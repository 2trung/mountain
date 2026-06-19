export const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x)

export const lerp = (a, b, t) => a + (b - a) * t

export const smoothstep = (edge0, edge1, x) => {
  const t = clamp01((x - edge0) / (edge1 - edge0))
  return t * t * (3 - 2 * t)
}
