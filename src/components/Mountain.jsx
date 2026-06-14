import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { useCloudMaterial } from '../materials/useCloudMaterial'
import { useMountainMaterial } from '../materials/useMountainMaterial'
import { useTransitionState } from '../state/TransitionContext'

export function Mountain(props) {
  const { nodes } = useGLTF('/mountains.glb')
  const foregroundMaterial = useCloudMaterial(nodes.Foreground)
  const middlegroundMaterial = useCloudMaterial(nodes.Middleground)
  const mountainMaterial = useMountainMaterial()
  const progress = useTransitionState()

  useEffect(() => {
    const u = mountainMaterial.userData
    u.uFogNear.value = 1
    u.uFogFar.value = 2000
    for (const m of [foregroundMaterial, middlegroundMaterial]) {
      m.userData.uSize.value.set(1, 1)
    }
  }, [mountainMaterial, foregroundMaterial, middlegroundMaterial])

  useFrame(() => {
    const u = mountainMaterial.userData
    u.uPage.value = progress.page
    u.uTransition.value = progress.transition
    u.uTransitionDirection.value = progress.transitionDirection
    u.uChapter.value = 0 // kept at 0 so the mesh never alpha-fades out
    u.uLightColor.value.copy(progress.mood.fog) // distance fog → sky tone

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
