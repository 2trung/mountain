import { Environment, OrbitControls } from '@react-three/drei'
import { Background } from './Background'
import { CameraRig } from './CameraRig'
import { Lighting } from './Lighting'
import { Mountain } from './Mountain'
import { Peaks } from './Peaks'
import { Capital } from './Capital'
import { Maritime } from './Maritime'

export const Experience = () => {
  return (
    <>
      <CameraRig />
      <Environment files='/envmap-min.exr' />
      {/* <Lighting /> */}
      {/* <OrbitControls /> */}

      <Background />
      <Mountain />
      <Peaks />
      <Capital />
      <Maritime />
    </>
  )
}
