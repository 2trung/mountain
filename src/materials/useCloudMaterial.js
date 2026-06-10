import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { MeshBasicNodeMaterial, RepeatWrapping, DoubleSide } from 'three/webgpu'
import {
  uv,
  vec2,
  vec3,
  vec4,
  float,
  time,
  texture,
  smoothstep,
  oneMinus,
  mix,
  clamp,
  buffer,
  instanceIndex,
  varying,
} from 'three/tsl'

// Procedural TSL cloud material for the instanced quads in mountains.glb.
// Animated soft puffs: a radial mask fades the quad edges to nothing, while
// two scrolling samples of perlinNoise.webp are multiplied for a wispy,
// slowly-morphing density. Built as a MeshBasicNodeMaterial (unlit) since
// the clouds read as flat, stylized billboards.
//
// Pass the InstancedMesh (e.g. nodes.Foreground) so the shader can read each
// instance's scale out of its instanceMatrix and fade opacity by size:
// bigger cloud instances render fainter/softer, smaller ones denser.
export function useCloudMaterial(instancedMesh) {
  const perlin = useTexture('/perlinNoise.webp')

  return useMemo(() => {
    perlin.wrapS = perlin.wrapT = RepeatWrapping

    const st = uv()

    // Soft circular falloff: 1 at the quad center, 0 by the edges.
    const radial = oneMinus(smoothstep(0.1, 0.5, st.sub(0.5).length()))

    // Two layers of the perlin texture scrolling in different directions
    // give the cloud a living, morphing surface instead of a static blob.
    const t = time.mul(0.015)
    const n1 = texture(perlin, st.mul(1.5).add(vec2(t, t.mul(0.4)))).r
    const n2 = texture(perlin, st.mul(2.6).sub(vec2(t.mul(0.6), t.mul(0.25)))).r
    const density = n1.mul(n2).mul(2.2)

    // Shape into puffs: mask by the radial falloff, then threshold the edge.
    let opacity = smoothstep(0.12, 0.5, radial.mul(density))

    // Fade opacity by instance size, read from the instanceMatrix.
    if (instancedMesh?.isInstancedMesh) {
      const im = instancedMesh.instanceMatrix
      // Same buffer path three uses internally for small instance counts:
      // an array of mat4 indexed by the built-in instanceIndex.
      const matrix = buffer(im.array, 'mat4', Math.max(im.count, 1)).element(
        instanceIndex,
      )
      // Scale of the X basis vector (matrix * unit X) == per-instance X scale,
      // used as the "size" proxy. The cloud instances are non-uniformly
      // scaled (X ~100-200, Y ~500-1000), so a single in-plane axis reads as
      // the visual width better than the towering Y.
      const instanceScale = matrix.mul(vec4(1, 0, 0, 0)).xyz.length()

      // Larger instances → fainter/softer. REFERENCE_SCALE is the size that
      // stays at full opacity; instances bigger than it fade toward the floor.
      // Set to ~the middle of the observed X-scale range (~100-200); tune here.
      const REFERENCE_SCALE = float(150.0)
      const sizeFade = clamp(REFERENCE_SCALE.div(instanceScale), 0.35, 1.0)

      // Resolve per-instance (vertex stage) and interpolate to the fragment.
      opacity = opacity.mul(varying(sizeFade))
    }

    const material = new MeshBasicNodeMaterial({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    })
    material.colorNode = mix(
      vec3(0.78, 0.8, 0.86),
      vec3(1.0, 1.0, 1.0),
      density,
    )
    material.opacityNode = opacity.mul(0.9)

    return material
  }, [perlin, instancedMesh])
}
