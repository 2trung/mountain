import { Suspense } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Experience } from './components/Experience'

import * as THREE from 'three/webgpu'
import { WebGPURenderer } from 'three/webgpu'

function App() {
  return (
    <Canvas
      shadows
      camera={{ fov: 55 }}
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
      <color attach='background' args={['#949FA8']} />
      <Suspense fallback={null}>
        <Experience />
      </Suspense>
    </Canvas>
  )
}

export default App
