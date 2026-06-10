import { Suspense } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Experience } from './components/Experience'

import * as THREE from 'three/webgpu'
import { WebGPURenderer } from 'three/webgpu'

function App() {
  return (
    <Canvas
      shadows
      camera={{ position: [0, 0, 200], fov: 55 }}
      gl={(props) => {
        extend(THREE)
        const renderer = new WebGPURenderer({
          ...props,
          powerPreference: 'high-performance',
          antialias: true,
          alpha: false,
          stencil: false,
          shadowMap: true,
        })
        return renderer.init().then(() => renderer)
      }}
    >
      <color attach='background' args={['#ececec']} />
      <Suspense fallback={null}>
        <Experience />
      </Suspense>
    </Canvas>
  )
}

export default App
