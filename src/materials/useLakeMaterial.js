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
  max,
  pow,
  dot,
  length,
  normalize,
  uniform,
  reflector,
  positionView,
  normalView,
} from 'three/tsl'
import { rotateUv, tangentTransform } from './tslUtils'

// TSL port of the reference GLSL lake shader (lake.glsl) — the reflective pond
// in the meadow valley. It rotates the uv, drives two animated normal-map
// layers through the tangent frame, then mixes a real planar reflection of the
// scene (the mountain) with a Blinn-Phong specular highlight, fading on
// transition.
//
// The original samples a planar-reflection render target via
// texture2DProj(tDiffuse, vReflectUv). The WebGPU/TSL backend provides exactly
// that through reflector(): a mirror render-target node whose `target` Object3D
// defines the reflection plane. We orient that plane by parenting target to the
// (horizontal) lake mesh in Meadow.jsx, and ripple the lookup by offsetting the
// reflector uv with the perturbed surface normal — the equivalent of the GLSL's
// `reflectUv.rgb += normal`.
//
// Sampler → asset mapping:
//   tNoiseNormal → noise-solid-normal.webp (the rippling normal detail)
//   tNoise       → noise.webp (uv warp before the normal lookups)
//   tDiffuse     → reflector() (live planar reflection of the mountain)
export function useLakeMaterial() {
  const [normalTex, noiseTex] = useTexture([
    `${import.meta.env.BASE_URL}noise-solid-normal.webp`,
    `${import.meta.env.BASE_URL}noise.webp`,
  ])

  return useMemo(
    () => createLakeMaterial({ normalTex, noiseTex }),
    [normalTex, noiseTex],
  )
}

export function createLakeMaterial({ normalTex, noiseTex }) {
  for (const t of [normalTex, noiseTex]) {
    t.wrapS = t.wrapT = RepeatWrapping
  }

  const uTransition = uniform(0)
  const uVisible = uniform(0) // chapter gate (1 on meadow)
  // Reference uTransitionColor (linear RGB).
  const uTransitionColor = uniform(new Color(0.7084, 0.6939, 0.6584))
  const uDistortion = uniform(0.05) // ripple strength of the reflection lookup

  // Live planar reflection of the scene. `target` (added under the lake mesh in
  // Meadow.jsx) defines the mirror plane; the node samples it in screen space.
  const mirror = reflector({ resolutionScale: 0.5, bounces: false })

  const st = uv()
  const viewPos = positionView // -vViewPosition (GLSL)
  const geoNormal = normalView // vNormal

  const fragment = Fn(() => {
    const lt = time.mul(0.03) // GLSL: time = uTime * .03
    const roughness = float(0.1)

    // Base lake tint: bright blue, brightened toward the rim.
    let color = vec3(0.42, 0.8, 1).mul(
      smoothstep(0, 0.4, length(st.sub(0.5)))
        .mul(0.5)
        .add(0.6),
    )

    // Warp the uv, then sample two animated normal layers (ripple strength .025).
    let dUv = rotateUv(st, vec2(0.5, 0.5), 0.4)
    dUv = dUv.add(
      texture(noiseTex, st.mul(6).add(vec2(-0.5, 0.2).mul(lt))).rg.mul(0.025),
    )
    const nTex = texture(normalTex, dUv.mul(3).add(time.mul(0.02)))
      .rgb.mul(2)
      .sub(1)
      .add(
        texture(normalTex, dUv.mul(5).sub(time.mul(0.017)))
          .rgb.mul(2)
          .sub(1),
      )
    const normal = normalize(tangentTransform(viewPos, geoNormal, dUv, nTex))

    // Planar reflection of the mountain, rippled by the perturbed normal
    // (GLSL: reflectUv.rgb += normal), with the original contrast boost on dim
    // values.
    mirror.uvNode = mirror.uvNode.add(normal.xy.mul(uDistortion))
    let reflexion = mirror.rgb
    reflexion = reflexion.mul(
      smoothstep(0.7, 0, length(reflexion)).mul(2.2).add(1),
    )

    // Blinn-Phong highlight from a fixed key light.
    // -vViewPosition = positionView, so lightPos - vViewPosition = lightPos +
    // positionView, and viewDir = normalize(-vViewPosition) = normalize(viewPos).
    const lightDir = normalize(vec3(10, 10, 0).add(viewPos))
    const viewDir = normalize(viewPos)
    const halfway = normalize(lightDir.add(viewDir))
    const spec = pow(max(dot(normal, halfway), 0), float(1).sub(roughness))
    const specular = reflexion.add(0.6).mul(spec)

    color = mix(color, reflexion, spec.mul(0.5).add(0.78))
    color = color.add(specular)

    color = mix(color, uTransitionColor, smoothstep(0, 0.5, uTransition))

    const alpha = smoothstep(1, 0.8, uTransition).mul(uVisible)

    return vec4(color, alpha)
  })

  const material = new MeshBasicNodeMaterial({
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    toneMapped: false,
  })
  material.fragmentNode = fragment()

  material.userData.uTransition = uTransition
  material.userData.uVisible = uVisible
  material.userData.uTransitionColor = uTransitionColor
  material.userData.uDistortion = uDistortion
  // Parent this under the lake mesh so its plane matches the water surface.
  material.userData.reflectorTarget = mirror.target

  return material
}
