import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import {
  MeshBasicNodeMaterial,
  RepeatWrapping,
  ClampToEdgeWrapping,
  LinearSRGBColorSpace,
  Matrix4,
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
  positionLocal,
} from 'three/tsl'
import { adjustSaturation, hueShift, tangentTransform } from './tslUtils'

// TSL port of ocean_water.glsl.
//
// Sampler → asset mapping:
//   tNoiseNormal → water-normal.webp
//   tNoise       → noise.webp
//   tMap (foam)  → perlinNoise.webp
//   tDiffuse     → ocean-lightmap.webp (processed via reflect_mountain_ocean.glsl logic)
//
// Reflection approach:
//   The original used texture2DProj(tDiffuse, vReflectUv) where tDiffuse was a
//   live planar-reflection RT rendered through reflect_mountain_ocean.glsl.
//   Here we use ocean-lightmap.webp as a static tDiffuse substitute:
//   - vReflectUv = textureMatrix * vec4(position, 1.0) replicated via
//     uTextureMatrix.mul(vec4(positionLocal, 1)) — values baked from the scene
//   - the reflect shader's contrast curve is applied inline
//   - the reflect shader's height fade (smoothstep(30,15,vPosition.y)) is
//     skipped — at the water plane y≈-19 it evaluates to 1.0 anyway
//
// Intentional simplifications vs. GLSL:
//   - uChapter removed (replaced by uVisible gate + uTransition)
//   - tMouse dropped (mouse = 0 cancels all its terms)
//   - reflexion tint (mix(vec3(1), vec3(0.2, .95-uChapter, 1), ...)) dropped
//     (needs uChapter + screen-space sUv)
//   - Centered foam discs (waveFoamer / foamer) dropped — too large on the
//     ±200-unit Sea plane; they flood the scene white
//   - Fog uses linear viewZ / uFogDist instead of clip-depth near=0.1/far=30
// `foamTex` (the GLSL `tMap`) is the GLB Sea material's baked "waves" map —
// pass materials.Sea.map in. It carries the shoreline mask authored for the
// Sea mesh's exact UVs, so it must come from the GLB, not a re-exported file.
export function useWaterMaterial(foamTex) {
  const [normalTex, noiseTex, lightmapTex] = useTexture([
    '/water-normal.webp',
    '/noise.webp',
    '/ocean/ocean-lightmap.webp',
  ])

  return useMemo(
    () => createWaterMaterial({ normalTex, noiseTex, foamTex, lightmapTex }),
    [normalTex, noiseTex, foamTex, lightmapTex],
  )
}

export function createWaterMaterial({
  normalTex,
  noiseTex,
  foamTex,
  lightmapTex,
}) {
  // Only the tiling detail textures repeat. foamTex is the GLB Sea map
  // (the foam mask); it's sampled at st = (uv-.5)*1.5+.5 which runs to
  // [-0.25, 1.25], so it MUST clamp — Repeat (the glTF default) tiles the
  // blob into the 4 edges. Borders are black, so clamping extends black.
  for (const t of [normalTex, noiseTex]) {
    t.wrapS = t.wrapT = RepeatWrapping
  }
  foamTex.wrapS = foamTex.wrapT = ClampToEdgeWrapping
  foamTex.needsUpdate = true
  lightmapTex.colorSpace = LinearSRGBColorSpace

  const uTransition = uniform(0)
  const uVisible = uniform(0)
  const uWaterColor = uniform(new Color('#1a5a75'))
  const uLightColor = uniform(new Color('#ffffff'))
  const uFogDist = uniform(2600)
  // textureMatrix from vertex shader: textureMatrix * vec4(position, 1.0) → vReflectUv
  // Values are column-major as provided by the scene's Reflector
  const uTextureMatrix = uniform(
    new Matrix4().fromArray([
      0.6559, 0.2811, 0.5374, 0.5369, 0.175, 0.4413, 0.8442, 0.8433, -0.0122,
      0.948, -0.0244, -0.0243, 127.2026, 135.2553, 237.0185, 237.7815,
    ]),
  )

  // vUv = (uv - .5) * 1.5 + .5  (vertex shader)
  const st = uv().sub(0.5).mul(1.5).add(0.5)
  const viewPos = positionView // = -vViewPosition in GLSL
  const posW = positionWorld
  const t = time

  const fragment = Fn(() => {
    /* Sum-of-sines wave height — all 6 terms from water(), diff = vec2(0) */
    const pos = posW.xz
    const wh = 2.0 // large_waveheight
    let wave = sin(pos.x.mul(0.15).add(t)).mul(wh)
    wave = wave.add(
      sin(pos.y.mul(0.04).sub(pos.x.mul(0.1)).add(t.mul(0.6))).mul(wh),
    )
    wave = wave.add(
      sin(pos.x.mul(0.1).sub(pos.y.mul(0.2)).sub(t)).mul(wh * 1.2),
    )
    wave = wave.add(
      sin(pos.x.mul(-0.2).add(pos.y.mul(0.05)).add(t)).mul(wh * 0.9),
    )
    // Small self-referential wave terms (wave fed back into the sin argument)
    wave = wave.add(
      sin(
        pos.x.mul(1.3).sub(pos.y.mul(2.4)).add(wave.mul(1.2)).sub(t.mul(5)),
      ).mul(0.1),
    )
    wave = wave.add(
      sin(
        pos.x.mul(1.1).sub(pos.y.mul(1.8)).sub(wave.mul(0.9)).sub(t.mul(3)),
      ).mul(0.025),
    )
    const height = wave

    /* dUv — GLSL: (vUv - uvCenter) * (1.1 + .8 * uChapter) + uvCenter
       uChapter removed; scale fixed at 1.1 */
    const uvCenter = vec2(0.16, 0.05)
    const dUv = st.sub(uvCenter).mul(1.1).add(uvCenter)

    /* noise — scalar UV perturbation used in layer-2 normal samples */
    const noiseVal = float(1.4).mul(
      texture(noiseTex, dUv.mul(vec2(20, 10)).add(t.mul(0.001))).r.sub(0.5),
    )

    let normal = vec3(0, 1, 0)

    /* Layer 1 normal */
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

    /* Layer 2 normal — noiseVal perturbs both sample UVs */
    const n2a = texture(
      normalTex,
      dUv
        .mul(42)
        .add(normal.xy.mul(0.2))
        .add(noiseVal.mul(0.1))
        .sub(t.mul(0.05)),
    )
      .rgb.oneMinus()
      .mul(2)
      .sub(1)
    const n2b = texture(
      normalTex,
      dUv
        .mul(28)
        .add(normal.xy.mul(0.04))
        .add(noiseVal.mul(0.05))
        .add(t.mul(0.035)),
    )
      .rgb.oneMinus()
      .mul(2)
      .sub(1)
    let nTex2 = n2a.add(n2b)
    nTex2 = vec3(nTex2.x.mul(-0.5), nTex2.y.mul(-0.5), nTex2.z)
    normal = normalize(tangentTransform(viewPos, normal, st, nTex2))

    /* Layer 3 normal */
    const n3 = texture(
      normalTex,
      dUv.mul(147).add(normal.xy.mul(0.2)).sub(t.mul(0.25)),
    )
      .rgb.mul(2)
      .sub(1)
      .add(
        texture(
          normalTex,
          dUv.mul(99).add(normal.xy.mul(0.04)).add(t.mul(0.015)),
        )
          .rgb.mul(2)
          .sub(1),
      )
    const nTex3 = vec3(n3.x.mul(0.1), n3.y.mul(0.1), n3.z)
    normal = normalize(tangentTransform(viewPos, normal, st, nTex3))

    /* tDiffuse — ocean-lightmap.webp via reflect_mountain_ocean.glsl logic.
       vReflectUv = textureMatrix * vec4(position, 1.0), replicated from vertex shader.
       Normal perturbation added before perspective divide (matches texture2DProj). */
    const reflectVec = uTextureMatrix.mul(vec4(positionLocal, 1))
    // texture2DProj: divide by w after adding perturbation (mouse=0 so only normal)
    const pertW = reflectVec.w.add(0.8)
    const reflectSampleUv = vec2(
      reflectVec.x.add(normal.x.mul(0.8)),
      reflectVec.y.add(normal.y.mul(0.8)),
    ).div(pertW)
    let reflexion = texture(lightmapTex, reflectSampleUv).rgb
    // reflect shader: map.rgb *= .05 + .6 * smoothstep(.2, .9, map.rgb)
    reflexion = reflexion.mul(
      float(0.05).add(smoothstep(0.2, 0.9, reflexion).mul(0.6)),
    )
    // reflect shader height fade smoothstep(30,15,y) omitted — equals 1.0 at water depth
    const rlen = length(reflexion)
    reflexion = reflexion.add(
      smoothstep(0.5, 1, rlen)
        .mul(smoothstep(1, 0.7, rlen))
        .mul(0.5),
    )
    reflexion = reflexion.sub(smoothstep(0.9, 0, rlen).mul(0.2))

    /* Lighting */
    const lightDir = normalize(vec3(200, 20, 100).sub(posW))
    const viewDir = normalize(viewPos)
    const halfway = normalize(lightDir.add(viewDir))
    // GLSL: pow(..., 0.5 + uChapter) / pow(..., 0.8 + uChapter) — uChapter removed
    const trans = pow(max(dot(normal.negate(), halfway), 0), 0.5)
    const spec = pow(max(dot(normal, halfway), 0), 0.8)

    let color = uWaterColor.mul(smoothstep(-20, 20, height).mul(0.4).add(0.8))
    color = color.sub(trans.mul(0.1)).mul(trans.mul(0.5).oneMinus())
    // GLSL: mix(color * (.8 + .2 * reflexion), reflexion, 0.2 * spec + .08)
    color = mix(
      color.mul(reflexion.mul(0.2).add(0.8)),
      reflexion,
      spec.mul(0.2).add(0.08),
    )

    /* Foam — centered discs (waveFoamer / foamer) intentionally dropped.
       The GLB Sea map (foam mask) is sampled at the raw mesh UV: no flip and
       no 1.5x scale (GLTFLoader loads it flipY=false), clamped at the edges
       (set above) so it doesn't tile. */
    const waver = texture(
      foamTex,
      uv().add(length(normal.xz).sub(0.06).mul(0.04)),
    ).r
    // GLSL: .8 * (sin(waver*10 + 2*sin(.7*t)) + 1) * smoothstep(0, 0.1, waver)
    const waveFoam = sin(waver.mul(10).add(sin(t.mul(0.7)).mul(2)))
      .add(1)
      .mul(0.8)
      .mul(smoothstep(0, 0.1, waver))
    color = color.add(waveFoam.mul(0.35))
    color = color.add(waver.mul(0.5))

    color = adjustSaturation(color, 1.2)
    color = hueShift(
      color,
      float(-0.3).mul(smoothstep(0.45, 0, posW.z.sub(posW.x).mul(0.001))),
    )

    /* Transition wash + edge / visibility alpha */
    const wash = smoothstep(0.3, 0, uTransition.sub(length(st.sub(0.5))))
    color = mix(uLightColor, color, wash)

    const alpha = smoothstep(
      0.6,
      0.1,
      uTransition.sub(length(st.sub(0.5))),
    ).mul(0.98)

    /* Distance fog */
    const fog = smoothstep(
      0.01,
      0.7,
      clamp(viewPos.z.negate().div(uFogDist), 0, 1),
    )
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
  material.userData.uFogDist = uFogDist
  material.userData.uTextureMatrix = uTextureMatrix

  return material
}
