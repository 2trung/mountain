import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import {
  MeshStandardNodeMaterial,
  RepeatWrapping,
  Color,
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
  clamp,
  length,
  uniform,
  output,
  positionView,
  positionWorld,
  normalView,
  depth,
  perspectiveDepthToViewZ,
  viewZToOrthographicDepth,
} from 'three/tsl'
import { hueShift, adjustSaturation, dHdxyFwd, perturbNormalArb } from './tslUtils'

// TSL port of the reference GLSL meadow foreground shader
// (meadow_foreground.glsl) — the grassy prairie slab in front of the meadow
// mountain, with a transparent lake hole (the lake plane shows through it), a
// grass/hue-shifted color grade, the mountain-cast shadow, baked lightmap
// emissive, and the meadow valley fog / atmosphere wash on the lit output.
//
// The reference is a hand-written PBR pass forced to metallic = 1 (so the
// diffuse term is zero and the surface is lit purely by image-based lighting +
// the baked lightmap emissive). Rather than re-implement that pipeline, this
// drives MeshStandardNodeMaterial slots — colorNode / metalnessNode /
// roughnessNode / normalNode / emissiveNode feed three's standard lighting (the
// scene <Environment> supplies the IBL the original read from tEnvMap), and
// outputNode reproduces the tail of main(): height tint, meadow fog, depth
// haze, transition wash and the chapter/transition alpha fades.
//
// Sampler → asset mapping:
//   tMap         → the GLB MeadowForeground base map (seamless grass, uv0)
//   tEmissiveMap → the GLB prairie lightmap (baked light, uv1)
//   tGrass       → grass_diffuse.webp (detail grass + bump source)
//   tNoise       → noise.webp (uv jitter, lake warp, fog noise)
// Omitted (no asset / not compiled into the reference variant): tReflexion,
// tNoiseNormal (declared but unused), tMouse (= 0; its normal-scale term
// collapses to 1). tVoronoi only fed a `moss` color the reference computes but
// never reads back (dead code), so both are dropped.
export function useMeadowForegroundMaterial({ baseMap, lightMap }) {
  const [grassTex, noiseTex] = useTexture([
    '/grass_diffuse.webp',
    '/noise.webp',
  ])

  return useMemo(
    () =>
      createMeadowForegroundMaterial({
        baseMap,
        lightMap,
        grassTex,
        noiseTex,
      }),
    [baseMap, lightMap, grassTex, noiseTex],
  )
}

export function createMeadowForegroundMaterial({
  baseMap,
  lightMap,
  grassTex,
  noiseTex,
}) {
  for (const t of [grassTex, noiseTex]) {
    t.wrapS = t.wrapT = RepeatWrapping
  }

  const uColor = uniform(new Color(1, 1, 1))
  const uOpacity = uniform(1)
  const uRoughness = uniform(0.6)
  const uEmissive = uniform(new Color(1, 1, 1)) // lightmap emissive tint
  const uChapter = uniform(0)
  const uTransition = uniform(0)
  const uTransitionColor = uniform(new Color('#5f9bc4'))
  const uLightColor = uniform(new Color('#e7f1f5')) // depth haze / sky tone
  const uDarkColor = uniform(new Color('#74aed8')) // high-altitude tint
  const uMeadowFog = uniform(new Color('#aebdab')) // valley fog
  // Near fog near/far. The reference hardcodes 0.01 / 50 (its scene units);
  // exposed here so Meadow.jsx can match the camera and avoid over-fogging the
  // larger world scale.
  const uFogNear = uniform(0.01)
  const uFogFar = uniform(50)

  const st = uv() // vMapUv / vUv (uv0)
  const eUv = uv(1) // vEmissiveMapUv (uv1)
  const viewPos = positionView // -vViewPosition
  const posW = positionWorld // vWorldPosition
  const geoNormal = normalView // normalize(vNormal)
  const t = time

  /* --- near "shadow" depth (computeDepth on gl_FragCoord.z) --- */
  const fogViewZ = perspectiveDepthToViewZ(depth, uFogNear, uFogFar)
  const fogDepth = viewZToOrthographicDepth(fogViewZ, uFogNear, uFogFar)
  const shadow = smoothstep(0.03, 0.07, fogDepth)

  /* --- base color map (uv jitter) + near brightening --- */
  let diffuse = vec4(uColor, uOpacity).mul(
    texture(baseMap, st.add(texture(noiseTex, st.mul(30)).rg.sub(0.5).mul(0.02))),
  )
  diffuse = vec4(
    diffuse.rgb.mul(smoothstep(100, 2, viewPos.z.negate()).mul(1.5).add(1)),
    diffuse.a,
  )

  /* --- lake hole carved in uv1 space (alpha 0 inside, dark green rim) --- */
  const bigNoise = texture(noiseTex, eUv).rg.sub(0.5)
  let lakeUv = bigNoise
    .mul(0.09)
    .add(eUv.mul(vec2(0.7, 1)))
    .sub(vec2(0.16, 0.38))
  lakeUv = lakeUv.add(
    texture(noiseTex, eUv.mul(8))
      .rg.sub(0.5)
      .mul(0.05)
      .mul(smoothstep(0.1, -0.3, bigNoise)),
  )
  const laker = length(lakeUv)
  let a = diffuse.a.mul(smoothstep(0.0845, 0.085, laker))
  let rgb = diffuse.rgb
    .mul(smoothstep(0.095, 0.08, laker).mul(0.7).add(1))
    .mul(mix(vec3(1), vec3(0.14, 0.28, 0.18).mul(2), smoothstep(0.085, 0.084, laker)))

  /* --- grass / hue-shift color grade --- */
  const grass = texture(grassTex, eUv.mul(30)).rgb
  rgb = adjustSaturation(rgb, 0.9)
  rgb = hueShift(rgb, bigNoise.y.mul(1.5))
  const grassZone = smoothstep(0, 0.2, eUv.x)
  a = a.mul(
    smoothstep(0.35, 0.32, eUv.x.sub(smoothstep(0, 0.8, eUv.y).mul(0.12))).add(
      smoothstep(0.5, 0.51, eUv.x),
    ),
  )
  rgb = mix(hueShift(grass.mul(0.4), 0.2), rgb, grassZone)

  /* --- mountain-cast shadow + lightmap brighten + near shadow --- */
  const mtnShadow = length(eUv.sub(vec2(0.55, 0.65)))
  rgb = rgb.mul(smoothstep(-0.1, 0.35, mtnShadow))
  const lightmap = texture(lightMap, eUv).rgb
  rgb = rgb.mul(lightmap.mul(40).mul(0.9).add(1))
  rgb = rgb.mul(shadow.mul(3).oneMinus())

  const diffuseColor = vec4(rgb, a)

  /* --- normal: grass bump (mouse term = 0 → factor 1) --- */
  const normal = perturbNormalArb(
    viewPos,
    geoNormal,
    dHdxyFwd(grassTex, st.mul(20), 0.2),
  )

  /* --- post-lighting tail: `output` is the lit color (IBL + emissive) --- */
  let outgoing = output.rgb

  const meadowNoise = texture(
    noiseTex,
    posW.zy.mul(vec2(1, 2)).add(t.mul(2)).mul(0.002),
  ).r.sub(0.5)
  outgoing = mix(
    outgoing,
    mix(uLightColor, uDarkColor, 0.7),
    smoothstep(10, 40, posW.y.add(meadowNoise.mul(10))).mul(0.1),
  )

  let meadowFog = smoothstep(
    0.2,
    0.8,
    texture(noiseTex, posW.zy.mul(vec2(1, 3)).mul(0.001).sub(t.mul(0.001))).r,
  )
  meadowFog = meadowFog.mul(smoothstep(0, -40, posW.y.add(meadowNoise.mul(40))))
  meadowFog = meadowFog.mul(smoothstep(-200, -190, posW.x))
  outgoing = mix(outgoing, uMeadowFog, meadowFog.mul(0.5))

  outgoing = mix(outgoing, uLightColor, fogDepth)
  outgoing = mix(outgoing, uTransitionColor, smoothstep(0, 0.5, uTransition))

  /* --- alpha: fog lift + transition + chapter fade-out --- */
  let alpha = a.add(meadowFog.mul(0.5))
  alpha = alpha.mul(smoothstep(1, 0.9, uTransition))
  alpha = alpha.mul(smoothstep(2, 1.5, uChapter))

  const material = new MeshStandardNodeMaterial({ transparent: true })
  material.colorNode = diffuseColor
  material.metalnessNode = float(1)
  material.roughnessNode = clamp(uRoughness, 0.04, 1)
  material.normalNode = normal
  material.emissiveNode = uEmissive.mul(lightmap)
  material.outputNode = vec4(outgoing, clamp(alpha, 0, 1))

  material.userData.uColor = uColor
  material.userData.uOpacity = uOpacity
  material.userData.uRoughness = uRoughness
  material.userData.uEmissive = uEmissive
  material.userData.uChapter = uChapter
  material.userData.uTransition = uTransition
  material.userData.uTransitionColor = uTransitionColor
  material.userData.uLightColor = uLightColor
  material.userData.uDarkColor = uDarkColor
  material.userData.uMeadowFog = uMeadowFog
  material.userData.uFogNear = uFogNear
  material.userData.uFogFar = uFogFar

  return material
}
