import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import { MeshStandardNodeMaterial } from 'three/webgpu'
import { positionLocal, smoothstep } from 'three/tsl'

export function Model(props) {
  const { nodes, materials } = useGLTF('/Homepage.glb')

  const peaksMaterial = useMemo(() => {
    const source = materials.HomepagePeaks
    const material = new MeshStandardNodeMaterial()
    for (const key in source) material[key] = source[key]
    material.transparent = true
    material.opacityNode = smoothstep(-0.8, 1.0, positionLocal.y)
    return material
  }, [materials])

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
