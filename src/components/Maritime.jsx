import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useWaterMaterial } from '../materials/useWaterMaterial'
import { useTransitionState } from '../state/TransitionContext'
import { useChapterVisible } from '../state/useChapterVisible'
import { smoothstep } from '../utils/math'

// Marine chapter props (imported via gltfjsx structure) from maritime.glb: the
// big Sea plane (animated water shader) and the instanced sea rocks, which carry
// their world placement in their instanceMatrix. (The baked DiffuseCloud
// instances rendered as flat slabs and are dropped; the sky dome supplies the
// overcast cloud cover instead.)
export function Maritime(props) {
  const { nodes, materials } = useGLTF('/maritime.glb')
  const water = useWaterMaterial()
  const progress = useTransitionState()
  const ref = useChapterVisible(3)

  // The baked sea-rock material is near-black (it expects the custom shader);
  // give it a real rock color so it reads under the overcast lighting.
  useEffect(() => {
    materials.SeaRock.color.set('#6a7079')
    materials.SeaRock.roughness = 0.85
    materials.SeaRock.metalness = 0
  }, [materials])

  useFrame(() => {
    const u = water.userData
    u.uVisible.value = smoothstep(2.4, 2.9, progress.page)
    u.uTransition.value = progress.transition
    u.uLightColor.value.copy(progress.mood.fog) // water hazes into the sky
  })

  return (
    <group ref={ref} {...props} dispose={null}>
      <mesh
        geometry={nodes.Sea.geometry}
        material={water}
        position={[-7.913, -19, 28.401]}
        scale={[2.5, 1, 2.5]}
        renderOrder={0}
      />
      <instancedMesh
        args={[nodes.Maritime1.geometry, materials.SeaRock, 10]}
        instanceMatrix={nodes.Maritime1.instanceMatrix}
        castShadow
        receiveShadow
      />
      <instancedMesh
        args={[nodes.Maritime2.geometry, materials.SeaRock, 7]}
        instanceMatrix={nodes.Maritime2.instanceMatrix}
        castShadow
        receiveShadow
      />
    </group>
  )
}

useGLTF.preload('/maritime.glb')
