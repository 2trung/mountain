import { OrbitControls, useGLTF } from "@react-three/drei";
import { MODELS } from "../assets";

export const Experience = () => {
  // Both GLBs are preloaded in assets.js, so these resolve from cache.
  const homepage = useGLTF(MODELS.homepage);
  const mountains = useGLTF(MODELS.mountains);

  return (
    <>
      <OrbitControls />
      <ambientLight intensity={0.6} />
      <directionalLight position={[5, 8, 5]} intensity={1.5} castShadow />

      {/* mountains.glb — the large scene */}
      <primitive object={mountains.scene} />

      {/* Homepage.glb — offset so the two don't overlap */}
      <primitive object={homepage.scene} position={[3, 0, 0]} />
    </>
  );
};
