import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import { usePeakMaterial } from '../materials/usePeakMaterial'
import { useTransitionState } from '../state/TransitionContext'
import { smoothstep } from '../utils/math'

// The floating backdrop peaks that frame the snow scene. They only belong to the
// snow chapter, so they fade out (via the same uTransition the peak shader uses)
// both during a switch and whenever the active page leaves it.
export function Peaks(props) {
  const { nodes, materials } = useGLTF('/Homepage.glb')
  const peaksMaterial = usePeakMaterial(materials.HomepagePeaks)
  const progress = useTransitionState()

  useEffect(() => {
    const u = peaksMaterial.userData
    u.uFogNear.value = 1
    u.uFogFar.value = 2000
    u.uLightColor.value.set('#949fa8')
  }, [peaksMaterial])

  useFrame(() => {
    // 0 on snow, 1 once we move off it; combined with the live wave value so the
    // peaks dissolve with the transition and stay gone for the other chapters.
    const awayFromSnow = smoothstep(0, 0.5, progress.page)
    peaksMaterial.userData.uTransition.value = Math.max(
      progress.transition,
      awayFromSnow,
    )
  })

  return (
    <group {...props} dispose={null}>
      <group name='MONTFORT'>
        <mesh
          name='HomepagePeaks'
          renderOrder={3}
          castShadow
          receiveShadow
          geometry={nodes.HomepagePeaks.geometry}
          material={peaksMaterial}
          position={[149.026, 14.095, 4.235]}
          rotation={[-0.048, 0.441, -0.153]}
          scale={[7.654, 7.654, 9.185]}
        />
        <mesh
          name='HomepagePeaksBG'
          renderOrder={3}
          castShadow
          receiveShadow
          geometry={nodes.HomepagePeaksBG.geometry}
          material={peaksMaterial}
          position={[-201.628, -35.987, 438.015]}
          rotation={[0.943, -1.443, 0.951]}
          scale={[21.869, 21.869, 26.243]}
        />
        <mesh
          name='HomepagePeaks002'
          renderOrder={3}
          castShadow
          receiveShadow
          geometry={nodes.HomepagePeaks002.geometry}
          material={peaksMaterial}
          position={[90.038, 5.263, -64.187]}
          rotation={[2.876, 1.009, -2.628]}
          scale={[5.569, 5.569, 6.683]}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/Homepage.glb')
