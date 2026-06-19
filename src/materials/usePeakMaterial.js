import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import {
  MeshStandardNodeMaterial,
  RepeatWrapping,
  Color,
  DoubleSide,
} from 'three/webgpu'
import {
  uv,
  vec2,
  vec3,
  vec4,
  time,
  texture,
  smoothstep,
  mix,
  clamp,
  normalize,
  uniform,
  output,
  faceDirection,
  positionLocal,
  positionView,
  normalView,
} from 'three/tsl'
import { dHdxyFwd, perturbNormalArb, tangentTransform } from './tslUtils'

// TSL port of the reference GLSL peaks shader (peak_fragment.glsl,
// SHADER_NAME SnowPeaks) — the generic "sixty" PBR material with three
// custom areas: scrolling windy snow blended into the diffuse, a perlin bump
// layered on the normal map, and distance fog + height/transition alpha
// fades. Like the mountain, the standard-material slots replace the
// hand-written PBR pipeline and outputNode reproduces the post-lighting tail.
//
// Sampler → asset mapping:
//   tMap       → the SnowPeaks GLB material's baseColor texture
//   tNoise     → /noise.webp
//   tPerlin    → /perlinNoise.webp
//   tNormalMap → /noise-solid-normal.webp (stand-in: the GLB exports no
//                normal texture; uNormalScale tunes its strength)
// Omitted: tEnvMap (scene lights stand in for the original's IBL, as on the
// mountain).
export function usePeakMaterial(sourceMaterial) {
  const [noiseTex, perlinTex, normalTex] = useTexture([
    `${import.meta.env.BASE_URL}noise.webp`,
    `${import.meta.env.BASE_URL}perlinNoise.webp`,
    `${import.meta.env.BASE_URL}noise-solid-normal.webp`,
  ])

  return useMemo(
    () =>
      createPeakMaterial({
        map: sourceMaterial.map,
        noiseTex,
        perlinTex,
        normalTex,
      }),
    [sourceMaterial, noiseTex, perlinTex, normalTex],
  )
}

export function createPeakMaterial({ map, noiseTex, perlinTex, normalTex }) {
  for (const t of [noiseTex, perlinTex, normalTex]) {
    t.wrapS = t.wrapT = RepeatWrapping
  }

  const uTransition = uniform(0)
  const uColor = uniform(new Color(1, 1, 1))
  const uOpacity = uniform(1)
  const uRoughness = uniform(0.9)
  const uMetalness = uniform(0)
  const uNormalScale = uniform(vec2(1, 1))
  const uFogNear = uniform(1)
  const uFogFar = uniform(1000)
  const uLightColor = uniform(new Color('#949fa8'))

  const st = uv()
  const viewPos = positionView // -vViewPosition
  const t = time // uTime

  const transition = smoothstep(0, 0.2, uTransition)

  /* Diffuse: base color + scrolling windy snow toward white */
  const baseSample = texture(map, st)
  let diffuseRgb = uColor.mul(baseSample.rgb)
  const windySnow = smoothstep(
    0.6,
    0.8,
    texture(
      perlinTex,
      vec2(1, 7)
        .mul(st)
        .add(vec2(t.mul(-0.07), 0)),
    ).rgb,
  ).mul(
    smoothstep(
      0.5,
      1,
      texture(
        noiseTex,
        vec2(1, 1.5)
          .mul(st)
          .add(vec2(t.mul(-0.05), 0)),
      ).rgb,
    ),
  )
  diffuseRgb = mix(diffuseRgb, vec3(1), windySnow)

  /* Normal: normal map through the tangent frame, then a perlin bump.
     The material is double-sided, so flip the geometry normal on backfaces
     like the GLSL's faceDirection. */
  const geoNormal = normalView.mul(faceDirection)
  const nTexRaw = texture(normalTex, st).rgb.mul(2).sub(1)
  const nTex = vec3(nTexRaw.xy.mul(uNormalScale), nTexRaw.z)
  const mappedNormal = normalize(tangentTransform(viewPos, geoNormal, st, nTex))
  const finalNormal = perturbNormalArb(
    viewPos,
    mappedNormal,
    dHdxyFwd(perlinTex, st.mul(6), 2),
  )

  /* Post-lighting: distance fog + height/transition alpha fades */
  const depth = smoothstep(
    0.01,
    0.6,
    viewPos.z.add(uFogNear).div(uFogNear.sub(uFogFar)),
  ).mul(transition.oneMinus())
  const outgoing = mix(output.rgb, uLightColor, depth)
  const alpha = output.a
    .mul(smoothstep(-0.8, 1, positionLocal.y))
    .mul(transition.oneMinus())

  const material = new MeshStandardNodeMaterial({
    transparent: true,
    side: DoubleSide,
  })
  material.colorNode = vec4(diffuseRgb, uOpacity.mul(baseSample.a))
  material.normalNode = finalNormal
  material.roughnessNode = clamp(uRoughness, 0.04, 1)
  material.metalnessNode = clamp(uMetalness, 0.04, 1)
  material.outputNode = vec4(outgoing, alpha)

  material.userData.uTransition = uTransition
  material.userData.uColor = uColor
  material.userData.uOpacity = uOpacity
  material.userData.uRoughness = uRoughness
  material.userData.uMetalness = uMetalness
  material.userData.uNormalScale = uNormalScale
  material.userData.uFogNear = uFogNear
  material.userData.uFogFar = uFogFar
  material.userData.uLightColor = uLightColor

  return material
}
