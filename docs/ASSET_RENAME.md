# Asset rename — complete

Scene rename `snow / night / meadow / ocean` is fully applied across code, comments,
docs, and the assets themselves. See `CLAUDE.md` for the old→new name map.

## ✅ Done

- **GLB files**: `Homepage.glb`→`snow.glb`, `capital-min.glb`→`meadow-min.glb`,
  `maritime.glb`→`ocean.glb` (old files removed). Code paths updated.
- **Per-chapter folders**: chapter assets moved to `public/{snow,night,meadow,ocean}/`
  (e.g. `public/ocean/ocean.glb`, `public/meadow/meadow-lightmap.webp`). Shared assets
  (`mountains.glb`, noise/rock/grass/env textures) stay at the `public/` root. Code paths updated.
- **GLB node names**: `SnowPeaks*`, `meadow-prairie`, `meadowMGmountains`, `Ocean0/1/2`,
  groups `Meadow`. Code `nodes.*` lookups updated.
- **GLB material names**: `SnowPeaks` (snow.glb), `MeadowForeground` / `MeadowBackground`
  (meadow-min.glb). Code `materials.*` lookups updated.
- **Lightmap textures**: `meadow-/night-/ocean-/snow-lightmap.webp`. Code paths updated.
- **Reference GLSL files**: `meadow_foreground.glsl`, `night_background.glsl`,
  `ocean_sea_rock.glsl`, `ocean_water.glsl`, `reflect_mountain_ocean.glsl`. Comment refs updated.
- **Material module**: `useCapitalForegroundMaterial.js` → `useMeadowForegroundMaterial.js`.
- `yarn build` passes; all referenced public assets resolve; no old-scene-named files remain.

## Kept on purpose (not scene names)

Generic GLB nodes/materials `Sea`, `DiffuseCloud`, `SeaRock`, `Mountain`, `Skybox`,
`Foreground`, `Middleground`, `CameraPath`, `TargetPath`; reference shaders `mountain.glsl`,
`background.glsl`, `lake.glsl`, `sun.glsl`; textures `snow_diffuse.webp`, `snowRockMix.webp`.
