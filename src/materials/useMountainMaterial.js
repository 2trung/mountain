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
// outputNode post-processes the lit color (capital grading, transition
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
//   tMap2       → rock_diffuse.webp (detail/second diffuse; capital swaps in
//                 grass_diffuse.webp)
//   tMap        → rock_diffuse.webp (stand-in: only sampled when uPage > 2.5)
//   tRockNormal → rock_normal.webp
// Omitted (no asset / no equivalent):
//   tMouse  — mouse trail FBO; with mouse = 0 every term it feeds cancels,
//             so the trading wireframe grid is dropped too
//   tEnvMap — PMREM env map; the scene's ambient + directional lights stand
//             in for the original's IBL-only lighting
// tArmMap (AO/lightmap) is the original's single swapped-per-chapter sampler;
// here capital and trading read dedicated baked lightmaps
// (capital-lightmap.webp / trading-lightmap.webp), while homepage and maritime
// fall back to the shader's vec4(1) default.
export function useMountainMaterial() {
  const [
    noiseTex,
    perlinTex,
    voronoiTex,
    mixTex,
    diffuseTex,
    rockNormalTex,
    grassTex,
    capitalLightmapTex,
    tradingLightmapTex,
    maritimeLightmapTex,
  ] = useTexture([
    '/noise.webp',
    '/perlinNoise.webp',
    '/voronoi.webp',
    '/snowRockMix.webp',
    '/rock_diffuse.webp',
    '/rock_normal.webp',
    '/grass_diffuse.webp',
    '/capital-lightmap.webp',
    '/trading-lightmap.webp',
    '/maritime-lightmap.webp',
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
        capitalLightmapTex,
        tradingLightmapTex,
        maritimeLightmapTex,
      }),
    [
      noiseTex,
      perlinTex,
      voronoiTex,
      mixTex,
      diffuseTex,
      rockNormalTex,
      grassTex,
      capitalLightmapTex,
      tradingLightmapTex,
      maritimeLightmapTex,
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
  capitalLightmapTex,
  tradingLightmapTex,
  maritimeLightmapTex,
}) {
  for (const t of [
    noiseTex,
    perlinTex,
    voronoiTex,
    mixTex,
    diffuseTex,
    rockNormalTex,
    grassTex,
    capitalLightmapTex,
    tradingLightmapTex,
    maritimeLightmapTex,
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
  const uDarkColor = uniform(new Color('#1e2630')) // capital high-altitude tint
  const uCapitalFog = uniform(new Color('#aebdab')) // capital valley fog

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
  const homepage = step(0.5, uPage).oneMinus()
  const trading = step(0.5, uPage).mul(step(1.5, uPage).oneMinus())
  const capital = step(1.5, uPage).mul(step(2.5, uPage).oneMinus())
  const maritime = step(2.5, uPage).mul(step(3.5, uPage).oneMinus())
  const fortEnergy = step(3.5, uPage)
  const pageHigh = step(2.5, uPage) // maritime + fortEnergy

  const transition = uTransition
  const transDir = uTransitionDirection
  const transitionSize = float(0.03)
    .sub(capital.mul(0.01))
    .sub(trading.mul(0.01))
    .mul(2)

  /* Grain + transition wave sweeping along the mountain's height */
  const pixelScale = capital.add(trading.mul(2)).add(homepage)
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
    mix(second0.rgb, mix(vec3(0.36, 0.47, 0.52), vec3(1), second0.r), homepage),
    second0.a,
  )
  const mixMapSample = texture(mixTex, mixUv.add(smallNoise.mul(0.002)))

  /* HOMEPAGE & TRADING */
  const hoTraSample = mix(secondSample.mul(1.3), baseSample, mixMapSample.r)

  /* CAPITAL — grass, moss, flowers, valley shading.
     Capital swaps the "second" diffuse (tMap2) for the grass diffuse. */
  const grassSample = texture(grassTex, map2Uv)
  let capitalSample = mix(grassSample.mul(0.6), baseSample, mixMapSample.r)
  let capRgb = hueShift(
    capitalSample.rgb,
    texture(noiseTex, st.mul(2.2)).r.sub(0.5).mul(1.8).add(0.2),
  )
  capRgb = capRgb.mul(
    smoothstep(0.4, 0.6, texture(noiseTex, st.mul(2.9)).r)
      .mul(0.3)
      .add(1),
  )
  const lilGrass = texture(grassTex, st.mul(8)).rgb
  const lilFactor = smoothstep(0.7, 1, texture(perlinTex, st.mul(5)).r)
  capitalSample = vec4(mix(capRgb, lilGrass, lilFactor), capitalSample.a)
  let moss = capitalSample.mul(0.6)
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
  capitalSample = mix(capitalSample, moss, clamp(mossZone, 0, 1))
  const bottom = smoothstep(-18, -35, heightLine)
  capitalSample = vec4(
    hueShift(capitalSample.rgb, bottom.mul(-0.5)),
    capitalSample.a,
  ).mul(bottom.mul(0.8).oneMinus())
  capRgb = capitalSample.rgb.mul(
    texture(noiseTex, st.mul(vec2(16, 1)))
      .r.mul(smoothstep(0.3, 0.5, texture(noiseTex, st.mul(2)).r))
      .mul(0.8)
      .add(0.5),
  )
  capitalSample = vec4(adjustSaturation(capRgb, 1.1), capitalSample.a)

  /* MARITIME — coast shading + animated splashes */
  const mixMaritime = smoothstep(-0.5, 0.8, geoNormal.x)
  let maritimeSample = mix(
    vec4(adjustSaturation(baseSample.rgb, 2), 1),
    secondSample.mul(vec4(0.8, 0.7, 0.8, 1)),
    mixMaritime,
  )
  // Darken the lower island toward the waterline so the wide base apron reads
  // as wet rock/shore instead of bright snow (range widened from the original
  // -22..-15 to span the visible base above the raised sea).
  maritimeSample = vec4(
    maritimeSample.rgb.mul(
      smoothstep(0, 38, posL.y.add(smallNoise.x.mul(5)))
        .mul(0.9)
        .add(0.1),
    ),
    maritimeSample.a,
  )
  const splasher = posL.z.add(posL.x)
  const splash = smoothstep(
    -2,
    1,
    sin(splasher.mul(0.4).add(t))
      .mul(sin(splasher.add(t.mul(0.1))))
      .mul(smoothstep(-1, 1, sin(splasher.mul(0.3).add(t.mul(2))))),
  )
  maritimeSample = maritimeSample.add(
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
  const maritimeEmissive = foamFog
    .mul(0.3)
    .add(smoothstep(0.5, 0.1, splashZone).mul(transitionWave.oneMinus()))
    .mul(maritime)

  /* Blend chapters into the diffuse color */
  let base = mix(baseSample, hoTraSample, homepage.add(trading))
  base = mix(base, capitalSample, capital)
  base = mix(base, maritimeSample, maritime)
  let diffuseRgb = uColor.mul(base.rgb)

  /* ARM lightmap chain — capital, trading & maritime sample their baked
     lightmap textures (the original's tArmMap), with the flipped-Y UV + noise
     jitter of the reference shader. Homepage keeps the vec4(1) fallback. */
  const armUv = vec2(st.x, st.y.oneMinus()).add(
    texture(noiseTex, st.mul(80)).rg.sub(0.5).mul(0.005),
  )
  let armSample0 = vec4(1)
  armSample0 = mix(armSample0, texture(capitalLightmapTex, armUv), capital)
  armSample0 = mix(armSample0, texture(tradingLightmapTex, armUv), trading)
  armSample0 = mix(armSample0, texture(maritimeLightmapTex, armUv), maritime)
  const capitalLightmap = mix(
    vec3(0.2, 0.2, 0.1),
    vec3(0.97, 0.8, 0.5),
    armSample0.r,
  ).mul(smoothstep(0.6, 1, armSample0.rgb).mul(2.8).mul(capital).add(1))
  let armSample = armSample0.mul(float(3).sub(maritime.mul(2)))
  armSample = armSample.add(
    smoothstep(0.2, 0.7, armSample).mul(maritime.mul(2.5).add(0.3)),
  )
  const homepageLightmap = mix(
    vec3(0.36, 0.47, 0.52),
    vec3(1),
    smoothstep(0.2, 0.9, armSample.r),
  )
  const tradingLight = mix(
    vec3(1, 0.5, 0.2),
    vec3(0.35, 0.34, 0.5),
    smoothstep(40, 20, posL.y),
  )
  const tradingLightmap = adjustSaturation(
    armSample.rgb.mul(
      mix(
        vec3(0.1, 0.18, 0.25).mul(0.5),
        tradingLight,
        smoothstep(0.2, 1.1, armSample.r),
      ),
    ),
    0.7,
  )
  let armRgb = mix(armSample.rgb, homepageLightmap, homepage)
  armRgb = mix(armRgb, capitalLightmap, capital)
  armRgb = mix(armRgb, tradingLightmap, trading)

  /* Normals — rock detail + chapter-specific bump layers */
  const transitionNormal = perturbNormalArb(
    viewPos,
    geoNormal,
    dHdxyFwd(perlinTex, st.mul(10), 5),
  )
  const nTexRaw = texture(rockNormalTex, st.mul(30)).rgb.mul(2).sub(1)
  const nTexScale = mix(
    float(2)
      .add(trading.mul(4))
      .mul(mixMapSample.r.mul(homepage.add(trading)).oneMinus()),
    0.3, // capital factor; original adds .4 * mouse (omitted)
    capital,
  )
  const nTex = vec3(nTexRaw.xy.mul(nTexScale), nTexRaw.z)
  const rockNormal = normalize(tangentTransform(viewPos, geoNormal, st, nTex))

  /* Windy snow (homepage + trading) */
  const windUv = rotateUv(st, vec2(1, 7), trading.mul(0.3).add(2.7)).mul(
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
    .mul(mix(float(1), mixMapSample.r, trading))
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
    trading,
  )
  // uPage >= 1.5 branch
  const pHighBase = perturbNormalArb(
    viewPos,
    rockNormal,
    dHdxyFwd(
      diffuseTex,
      st.mul(15),
      capital.mul(mixMapSample.r).oneMinus().mul(3.5),
    ),
  )
  const pHigh = mix(
    pHighBase,
    perturbNormalArb(viewPos, pHighBase, dHdxyFwd(perlinTex, st, 20)),
    maritime,
  )
  const perturbedNormal = mix(pHigh, pLow, homepage.add(trading))
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
  const totalEmissive = vec3(maritimeEmissive).add(waveEmissive)

  /* Post-lighting: `output` holds the lit color from the standard pipeline */
  let outgoing = output.rgb

  // Capital color correction (mask-gated, like the original's if-block)
  const capitalNoise = texture(
    noiseTex,
    posW.zy.mul(vec2(1, 2)).add(t.mul(2)).mul(0.002),
  ).r.sub(0.5)
  let capitalOLight = mix(
    outgoing,
    mix(uLightColor, uDarkColor, 0.7),
    smoothstep(10, 40, posW.y.add(capitalNoise.mul(10))).mul(0.1),
  )
  const capitalFog = smoothstep(
    0.2,
    0.8,
    texture(noiseTex, posW.zy.mul(vec2(1, 3)).mul(0.001).sub(t.mul(0.001))).r,
  ).mul(smoothstep(0, -40, posW.y.add(capitalNoise.mul(40))))
  capitalOLight = mix(
    capitalOLight,
    vec3(0.25, 0.3, 0.03).mul(0.1),
    smoothstep(0.1, 0, length(st.sub(vec2(0.03, 0.65)))).mul(0.7),
  )
  capitalOLight = mix(capitalOLight, uCapitalFog, capitalFog.mul(0.5))
  outgoing = mix(
    outgoing,
    mix(capitalOLight, outgoing, transitionWave),
    capital,
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

  const tradingFog = smoothstep(15, -20, posL.y).mul(0.2).mul(trading)
  outgoing = mix(outgoing, vec3(0, 0.4, 0.9), tradingFog.mul(0.2))

  // (Trading mouse wireframe grid omitted — needs the tMouse trail FBO)
  const strictTrading = max(0, trading.sub(transition))
  outgoing = outgoing.mul(strictTrading.mul(min(1, uChapter)).oneMinus())

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
  material.userData.uCapitalFog = uCapitalFog
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
