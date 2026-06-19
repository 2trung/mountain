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
  vec3,
  vec4,
  float,
  time,
  texture,
  smoothstep,
  mix,
  clamp,
  sin,
  normalize,
  uniform,
  output,
  positionWorld,
  positionView,
  normalView,
  depth,
  perspectiveDepthToViewZ,
  viewZToOrthographicDepth,
} from 'three/tsl'
import { perturbNormalArb, dHdxyFwd, tangentTransform } from './tslUtils'

// TSL port of the reference GLSL sea-rock shader (ocean_sea_rock.glsl) — the
// instanced rocks ringing the ocean island. It's a STANDARD (IBL-lit) PBR
// material like the mountain, so it uses MeshStandardNodeMaterial slots
// (colorNode / normalNode / roughnessNode / metalnessNode) and post-processes
// the lit color in outputNode (emissive foam, distance fog, transition fade).
//
// Only a few of the reference's "sixty" features are compiled in (per the
// shader's active #defines): SIXTY_ENVMAP + SIXTY_NORMALMAP. There is no tMap
// (base color is the flat uColor), no tArmMap/tAoMap (roughness/metalness are
// the plain uniforms, no specular occlusion). The look comes from the rock
// normal map, a noise micro-bump, and the waterline wet/splash shading.
//
// Sampler → /public asset mapping:
//   tNormalMap → rock_normal.webp (the GLSL SIXTY_NORMALMAP sampler)
//   tNoise     → noise.webp (bump perturbation + splash jitter)
// Omitted (no asset / no equivalent):
//   tEnvMap — the scene's <Environment> IBL stands in, exactly like the mountain
export function useSeaRockMaterial() {
  const [normalTex, noiseTex] = useTexture([`${import.meta.env.BASE_URL}rock_normal.webp`, `${import.meta.env.BASE_URL}noise.webp`])

  return useMemo(
    () => createSeaRockMaterial({ normalTex, noiseTex }),
    [normalTex, noiseTex],
  )
}

export function createSeaRockMaterial({ normalTex, noiseTex }) {
  for (const t of [normalTex, noiseTex]) {
    t.wrapS = t.wrapT = RepeatWrapping
  }

  // Dark slate: the reference multiplies the diffuse by 5×(1-wet), so the base
  // color must be much darker than the old baked material's #6a7079 (which, ×5,
  // landed near-white). ×5 of this lands around a believable wet-rock grey.
  const uColor = uniform(new Color('#010101'))
  const uRoughness = uniform(0.85)
  const uMetalness = uniform(0)
  const uNormalScale = uniform(new Vector2(1, 1))
  const uEmissive = uniform(new Color(0, 0, 0))
  const uLightColor = uniform(new Color('#9fadb6')) // distance-fog / sky tone
  const uTransition = uniform(0)
  // Camera near/far — linearize gl_FragCoord.z for the distance fog (same as
  // the mountain; not the reference's per-chapter fog values).
  const uFogNear = uniform(0.1)
  const uFogFar = uniform(5000)

  const st = uv()
  const posW = positionWorld // vWorldPosition (incl. instance matrix)
  const viewPos = positionView // -vViewPosition
  const geoNormal = normalView // normalize(vNormal)
  const t = time // uTime

  /* Base color — diffuseColor = vec4(uColor, uOpacity); no tMap sample. */
  let diffuseRgb = uColor

  /* Normal: rock normal map (tbn * nTex) then a tNoise micro-bump, matching
     the reference's SIXTY_NORMALMAP block + perturbNormalArb(dHdxy_fwd(tNoise)). */
  const nTexRaw = texture(normalTex, st).rgb.mul(2).sub(1)
  const nTex = vec3(nTexRaw.xy.mul(uNormalScale), nTexRaw.z)
  let normal = normalize(tangentTransform(viewPos, geoNormal, st, nTex))
  normal = perturbNormalArb(viewPos, normal, dHdxyFwd(noiseTex, st.mul(6), 1))

  /* Wet shoreline: darken toward the waterline and drop roughness so the wet
     rock turns glossy. roughness = mix(clamp(uRoughness), 0.2, wet). */
  const wet = smoothstep(
    -24,
    -25.2,
    posW.y.add(texture(noiseTex, st.mul(5)).r.mul(0.3)),
  )
  const roughnessOut = mix(clamp(uRoughness, 0.04, 1), 0.2, wet)
  diffuseRgb = diffuseRgb.mul(wet.oneMinus().mul(5))

  /* Animated splash band riding up the rock near the sea surface. */
  const splasher = posW.z.add(posW.x)
  const splash = smoothstep(
    -2,
    1,
    sin(splasher.mul(0.4).add(t))
      .mul(sin(splasher.add(t.mul(0.1))))
      .mul(smoothstep(-1, 1, sin(splasher.mul(0.3).add(t.mul(2))))),
  )
  diffuseRgb = diffuseRgb.add(
    smoothstep(
      splash.mul(1.5).add(-26.5),
      splash.mul(0.8).add(-26.8),
      posW.y.add(
        texture(noiseTex, st.mul(8).add(t.mul(0.05)))
          .r.sub(0.5)
          .mul(2),
      ),
    ),
  )

  /* Emissive foam at the very base (totalEmissiveRadiance). Added before fog,
     like the reference, so the foam also hazes into the distance. */
  const splashZone = smoothstep(-26.5, -24.8, posW.y)
  const emissiveOut = vec3(uEmissive).add(smoothstep(0.7, 0.2, splashZone))

  /* Post-lighting: `output` is the lit color from the standard PBR pipeline. */
  let outgoing = output.rgb.add(emissiveOut)

  // Distance fog toward uLightColor — same computeDepth() port as the mountain,
  // but with the reference sea-rock's tighter smoothstep(0.01, 0.15) ramp.
  const fogViewZ = perspectiveDepthToViewZ(depth, uFogNear, uFogFar)
  const fogDepth = smoothstep(
    0.01,
    0.4,
    viewZToOrthographicDepth(fogViewZ, uFogNear, uFogFar),
  )
  outgoing = mix(outgoing, uLightColor, fogDepth)

  // Fade the rocks out as the chapter transition sweeps past (OPAQUE → alpha 1,
  // then mix(1, 0, smoothstep(0.3, 0.7, uTransition))).
  const transitionFade = smoothstep(0.3, 0.7, uTransition).oneMinus()
  // Submerge fade: the reference relied on its opaque water to hide the rock's
  // base; our water is transparent (depthWrite off), so clip the rock below the
  // sea surface (y ≈ -25.6) instead — otherwise the dark wet rock and the white
  // emissive foam base show straight through the water.
  const submergeFade = smoothstep(-26.4, -25.4, posW.y)
  const alpha = transitionFade.mul(submergeFade)

  const material = new MeshStandardNodeMaterial({ transparent: true })
  material.colorNode = vec4(diffuseRgb, 1)
  material.normalNode = normal
  material.roughnessNode = roughnessOut
  material.metalnessNode = clamp(uMetalness, 0.04, 1)
  material.outputNode = vec4(outgoing, clamp(alpha, 0, 1))

  material.userData.uColor = uColor
  material.userData.uRoughness = uRoughness
  material.userData.uMetalness = uMetalness
  material.userData.uNormalScale = uNormalScale
  material.userData.uEmissive = uEmissive
  material.userData.uLightColor = uLightColor
  material.userData.uTransition = uTransition
  material.userData.uFogNear = uFogNear
  material.userData.uFogFar = uFogFar

  return material
}
