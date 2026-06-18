import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import { useChapterVisible } from '../state/useChapterVisible'
import { useTransitionState } from '../state/TransitionContext'
import { useMeadowForegroundMaterial } from '../materials/useMeadowForegroundMaterial'
import { useLakeMaterial } from '../materials/useLakeMaterial'
import { clamp01, smoothstep } from '../utils/math'

export function Meadow(props) {
  const { nodes, materials } = useGLTF('/meadow/meadow-min.glb')
  const ref = useChapterVisible(2)
  const progress = useTransitionState()
  const camera = useThree((s) => s.camera)

  // The GLB MeadowForeground material carries the baked prairie textures: its
  // base map (seamless grass, uv0) and its emissive lightmap (uv1). Feed both
  // into the TSL port of meadow_foreground.glsl.
  const foreground = useMeadowForegroundMaterial({
    baseMap: materials.MeadowForeground.map,
    lightMap: materials.MeadowForeground.emissiveMap,
  })
  const lake = useLakeMaterial()

  useEffect(() => {
    // Near-fog depth linearizes against the camera's own near/far (the
    // reference's hardcoded 0.01/50 over-fogs this larger world scale).
    foreground.userData.uFogNear.value = camera.near
    foreground.userData.uFogFar.value = camera.far
  }, [foreground, camera])

  useFrame(() => {
    const fg = foreground.userData
    fg.uChapter.value = 0 // visibility toggle handles the chapter swap
    fg.uTransition.value = progress.transition
    fg.uRoughness.value = progress.mood.roughness
    fg.uLightColor.value.copy(progress.mood.fog) // depth haze → sky tone

    const lk = lake.userData
    lk.uTransition.value = progress.transition
    lk.uVisible.value =
      clamp01(smoothstep(1.4, 1.9, progress.page)) *
      clamp01(smoothstep(2.6, 2.1, progress.page))
  })

  return (
    <group ref={ref} {...props} dispose={null}>
      <group name='MONTFORT'>
        <group name='Meadow' position={[-69.803, 6.596, 0.499]}>
          <mesh
            name='meadow-prairie'
            renderOrder={3}
            castShadow
            receiveShadow
            geometry={nodes['meadow-prairie'].geometry}
            material={foreground}
            position={[-100.174, -37.921, 34.493]}
          />
          <mesh
            name='meadowMGmountains'
            castShadow
            receiveShadow
            geometry={nodes.meadowMGmountains.geometry}
            material={materials.MeadowBackground}
            position={[-37.625, 27.279, 105.855]}
            rotation={[0, -0.77, 0]}
            scale={1.108}
          />
        </group>
        {/* Lake plane the prairie's transparent hole reveals (lake.glsl port).
            Spawned at the GLB LakePos locator; size is tuned to cover the hole. */}
        <mesh
          name='Lake'
          renderOrder={2}
          material={lake}
          position={[-167.995, -34.498, 40.655]}
          rotation={[-Math.PI / 2, 0, 0]}
        >
          <planeGeometry args={[60, 60]} />
          {/* Mirror plane for the reflection (local +Z → world +Y here). */}
          <primitive object={lake.userData.reflectorTarget} />
        </mesh>
      </group>
    </group>
  )
}

useGLTF.preload('/meadow/meadow-min.glb')
