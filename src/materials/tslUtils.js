import {
  uv,
  vec2,
  vec3,
  float,
  texture,
  mix,
  max,
  clamp,
  sin,
  cos,
  dot,
  cross,
  normalize,
  abs,
  sign,
  inversesqrt,
  dFdx,
  dFdy,
} from 'three/tsl'

// Shared TSL ports of the helper functions used by the reference "sixty"
// GLSL shaders (mountain_fragment.glsl / peak_fragment.glsl).

export const hueShift = (color, hueAngle) => {
  const k = vec3(0.57735, 0.57735, 0.57735)
  const cosAngle = cos(hueAngle)
  return color
    .mul(cosAngle)
    .add(cross(k, color).mul(sin(hueAngle)))
    .add(k.mul(dot(k, color)).mul(cosAngle.oneMinus()))
}

export const adjustSaturation = (color, saturation) =>
  mix(vec3(dot(color, vec3(0.2125, 0.7154, 0.0721))), color, saturation)

export const rotateUv = (uvNode, mid, rotation) => {
  const c = cos(rotation)
  const s = sin(rotation)
  const d = uvNode.sub(mid)
  return vec2(
    c.mul(d.x).add(s.mul(d.y)).add(mid.x),
    c.mul(d.y).sub(s.mul(d.x)).add(mid.y),
  )
}

// Bump derivative: height differences across one screen pixel of the
// base uv (matches dHdxy_fwd, which derives vUv even for scaled lookups).
export const dHdxyFwd = (tex, texUv, strength) => {
  const s = float(strength)
  const dSTdx = dFdx(uv())
  const dSTdy = dFdy(uv())
  const Hll = s.mul(texture(tex, texUv).r)
  return vec2(
    s.mul(texture(tex, texUv.add(dSTdx)).r).sub(Hll),
    s.mul(texture(tex, texUv.add(dSTdy)).r).sub(Hll),
  )
}

export const perturbNormalArb = (surfPos, surfNorm, dHdxy) => {
  const vSigmaX = dFdx(surfPos)
  const vSigmaY = dFdy(surfPos)
  const R1 = cross(vSigmaY, surfNorm)
  const R2 = cross(surfNorm, vSigmaX)
  const fDet = dot(vSigmaX, R1)
  const vGrad = sign(fDet).mul(dHdxy.x.mul(R1).add(dHdxy.y.mul(R2)))
  return normalize(abs(fDet).mul(surfNorm).sub(vGrad))
}

// getTangentFrame folded together with the `tbn * nTex` multiply.
export const tangentTransform = (eyePos, N, texUv, nTex) => {
  const posDx = dFdx(eyePos)
  const posDy = dFdy(eyePos)
  const uvDx = clamp(dFdx(texUv), vec2(1e-2), vec2(1))
  const uvDy = clamp(dFdy(texUv), vec2(1e-2), vec2(1))
  const q1perp = cross(posDy, N)
  const q0perp = cross(N, posDx)
  const T = q1perp.mul(uvDx.x).add(q0perp.mul(uvDy.x))
  const B = q1perp.mul(uvDx.y).add(q0perp.mul(uvDy.y))
  const det = max(dot(T, T), dot(B, B))
  const scale = inversesqrt(max(det, 1e-20))
  return T.mul(scale)
    .mul(nTex.x)
    .add(B.mul(scale).mul(nTex.y))
    .add(N.mul(nTex.z))
}
