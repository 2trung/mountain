import { createContext, useContext, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useControls } from 'leva'
import { Color } from 'three'
import { CHAPTERS, CHAPTER_OPTIONS, moodForPage } from '../config/chapters'
import { lerp, smoothstep } from '../utils/math'

// Single source of truth for the scene's animated scroll state. It is a plain
// mutable object (not React state) shared through context: TransitionDriver
// writes it every frame and the material components read it in their own
// useFrame, so switching chapters never triggers a React re-render.
const TransitionContext = createContext(null)
export const useTransitionState = () => useContext(TransitionContext)

export function TransitionProvider({ children }) {
  const progress = useMemo(() => {
    const m = CHAPTERS[0].mood
    return {
      page: CHAPTERS[0].page, // uPage — selects the chapter look
      transition: 0, // uTransition — 0..1 energy-wave sweep
      transitionDirection: 1, // uTransitionDirection — 1 = wave (vs flat fade)
      // Camera viewpoint blend: from/to chapter indices + 0..1 blend factor.
      camFrom: 0,
      camTo: 0,
      camBlend: 1,
      // Live, smoothly interpolated atmosphere read by lights/sky/fog.
      mood: {
        bgDark: new Color(m.bgDark),
        bgLight: new Color(m.bgLight),
        fog: new Color(m.fog),
        dirCol: new Color(m.dirCol),
        cloud: m.cloud,
        amb: m.amb,
        dir: m.dir,
        env: m.env,
      },
    }
  }, [])

  return (
    <TransitionContext.Provider value={progress}>
      <TransitionDriver progress={progress} />
      {children}
    </TransitionContext.Provider>
  )
}

// Seconds spent covering the mountain with the wave, then revealing the new one.
const COVER_TIME = 1.0
const REVEAL_TIME = 1.0

// Drives the chapter switch animation. When the leva State differs from the
// rendered page it runs a two-phase wave (referencing moutain_fragment.glsl's
// transitionWave): cover ramps uTransition 0→1 so the wave climbs the mountain
// from top to bottom and hides the mesh, the page is swapped at full cover, then
// reveal ramps 1→0 to wash the new chapter in. The camera glides along the path
// across both phases.
function TransitionDriver({ progress }) {
  const { State } = useControls({
    State: { value: 0, options: CHAPTER_OPTIONS },
  })

  const anim = useRef({ phase: 'idle', t: 0, from: 0, to: 0 }).current
  const tmpCol = useRef(new Color()).current

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 30) // guard against tab-switch dt spikes
    const target = CHAPTERS[State]

    // Ease the live atmosphere toward the active chapter's mood. Done off the
    // discrete page so lights/sky cross-fade smoothly through the switch.
    const m = moodForPage(progress.page)
    const md = progress.mood
    const k = Math.min(1, dt * 2.5)
    md.bgDark.lerp(tmpCol.set(m.bgDark), k)
    md.bgLight.lerp(tmpCol.set(m.bgLight), k)
    md.fog.lerp(tmpCol.set(m.fog), k)
    md.dirCol.lerp(tmpCol.set(m.dirCol), k)
    md.cloud = lerp(md.cloud, m.cloud, k)
    md.amb = lerp(md.amb, m.amb, k)
    md.dir = lerp(md.dir, m.dir, k)
    md.env = lerp(md.env, m.env, k)

    if (anim.phase === 'idle' && target.page !== progress.page) {
      const fromIndex = CHAPTERS.findIndex((c) => c.page === progress.page)
      anim.from = fromIndex < 0 ? 0 : fromIndex
      anim.to = State
      anim.phase = 'cover'
      anim.t = 0
    }

    if (anim.phase === 'cover') {
      anim.t = Math.min(1, anim.t + dt / COVER_TIME)
      progress.transition = anim.t
      if (anim.t >= 1) {
        progress.page = CHAPTERS[anim.to].page // swap hidden under full wave
        progress.transition = 1
        anim.phase = 'reveal'
        anim.t = 0
      }
    } else if (anim.phase === 'reveal') {
      anim.t = Math.min(1, anim.t + dt / REVEAL_TIME)
      progress.transition = 1 - anim.t
      if (anim.t >= 1) {
        progress.transition = 0
        anim.phase = 'idle'
      }
    }

    // Camera viewpoint blend across the whole cover (0→0.5) + reveal (0.5→1)
    // span. CameraRig resolves each chapter index to a path sample or override.
    if (anim.phase !== 'idle') {
      const overall = anim.phase === 'cover' ? anim.t * 0.5 : 0.5 + anim.t * 0.5
      progress.camFrom = anim.from
      progress.camTo = anim.to
      progress.camBlend = smoothstep(0, 1, overall)
    } else {
      const idx = CHAPTERS.findIndex((c) => c.page === progress.page)
      progress.camFrom = idx < 0 ? 0 : idx
      progress.camTo = progress.camFrom
      progress.camBlend = 1
    }
  }, -2) // run before the camera rig (-1) and material appliers (0)

  return null
}
