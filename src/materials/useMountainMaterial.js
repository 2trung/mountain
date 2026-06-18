import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import {
  MeshStandardNodeMaterial,
  RepeatWrapping,
  Color,
  Vector2,
} from 'three/webgpu'
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  time,
  texture,
  smoothstep,
  mix,
  min,
  max,
  clamp,
  step,
  sin,
  normalize,
  length,
  uniform,
  output,
  positionLocal,
  positionWorld,
  positionView,
  normalView,
  depth,
  perspectiveDepthToViewZ,
  viewZToOrthographicDepth,
} from 'three/tsl'
import {
  hueShift,
  adjustSaturation,
  rotateUv,
  dHdxyFwd,
  perturbNormalArb,
  tangentTransform,
} from './tslUtils'

// TSL port of the reference GLSL mountain shader (mountain_fragment.glsl).
// One material renders the 5 chapter looks of the same mountain mesh; uPage
// selects the chapter with branchless step() masks and uTransition sweeps a
// noisy "energy wave" across the surface between pages.
//
// Instead of re-implementing the hand-written PBR pipeline of the original,
// this uses MeshStandardNodeMaterial slots: colorNode / normalNode /
// roughnessNode / metalnessNode feed three's standard lighting, and
// outputNode post-processes the lit color (meadow grading, transition
// desaturation, emissive wave, distance fog, alpha) exactly like the tail of
// the GLSL main().
//
// Sampler → /public asset mapping (the original site streams its own set):
//   tNoise      → noise.webp
//   tRandom     → noise.webp (stand-in: original uses a dedicated RGB random
//                 texture; only feeds the subtle pixelNoise grain)
//   tPerlin     → perlinNoise.webp
//   tVoronoi    → voronoi.webp
//   tMixMap     → snowRockMix.webp (snow/rock blend mask)
//   tMap2       → rock_diffuse.webp (detail/second diffuse; meadow and
//                 ocean swap in grass_diffuse.webp)
//   tMap        → rock_diffuse.webp (only sampled when uPage > 2.5: ocean &
//                 fortEnergy — the ocean coast's bare-rock layer)
//   tRockNormal → rock_normal.webp
// Omitted (no asset / no equivalent):
//   tMouse  — mouse trail FBO; with mouse = 0 every term it feeds cancels,
//             so the night wireframe grid is dropped too
//   tEnvMap — PMREM env map; the scene's ambient + directional lights stand
//             in for the original's IBL-only lighting
// tArmMap (AO/lightmap) is the original's single swapped-per-chapter sampler;
// here every chapter reads a dedicated baked lightmap
// (snow-lightmap.webp / night-lightmap.webp / meadow-lightmap.webp /
// ocean-lightmap.webp).
export function useMountainMaterial() {
  const [
    noiseTex,
    perlinTex,
    voronoiTex,
    mixTex,
    diffuseTex,
    rockNormalTex,
    grassTex,
    snowLightmapTex,
    meadowLightmapTex,
    nightLightmapTex,
    oceanLightmapTex,
  ] = useTexture([
    '/noise.webp',
    '/perlinNoise.webp',
    '/voronoi.webp',
    '/snowRockMix.webp',
    '/rock_diffuse.webp',
    '/rock_normal.webp',
    '/grass_diffuse.webp',
    '/snow/snow-lightmap.webp',
    '/meadow/meadow-lightmap.webp',
    '/night/night-lightmap.webp',
    '/ocean/ocean-lightmap.webp',
  ])

  return useMemo(
    () =>
      createMountainMaterial({
        noiseTex,
        perlinTex,
        voronoiTex,
        mixTex,
        diffuseTex,
        rockNormalTex,
        grassTex,
        snowLightmapTex,
        meadowLightmapTex,
        nightLightmapTex,
        oceanLightmapTex,
      }),
    [
      noiseTex,
      perlinTex,
      voronoiTex,
      mixTex,
      diffuseTex,
      rockNormalTex,
      grassTex,
      snowLightmapTex,
      meadowLightmapTex,
      nightLightmapTex,
      oceanLightmapTex,
    ],
  )
}

export function createMountainMaterial({
  noiseTex,
  perlinTex,
  voronoiTex,
  mixTex,
  diffuseTex,
  rockNormalTex,
  grassTex,
  snowLightmapTex,
  meadowLightmapTex,
  nightLightmapTex,
  oceanLightmapTex,
}) {
  for (const t of [
    noiseTex,
    perlinTex,
    voronoiTex,
    mixTex,
    diffuseTex,
    rockNormalTex,
    grassTex,
    snowLightmapTex,
    meadowLightmapTex,
    nightLightmapTex,
    oceanLightmapTex,
  ]) {
    t.wrapS = t.wrapT = RepeatWrapping
  }

  /* Uniforms (scroll-driven ones get neutral defaults, like the clouds) */
  const uPage = uniform(0)
  const uChapter = uniform(0)
  const uTransition = uniform(0)
  const uTransitionDirection = uniform(1)
  const uColor = uniform(new Color(1, 1, 1))
  const uRoughness = uniform(0.9)
  const uMetalness = uniform(0)
  // Camera near/far — used to linearize gl_FragCoord.z for the distance fog.
  // (These are NOT the reference's per-chapter fog values; computeDepth needs
  // the actual projection's near/far to recover true linear depth.)
  const uFogNear = uniform(0.1)
  const uFogFar = uniform(5000)
  const uLightColor = uniform(new Color('#949fa8')) // distance-fog / sky
  const uDarkColor = uniform(new Color('#1e2630')) // meadow high-altitude tint
  const uMeadowFog = uniform(new Color('#aebdab')) // meadow valley fog

  /* Per-chapter texture UV transforms (reference mapTransform* fields). map ->
     primary diffuse, map2 -> second diffuse / grass, mix -> snow-rock mask. */
  const uMapRepeat = uniform(new Vector2(1, 1))
  const uMapOffset = uniform(new Vector2(0, 0))
  const uMapRot = uniform(0)
  const uMap2Repeat = uniform(new Vector2(1, 1))
  const uMap2Offset = uniform(new Vector2(0, 0))
  const uMap2Rot = uniform(0)
  const uMixRepeat = uniform(new Vector2(1, 1))
  const uMixOffset = uniform(new Vector2(0, 0))
  const uMixRot = uniform(0)

  // uv * transform: rotate about the texture centre, scale by repeat, shift.
  const txUv = (base, repeat, offset, rot) =>
    rotateUv(base, vec2(0.5, 0.5), rot).mul(repeat).add(offset)

  const st = uv()
  const posL = positionLocal // vPosition
  const posW = positionWorld // vWorldPosition
  const viewPos = positionView // -vViewPosition
  const geoNormal = normalView // normalize(vNormal)
  const t = time // uTime

  /* Chapter masks — exactly one is 1 */
  const snow = step(0.5, uPage).oneMinus()
  const night = step(0.5, uPage).mul(step(1.5, uPage).oneMinus())
  const meadow = step(1.5, uPage).mul(step(2.5, uPage).oneMinus())
  const ocean = step(2.5, uPage).mul(step(3.5, uPage).oneMinus())
  const fortEnergy = step(3.5, uPage)
  const pageHigh = step(2.5, uPage) // ocean + fortEnergy

  const transition = uTransition
  const transDir = uTransitionDirection
  const transitionSize = float(0.03)
    .sub(meadow.mul(0.01))
    .sub(night.mul(0.01))
    .mul(2)

  /* Grain + transition wave sweeping along the mountain's height */
  const pixelScale = meadow.add(night.mul(2)).add(snow)
  const pixelNoise = texture(noiseTex, st.mul(pixelScale.add(2)))
    .r.mul(
      texture(noiseTex, st.mul(pixelScale.add(3)).add(t.mul(0.01).add(0.5))).r,
    )
    .sub(1)

  const basicNoise = texture(noiseTex, st).r
  const mountainHeight = smoothstep(
    0,
    400,
    length(posL.sub(vec3(-20, 65, 3.4))),
  )
    .sub(
      basicNoise
        .sub(0.5)
        .mul(0.3)
        .mul(smoothstep(1, 0.9, transition))
        .mul(smoothstep(0, 0.1, transition)),
    )
    .add(pixelNoise.mul(0.015))

  const waveBase = smoothstep(
    transitionSize.mul(2).oneMinus(),
    1,
    transition.add(mountainHeight.mul(1.8)),
  )
  const wave = mix(
    mix(waveBase, 1, smoothstep(0.99, 1, transition)),
    0,
    smoothstep(0.01, 0, transition),
  )
  const fadeTransition = mix(
    smoothstep(0, 0.2, transition),
    smoothstep(0.09, 0.1, transition.mul(0.13).add(mountainHeight.mul(0.2))),
    fortEnergy,
  )
  const transitionWave = mix(fadeTransition, wave, transDir)

  const smallNoise = texture(noiseTex, st.mul(45)).rg.sub(0.5)
  const bigNoise = texture(noiseTex, st.mul(5)).rg.sub(0.5)

  /* Per-chapter transformed UVs for the diffuse / second / mix samplers. */
  const mapUv = txUv(st, uMapRepeat, uMapOffset, uMapRot)
  const map2Uv = txUv(st, uMap2Repeat, uMap2Offset, uMap2Rot)
  const mixUv = txUv(
    vec2(st.x, st.y.oneMinus()),
    uMixRepeat,
    uMixOffset,
    uMixRot,
  )

  /* Base color layers */
  const baseSample = mix(
    vec4(0.98, 0.98, 1, 1),
    texture(diffuseTex, mapUv),
    pageHigh,
  )
  const second0 = texture(diffuseTex, map2Uv)
  const secondSample = vec4(
    mix(second0.rgb, mix(vec3(0.36, 0.47, 0.52), vec3(1), second0.r), snow),
    second0.a,
  )
  const mixMapSample = texture(mixTex, mixUv.add(smallNoise.mul(0.002)))

  /* SNOW & NIGHT */
  const snowNightSample = mix(secondSample.mul(1.3), baseSample, mixMapSample.r)

  /* MEADOW — grass, moss, flowers, valley shading.
     Meadow swaps the "second" diffuse (tMap2) for the grass diffuse. */
  const grassSample = texture(grassTex, map2Uv)
  let meadowSample = mix(grassSample.mul(0.6), baseSample, mixMapSample.r)
  let meadowRgb = hueShift(
    meadowSample.rgb,
    texture(noiseTex, st.mul(2.2)).r.sub(0.5).mul(1.8).add(0.2),
  )
  meadowRgb = meadowRgb.mul(
    smoothstep(0.4, 0.6, texture(noiseTex, st.mul(2.9)).r)
      .mul(0.3)
      .add(1),
  )
  const lilGrass = texture(grassTex, st.mul(8)).rgb
  const lilFactor = smoothstep(0.7, 1, texture(perlinTex, st.mul(5)).r)
  meadowSample = vec4(mix(meadowRgb, lilGrass, lilFactor), meadowSample.a)
  let moss = meadowSample.mul(0.6)
  const flowers = vec4(hueShift(vec3(1, 0.21, 0.05), bigNoise.r.mul(-5)), 1)
  moss = mix(
    moss,
    flowers,
    smoothstep(0.24, 0.3, texture(voronoiTex, st.mul(6).add(bigNoise)).r).mul(
      smoothstep(0.2, 0.55, texture(voronoiTex, st.mul(120)).r),
    ),
  )
  const heightLine = posL.y.add(posL.z.mul(0.1)).add(bigNoise.r.mul(10))
  const mossZone = mixMapSample.r.add(smoothstep(-10, -25, heightLine))
  meadowSample = mix(meadowSample, moss, clamp(mossZone, 0, 1))
  const bottom = smoothstep(-18, -35, heightLine)
  meadowSample = vec4(
    hueShift(meadowSample.rgb, bottom.mul(-0.5)),
    meadowSample.a,
  ).mul(bottom.mul(0.8).oneMinus())
  meadowRgb = meadowSample.rgb.mul(
    texture(noiseTex, st.mul(vec2(16, 1)))
      .r.mul(smoothstep(0.3, 0.5, texture(noiseTex, st.mul(2)).r))
      .mul(0.8)
      .add(0.5),
  )
  meadowSample = vec4(adjustSaturation(meadowRgb, 1.1), meadowSample.a)

  /* OCEAN — coast shading + animated splashes.
     tMap = rock_diffuse (baseSample), tMap2 = grass_diffuse (grassSample), so
     the coast blends bare rock with the grass diffuse like the reference. */
  const mixOcean = smoothstep(-0.5, 0.8, geoNormal.x)
  let oceanSample = mix(
    vec4(adjustSaturation(baseSample.rgb, 2), 1),
    grassSample.mul(vec4(0.8, 0.7, 0.8, 1)),
    mixOcean,
  )
  // Darken the lower island toward the waterline so the wide base apron reads
  // as wet rock/shore instead of bright snow (range widened from the original
  // -22..-15 to span the visible base above the raised sea).
  oceanSample = vec4(
    oceanSample.rgb.mul(
      smoothstep(0, 38, posL.y.add(smallNoise.x.mul(5)))
        .mul(0.9)
        .add(0.1),
    ),
    oceanSample.a,
  )
  const splasher = posL.z.add(posL.x)
  const splash = smoothstep(
    -2,
    1,
    sin(splasher.mul(0.4).add(t))
      .mul(sin(splasher.add(t.mul(0.1))))
      .mul(smoothstep(-1, 1, sin(splasher.mul(0.3).add(t.mul(2))))),
  )
  oceanSample = oceanSample.add(
    smoothstep(
      splash.mul(1.5).add(-22.9),
      splash.mul(0.8).add(-23.8),
      posL.y.add(
        texture(noiseTex, st.mul(30).add(t.mul(0.05)))
          .r.sub(0.5)
          .mul(2),
      ),
    ),
  )
  const splashZone = smoothstep(-23.8, -20.2, posL.y)
  const foamFog = smoothstep(
    -14.2,
    -23.8,
    posL.y.add(texture(noiseTex, st.mul(2).sub(t.mul(0.005))).r.mul(10)),
  )
  const oceanEmissive = foamFog
    .mul(0.3)
    .add(smoothstep(0.5, 0.1, splashZone).mul(transitionWave.oneMinus()))
    .mul(ocean)

  /* Blend chapters into the diffuse color */
  let base = mix(baseSample, snowNightSample, snow.add(night))
  base = mix(base, meadowSample, meadow)
  base = mix(base, oceanSample, ocean)
  let diffuseRgb = uColor.mul(base.rgb)

  /* ARM lightmap chain — every chapter samples its baked lightmap texture
     (the original's tArmMap), with the flipped-Y UV + noise jitter of the
     reference shader. */
  const armUv = vec2(st.x, st.y.oneMinus()).add(
    texture(noiseTex, st.mul(80)).rg.sub(0.5).mul(0.005),
  )
  let armSample0 = vec4(1)
  armSample0 = mix(armSample0, texture(snowLightmapTex, armUv), snow)
  armSample0 = mix(armSample0, texture(meadowLightmapTex, armUv), meadow)
  armSample0 = mix(armSample0, texture(nightLightmapTex, armUv), night)
  armSample0 = mix(armSample0, texture(oceanLightmapTex, armUv), ocean)
  const meadowLightmap = mix(
    vec3(0.2, 0.2, 0.1),
    vec3(0.97, 0.8, 0.5),
    armSample0.r,
  ).mul(smoothstep(0.6, 1, armSample0.rgb).mul(2.8).mul(meadow).add(1))
  let armSample = armSample0.mul(float(3).sub(ocean.mul(2)))
  armSample = armSample.add(
    smoothstep(0.2, 0.7, armSample).mul(ocean.mul(2.5).add(0.3)),
  )
  const snowLightmap = mix(
    vec3(0.36, 0.47, 0.52),
    vec3(1),
    smoothstep(0.2, 0.9, armSample.r),
  )
  const nightLight = mix(
    vec3(1, 0.5, 0.2),
    vec3(0.35, 0.34, 0.5),
    smoothstep(40, 20, posL.y),
  )
  const nightLightmap = adjustSaturation(
    armSample.rgb.mul(
      mix(
        vec3(0.1, 0.18, 0.25).mul(0.5),
        nightLight,
        smoothstep(0.2, 1.1, armSample.r),
      ),
    ),
    0.7,
  )
  let armRgb = mix(armSample.rgb, snowLightmap, snow)
  armRgb = mix(armRgb, meadowLightmap, meadow)
  armRgb = mix(armRgb, nightLightmap, night)

  /* Specular occlusion (reference lines 537-539). The scene is IBL-only, so the
     env map is the sole specular source; without this the ocean coast keeps
     bright env reflections in its crevices and a grazing Fresnel rim and reads
     "shiny". aoNode drives MeshStandardNodeMaterial's computeSpecularOcclusion
     (the same function the GLSL calls) and also AOs the indirect diffuse.
     occlusion = mix(armRgb.r, 1, transitionWave): armRgb.r is the post-remap
     lightmap red (the GLSL `armSample.r`); in lit areas it's boosted >1 so the
     clamp lands on 1 (no diffuse change, full specular), only crevices occlude.
     Gated to ocean so the other three chapters stay unchanged (ao = 1). */
  const occlusion = mix(
    float(1),
    clamp(mix(armRgb.r, float(1), transitionWave), 0, 1),
    ocean,
  )

  /* Normals — rock detail + chapter-specific bump layers */
  const transitionNormal = perturbNormalArb(
    viewPos,
    geoNormal,
    dHdxyFwd(perlinTex, st.mul(10), 5),
  )
  const nTexRaw = texture(rockNormalTex, st.mul(30)).rgb.mul(2).sub(1)
  const nTexScale = mix(
    float(2)
      .add(night.mul(4))
      .mul(mixMapSample.r.mul(snow.add(night)).oneMinus()),
    0.3, // meadow factor; original adds .4 * mouse (omitted)
    meadow,
  )
  const nTex = vec3(nTexRaw.xy.mul(nTexScale), nTexRaw.z)
  const rockNormal = normalize(tangentTransform(viewPos, geoNormal, st, nTex))

  /* Windy snow (snow + night) */
  const windUv = rotateUv(st, vec2(1, 7), night.mul(0.3).add(2.7)).mul(
    vec2(1, 7),
  )
  const snowCloud = texture(
    noiseTex,
    vec2(0.8, 0.3)
      .mul(windUv)
      .add(vec2(t.mul(0.02), t.mul(-0.02))),
  ).r
  const windySnow = smoothstep(
    0.5,
    1,
    texture(perlinTex, windUv.add(vec2(t.mul(0.03), 0))).rgb,
  )
    .mul(mix(float(1), mixMapSample.r, night))
    .mul(smoothstep(0.45, 1, snowCloud))
  diffuseRgb = diffuseRgb.add(
    windySnow
      .mul(1.1)
      .mul(transitionWave.oneMinus())
      .mul(step(1.5, uPage).oneMinus()),
  )

  // uPage < 1.5 branch
  const pLowBase = perturbNormalArb(
    viewPos,
    rockNormal,
    dHdxyFwd(perlinTex, st.mul(10), smoothstep(0.7, 0.4, snowCloud).mul(2)),
  )
  const pLow = mix(
    pLowBase,
    perturbNormalArb(
      viewPos,
      pLowBase,
      dHdxyFwd(
        perlinTex,
        st.mul(vec2(4, 12)),
        mixMapSample.r.oneMinus().mul(9),
      ),
    ),
    night,
  )
  // uPage >= 1.5 branch
  const pHighBase = perturbNormalArb(
    viewPos,
    rockNormal,
    dHdxyFwd(
      diffuseTex,
      st.mul(15),
      meadow.mul(mixMapSample.r).oneMinus().mul(3.5),
    ),
  )
  const pHigh = mix(
    pHighBase,
    perturbNormalArb(viewPos, pHighBase, dHdxyFwd(perlinTex, st, 20)),
    ocean,
  )
  const perturbedNormal = mix(pHigh, pLow, snow.add(night))
  const finalNormal = mix(perturbedNormal, transitionNormal, transitionWave)

  diffuseRgb = diffuseRgb.mul(armRgb)

  /* Transition state — perlin "energy" surface */
  const transitionColor = texture(perlinTex, st.mul(3)).rgb.mul(
    clamp(length(finalNormal.xy), 0.5, 1),
  )
  const colorOut = mix(diffuseRgb, transitionColor, transitionWave)
  const roughnessOut = mix(clamp(uRoughness, 0.04, 1), 1, transitionWave)

  /* Transition wave emissive front */
  let waveColor = mix(
    vec3(0.2, 0.4, 1),
    vec3(0.5, 0.85, 0.85),
    smoothstep(0.2, 0.7, texture(noiseTex, st.mul(3).add(t.mul(0.04))).r),
  )
  waveColor = hueShift(waveColor, sin(posL.z.mul(0.1).add(t)).mul(0.2))
  waveColor = waveColor.mul(smoothstep(0.3, 0.9, basicNoise).mul(0.4).add(0.8))
  waveColor = mix(
    waveColor,
    transitionColor,
    smoothstep(0, 0.5, pixelNoise.add(1)),
  )
  const waveEmissive = waveColor
    .mul(transDir)
    .mul(
      clamp(
        transitionWave.sub(
          smoothstep(
            transitionSize.oneMinus(),
            1,
            transition.add(mountainHeight.mul(1.8)),
          ),
        ),
        0,
        1,
      ),
    )
  const totalEmissive = vec3(oceanEmissive).add(waveEmissive)

  /* Post-lighting: `output` holds the lit color from the standard pipeline */
  let outgoing = output.rgb

  // Meadow color correction (mask-gated, like the original's if-block)
  const meadowNoise = texture(
    noiseTex,
    posW.zy.mul(vec2(1, 2)).add(t.mul(2)).mul(0.002),
  ).r.sub(0.5)
  let meadowOLight = mix(
    outgoing,
    mix(uLightColor, uDarkColor, 0.7),
    smoothstep(10, 40, posW.y.add(meadowNoise.mul(10))).mul(0.1),
  )
  const meadowFog = smoothstep(
    0.2,
    0.8,
    texture(noiseTex, posW.zy.mul(vec2(1, 3)).mul(0.001).sub(t.mul(0.001))).r,
  ).mul(smoothstep(0, -40, posW.y.add(meadowNoise.mul(40))))
  meadowOLight = mix(
    meadowOLight,
    vec3(0.25, 0.3, 0.03).mul(0.1),
    smoothstep(0.1, 0, length(st.sub(vec2(0.03, 0.65)))).mul(0.7),
  )
  meadowOLight = mix(meadowOLight, uMeadowFog, meadowFog.mul(0.5))
  outgoing = mix(
    outgoing,
    mix(meadowOLight, outgoing, transitionWave),
    meadow,
  )

  // Desaturate while the wave passes, then add emissive
  outgoing = adjustSaturation(outgoing, transitionWave.oneMinus())
  outgoing = outgoing.add(totalEmissive)

  // Distance fog toward uLightColor — faithful port of computeDepth():
  // linearize gl_FragCoord.z with the per-chapter fog near/far, then ramp.
  const fogViewZ = perspectiveDepthToViewZ(depth, uFogNear, uFogFar)
  const fogDepth = smoothstep(
    0.01,
    0.3,
    viewZToOrthographicDepth(fogViewZ, uFogNear, uFogFar),
  ).mul(transition.oneMinus())
  outgoing = mix(outgoing, uLightColor, fogDepth)

  const nightFog = smoothstep(15, -20, posL.y).mul(0.2).mul(night)
  outgoing = mix(outgoing, vec3(0, 0.4, 0.9), nightFog.mul(0.2))

  // (Night mouse wireframe grid omitted — needs the tMouse trail FBO)
  const strictNight = max(0, night.sub(transition))
  outgoing = outgoing.mul(strictNight.mul(min(1, uChapter)).oneMinus())

  /* Alpha — fortEnergy backside/edge fades + chapter fade-out */
  let alpha = mix(
    float(1),
    smoothstep(302, 301.5, viewPos.z.negate()),
    fortEnergy,
  )
  alpha = alpha.mul(mix(fortEnergy.oneMinus(), 1, transitionWave))
  alpha = alpha.mul(
    smoothstep(0.3, 0.45, length(st.sub(0.5)))
      .mul(fortEnergy)
      .mul(smoothstep(0.6, 0.2, uTransition))
      .oneMinus(),
  )
  alpha = alpha.mul(smoothstep(2.5, 2.3, uChapter))
  outgoing = outgoing.mul(alpha)

  const material = new MeshStandardNodeMaterial({ transparent: true })
  material.colorNode = vec4(colorOut, 1)
  material.normalNode = finalNormal
  material.roughnessNode = roughnessOut
  material.metalnessNode = clamp(uMetalness, 0.04, 1)
  material.aoNode = occlusion
  material.outputNode = vec4(outgoing, clamp(alpha, 0, 1))

  material.userData.uPage = uPage
  material.userData.uChapter = uChapter
  material.userData.uTransition = uTransition
  material.userData.uTransitionDirection = uTransitionDirection
  material.userData.uColor = uColor
  material.userData.uRoughness = uRoughness
  material.userData.uMetalness = uMetalness
  material.userData.uFogNear = uFogNear
  material.userData.uFogFar = uFogFar
  material.userData.uLightColor = uLightColor
  material.userData.uDarkColor = uDarkColor
  material.userData.uMeadowFog = uMeadowFog
  material.userData.uMapRepeat = uMapRepeat
  material.userData.uMapOffset = uMapOffset
  material.userData.uMapRot = uMapRot
  material.userData.uMap2Repeat = uMap2Repeat
  material.userData.uMap2Offset = uMap2Offset
  material.userData.uMap2Rot = uMap2Rot
  material.userData.uMixRepeat = uMixRepeat
  material.userData.uMixOffset = uMixOffset
  material.userData.uMixRot = uMixRot

  return material
}
