import { useMemo } from 'react'
import { useTexture } from '@react-three/drei'
import {
  MeshBasicNodeMaterial,
  RepeatWrapping,
  NearestFilter,
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

// Full TSL port of background.glsl (material "Sky") — the dome behind the
// mountain. Recreated 1:1 from the reference fragment shader: vertical sky
// gradient, drifting cloud bands, trading "data" lines, the fort-energy
// starfield, the who-we-are / homepage sea & globe chapter washes, and the
// transition cloud wash. GLSL branches (if fortEnergy / if homepage) are kept
// as branchless mask multiplies, which is equivalent and friendlier to the
// node graph.
//
// Sampler -> asset mapping:
//   tNoise        -> noise.webp (all cloud/line/dither/star-placement noise)
//   tNearestNoise -> noise.webp sampled with NearestFilter (star cells)
//   tMouse        -> no mouse-trail render target exists in this build, so the
//                    mouse term resolves to 0 (every place it feeds is additive
//                    and degrades cleanly: cloud offsets vanish, stars keep
//                    their .8 base brightness).
export function useBackgroundMaterial() {
  const [noiseTex] = useTexture(['/noise.webp'])

  return useMemo(() => createBackgroundMaterial({ noiseTex }), [noiseTex])
}

export function createBackgroundMaterial({ noiseTex }) {
  noiseTex.wrapS = noiseTex.wrapT = RepeatWrapping

  // tNearestNoise: same image, point-sampled so each star cell reads one flat
  // value. Cloning gives it an independent sampler/GPU upload.
  const nearestTex = noiseTex.clone()
  nearestTex.wrapS = nearestTex.wrapT = RepeatWrapping
  nearestTex.minFilter = nearestTex.magFilter = NearestFilter
  nearestTex.needsUpdate = true

  const uPage = uniform(0)
  const uTransition = uniform(0)
  const uChapter = uniform(0)
  const uDarkColor = uniform(new Color('#586470'))
  const uLightColor = uniform(new Color('#9aa7b2'))
  const uTransitionColor = uniform(new Color('#5f9bc4'))

  // GLSL: highp rand(uv) = fract(sin(mod(dot(uv, vec2(a,b)), PI)) * c)
  const rand = (p) =>
    fract(sin(mod(dot(p, vec2(12.9898, 78.233)), Math.PI)).mul(43758.5453))

  const pow2 = (x) => x.mul(x)

  const fragment = Fn(() => {
    const vUv = uv()
    const sUv = screenUV // gl_FragCoord.xy / uResolution
    const t = time
    const fragCoord = screenUV.mul(screenSize)

    // --- page masks (branchless chapter select) ---
    const whoWeAre = step(-0.5, uPage).oneMinus()
    const homepage = step(-0.5, uPage).mul(step(0.5, uPage).oneMinus())
    const trading = step(0.5, uPage).mul(step(1.5, uPage).oneMinus())
    const fortEnergy = step(3.5, uPage).mul(step(4.5, uPage).oneMinus())

    // --- base sky value: soft radial darkening * height + a slow cloud lift ---
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

    // --- trading: focus the sky into a dithered lower-left glow ---
    const ditheredUv = vUv.add(rand(fragCoord).sub(0.5).mul(0.002))
    const ditheredValue = smoothstep(
      float(0.2).sub(trading.mul(0.08)),
      0,
      length(ditheredUv.sub(vec2(0.34, 0.2))),
    )
    value = mix(value, ditheredValue, trading)

    // --- fort energy: bottom-up glow + soft cloud band ---
    let energyValue = smoothstep(
      0.15,
      0.25,
      ditheredUv.y
        .add(rand(fragCoord).sub(0.5).mul(0.002))
        .add(0.03)
        .sub(abs(sUv.x.sub(0.5)).mul(0.1)),
    )
    energyValue = energyValue.mul(smoothstep(0.26, 0.25, vUv.y))
    let feUv = vec2(
      vUv.x.mul(float(1).add(sUv.x.sub(0.5).mul(0.2))),
      vUv.y.mul(float(2).add(pow2(abs(sUv.x.sub(0.5))).mul(0.8))),
    )
    feUv = feUv.mul(
      float(1).add(
        texture(noiseTex, vUv.mul(2).add(vec2(0, t.mul(0.007))))
          .r.sub(0.5)
          .mul(0.08),
      ),
    )
    let feClouds = texture(noiseTex, feUv.add(0.2)).r
    feClouds = smoothstep(0.55, 0, feClouds)
    energyValue = energyValue.add(feClouds)
    energyValue = min(energyValue, 1)
    value = mix(value, energyValue, fortEnergy)

    // --- sky gradient (homepage lifts the horizon a touch brighter) ---
    let color = mix(
      uDarkColor,
      uLightColor.add(homepage.mul(0.08)),
      clamp(value, 0, 1),
    )

    // --- trading "data" lines (added later, after stars) ---
    let lines = texture(
      noiseTex,
      vUv.mul(vec2(8, 0.1)).add(vec2(0, t.mul(0.01))),
    ).r.mul(0.85)
    lines = smoothstep(float(0.5).sub(value.mul(0.15)), 0.8, lines).mul(
      smoothstep(0.5, 1, value),
    )

    const uvB = vUv.mul(vec2(6, -8))
    const basic2Noise = texture(noiseTex, uvB.mul(2.5).mul(vec2(2, 1))).r
    // tMouse render target absent in this build -> mouse = 0.
    const mouse = float(0)

    // --- fort-energy starfield (3 layered point-sampled cells) ---
    const starLayer = (scale, off, secondInner) => {
      const cell = vUv.mul(scale)
      const cellUv = fract(cell)
      const uniq = texture(nearestTex, floor(cell).div(scale).add(off))
      const m = length(cellUv.sub(0.5).add(uniq.rg.sub(0.5).mul(0.4)))
      const s = smoothstep(0.05, 0, m).add(
        smoothstep(secondInner, 0, m).mul(0.1),
      )
      return s.mul(smoothstep(0.7, 1, uniq.b))
    }
    let stars = starLayer(150, 0, 0.15)
    stars = stars.add(starLayer(200, 0.5, 0.1))
    stars = stars.add(starLayer(230, 0.1, 0.1).mul(0.8))
    stars = stars.mul(smoothstep(0.25, 0.15, vUv.y))
    stars = stars.mul(smoothstep(0.2, 0, feClouds))
    stars = stars.mul(mouse.add(0.8))
    color = color.add(stars.mul(uLightColor.add(0.4)).mul(fortEnergy))
    color = mix(color, vec3(0), smoothstep(0.5, 1, uChapter).mul(fortEnergy))

    // --- trading lines blended in over the sky ---
    // Reference tints these "data lines" with vec3(0.3, 0.7, 0.5), but that
    // reads as a glowing green-noise blob where the sky peeks through the
    // ridge notch. Use the sky tone itself so the lines stay subtle (no green).
    color = color.add(
      lines
        .mul(uLightColor)
        .mul(vec3(0.3, 0.7, 0.5))
        .mul(trading),
    )

    const transition = smoothstep(0, 0.2, uTransition)
    color = mix(color, uTransitionColor, transition)

    // --- procedural cloud rows (homepage sky + transition wash) ---
    const count = float(4)
    const fUv = uvB.add(vec2(t.mul(0.005), 0)).add(mouse.mul(0.01))
    // Only cUv.y is read downstream, so we track it as a scalar.
    let cY = uvB.y.mul(count).add(mouse.mul(0.01)).sub(2)
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
    cY = cY.mul(texture(noiseTex, fUv.mul(0.3)).g.sub(0.5).mul(0.3).add(1))
    cY = cY.add(texture(noiseTex, fUv.mul(0.4)).r.sub(0.5))
    cY = cY.sub(texture(noiseTex, fUv.mul(4)).r.mul(0.05).mul(count))
    let cloudRows = fract(cY)
    cloudRows = cloudRows.add(smoothstep(0.5, 0, cloudRows))

    const sCUv = uvB
      .add(t.mul(0.01))
      .add(texture(noiseTex, uvB).r.mul(0.2))
      .add(vec2(basic2Noise, basic2Noise).mul(0.05))
      .add(mouse.mul(0.01))
    const smallCloudsX = smoothstep(
      0.5,
      0.62,
      texture(noiseTex, sCUv.mul(0.1).add(vec2(0, -0.01))).r,
    )
    const smallCloudsY = smoothstep(
      0.46,
      0.5,
      texture(noiseTex, sCUv.mul(0.1)).r,
    )
    const clouds = clamp(mix(cloudRows, smallCloudsX, smallCloudsY), 0, 1)

    const darkColor = vec3(0.737, 0.773, 0.8).mul(
      float(1).add(whoWeAre.mul(0.13)),
    )
    const cloudySkyColor = mix(darkColor, vec3(0.961, 0.969, 0.976), clouds)
    color = mix(
      color,
      cloudySkyColor,
      clamp(homepage.mul(0.3).add(transition), 0, 1).mul(0.5),
    )
    color = mix(color, cloudySkyColor, whoWeAre)

    // --- homepage chapter washes: sea -> globe sky -> deep teal ---
    const seaColor = vec3(0.31, 0.373, 0.427)
    const globeSky = vec3(0.0196, 0.0745, 0.1098)
    color = mix(
      color,
      seaColor,
      smoothstep(2.5, 2.7, uChapter.add(dUv.y).add(noise.mul(0.1))).mul(
        homepage,
      ),
    )
    color = mix(color, globeSky, smoothstep(4, 4.1, uChapter).mul(homepage))
    color = mix(
      color,
      vec3(0.11, 0.22, 0.26),
      smoothstep(4.2, 4.3, uChapter).mul(homepage),
    )
    // trading (else-if): darken toward black as its chapter advances.
    color = color.mul(mix(float(1), float(1).sub(min(uChapter, 1)), trading))

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
