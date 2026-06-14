import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import {
  MeshBasicNodeMaterial,
  RepeatWrapping,
  Color,
  DoubleSide,
} from 'three/webgpu'
import {
  Fn,
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
  max,
  sin,
  pow,
  length,
  dot,
  normalize,
  uniform,
  positionWorld,
  positionView,
} from 'three/tsl'
import { adjustSaturation, tangentTransform } from './tslUtils'

// TSL port of the reference GLSL water shader (marine_water.glsl) onto a spawned
// plane (the GLBs ship no water geometry). It builds a rippling surface from
// three layered normal-map samples, a sum-of-sines wave height, foam streaks and
// a specular/translucency term, then fades with the chapter transition.
//
// Sampler → asset mapping:
//   tNoiseNormal → water-normal.webp (the rippling water normal detail)
//   tNoise       → noise.webp (foam break-up)
//   tMap (foam)  → perlinNoise.webp (stand-in for the original foam map)
// Omitted: tDiffuse / vReflectUv — the original samples a planar-reflection
// render target (texture2DProj). There's no Reflector for the WebGPU/TSL
// backend, so the reflection is approximated from sky tones (uSkyColor); the
// downstream highlight/spec/foam math is kept intact. tMouse is dropped (mouse
// = 0 cancels its terms).
export function useWaterMaterial() {
  const [normalTex, noiseTex, foamTex] = useTexture([
    '/water-normal.webp',
    '/noise.webp',
    '/perlinNoise.webp',
  ])

  return useMemo(
    () => createWaterMaterial({ normalTex, noiseTex, foamTex }),
    [normalTex, noiseTex, foamTex],
  )
}

export function createWaterMaterial({ normalTex, noiseTex, foamTex }) {
  for (const t of [normalTex, noiseTex, foamTex]) {
    t.wrapS = t.wrapT = RepeatWrapping
  }

  const uTransition = uniform(0)
  const uVisible = uniform(0) // chapter gate (1 on marine)
  const uWaterColor = uniform(new Color('#2a4150'))
  const uLightColor = uniform(new Color('#949fa8'))
  const uSkyColor = uniform(new Color('#6e8593')) // stands in for the reflection
  const uFogDist = uniform(2600) // relaxed vs the original near-camera 30u fog

  const st = uv()
  const viewPos = positionView // -vViewPosition (GLSL)
  const posW = positionWorld
  const t = time

  const fragment = Fn(() => {
    /* Sum-of-sines wave height (drives a subtle brightness band) */
    const pos = posW.xz
    const wh = 2.0
    let wave = sin(pos.x.mul(0.15).add(t)).mul(wh)
    wave = wave.add(
      sin(pos.y.mul(0.04).sub(pos.x.mul(0.1)).add(t.mul(0.6))).mul(wh),
    )
    wave = wave.add(sin(pos.x.mul(0.1).sub(pos.y.mul(0.2)).sub(t)).mul(wh * 1.2))
    wave = wave.add(
      sin(pos.x.mul(-0.2).add(pos.y.mul(0.05)).add(t)).mul(wh * 0.9),
    )
    const height = wave

    /* Three layers of animated normal detail through the tangent frame */
    const uvCenter = vec2(0.16, 0.05)
    const dUv = st.sub(uvCenter).mul(1.1).add(uvCenter)
    let normal = vec3(0, 1, 0)

    const n1a = texture(normalTex, dUv.mul(5).sub(t.mul(0.02)))
      .rgb.oneMinus()
      .mul(2)
      .sub(1)
    const n1b = texture(normalTex, dUv.mul(8).add(t.mul(0.01)))
      .rgb.oneMinus()
      .mul(2)
      .sub(1)
    let nTex = vec3(n1a.x.mul(-0.5), n1a.y.mul(-0.5), n1a.z).add(n1b.mul(0.3))
    normal = normalize(
      tangentTransform(viewPos.sub(vec3(0, height, 0)), normal, st, nTex),
    )

    const n2a = texture(normalTex, dUv.mul(42).add(normal.xy.mul(0.2)).sub(t.mul(0.05)))
      .rgb.oneMinus()
      .mul(2)
      .sub(1)
    const n2b = texture(normalTex, dUv.mul(28).add(normal.xy.mul(0.04)).add(t.mul(0.035)))
      .rgb.oneMinus()
      .mul(2)
      .sub(1)
    let nTex2 = n2a.add(n2b)
    nTex2 = vec3(nTex2.x.mul(-0.5), nTex2.y.mul(-0.5), nTex2.z)
    normal = normalize(tangentTransform(viewPos, normal, st, nTex2))

    const n3 = texture(normalTex, dUv.mul(147).add(normal.xy.mul(0.2)).sub(t.mul(0.25)))
      .rgb.mul(2)
      .sub(1)
      .add(
        texture(normalTex, dUv.mul(99).add(normal.xy.mul(0.04)).add(t.mul(0.015)))
          .rgb.mul(2)
          .sub(1),
      )
    const nTex3 = vec3(n3.x.mul(0.1), n3.y.mul(0.1), n3.z)
    normal = normalize(tangentTransform(viewPos, normal, st, nTex3))

    /* Approximated sky reflection + the original contrast tweaks */
    let reflexion = mix(
      uSkyColor.mul(0.6),
      uSkyColor.add(0.1),
      clamp(normal.y.mul(0.5).add(0.5).add(normal.x.mul(0.4)), 0, 1),
    )
    const rlen = length(reflexion)
    reflexion = reflexion.add(
      smoothstep(0.5, 1, rlen).mul(smoothstep(1, 0.7, rlen)).mul(0.5),
    )
    reflexion = reflexion.sub(smoothstep(0.9, 0, rlen).mul(0.2))

    /* Lighting */
    const lightDir = normalize(vec3(200, 20, 100).sub(posW))
    const viewDir = normalize(viewPos)
    const halfway = normalize(lightDir.add(viewDir))
    const trans = pow(max(dot(normal.negate(), halfway), 0), 0.5)
    const spec = pow(max(dot(normal, halfway), 0), 0.8)

    let color = uWaterColor.mul(smoothstep(-20, 20, height).mul(0.4).add(0.8))
    color = color.sub(trans.mul(0.1)).mul(trans.mul(0.5).oneMinus())
    color = mix(color.mul(reflexion.mul(0.3).add(0.7)), reflexion, spec.mul(0.15).add(0.04))

    /* Foam — only subtle wave-crest sparkle. The original's two centered foam
       discs are scene-scale (a small pond) and balloon into a white skirt across
       this huge ±200 Sea plane, drowning the island, so they're dropped. */
    const waver = texture(
      foamTex,
      vec2(st.x, st.y.oneMinus()).add(length(normal.xz).sub(0.06).mul(0.04)),
    ).r
    const waveFoam = sin(waver.mul(10).add(sin(t.mul(0.7)).mul(2)))
      .add(1)
      .mul(0.5)
      .mul(smoothstep(0.55, 0.85, waver))
    color = color.add(waveFoam.mul(0.08))
    color = adjustSaturation(color, 1.2)

    /* Transition wash + edge/visibility alpha + distance fog */
    const wash = smoothstep(0.3, 0, uTransition.sub(length(st.sub(0.5))))
    color = mix(uLightColor, color, wash)

    let alpha = smoothstep(0.6, 0.1, uTransition.sub(length(st.sub(0.5))))
    alpha = alpha
      .mul(smoothstep(0, 0.1, st.x))
      .mul(smoothstep(1, 0.9, st.x))
      .mul(smoothstep(0, 0.1, st.y))
      .mul(smoothstep(1, 0.9, st.y))
      .mul(uVisible)

    const fog = smoothstep(0.01, 0.7, clamp(viewPos.z.negate().div(uFogDist), 0, 1))
    color = mix(color, uLightColor, fog)

    return vec4(color, alpha)
  })

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
  })
  material.fragmentNode = fragment()

  material.userData.uTransition = uTransition
  material.userData.uVisible = uVisible
  material.userData.uWaterColor = uWaterColor
  material.userData.uLightColor = uLightColor
  material.userData.uSkyColor = uSkyColor
  material.userData.uFogDist = uFogDist

  return material
}
