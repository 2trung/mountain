import { useEffect } from 'react'
import { useGLTF } from '@react-three/drei'
import { useControls } from 'leva'
import { useCloudMaterial } from '../materials/useCloudMaterial'

export function Model(props) {
  const { nodes, materials } = useGLTF('/mountains.glb')
  const foregroundMaterial = useCloudMaterial(nodes.Foreground)
  const middlegroundMaterial = useCloudMaterial(nodes.Middleground)

  const { uChapter, uTransition, uSize } = useControls('Clouds', {
    uChapter: { value: 0, min: 0, max: 3, step: 0.01 },
    uTransition: { value: 0, min: 0, max: 1, step: 0.01 },
    uSize: { value: { x: 1, y: 1 }, min: 0.1, max: 5, step: 0.01 },
  })

  useEffect(() => {
    for (const mat of [foregroundMaterial, middlegroundMaterial]) {
      mat.userData.uChapter.value = uChapter
      mat.userData.uTransition.value = uTransition
      mat.userData.uSize.value.set(uSize.x, uSize.y)
    }
  }, [foregroundMaterial, middlegroundMaterial, uChapter, uTransition, uSize])
  return (
    <group {...props} dispose={null}>
      <group name='MONTFORT'>
        {/* <lineSegments
          name='CameraPath'
          geometry={nodes.CameraPath.geometry}
          material={nodes.CameraPath.material}
        />
        <lineSegments
          name='TargetPath'
          geometry={nodes.TargetPath.geometry}
          material={nodes.TargetPath.material}
        /> */}
        {/* <mesh
          name='Skybox'
          renderOrder={-10}
          castShadow
          receiveShadow
          geometry={nodes.Skybox.geometry}
          material={materials.Sky}
          position={[0, 42.344, 0]}
          scale={100}
        /> */}
        <group name='Homepage' position={[-69.803, 6.596, 0.499]} />
        <group name='Trading' position={[-69.803, 6.596, 0.499]} />
        <group name='FortEnergy' position={[-69.803, 6.596, 0.499]} />
        {/* <lineSegments
          name='Path-TopChapters'
          geometry={nodes['Path-TopChapters'].geometry}
          material={nodes['Path-TopChapters'].material}
        />
        <lineSegments
          name='TargetPath-TopChapters'
          geometry={nodes['TargetPath-TopChapters'].geometry}
          material={nodes['TargetPath-TopChapters'].material}
        /> */}
        <group name='Globe' position={[240.128, -368.833, 0]} />
        <mesh
          name='Mountain'
          renderOrder={1}
          castShadow
          receiveShadow
          geometry={nodes.Mountain.geometry}
          material={materials.Mountain}
          position={[0, -3.242, 0]}
        />
        <group name='CapitalSun' position={[-76, 1.398, 171.841]} />
        <lineSegments
          name='TargetPath-Mobile'
          geometry={nodes['TargetPath-Mobile'].geometry}
          material={nodes['TargetPath-Mobile'].material}
        />
        <group name='Clouds'>
          <primitive
            object={nodes.Foreground}
            material={foregroundMaterial}
            renderOrder={4}
          />
          <primitive
            object={nodes.Middleground}
            material={middlegroundMaterial}
            renderOrder={2}
          />
        </group>
        {/* <group name='TransitionLines'>
          <group name='TransitionLine' position={[-98.195, -16.467, 19.341]} />
          <group
            name='TransitionLine001'
            position={[-78.263, 7.703, -22.207]}
          />
          <group
            name='TransitionLine002'
            position={[-51.593, 19.825, -8.451]}
          />
          <group
            name='TransitionLine003'
            position={[-32.223, 8.223, -66.844]}
          />
          <group name='TransitionLine006' position={[16.344, 9.424, -30.91]} />
          <group
            name='TransitionLine007'
            position={[61.662, -2.629, -35.236]}
          />
          <group name='TransitionLine008' position={[41.61, 20.83, 19.622]} />
          <group name='TransitionLine009' position={[14.94, 24.249, 31.974]} />
          <group name='TransitionLine013' position={[-42.61, 35.709, 36.185]} />
          <group name='TransitionLine014' position={[-68.156, 5.894, 78.014]} />
          <group name='TransitionLine015' position={[-9.764, -15.02, 96.823]} />
          <group name='TransitionLine016' position={[62.103, 11.561, -1.994]} />
          <group
            name='TransitionLine017'
            position={[-16.782, 11.165, -86.776]}
          />
          <group
            name='TransitionLine018'
            position={[-63.665, -9.625, -51.403]}
          />
          <group
            name='TransitionLine020'
            position={[-64.787, 32.925, 20.183]}
          />
          <group
            name='TransitionLine023'
            position={[38.522, -10.92, -63.194]}
          />
          <group
            name='TransitionLine025'
            position={[-95.106, -18.553, 45.73]}
          />
          <group name='TransitionLine026' position={[-15.379, 26.63, 27.202]} />
          <group name='TransitionLine027' position={[-90.615, -9.85, -50.28]} />
          <group
            name='TransitionLine029'
            position={[28.696, -25.345, 87.278]}
          />
          <group
            name='TransitionLine030'
            position={[-100.44, -28.081, 103.842]}
          />
        </group> */}
      </group>
    </group>
  )
}

useGLTF.preload('/mountains.glb')
