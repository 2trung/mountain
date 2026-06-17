import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useTransitionState } from './TransitionContext'

// Returns a ref to attach to a chapter group; toggles its visibility so the
// group only renders on its own page. The swap happens at the transition's
// midpoint (page changes under the full wave / sky wash), which hides the pop.
export function useChapterVisible(page) {
  const progress = useTransitionState()
  const ref = useRef()
  useFrame(() => {
    if (ref.current) ref.current.visible = Math.round(progress.page) === page
  })
  return ref
}
