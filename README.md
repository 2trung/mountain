# Mountain

An interactive WebGPU mountain scene built with **Three.js** and **React Three Fiber**. A single mountain mesh morphs through four atmospheric "chapters" — **Snow → Night → Meadow → Ocean** — each with its own lighting, color grading, weather, and camera viewpoint, blended together by an animated GPU "energy wave" transition.

🔗 **Live demo:** https://2trung.github.io/mountain

## Tech stack

|           |                                                    |
| --------- | -------------------------------------------------- |
| Renderer  | `three` `0.184` (`three/webgpu` + TSL)             |
| Framework | React `19`, `@react-three/fiber` `9`               |
| Helpers   | `@react-three/drei`, `@react-three/postprocessing` |
| Build     | Vite `8`                                           |
| Deploy    | `gh-pages`                                         |

## Getting started

```bash
# install (npm, yarn, or pnpm)
npm install

# dev server (Vite)
npm run dev

# production build → dist/
npm run build

# preview the production build locally
npm run preview
```
