import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CatmullRomCurve3, Vector3 } from 'three'
import { CHAPTERS } from '../config/chapters'
import { useTransitionState } from '../state/TransitionContext'
import { clamp01 } from '../utils/math'

// Builds a smooth curve through the points of one of the GLB's path polylines
// (CameraPath / TargetPath), so a chapter's camT can sample a continuous point.
function curveFromGeometry(geometry) {
  const pos = geometry.attributes.position
  const points = []
  for (let i = 0; i < pos.count; i++) {
    points.push(new Vector3().fromBufferAttribute(pos, i))
  }
  return new CatmullRomCurve3(points)
}

export function CameraRig() {
  const { nodes } = useGLTF(`${import.meta.env.BASE_URL}/mountains.glb`)
  const progress = useTransitionState()
  const camera = useThree((s) => s.camera)

  const { camCurve, targetCurve } = useMemo(
    () => ({
      camCurve: curveFromGeometry(nodes.CameraPath.geometry),
      targetCurve: curveFromGeometry(nodes.TargetPath.geometry),
    }),
    [nodes],
  )

  // Scratch vectors reused each frame.
  const v = useMemo(
    () => ({
      posA: new Vector3(),
      tgtA: new Vector3(),
      posB: new Vector3(),
      tgtB: new Vector3(),
      pos: new Vector3(),
      tgt: new Vector3(),
    }),
    [],
  )

  // Resolve a chapter index to a camera position + look-at target: an explicit
  // override if the chapter declares one, otherwise a sample of the GLB path.
  const resolve = (index, outPos, outTgt) => {
    const ch = CHAPTERS[index] ?? CHAPTERS[0]
    if (ch.cam) {
      outPos.set(...ch.cam.pos)
      outTgt.set(...ch.cam.lookAt)
    } else {
      const t = clamp01(ch.camT)
      camCurve.getPointAt(t, outPos)
      targetCurve.getPointAt(t, outTgt)
    }
  }

  useFrame(() => {
    resolve(progress.camFrom, v.posA, v.tgtA)
    resolve(progress.camTo, v.posB, v.tgtB)
    const b = clamp01(progress.camBlend)
    v.pos.lerpVectors(v.posA, v.posB, b)
    v.tgt.lerpVectors(v.tgtA, v.tgtB, b)
    camera.position.copy(v.pos)
    camera.lookAt(v.tgt)
  }, -1)

  return null
}
