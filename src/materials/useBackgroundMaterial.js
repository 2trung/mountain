import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import {
  MeshBasicNodeMaterial,
  RepeatWrapping,
  Color,
  DoubleSide,
} from 'three/webgpu'
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
  min,
  uniform,
  screenUV,
  screenSize,
} from 'three/tsl'

// From-scratch TSL port of background.glsl (the "Sky" dome behind the
// mountain). It reproduces the reference fragment shader for every page this
// 4-scene project actually drives:
//
//   page -1  whoWeAre  intro wash -> the cloudy-sky look
//   page  0  snow      homepage: bright sky + cloud rows + chapter washes
//   page  1  night     dark glow + green "data" lines
//   page  2  meadow    (no background-specific branch in the reference)
//   page  3  ocean     (no background-specific branch in the reference)
//
// The reference's legacy page-4 "fortEnergy" branch (procedural stars + a
// mouse-driven glow) is intentionally omitted: this project has no page 4, no
// mouse render target (tMouse), and no nearest-noise texture (tNearestNoise).
// With mouse dropped, every `+ .01 * mouse` term in the reference is 0.
//
// Reference if/else-if chapter branches are written here as branchless mask
// multiplies, which is equivalent and friendlier to the node graph.
//
// Sampler -> asset mapping:
//   tNoise -> noise.webp (all cloud / line / dither noise)
export function useBackgroundMaterial() {
  const [noiseTex] = useTexture(['/noise.webp'])

  return useMemo(() => createBackgroundMaterial({ noiseTex }), [noiseTex])
}

export function createBackgroundMaterial({ noiseTex }) {
  noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping

  // Set per frame by Background.jsx (uPage, uTransition, uDarkColor, uLightColor).
  // uChapter / uTransitionColor stay at their defaults in this project.
  const uPage = uniform(0)
  const uTransition = uniform(0)
  const uChapter = uniform(0)
  const uDarkColor = uniform(new Color('#586470'))
  const uLightColor = uniform(new Color('#9aa7b2'))
  const uTransitionColor = uniform(new Color('#5f9bc4'))

  // GLSL: highp rand(uv) = fract(sin(mod(dot(uv, vec2(a,b)), PI)) * c)
  const rand = (p) =>
    fract(sin(mod(dot(p, vec2(12.9898, 78.233)), Math.PI)).mul(43758.5453))

  const fragment = Fn(() => {
    const vUv = uv()
    const sUv = screenUV // gl_FragCoord.xy / uResolution
    const t = time
    const fragCoord = screenUV.mul(screenSize)

    // --- page masks (branchless chapter select) ---
    const whoWeAre = step(-0.5, uPage).oneMinus() //  uPage < -0.5
    const snow = step(-0.5, uPage).mul(step(0.5, uPage).oneMinus()) // homepage
    const night = step(0.5, uPage).mul(step(1.5, uPage).oneMinus()) // trading

    // --- base sky value ---
    // soft radial darkening scaled by height, plus a slow drifting cloud lift.
    //   value = 1 - length(dsUv - .5) * sUv.y  + .5 * simpleClouds
    const dUv = vec2(vUv.x.add(t.mul(0.01)), vUv.y)
    const aUv = vUv.add(vec2(t.mul(-0.004), t.mul(0.002)))
    const noise = texture(noiseTex, dUv).r.mul(texture(noiseTex, aUv).r)
    const dsUv = sUv.add(noise.sub(0.25).mul(0.5))
    const simpleClouds = texture(
      noiseTex,
      vUv.mul(2).add(vec2(t.mul(-0.001), 0)),
    ).g
    let value = float(1)
      .sub(length(dsUv.sub(0.5)).mul(sUv.y))
      .add(simpleClouds.mul(0.5))

    // --- night: collapse the sky into a dithered lower-left glow ---
    const ditheredUv = vUv.add(rand(fragCoord).sub(0.5).mul(0.002))
    const ditheredValue = smoothstep(
      float(0.2).sub(night.mul(0.08)),
      0,
      length(ditheredUv.sub(vec2(0.34, 0.2))),
    )
    value = mix(value, ditheredValue, night)

    // --- sky gradient (snow lifts the light tone a touch brighter) ---
    let color = mix(
      uDarkColor,
      uLightColor.add(snow.mul(0.08)),
      clamp(value, 0, 1),
    )

    // --- night "data" lines behind the mountain ---
    let lines = texture(
      noiseTex,
      vUv.mul(vec2(8, 0.1)).add(vec2(0, t.mul(0.01))),
    ).r.mul(0.85)
    lines = smoothstep(float(0.5).sub(value.mul(0.15)), 0.8, lines).mul(
      smoothstep(0.5, 1, value),
    )

    const uvB = vUv.mul(vec2(6, -8))
    const basic2Noise = texture(noiseTex, uvB.mul(2.5).mul(vec2(2, 1))).r

    // Reference tints the lines green: lines * uLightColor * vec3(.3,.7,.5).
    color = color.add(lines.mul(uLightColor).mul(vec3(0.3, 0.7, 0.5)).mul(night))

    const transition = smoothstep(0, 0.2, uTransition)
    color = mix(color, uTransitionColor, transition)

    // --- procedural cloud rows (snow sky + transition wash) ---
    // The reference builds cUv but only ever reads cUv.y, so we track that
    // single scalar (cY) instead of the full vec2.
    const count = float(4)
    const fUv = uvB.add(vec2(t.mul(0.005), 0))
    let cY = uvB.y.mul(count).sub(2)
    const offset = smoothstep(
      texture(noiseTex, uvB.mul(4)).r.mul(0.2).add(0.7),
      1,
      fract(cY),
    )
      .add(floor(cY))
      .mul(1.5)
    const cloudShape = abs(sin(uvB.x.mul(50).add(offset)))
      .mul(-0.01)
      .sub(abs(sin(uvB.x.mul(15).add(offset))).mul(0.03))
      .sub(abs(sin(fUv.x.mul(17).add(offset))).mul(0.02))
      .mul(count)
    cY = cY.add(cloudShape)
    // cUv *= 1 + .3*(tex(fUv*.3).rg - .5)  -> only the .y (=.g) channel matters
    cY = cY.mul(texture(noiseTex, fUv.mul(0.3)).g.sub(0.5).mul(0.3).add(1))
    cY = cY.add(texture(noiseTex, fUv.mul(0.4)).r.sub(0.5))
    cY = cY.sub(texture(noiseTex, fUv.mul(4)).r.mul(0.05).mul(count))
    let cloudRows = fract(cY)
    cloudRows = cloudRows.add(smoothstep(0.5, 0, cloudRows))

    // small wispy clouds layered over the rows
    const sCUv = uvB
      .add(t.mul(0.01))
      .add(texture(noiseTex, uvB).r.mul(0.2))
      .add(vec2(basic2Noise, basic2Noise).mul(0.05))
    const offsetSmallClouds = smoothstep(
      0.5,
      0.62,
      texture(noiseTex, sCUv.mul(0.1).add(vec2(0, -0.01))).r,
    )
    const smallClouds = smoothstep(0.46, 0.5, texture(noiseTex, sCUv.mul(0.1)).r)
    const clouds = clamp(mix(cloudRows, offsetSmallClouds, smallClouds), 0, 1)

    const darkColor = vec3(0.737, 0.773, 0.8).mul(
      float(1).add(whoWeAre.mul(0.13)),
    )
    const cloudySkyColor = mix(darkColor, vec3(0.961, 0.969, 0.976), clouds)
    color = mix(
      color,
      cloudySkyColor,
      clamp(snow.mul(0.3).add(transition), 0, 1).mul(0.5),
    )
    color = mix(color, cloudySkyColor, whoWeAre)

    // --- snow chapter washes: sea -> globe sky -> deep teal ---
    const seaColor = vec3(0.31, 0.373, 0.427)
    const globeSky = vec3(0.0196, 0.0745, 0.1098)
    color = mix(
      color,
      seaColor,
      smoothstep(2.5, 2.7, uChapter.add(dUv.y).add(noise.mul(0.1))).mul(snow),
    )
    color = mix(color, globeSky, smoothstep(4, 4.1, uChapter).mul(snow))
    color = mix(
      color,
      vec3(0.11, 0.22, 0.26),
      smoothstep(4.2, 4.3, uChapter).mul(snow),
    )

    // night (else-if): darken toward black as its chapter advances.
    color = color.mul(mix(float(1), float(1).sub(min(uChapter, 1)), night))

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
  material.userData.uChapter = uChapter
  material.userData.uDarkColor = uDarkColor
  material.userData.uLightColor = uLightColor
  material.userData.uTransitionColor = uTransitionColor

  return material
}
