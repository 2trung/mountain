import { useRef } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useBackgroundMaterial } from '../materials/useBackgroundMaterial'
import { useTransitionState } from '../state/TransitionContext'

// The sky dome behind everything. Its look is UV-based (not view-direction
// based), so we recenter it on the camera every frame — that guarantees the
// dome always wraps the view (the marine camera otherwise drifts to its edge)
// without changing the rendered pattern. Drawn first, depth-test off, so it can
// never occlude the scene.
export function Background(props) {
  const { nodes } = useGLTF('/mountains.glb')
  const material = useBackgroundMaterial()
  const progress = useTransitionState()
  const camera = useThree((s) => s.camera)
  const group = useRef()

  useFrame(() => {
    if (group.current) group.current.position.copy(camera.position)
    const u = material.userData
    u.uPage.value = progress.page
    u.uTransition.value = progress.transition
    u.uDarkColor.value.copy(progress.mood.bgDark)
    u.uLightColor.value.copy(progress.mood.bgLight)
  })

  return (
    <group ref={group} {...props}>
      <mesh
        name='Skybox'
        renderOrder={-1000}
        frustumCulled={false}
        geometry={nodes.Skybox.geometry}
        material={material}
        position={[0, 42.344, 0]}
        scale={100}
      />
    </group>
  )
}

useGLTF.preload('/mountains.glb')
