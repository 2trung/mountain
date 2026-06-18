import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useWaterMaterial } from '../materials/useWaterMaterial'
import { useSeaRockMaterial } from '../materials/useSeaRockMaterial'
import { useTransitionState } from '../state/TransitionContext'
import { useChapterVisible } from '../state/useChapterVisible'
import { smoothstep } from '../utils/math'

// Ocean chapter props (imported via gltfjsx structure) from maritime.glb: the
// big Sea plane (animated water shader) and the instanced sea rocks, which carry
// their world placement in their instanceMatrix. (The baked DiffuseCloud
// instances rendered as flat slabs and are dropped; the sky dome supplies the
// overcast cloud cover instead.)
export function Ocean(props) {
  const { nodes, materials } = useGLTF('/maritime.glb')
  // The Sea material's baked map is the GLSL `tMap` (the "waves" shoreline mask).
  const water = useWaterMaterial(materials.Sea.map)
  // TSL port of maritime_sea_rock.glsl, replacing the near-black baked material.
  const seaRock = useSeaRockMaterial()
  const progress = useTransitionState()
  const ref = useChapterVisible(3)
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    // Distance fog linearizes depth with the camera's own near/far (matches Mountain).
    const u = seaRock.userData
    u.uFogNear.value = camera.near
    u.uFogFar.value = camera.far
  }, [seaRock, camera])

  useFrame(() => {
    const u = water.userData
    u.uVisible.value = smoothstep(2.4, 2.9, progress.page)
    u.uTransition.value = progress.transition
    u.uLightColor.value.copy(progress.mood.fog) // water hazes into the sky

    const r = seaRock.userData
    r.uTransition.value = progress.transition
    r.uLightColor.value.copy(progress.mood.fog) // rocks haze into the sky too
  })

  return (
    <group ref={ref} {...props} dispose={null}>
      <mesh
        geometry={nodes.Sea.geometry}
        material={water}
        position={[-7.913, -25.633, 28.401]}
        // scale={[2.5, 1, 2.5]}
        renderOrder={2}
      />
      <mesh
        name='Maritime0'
        castShadow
        receiveShadow
        geometry={nodes.Maritime0.geometry}
        material={materials.DiffuseCloud}
        renderOrder={3}
      />
      {/* Maritime1/2 are EXT_mesh_gpu_instancing nodes (InstancedMesh): render
          the node itself so its instanceMatrix places every rock — a plain
          <mesh geometry=...> would collapse them to a single copy at origin.
          Override only the material with the TSL sea-rock port. */}
      <primitive
        object={nodes.Maritime1}
        material={seaRock}
        castShadow
        receiveShadow
        renderOrder={3}
      />
      <primitive
        object={nodes.Maritime2}
        material={seaRock}
        castShadow
        receiveShadow
        renderOrder={3}
      />
    </group>
  )
}

useGLTF.preload('/maritime.glb')
