import { useGLTF, useTexture } from "@react-three/drei";

// Central registry for every asset shipped in /public.
// Paths are root-relative so Vite serves them straight from /public.
export const MODELS = {
  homepage: "/Homepage.glb",
  mountains: "/mountains.glb",
};

export const TEXTURES = {
  noise: "/noise.webp",
  perlinNoise: "/perlinNoise.webp",
  rockNormal: "/rock_normal.webp",
};

// Preload everything ahead of first render so there is no pop-in.
// useGLTF/useTexture cache by URL, so any later useGLTF(MODELS.x) /
// useTexture(TEXTURES.x) call resolves instantly from cache.
Object.values(MODELS).forEach((url) => useGLTF.preload(url));
useTexture.preload(Object.values(TEXTURES));
