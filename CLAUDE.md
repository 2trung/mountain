# Project context for Claude

## Scene rename (2026-06-18)

The 4 scenes ("chapters") were renamed. **If a request uses an old name, treat it as the new one.**

| page | Old name           | New name | Description                  |
| ---- | ------------------ | -------- | ---------------------------- |
| 0    | home / homepage    | `snow`   | White snow, homepage         |
| 1    | trading            | `night`  | Late-night, warm light       |
| 2    | capital            | `meadow` | Sunny green prairie          |
| 3    | marine / maritime  | `ocean`  | Cloudy sea, island           |

Combined identifier `hoTra*` (home+trading) → `snowNight*` (e.g. `hoTraSample` → `snowNightSample`).

Renamed everywhere — code, comments, docs, **and the files/assets themselves**:
- Chapter `key`/`label` in `src/config/chapters.js` (drives the leva dropdown: Snow / Night / Meadow / Ocean).
- Components: `Capital.jsx` → `Meadow.jsx` (`Meadow`), `Maritime.jsx` → `Ocean.jsx` (`Ocean`).
- Material module: `useCapitalForegroundMaterial.js` → `useMeadowForegroundMaterial.js`
  (`useMeadowForegroundMaterial` / `createMeadowForegroundMaterial`, `uMeadowFog`, etc.).
- Shader scene-mask variables in `useMountainMaterial.js` and `useBackgroundMaterial.js`
  (`homepage→snow`, `trading→night`, `capital→meadow`, `maritime→ocean`) plus derived vars
  (`uCapitalFog→uMeadowFog`, `tradingFog→nightFog`, `capitalSample→meadowSample`, etc.).
- **GLB files**: `Homepage.glb`→`snow.glb`, `capital-min.glb`→`meadow-min.glb`, `maritime.glb`→`ocean.glb`.
  Chapter assets now live in per-chapter folders under `public/` (see "Public layout" below).
- **GLB node names** (re-exported by hand): `HomepagePeaks*`→`SnowPeaks*`, `capital-prairie`→`meadow-prairie`,
  `capitalMGmountains`→`meadowMGmountains`, `Maritime0/1/2`→`Ocean0/1/2`, groups `Capital`→`Meadow`.
- **Lightmap textures**: `capital-lightmap.webp`→`meadow-lightmap.webp`,
  `trading-lightmap.webp`→`night-lightmap.webp`, `maritime-lightmap.webp`→`ocean-lightmap.webp`,
  `homepage-lightmap.webp`→`snow-lightmap.webp`.
- **Reference GLSL files**: `capital_foreground.glsl`→`meadow_foreground.glsl`,
  `trading_background.glsl`→`night_background.glsl`, `maritime_sea_rock.glsl`→`ocean_sea_rock.glsl`,
  `maritime_water.glsl`→`ocean_water.glsl`, `reflect_mountain_maritime.glsl`→`reflect_mountain_ocean.glsl`.

GLB-internal material names were also re-exported: `snow.glb` material `SnowPeaks`,
`meadow-min.glb` materials `MeadowForeground` / `MeadowBackground`. Code `materials.*` lookups updated.

### Public layout

Each chapter's own assets live in a folder named after the chapter; shared assets stay at the `public/` root.

```
public/
  snow/   snow.glb, snow-lightmap.webp
  night/  night-lightmap.webp
  meadow/ meadow-min.glb, meadow-lightmap.webp
  ocean/  ocean.glb, ocean-lightmap.webp
  mountains.glb + shared textures (noise/perlin/voronoi/rock/grass/snow/env…) at root
```

### Generic (non-scene) names kept on purpose (do NOT "fix")

- GLB nodes/materials `Sea`, `DiffuseCloud`, `SeaRock`,
  `Mountain`, `Skybox`, `Foreground`, `Middleground`, `CameraPath`, `TargetPath`; reference shaders
  `mountain.glsl`, `background.glsl`, `lake.glsl`, `sun.glsl`; textures like `snow_diffuse.webp`,
  `snowRockMix.webp` (texture types, not chapters).
