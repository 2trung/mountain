import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { MeshBasicNodeMaterial, RepeatWrapping, Color, DoubleSide } from 'three/webgpu'
import {
  Fn,
  uv,
  vec4,
  float,
  time,
  texture,
  smoothstep,
  length,
  clamp,
  uniform,
  varying,
  buffer,
  instanceIndex,
} from 'three/tsl'

// TSL port of ocean_cloud.glsl — the instanced cloud slabs (node Ocean0,
// 3 instances) floating over the Ocean scene.
//
// Faithful notes about the reference fragment:
//   - tMouse doesn't exist in this project, so `mouse` is 0 and every
//     `+ .01 * mouse` term drops out (matches the other ported shaders).
//   - The reference does `alpha = cloud;` which OVERWRITES the two earlier
//     `alpha *= ...` lines, so those — along with vNormal, tPerlin, and the
//     unused `time`/`strength` locals — are dead. Effective result is:
//         cloud  = smoothstep(.5, .1, length(dUv - .5))
//         color  = uLightColor * (.9 + .3 * cloud)
//         alpha  = cloud * smoothstep(.2, 0., uTransition)
//
// vSeed comes from the source vertex shader, read here from the instanceMatrix
// (the only stage instanceIndex exists in):
//     vSeed = instanceMatrix[3][0] + instanceMatrix[3][1] + instanceMatrix[3][2]  (sum of translation)
// The provided fragment doesn't consume it, but without a seed all 3 instances
// sample identical noise and look like the same cloud copied 3×, so vSeed phases
// each instance's noise lookups. (The vertex shader also had vRatio =
// [1][1]/[0][0], but these instances are heavily rotated — that diagonal ratio
// is meaningless off the composed matrix and just squashes the round blob, so
// it's intentionally dropped. The cloud is a round blob, as in the reference.)
export function useOceanCloudMaterial(instancedMesh) {
  const [noiseTex] = useTexture(['/noise.webp'])

  return useMemo(() => {
    noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping

    // Set per frame by Ocean.jsx.
    const uTransition = uniform(0)
    const uLightColor = uniform(new Color('#C2C4BC'))

    // Per-instance seed from the instanceMatrix translation (instanceIndex
    // only exists in the vertex stage). Used purely to phase each instance's
    // noise so the 3 clouds don't sample identically — it does NOT reshape the
    // blob. (The source vertex shader also derived vRatio = [1][1]/[0][0], but
    // these instances are heavily rotated, so that diagonal ratio is meaningless
    // off the composed matrix and only squashes the round cloud — left out.)
    let vSeed = float(0)
    if (instancedMesh?.isInstancedMesh) {
      const im = instancedMesh.instanceMatrix
      const matrix = buffer(im.array, 'mat4', Math.max(im.count, 1)).element(
        instanceIndex,
      )
      const translation = matrix.mul(vec4(0, 0, 0, 1)).xyz
      vSeed = varying(translation.x.add(translation.y).add(translation.z))
    }

    const fragment = Fn(() => {
      const vUv = uv()
      const t = time

      // mouse = clamp(texture(tMouse, ...), 0, 1) -> no tMouse buffer -> 0.
      // Kept as a literal so the structure mirrors the reference.
      const mouse = float(0)

      // Distort the uv with two scrolling noise reads; vSeed phases each
      // instance so the 3 clouds don't end up identical.
      const dUv = vUv.toVar()
      dUv.addAssign(mouse.mul(0.01))
      dUv.addAssign(
        texture(noiseTex, vUv.mul(0.2).add(t.mul(0.02)).add(vSeed))
          .r.sub(0.5)
          .mul(0.2),
      )
      dUv.addAssign(
        texture(noiseTex, vUv.sub(t.mul(0.01)).add(vSeed)).r.sub(0.5).mul(0.1),
      )

      // Round soft blob (reference: smoothstep(.5, .1, length(dUv - .5))).
      const cloud = smoothstep(0.5, 0.1, length(dUv.sub(0.5)))

      const color = uLightColor.mul(cloud.mul(0.3).add(0.9))
      const alpha = cloud.mul(smoothstep(0.2, 0, uTransition))

      return vec4(color, clamp(alpha, 0, 1))
    })

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      // ocean_cloud.glsl writes color with no toneMapping() call (unlike
      // mountain/sea_rock), so opt out of the renderer's tone mapping to keep
      // the bright reference look — same as the background/lake ports.
      toneMapped: false,
    })
    material.fragmentNode = fragment()

    material.userData.uTransition = uTransition
    material.userData.uLightColor = uLightColor

    return material
  }, [noiseTex, instancedMesh])
}
