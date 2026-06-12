import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import { usePeakMaterial } from '../materials/usePeakMaterial'

export function Model(props) {
  const { nodes, materials } = useGLTF('/Homepage.glb')
  const peaksMaterial = usePeakMaterial(materials.HomepagePeaks)

  // Same leva keys as Mountains.jsx — leva shares the state between them
  const { uTransition } = useControls('Scroll', {
    uTransition: { value: 0, min: 0, max: 1, step: 0.01 },
  })
  const { uFogNear, uFogFar, uLightColor } = useControls('Mountain', {
    uFogNear: { value: 1, min: 0, max: 100, step: 0.1 },
    uFogFar: { value: 1000, min: 100, max: 3000, step: 1 },
    uLightColor: '#949fa8',
  })

  useEffect(() => {
    const u = peaksMaterial.userData
    u.uTransition.value = uTransition
    u.uFogNear.value = uFogNear
    u.uFogFar.value = uFogFar
    u.uLightColor.value.set(uLightColor)
  }, [peaksMaterial, uTransition, uFogNear, uFogFar, uLightColor])

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
