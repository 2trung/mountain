import { Suspense } from 'react'
import { Canvas, extend } from '@react-three/fiber'
import { Experience } from './components/Experience'
import { TransitionProvider } from './state/TransitionContext'

import * as THREE from 'three/webgpu'
import { WebGPURenderer } from 'three/webgpu'

function App() {
  return (
    <Canvas
      shadows
      camera={{ fov: 55, position: [175.856, 45.821, -51.137], far: 5000 }}
      gl={(props) => {
        extend(THREE)
        const renderer = new WebGPURenderer({
          ...props,
          powerPreference: 'high-performance',
          antialias: true,
          alpha: false,
          stencil: false,
          shadowMap: true,
          forceWebGL: true,
        })
        return renderer.init().then(() => renderer)
      }}
    >
      {/* <color attach='background' args={['#0a0e16']} /> */}
      <Suspense fallback={null}>
        <TransitionProvider>
          <Experience />
        </TransitionProvider>
      </Suspense>
    </Canvas>
  )
}

export default App
