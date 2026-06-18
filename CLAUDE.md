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

Renamed in code identity, comments, and `docs/MOUNTAIN_EXPLAINED.md`:
- Chapter `key`/`label` in `src/config/chapters.js` (drives the leva dropdown: Snow / Night / Meadow / Ocean).
- Components: `Capital.jsx` → `Meadow.jsx` (`Meadow`), `Maritime.jsx` → `Ocean.jsx` (`Ocean`).
- Shader scene-mask variables in `useMountainMaterial.js` and `useBackgroundMaterial.js`
  (`homepage→snow`, `trading→night`, `capital→meadow`, `maritime→ocean`) plus derived vars
  (`uCapitalFog→uMeadowFog`, `tradingFog→nightFog`, `capitalSample→meadowSample`, etc.).

### Old names that were intentionally KEPT (do NOT rename — they are asset/external bindings)

- **Asset filenames**: `capital-min.glb`, `maritime.glb`, `Homepage.glb`,
  `capital-lightmap.webp`, `trading-lightmap.webp`, `maritime-lightmap.webp`.
- **GLB node / material names**: `HomepagePeaks`, `Maritime0/1/2`, `capital-prairie`,
  `capitalMGmountains`, `CapitalForeground`, `CapitalBackground`, group `name='Capital'`.
  These must match the exported 3D assets — renaming breaks loading.
- **`useCapitalForegroundMaterial.js`** — named after the GLB `CapitalForeground` material;
  ports `capital_foreground.glsl`. Asset-bound, so kept.
- **Reference GLSL files** `mountain.glsl`, `background.glsl`, `trading_background.glsl` —
  these are the original upstream reference shaders ("shader gốc / tham chiếu"); kept verbatim
  so they stay 1:1 with the source.
