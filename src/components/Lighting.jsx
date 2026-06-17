import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { useTransitionState } from '../state/TransitionContext'

// Scene lighting driven by the active chapter's mood: dim warm night for
// trading, bright sun for capital, soft overcast for marine. Also scales the
// environment-map intensity so the IBL matches.
export function Lighting() {
  const progress = useTransitionState()
  const amb = useRef()
  const dir = useRef()
  const scene = useThree((s) => s.scene)

  useFrame(() => {
    const m = progress.mood
    if (amb.current) {
      amb.current.intensity = m.amb
      amb.current.color.copy(m.ambColor)
    }
    if (dir.current) {
      dir.current.intensity = m.dir
      dir.current.color.copy(m.dirCol)
    }
    scene.environmentIntensity = m.env
    scene.environmentRotation.set(0, m.envRot, 0)
  })

  return (
    <>
      <ambientLight ref={amb} intensity={0.6} />
      <directionalLight
        ref={dir}
        position={[5, 8, 5]}
        intensity={1.5}
        castShadow
      />
    </>
  )
}
