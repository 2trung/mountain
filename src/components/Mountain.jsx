import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useCloudMaterial } from '../materials/useCloudMaterial'
import { useMountainMaterial } from '../materials/useMountainMaterial'
import { useTransitionState } from '../state/TransitionContext'
import { mapsForPage } from '../config/chapters'

export function Mountain(props) {
  const { nodes } = useGLTF('/mountains.glb')
  const foregroundMaterial = useCloudMaterial(nodes.Foreground)
  const middlegroundMaterial = useCloudMaterial(nodes.Middleground)
  const mountainMaterial = useMountainMaterial()
  const progress = useTransitionState()
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    // Distance fog linearizes depth with the camera's own near/far.
    const u = mountainMaterial.userData
    u.uFogNear.value = camera.near
    u.uFogFar.value = camera.far
    for (const m of [foregroundMaterial, middlegroundMaterial]) {
      m.userData.uSize.value.set(1, 1)
    }
  }, [mountainMaterial, foregroundMaterial, middlegroundMaterial, camera])

  useFrame(() => {
    const u = mountainMaterial.userData
    u.uPage.value = progress.page
    u.uTransition.value = progress.transition
    u.uTransitionDirection.value = progress.transitionDirection
    u.uChapter.value = 0 // kept at 0 so the mesh never alpha-fades out
    u.uLightColor.value.copy(progress.mood.fog) // distance fog → sky tone
    u.uColor.value.copy(progress.mood.mtnColor)
    u.uRoughness.value = progress.mood.roughness

    // Per-chapter map UV transforms, snapped to the current page (textures
    // swap under the transition wave, so no need to interpolate them).
    const maps = mapsForPage(progress.page)
    u.uMapRepeat.value.set(maps.map.repeat[0], maps.map.repeat[1])
    u.uMapOffset.value.set(maps.map.offset[0], maps.map.offset[1])
    u.uMapRot.value = maps.map.rotation
    u.uMap2Repeat.value.set(maps.map2.repeat[0], maps.map2.repeat[1])
    u.uMap2Offset.value.set(maps.map2.offset[0], maps.map2.offset[1])
    u.uMap2Rot.value = maps.map2.rotation
    u.uMixRepeat.value.set(maps.mix.repeat[0], maps.mix.repeat[1])
    u.uMixOffset.value.set(maps.mix.offset[0], maps.mix.offset[1])
    u.uMixRot.value = maps.mix.rotation

    // Clouds belong to the homepage only; wipe them (guillotine fires past
    // uChapter 2.2) as soon as we leave home, and fade them during the switch
    // via uTransition.
    const cloudChapter = progress.page >= 1 ? 3 : 0
    for (const m of [foregroundMaterial, middlegroundMaterial]) {
      m.userData.uChapter.value = cloudChapter
      m.userData.uTransition.value = progress.transition
    }
  })

  return (
    <group {...props} dispose={null}>
      <group name='MONTFORT'>
        <mesh
          name='Mountain'
          renderOrder={1}
          castShadow
          receiveShadow
          geometry={nodes.Mountain.geometry}
          material={mountainMaterial}
          position={[0, -3.242, 0]}
        />
        <group name='Clouds'>
          <primitive
            object={nodes.Foreground}
            material={foregroundMaterial}
            renderOrder={4}
          />
          <primitive
            object={nodes.Middleground}
            material={middlegroundMaterial}
            renderOrder={2}
          />
        </group>
      </group>
    </group>
  )
}

useGLTF.preload('/mountains.glb')
