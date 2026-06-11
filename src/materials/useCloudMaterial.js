import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { MeshBasicNodeMaterial, RepeatWrapping, DoubleSide } from 'three/webgpu'
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
  min,
  uniform,
  varying,
  buffer,
  instanceIndex,
  screenUV,
  screenSize,
  normalView,
  positionLocal,
} from 'three/tsl'

// TSL port of the reference GLSL cloud shader (see Cloud_glsl.md).
// Each instanced quad gets a seed (sum of its instanceMatrix translation) and
// an aspect ratio (Y scale / X scale) so every cloud samples the noise
// textures differently. uv.y is distorted by three scrolling noise layers,
// then shaped into a band of cloud with smoothsteps and faded at the quad
// edges. The original's tMouse trail texture is omitted — with mouse = 0 its
// distortion terms cancel out exactly.
//
// Scroll-driven uniforms are exposed on material.userData with neutral
// defaults (the shader renders the plain cloud state until they're animated):
//   uChapter    — chapter scroll progress; > 2.2 tints clouds and wipes them
//                 out bottom-up ("guillotine")
//   uTransition — 0..1 page transition; fades clouds except camera-facing ones
//   uSize       — noise UV scale; also divides the scroll speed
export function useCloudMaterial(instancedMesh) {
  const [perlinTex, noiseTex] = useTexture(['/perlinNoise.webp', '/noise.webp'])

  return useMemo(() => {
    perlinTex.wrapS = perlinTex.wrapT = RepeatWrapping
    noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping

    const uChapter = uniform(0)
    const uTransition = uniform(0)
    const uSize = uniform(vec2(1, 1))

    // Per-instance varyings, read from the instanceMatrix in the vertex
    // stage (instanceIndex only exists there). Basis-vector lengths stand in
    // for the original's matrix[0][0] / matrix[1][1] diagonal reads — equal
    // for the unrotated cloud quads, and robust if any instance rotates.
    let vSeed = float(0)
    let vRatio = float(1)
    if (instancedMesh?.isInstancedMesh) {
      const im = instancedMesh.instanceMatrix
      const matrix = buffer(im.array, 'mat4', Math.max(im.count, 1)).element(
        instanceIndex,
      )
      const translation = matrix.mul(vec4(0, 0, 0, 1)).xyz
      const scaleX = matrix.mul(vec4(1, 0, 0, 0)).xyz.length()
      const scaleY = matrix.mul(vec4(0, 1, 0, 0)).xyz.length()
      vSeed = varying(translation.x.add(translation.y).add(translation.z))
      vRatio = varying(scaleY.div(scaleX))
    }

    const fragment = Fn(() => {
      const st = uv()
      const ratioedUv = vec2(5.0, vRatio).mul(st.add(vSeed.mul(0.1)))
      const resizedUv = uSize.mul(ratioedUv)
      const sUv = screenUV
      const t = time.mul(0.5).div(uSize.x)

      // Distort uv.y with two counter-scrolling noise reads plus a slow
      // perlin modulation — this is what makes the cloud band billow.
      const dUv = st.toVar()
      dUv.y.addAssign(
        texture(noiseTex, resizedUv.mul(0.2).add(vec2(-0.004, -0.02).mul(t)))
          .r.sub(0.5)
          .mul(0.3),
      )
      dUv.y.subAssign(
        texture(noiseTex, resizedUv.mul(0.08).add(vec2(0.005, 0.01).mul(t)))
          .r.sub(0.5)
          .mul(0.5),
      )
      dUv.y.mulAssign(
        texture(perlinTex, resizedUv.mul(0.5).sub(t.mul(0.01)))
          .r.sub(0.5)
          .mul(0.1)
          .add(1.0),
      )

      // Cloud band: soft top edge whose softness itself drifts with noise,
      // plus a lower cutoff that rises toward the quad's right side.
      const smoothness = smoothstep(
        0.4,
        0.7,
        texture(noiseTex, resizedUv.mul(0.08).add(vec2(-0.08, -0.04).mul(t))).r,
      )
      const clouds = smoothstep(
        float(0.9).sub(smoothness.mul(0.1)),
        float(0.7),
        dUv.y,
      ).toVar()
      clouds.mulAssign(
        smoothstep(0.0, 0.2, dUv.y.sub(smoothstep(0.4, 1.0, dUv.x).mul(0.2))),
      )

      // Fade the band at all four quad edges, then add an always-opaque
      // inner core so the cloud center never fully dissolves.
      const alpha = clouds
        .mul(smoothstep(1.0, 0.9, st.y))
        .mul(smoothstep(0.0, 0.1, st.y))
        .mul(smoothstep(0.0, 0.1, st.x))
        .mul(smoothstep(1.0, 0.9, st.x))
        .toVar()
      alpha.addAssign(
        smoothstep(0.2, 0.3, st.y)
          .mul(smoothstep(0.7, 0.6, st.y))
          .mul(smoothstep(0.2, 0.3, st.x))
          .mul(smoothstep(0.9, 0.8, st.x)),
      )
      alpha.assign(min(alpha, 1.0))

      // Brighter toward the distorted band's top and bottom, darker mid-band.
      const cloudDarkness = smoothstep(0.4, 1.0, dUv.y).add(
        smoothstep(0.4, 0.0, dUv.y),
      )
      const color = mix(
        vec3(0.82, 0.86, 0.88),
        vec3(0.961, 0.969, 0.976).mul(1.1),
        cloudDarkness,
      ).toVar()

      // Past chapter 2.2 the page text turns white; tint the clouds cooler.
      const whiteText = smoothstep(2.2, 2.3, uChapter)
      color.mulAssign(mix(vec3(1.0), vec3(0.8, 0.85, 0.87), whiteText))

      // "Guillotine": a noisy screen-space wipe that erases the clouds
      // bottom-up as uChapter crosses ~2.2. Neutral (== 1) at uChapter = 0.
      const aspect = screenSize.x.div(screenSize.y)
      const guillotineUv = vec2(aspect, 1.0).mul(0.4).mul(sUv)
      const guillotine = smoothstep(
        2.3,
        2.2,
        uChapter.sub(sUv.y.mul(0.3)).add(
          texture(
            noiseTex,
            guillotineUv.add(
              texture(noiseTex, guillotineUv.mul(4.0)).r.mul(0.02),
            ),
          )
            .r.sub(0.5)
            .mul(0.1),
        ),
      )
      alpha.mulAssign(guillotine)

      // Page transition: fade everything out, keeping camera-facing quads
      // (view-space normal ~ +Z) visible the longest.
      alpha.mulAssign(smoothstep(1.0, 0.3, uTransition))
      alpha.mulAssign(
        min(
          1.0,
          smoothstep(0.88, 0.96, normalView.z).add(
            smoothstep(0.05, 0.0, uTransition),
          ),
        ),
      )

      return vec4(color, alpha)
    })

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      depthTest: false,
      side: DoubleSide,
    })
    // The reference vertex shader nudges the quads up with the chapter.
    material.positionNode = positionLocal.add(vec3(0, uChapter.mul(0.01), 0))
    // fragmentNode (not colorNode/opacityNode) to match the reference
    // ShaderMaterial, which wrote gl_FragColor raw — no tone mapping or
    // output color-space conversion on these authored sRGB-ish values.
    material.fragmentNode = fragment()

    material.userData.uChapter = uChapter
    material.userData.uTransition = uTransition
    material.userData.uSize = uSize

    return material
  }, [perlinTex, noiseTex, instancedMesh])
}
