import { useGLTF } from '@react-three/drei'
import { useChapterVisible } from '../state/useChapterVisible'

export function Capital(props) {
  const { nodes, materials } = useGLTF('/capital-min.glb')
  const ref = useChapterVisible(2)
  return (
    <group ref={ref} {...props} dispose={null}>
      <group name='MONTFORT'>
        <group name='Capital' position={[-69.803, 6.596, 0.499]}>
          <mesh
            name='capital-prairie'
            castShadow
            receiveShadow
            geometry={nodes['capital-prairie'].geometry}
            material={materials.CapitalForeground}
            position={[-100.174, -37.921, 34.493]}
          />
          <mesh
            name='capitalMGmountains'
            castShadow
            receiveShadow
            geometry={nodes.capitalMGmountains.geometry}
            material={materials.CapitalBackground}
            position={[-37.625, 27.279, 105.855]}
            rotation={[0, -0.77, 0]}
            scale={1.108}
          />
        </group>
        <group name='LakePos' position={[-167.995, -34.498, 40.655]} />
      </group>
    </group>
  )
}

useGLTF.preload('/capital-min.glb')
