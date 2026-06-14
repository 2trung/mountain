import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import { MeshBasicNodeMaterial, RepeatWrapping, Color, DoubleSide } from 'three/webgpu'
import {
  Fn,
  uv,
  vec2,
  vec3,
  vec4,
  float,
  time,
  texture,
  smoothstep,
  mix,
  clamp,
  step,
  sin,
  abs,
  floor,
  fract,
  length,
  dot,
  mod,
  uniform,
  screenUV,
  screenSize,
} from 'three/tsl'

// TSL port of the reference GLSL sky/background shader (trading_background.glsl,
// material "Sky"). It paints the dome behind the mountain: a vertical sky
// gradient (uDarkColor → uLightColor), drifting cloud bands on the homepage, a
// band of teal "data" lines on trading, and a wash toward uTransitionColor +
// clouds while a chapter switch plays.
//
// Sampler → asset mapping:
//   tNoise → noise.webp (all cloud/line/dither noise)
// Omitted, because they only feed states unreachable in this 4-state build:
//   tNearestNoise — only the fort-energy starfield (uPage >= 3.5)
//   tMouse        — mouse trail; with mouse = 0 every term it feeds cancels
// Likewise the whoWeAre (uPage < -0.5) and uChapter-driven homepage sea/globe
// blocks are dropped since uPage stays in [0,3] and uChapter stays 0 here.
export function useBackgroundMaterial() {
  const [noiseTex] = useTexture(['/noise.webp'])

  return useMemo(() => createBackgroundMaterial({ noiseTex }), [noiseTex])
}

export function createBackgroundMaterial({ noiseTex }) {
  noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping

  const uPage = uniform(0)
  const uTransition = uniform(0)
  const uDarkColor = uniform(new Color('#586470')) // zenith
  const uLightColor = uniform(new Color('#9aa7b2')) // horizon haze
  const uTransitionColor = uniform(new Color('#5f9bc4')) // energy wash
  const uCloudiness = uniform(0.3) // how much cloud cover the sky shows

  // GLSL rand(gl_FragCoord.xy) — a cheap per-pixel hash used only for dither.
  const rand = (p) =>
    fract(sin(mod(dot(p, vec2(12.9898, 78.233)), Math.PI)).mul(43758.5453))

  const fragment = Fn(() => {
    const st = uv()
    const sUv = screenUV
    const t = time
    const fragCoord = screenUV.mul(screenSize)

    // Chapter masks (uPage >= 0 here, so step(-0.5, uPage) is always 1).
    const homepage = step(0.5, uPage).oneMinus()
    const trading = step(0.5, uPage).mul(step(1.5, uPage).oneMinus())

    // Base sky value: a soft radial darkening scaled by screen height, lifted by
    // a slow noise "cloud" layer. High value = light (horizon), low = dark.
    const dUv = vec2(st.x.add(t.mul(0.01)), st.y)
    const aUv = st.add(vec2(t.mul(-0.004), t.mul(0.002)))
    const noise = texture(noiseTex, dUv).r.mul(texture(noiseTex, aUv).r)
    const dsUv = sUv.add(noise.sub(0.25).mul(0.5))
    const simpleClouds = texture(noiseTex, st.mul(2).add(vec2(t.mul(-0.001), 0))).g
    let value = float(1)
      .sub(length(dsUv.sub(0.5)).mul(sUv.y))
      .add(simpleClouds.mul(0.5))

    // Trading focuses the sky into a dithered glow near the lower-left.
    const ditheredUv = st.add(rand(fragCoord).sub(0.5).mul(0.002))
    const ditheredValue = smoothstep(
      float(0.2).sub(trading.mul(0.08)),
      0,
      length(ditheredUv.sub(vec2(0.34, 0.2))),
    )
    value = mix(value, ditheredValue, trading)

    let color = mix(
      uDarkColor,
      uLightColor.add(homepage.mul(0.08)),
      clamp(value, 0, 1),
    )

    // Trading: faint horizontal "data" lines behind the mountain.
    const uvB = st.mul(vec2(6, -8))
    const basic2Noise = texture(noiseTex, uvB.mul(2.5).mul(vec2(2, 1))).r
    let lines = texture(noiseTex, st.mul(vec2(8, 0.1)).add(vec2(0, t.mul(0.01))))
      .r.mul(0.85)
    lines = smoothstep(float(0.5).sub(value.mul(0.15)), 0.8, lines).mul(
      smoothstep(0.5, 1, value),
    )
    color = color.add(lines.mul(uLightColor).mul(vec3(0.3, 0.7, 0.5)).mul(trading))

    const transition = smoothstep(0, 0.2, uTransition)
    color = mix(color, uTransitionColor, transition)

    // Procedural cloud rows used for the homepage sky and the transition wash.
    const count = float(4)
    const fUv = uvB.add(vec2(t.mul(0.005), 0))
    const cBaseY = uvB.y.mul(count).sub(2)
    const offset = smoothstep(
      texture(noiseTex, uvB.mul(4)).r.mul(0.2).add(0.7),
      1,
      fract(cBaseY),
    )
      .add(floor(cBaseY))
      .mul(1.5)
    const cloudShape = abs(sin(uvB.x.mul(50).add(offset)))
      .mul(-0.01)
      .sub(abs(sin(uvB.x.mul(15).add(offset))).mul(0.03))
      .sub(abs(sin(fUv.x.mul(17).add(offset))).mul(0.02))
      .mul(count)
    let cY = cBaseY.add(cloudShape)
    cY = cY.mul(texture(noiseTex, fUv.mul(0.3)).g.sub(0.5).mul(0.3).add(1))
    cY = cY.add(texture(noiseTex, fUv.mul(0.4)).r.sub(0.5))
    cY = cY.sub(texture(noiseTex, fUv.mul(4)).r.mul(0.05).mul(count))
    let cloudRows = fract(cY)
    cloudRows = cloudRows.add(smoothstep(0.5, 0, cloudRows))

    const sCUv = uvB
      .add(t.mul(0.01))
      .add(texture(noiseTex, uvB).r.mul(0.2))
      .add(vec2(basic2Noise, basic2Noise).mul(0.05))
    const smallCloudsX = smoothstep(
      0.5,
      0.62,
      texture(noiseTex, sCUv.mul(0.1).add(vec2(0, -0.01))).r,
    )
    const smallCloudsY = smoothstep(0.46, 0.5, texture(noiseTex, sCUv.mul(0.1)).r)
    const clouds = clamp(mix(cloudRows, smallCloudsX, smallCloudsY), 0, 1)

    const cloudySkyColor = mix(
      vec3(0.737, 0.773, 0.8),
      vec3(0.961, 0.969, 0.976),
      clouds,
    )
    color = mix(
      color,
      cloudySkyColor,
      clamp(uCloudiness.add(transition), 0, 1).mul(0.5),
    )

    return vec4(color, 1)
  })

  const material = new MeshBasicNodeMaterial({
    side: DoubleSide, // always visible regardless of which side faces the camera
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  })
  material.fragmentNode = fragment()

  material.userData.uPage = uPage
  material.userData.uTransition = uTransition
  material.userData.uDarkColor = uDarkColor
  material.userData.uLightColor = uLightColor
  material.userData.uTransitionColor = uTransitionColor
  material.userData.uCloudiness = uCloudiness

  return material
}
