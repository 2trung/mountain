import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTransitionState } from './TransitionContext'

export function useChapterVisible(page) {
  const progress = useTransitionState()
  const ref = useRef()
  useFrame(() => {
    if (ref.current) ref.current.visible = Math.round(progress.page) === page
  })
  return ref
}
