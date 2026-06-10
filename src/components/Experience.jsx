import { useLayoutEffect } from 'react'
import { OrbitControls, useGLTF } from '@react-three/drei'
import { useThree } from '@react-three/fiber'
import { Vector3 } from 'three'
import { Model as Mountains } from './Mountains'
import { Model as Homepage } from './Homepage'

function CameraRig() {
  const { nodes } = useGLTF('/mountains.glb')
  const camera = useThree((s) => s.camera)
  const controls = useThree((s) => s.controls)

  useLayoutEffect(() => {
    const point = nodes['Point-Homepage']
    const target = nodes['TargetPoint-Homepage']
    if (!point || !target) return

    const camPos = point.getWorldPosition(new Vector3())
    const lookAt = target.getWorldPosition(new Vector3())

    camera.position.copy(camPos)
    camera.lookAt(lookAt)

    if (controls) {
      controls.target.copy(lookAt)
      controls.update()
    }
  }, [nodes, camera, controls])

  return null
}

export const Experience = () => {
  return (
    <>
      <OrbitControls makeDefault />
      <CameraRig />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />

      <Mountains />
      <Homepage />
    </>
  )
}
