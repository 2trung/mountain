import { useGLTF } from '@react-three/drei'
import { useChapterVisible } from '../state/useChapterVisible'

// Capital chapter props (imported via gltfjsx structure): the prairie + its
// background mountains from capital-min.glb, authored against the shared chapter
// anchor [-69.803, 6.596, 0.499].
// NOTE: grass-min.glb is origin-authored with no scene placement; it landed as a
// misplaced lump, so it's parked until the right transform is known.
export function Capital(props) {
  const cap = useGLTF('/capital-min.glb')
  const ref = useChapterVisible(2)

  return (
    <group ref={ref} {...props} dispose={null}>
      <group position={[-69.803, 6.596, 0.499]}>
        <mesh
          geometry={cap.nodes['capital-prairie'].geometry}
          material={cap.materials.CapitalForeground}
          position={[-100.174, -37.921, 34.493]}
          receiveShadow
        />
        <mesh
          geometry={cap.nodes.capitalMGmountains.geometry}
          material={cap.materials.CapitalBackground}
          position={[-37.625, 27.279, 105.855]}
          rotation={[0, -0.77, 0]}
          scale={1.108}
        />
      </group>
    </group>
  )
}

useGLTF.preload('/capital-min.glb')
