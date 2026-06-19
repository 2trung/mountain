import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useWaterMaterial } from '../materials/useWaterMaterial'
import { useSeaRockMaterial } from '../materials/useSeaRockMaterial'
import { useOceanCloudMaterial } from '../materials/useOceanCloudMaterial'
import { useTransitionState } from '../state/TransitionContext'
import { useChapterVisible } from '../state/useChapterVisible'
import { smoothstep } from '../utils/math'
import { ConstantColorFactor } from 'three'

// Ocean chapter props (imported via gltfjsx structure) from ocean.glb: the
// big Sea plane (animated water shader), the instanced DiffuseCloud slabs
// (Ocean0), and the instanced sea rocks, which all carry their world placement
// in their instanceMatrix.
export function Ocean(props) {
  const { nodes, materials } = useGLTF('/ocean/ocean.glb')
  // The Sea material's baked map is the GLSL `tMap` (the "waves" shoreline mask).
  const water = useWaterMaterial(materials.Sea.map)
  // TSL port of ocean_sea_rock.glsl, replacing the near-black baked material.
  const seaRock = useSeaRockMaterial()
  // TSL port of ocean_cloud.glsl, replacing the baked DiffuseCloud material.
  const cloud = useOceanCloudMaterial(nodes.Ocean0)
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

    const c = cloud.userData
    c.uTransition.value = progress.transition
    // Reference convention: cloud uLightColor <- chapter bgLight (same pairing
    // the background dome uses), not the dimmer fog haze color.
    c.uLightColor.value.copy(progress.mood.bgLight)
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
      <primitive object={nodes.Ocean0} material={cloud} renderOrder={3} />
      <primitive
        object={nodes.Ocean1}
        material={seaRock}
        castShadow
        receiveShadow
        renderOrder={3}
      />
      <primitive
        object={nodes.Ocean2}
        material={seaRock}
        castShadow
        receiveShadow
        renderOrder={3}
      />
    </group>
  )
}

useGLTF.preload('/ocean/ocean.glb')
