import { Environment, OrbitControls } from '@react-three/drei'
import { Background } from './Background'
import { CameraRig } from './CameraRig'
import { Lighting } from './Lighting'
import { Mountain } from './Mountain'
import { Peaks } from './Peaks'
import { Meadow } from './Meadow'
import { Ocean } from './Ocean'

export const Experience = () => {
  return (
    <>
      <CameraRig />
      <Environment files={`${import.meta.env.BASE_URL}envmap-min.exr`} />{' '}
      {/* <Lighting /> */}
      {/* <OrbitControls /> */}
      <Background />
      <Mountain />
      <Peaks />
      <Meadow />
      <Ocean />
    </>
  )
}
