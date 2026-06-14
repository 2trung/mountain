import { clamp01 } from '../utils/math'

// The 4 scene states. `page` feeds the mountain shader's uPage (branchless
// step() masks select the chapter look — see moutain_fragment.glsl); `camT` is
// the normalized position [0..1] along the GLB CameraPath/TargetPath curves.
// The path's end (t = 1) is authored to land exactly on Point-Homepage, so home
// sits at 1 and the journey flies back along the path toward t = 0.
//
// `mood` is the per-chapter atmosphere — background sky colors, scene lighting
// and fog — tuned to the reference stills (home: bright snow, trading: dark
// night, capital: sunny day, marine: overcast sea).
export const CHAPTERS = [
  {
    key: 'home',
    label: 'Home',
    page: 0,
    camT: 1.0,
    mood: {
      bgDark: '#586470',
      bgLight: '#9aa7b2',
      cloud: 0.3,
      amb: 0.6,
      dir: 1.5,
      dirCol: '#ffffff',
      env: 1.0,
      fog: '#949fa8',
    },
  },
  {
    key: 'trading',
    label: 'Trading',
    page: 1,
    camT: 0.74,
    mood: {
      bgDark: '#05080f',
      bgLight: '#16273f',
      cloud: 0.0,
      amb: 0.12,
      dir: 0.7,
      dirCol: '#ffcb95',
      env: 0.18,
      fog: '#0c1422',
    },
  },
  {
    key: 'capital',
    label: 'Capital',
    page: 2,
    camT: 0.5,
    mood: {
      bgDark: '#74aed8',
      bgLight: '#e7f1f5',
      cloud: 0.12,
      amb: 0.85,
      dir: 2.1,
      dirCol: '#fff1d2',
      env: 1.3,
      fog: '#d4e6ed',
    },
  },
  {
    key: 'marine',
    label: 'Marine',
    page: 3,
    camT: 0.0,
    // Explicit low, near-water viewpoint (the path point sits too high and the
    // white island base fills the frame). Looks across the sea at the island.
    cam: { pos: [8, -19, 298], lookAt: [-8, 9, 11] },
    mood: {
      bgDark: '#7f8d98',
      bgLight: '#bcc7ce',
      cloud: 0.55,
      amb: 0.4,
      dir: 0.55,
      dirCol: '#d2dae1',
      env: 0.18,
      fog: '#9fadb6',
    },
  },
]

// leva dropdown map: { Home: 0, Trading: 1, ... } → chapter index
export const CHAPTER_OPTIONS = CHAPTERS.reduce(
  (acc, c, i) => ({ ...acc, [c.label]: i }),
  {},
)

export const moodForPage = (page) =>
  CHAPTERS[Math.round(clamp01(page / 3) * 3)].mood
