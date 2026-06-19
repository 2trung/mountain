import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { CatmullRomCurve3, Vector3 } from 'three'
import { CHAPTERS } from '../config/chapters'
import { useTransitionState } from '../state/TransitionContext'
import { clamp01, lerp } from '../utils/math'

const PARALLAX_AMOUNT = 1
const PARALLAX_EASE = 0.5

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

  // Scratch vectors reused each frame. `par` holds the smoothed mouse-parallax
  // offset (its x/y trail the pointer for the delayed feel).
  const v = useMemo(
    () => ({
      posA: new Vector3(),
      tgtA: new Vector3(),
      posB: new Vector3(),
      tgtB: new Vector3(),
      pos: new Vector3(),
      tgt: new Vector3(),
      par: new Vector3(),
    }),
    [],
  )

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

  const onPath = (index) => !(CHAPTERS[index] ?? CHAPTERS[0]).cam

  useFrame((state, delta) => {
    const from = progress.camFrom
    const to = progress.camTo
    const b = clamp01(progress.camBlend)

    if (onPath(from) && onPath(to)) {
      const tFrom = clamp01((CHAPTERS[from] ?? CHAPTERS[0]).camT)
      const tTo = clamp01((CHAPTERS[to] ?? CHAPTERS[0]).camT)
      const t = lerp(tFrom, tTo, b)
      camCurve.getPointAt(t, v.pos)
      targetCurve.getPointAt(t, v.tgt)
    } else {
      resolve(from, v.posA, v.tgtA)
      resolve(to, v.posB, v.tgtB)
      v.pos.lerpVectors(v.posA, v.posB, b)
      v.tgt.lerpVectors(v.tgtA, v.tgtB, b)
    }

    camera.position.copy(v.pos)
    camera.lookAt(v.tgt)

    const k = 1 - Math.pow(PARALLAX_EASE, delta)
    v.par.x = lerp(v.par.x, state.pointer.x * PARALLAX_AMOUNT, k)
    v.par.y = lerp(v.par.y, state.pointer.y * PARALLAX_AMOUNT, k)
    camera.translateX(v.par.x)
    camera.translateY(v.par.y)
    camera.lookAt(v.tgt)
  }, -1)

  return null
}
