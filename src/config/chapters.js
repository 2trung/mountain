import { clamp01 } from '../utils/math'

// The 4 scene states. `page` feeds the mountain shader's uPage (branchless
// step() masks select the chapter look — see moutain_fragment.glsl); `camT` is
// the normalized position [0..1] along the GLB CameraPath/TargetPath curves.
// The path's end (t = 1) is authored to land exactly on Point-Homepage, so snow
// sits at 1 and the journey flies back along the path toward t = 0.
//
// `mood` now mirrors the reference per-chapter mountainsConfig objects. Mapping
// of the original fields:
//   color            -> mtnColor   (uColor on the mountain material)
//   roughness        -> roughness  (uRoughness)
//   ambient          -> ambColor   (ambientLight.color tint)
//   ambientIntensity -> amb        (ambientLight.intensity)
//   envMapIntensity  -> env        (scene.environmentIntensity)
//   envMapRotation.y -> envRot     (scene.environmentRotation.y, radians)
// `maps` carries the map / map2 / mixMap UV transforms (repeat / offset /
// rotation in radians) applied to the diffuse, second-diffuse and mix samples.
// `fog` is the haze color distant geometry blends toward; the distance fog
// itself is a plain camera-depth fog (no per-chapter near/far — see Mountain).
export const CHAPTERS = [
  {
    key: 'snow',
    label: 'Snow',
    page: 0,
    camT: 1.0,
    mood: {
      bgDark: '#586470',
      bgLight: '#9aa7b2',
      cloud: 0.3,
      mtnColor: '#ffffff',
      roughness: 0.4,
      ambColor: '#a7bbc5',
      amb: 2.39,
      dir: 1.5,
      dirCol: '#ffffff',
      env: 0.33,
      envRot: -1.77,
      fog: '#949fa8',
    },
    maps: {
      map: { repeat: [10, 10], offset: [0, 0], rotation: 0 },
      map2: { repeat: [1, 50], offset: [0, 0], rotation: 0 },
      mix: { repeat: [1, 1], offset: [0, 0], rotation: 0 },
    },
  },
  {
    key: 'night',
    label: 'Night',
    page: 1,
    camT: 0.8,
    mood: {
      bgDark: '#05080f',
      bgLight: '#16273f',
      cloud: 0.0,
      mtnColor: '#ffffff',
      roughness: 0.9,
      ambColor: '#24648c',
      amb: 1.2,
      dir: 0.7,
      dirCol: '#ffcb95',
      env: 0.43,
      envRot: 0,
      fog: '#0c1422',
    },
    maps: {
      map: { repeat: [15, 15], offset: [0, 0], rotation: 0 },
      map2: { repeat: [30, 30], offset: [0, 0], rotation: 0 },
      mix: { repeat: [1, 1], offset: [0, 0], rotation: 0 },
    },
  },
  {
    key: 'meadow',
    label: 'Meadow',
    page: 2,
    camT: 0.43,
    mood: {
      bgDark: '#74aed8',
      bgLight: '#e7f1f5',
      cloud: 0.12,
      mtnColor: '#ffffff',
      roughness: 0.95,
      ambColor: '#ffffff',
      amb: 0.76,
      dir: 2.1,
      dirCol: '#fff1d2',
      env: 1.0,
      envRot: 44,
      fog: '#686868',
    },
    maps: {
      map: { repeat: [20, 20], offset: [0, 0], rotation: 0 },
      map2: { repeat: [30, 30], offset: [0, 0], rotation: 0 },
      mix: { repeat: [1, 1], offset: [0, 0], rotation: 0 },
    },
  },
  {
    key: 'ocean',
    label: 'Ocean',
    page: 3,
    camT: 0.19,
    // Explicit low, near-water viewpoint (the path point sits too high and the
    // white island base fills the frame). Looks across the sea at the island.
    // cam: { pos: [8, -19, 298], lookAt: [-8, 9, 11] },
    mood: {
      bgDark: '#7f8d98',
      bgLight: '#bcc7ce',
      cloud: 0.55,
      mtnColor: '#948f8c',
      roughness: 1.0,
      ambColor: '#beccd2',
      amb: 0.3,
      dir: 0.55,
      dirCol: '#d2dae1',
      env: 1.0,
      envRot: 4,
      fog: '#9fadb6',
    },
    maps: {
      map: {
        repeat: [12, 16],
        offset: [-5, -5],
        rotation: (190 * Math.PI) / 180,
      },
      map2: { repeat: [10, 10], offset: [0, 0], rotation: 0 },
      mix: { repeat: [1, 1], offset: [0, 0], rotation: 0 },
    },
  },
]

// Identity map transforms — fallback when a chapter declares no `maps`.
export const IDENTITY_MAPS = {
  map: { repeat: [1, 1], offset: [0, 0], rotation: 0 },
  map2: { repeat: [1, 1], offset: [0, 0], rotation: 0 },
  mix: { repeat: [1, 1], offset: [0, 0], rotation: 0 },
}

export const mapsForPage = (page) =>
  CHAPTERS[Math.round(clamp01(page / 3) * 3)].maps ?? IDENTITY_MAPS

// leva dropdown map: { Snow: 0, Night: 1, ... } → chapter index
export const CHAPTER_OPTIONS = CHAPTERS.reduce(
  (acc, c, i) => ({ ...acc, [c.label]: i }),
  {},
)

export const moodForPage = (page) =>
  CHAPTERS[Math.round(clamp01(page / 3) * 3)].mood
