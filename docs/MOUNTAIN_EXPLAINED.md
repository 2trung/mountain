# Mountain Rendering System — Explained

> Tài liệu dành cho fresher / Document for freshers
> Giải thích cách ngọn núi được hiển thị, chuyển cảnh, và tạo hiệu ứng trong dự án Three.js này.

---

## Mục lục / Table of Contents

1. [Tổng quan / Overview](#1-tổng-quan--overview)
2. [Cấu trúc thư mục / Folder Structure](#2-cấu-trúc-thư-mục--folder-structure)
3. [Luồng hoạt động / How It Works (Data Flow)](#3-luồng-hoạt-động--how-it-works-data-flow)
4. [5 Chương (Chapters) — Ngọn núi thay đổi như thế nào?](#4-5-chương-chapters--ngọn-núi-thay-đổi-như-thế-nào)
5. [Material (Vật liệu) — Shader hoạt động ra sao?](#5-material-vật-liệu--shader-hoạt-động-ra-sao)
6. [Chuyển cảnh (Transition) — Hiệu ứng sóng năng lượng](#6-chuyển-cảnh-transition--hiệu-ứng-sóng-năng-lượng)
7. [Camera — Di chuyển giữa các chương](#7-camera--di-chuyển-giữa-các-chương)
8. [Các thành phần khác / Other Components](#8-các-thành-phần-khác--other-components)
9. [Thuật ngữ cần biết / Key Terms](#9-thuật-ngữ-cần-biết--key-terms)

---

## 1. Tổng quan / Overview

### 🇻🇳 Tiếng Việt

Dự án này hiển thị **một ngọn núi 3D** (tải từ file `mountains.glb`) với **5 kiểu nhìn khác nhau** (gọi là "chapters"). Khi người dùng chuyển giữa các chapter, ngọn núi sẽ được phủ bằng một **sóng năng lượng** (transition wave) rồi hiển thị kiểu mới.

Điểm đặc biệt: **chỉ dùng 1 mesh núi duy nhất**, nhưng shader bên trong vẽ ra 5 kiểu khác nhau dựa vào giá trị `uPage` (0 → 4).

### 🇬🇧 English

This project renders **a single 3D mountain mesh** (loaded from `mountains.glb`) with **5 different visual styles** called "chapters." When switching between chapters, a noisy **energy wave** sweeps across the surface to hide the old look and reveal the new one.

Key idea: **one mesh, one material, five looks** — selected branchlessly by the `uPage` uniform.

---

## 2. Cấu trúc thư mục / Folder Structure

```
src/
├── main.jsx                          # Entry point — render <App> vào DOM
├── App.jsx                           # Canvas + WebGPU renderer + TransitionProvider
├── components/
│   ├── Experience.jsx                # Scene root: gom tất cả component lại
│   ├── Mountain.jsx                  # NÚI CHÍNH — load GLB, apply material, sync uniforms
│   ├── CameraRig.jsx                 # Camera di chuyển dọc path cong (CatmullRomCurve3)
│   ├── Background.jsx                # Sky dome — gradient bầu trời + mây
│   ├── Lighting.jsx                  # Đèn ambient + directional, thay đổi theo mood
│   ├── Peaks.jsx                     # Đỉnh núi phụ (homepage only)
│   ├── Capital.jsx                   # Thảo nguyên + núi nền (capital chapter)
│   └── Maritime.jsx                  # Biển + đá (marine chapter)
├── materials/
│   ├── useMountainMaterial.js        # ★ Material chính của núi (TSL shader)
│   ├── mountain.glsl                 # ★ Shader gốc (GLSL) — dùng làm tham chiếu
│   ├── useCloudMaterial.js           # Material mây (instanced quads)
│   ├── useBackgroundMaterial.js      # Material sky dome
│   ├── usePeakMaterial.js            # Material đỉnh núi phụ
│   ├── useWaterMaterial.js           # Material nước biển
│   └── tslUtils.js                   # Các hàm tiện ích: hueShift, perturbNormal...
├── config/
│   └── chapters.js                   # Định nghĩa 4 chapter: page, camT, mood
├── state/
│   ├── TransitionContext.jsx          # ★ State machine chuyển cảnh + mood interpolation
│   └── useChapterVisible.js          # Toggle visibility cho chapter-specific objects
└── utils/
    └── math.js                       # clamp01, lerp, smoothstep
```

**File quan trọng nhất** cho fresher cần đọc:

1. `TransitionContext.jsx` — hiểu cách chuyển cảnh hoạt động
2. `useMountainMaterial.js` — hiểu cách shader vẽ núi
3. `Mountain.jsx` — hiểu cách mọi thứ kết nối

---

## 3. Luồng hoạt động / How It Works (Data Flow)

### 🇻🇳

```
┌─────────────────────────────────────────────────────────────────┐
│  App.jsx                                                        │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  Canvas (WebGPU Renderer)                                 │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  TransitionProvider                                  │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │  │
│  │  │  │  Experience                                    │  │  │  │
│  │  │  │  ├── CameraRig    ← đọc camFrom/camTo/blend   │  │  │  │
│  │  │  │  ├── Lighting     ← đọc mood.amb/dir/dirCol   │  │  │  │
│  │  │  │  ├── Background   ← đọc mood.bgDark/bgLight   │  │  │  │
│  │  │  │  ├── Mountain     ← đọc page/transition/mood  │  │  │  │
│  │  │  │  ├── Peaks        ← chỉ hiện ở homepage       │  │  │  │
│  │  │  │  ├── Capital      ← chỉ hiện ở capital        │  │  │  │
│  │  │  │  └── Maritime     ← chỉ hiện ở marine         │  │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

**Luồng dữ liệu / Data flow:**

1. Người dùng chọn chapter trong **Leva dropdown** (UI control)
2. `TransitionDriver` (trong `TransitionContext.jsx`) phát hiện chapter mới
3. Chạy animation 2 pha: **COVER** (uTransition 0→1) → **REVEAL** (uTransition 1→0)
4. Mỗi frame, cập nhật `progress` object (shared mutable, không phải React state)
5. Các component đọc `progress` trong `useFrame()` và cập nhật uniforms

### 🇬🇧

1. User picks a chapter from the **Leva dropdown**
2. `TransitionDriver` detects the mismatch → starts a 2-phase animation
3. **COVER phase**: `uTransition` ramps 0→1 (wave hides the mountain)
4. At full cover: `progress.page` swaps to the new chapter
5. **REVEAL phase**: `uTransition` ramps 1→0 (wave reveals the new look)
6. Every frame, components read `progress` in `useFrame()` and push values into shader uniforms

**Tại sao dùng mutable object thay vì React state?**
Vì material uniforms cần cập nhật 60 lần/gây. Dùng `useState` sẽ trigger re-render mỗi frame → rất chậm. Mutable object + `useFrame()` = zero re-renders.

---

## 4. 5 Chương (Chapters) — Ngọn núi thay đổi như thế nào?

### 🇻🇳

Mỗi chapter có 3 thuộc tính:

| Thuộc tính | Ý nghĩa                                      |
| ---------- | -------------------------------------------- |
| `page`     | Giá trị `uPage` trong shader (0, 1, 2, 3)    |
| `camT`     | Vị trí camera trên đường cong [0..1]         |
| `mood`     | Màu sắc: nền trời, sương mù, đèn, môi trường |

### Bảng chapters (`src/config/chapters.js`):

| #   | Key       | page | camT  | Bầu trời        | Đèn           | Mô tả                  |
| --- | --------- | ---- | ----- | --------------- | ------------- | ---------------------- |
| 0   | `home`    | 0    | 1.0   | Xám-xanh nhạt   | Trắng, sáng   | Tuyết trắng, homepage  |
| 1   | `trading` | 1    | 0.74  | Đen-xanh đậm    | Cam ấm, tối   | Đêm khuya, giao dịch   |
| c   | `capital` | 2    | 0.5   | Xanh dương nhạt | Vàng ấm, sáng | Ngày nắng, thảo nguyên |
| 3   | `marine`  | 3    | 0.0\* | Xám-xanh biển   | Xám nhạt      | Biển mây, hải đảo      |

> \*Marine dùng camera override `cam: { pos: [8, -19, 298], lookAt: [-8, 9, 11] }` thay vì camT.

### 🇬🇧

Each chapter defines:

- **`page`** → the `uPage` shader uniform that selects the mountain's visual look
- **`camT`** → normalized position along the GLB camera path curve
- **`mood`** → atmosphere colors: background sky, fog, light colors, environment-map intensity

---

## 5. Material (Vật liệu) — Shader hoạt động ra sao?

### 🇻🇳

Material chính nằm trong `useMountainMaterial.js`. Đây là file phức tạp nhất (~536 dòng). Giải thích từng phần:

#### 5.1 Uniforms (biến đầu vào)

```js
const uPage = uniform(0)                // Chọn chapter (0, 1, 2, 3)
const uTransition = uniform(0)          // 0→1: sóng phủ, 1→0: sóng lộ
const uTransitionDirection = uniform(1) // 1 = sóng có hình, 0 = fade phẳng
const uColor = uniform(new Color(1,1,1)) // Tint màu chung
const uFogNear / uFogFar               // Khoảng cách sương mù
const uLightColor / uDarkColor          // Màu sương mù / tint capital
```

#### 5.2 Chapter Masks (chọn chapter không dùng if/else)

Đây là kỹ thuật quan trọng: dùng `step()` để tạo mask, **không dùng if/else** (GPU không thích branching).

```js
// Nếu uPage < 0.5 → homepage = 1, còn lại = 0
const homepage = step(0.5, uPage).oneMinus()

// Nếu 0.5 ≤ uPage < 1.5 → trading = 1
const trading = step(0.5, uPage).mul(step(1.5, uPage).oneMinus())

// Nếu 1.5 ≤ uPage < 2.5 → capital = 1
const capital = step(1.5, uPage).mul(step(2.5, uPage).oneMinus())

// Nếu 2.5 ≤ uPage < 3.5 → maritime = 1
const maritime = step(2.5, uPage).mul(step(3.5, uPage).oneMinus())
```

**Cách đọc:** `step(edge, x)` trả về 0 nếu x < edge, 1 nếu x ≥ edge. Nhân 2 step ngược nhau = chỉ 1 vùng cho ra 1.

#### 5.3 Base Color (màu cơ bản)

```
                    ┌─ homepage/trading ─┐     ┌── capital ──┐     ┌── maritime ──┐
                    │                    │     │             │     │              │
baseSample ─────────┤                    │     │             │     │              │
(màu trắng/xám)     │   hoTraSample      │     │ capitalSample│    │ maritimeSample│
                    │ = mix(1.3×second,  │     │ = grass,    │     │ = coast +    │
secondSample ───────┤    base, mixMap)   │     │   moss,     │     │   splashes   │
(diffuse texture)   │                    │     │   flowers   │     │              │
                    └────────────────────┘     └─────────────┘     └──────────────┘
                              │                      │                     │
                              └────── mix ───────────┴────── mix ──────────┘
                                        (dựa trên chapter mask)
                                              │
                                         diffuseRgb
```

- `mixMapSample.r` (từ `snowRockMix.webp`): mask blend giữa tuyết (trắng) và đá (diffuse)
- `secondSample`: diffuse texture, được tint xám-xanh cho homepage
- `hoTraSample = mix(1.3 × second, base, mixMap)` → đá sáng hơn, tuyết trắng

#### 5.4 Từng Chapter vẽ gì?

**Homepage & Trading** (dùng chung `hoTraSample`):

- Màu cơ bản giống nhau
- Khác nhau ở: lightmap, sương mù, normal map, hiệu ứng tuyết bay
- Trading có thêm fog xanh-dương + grid wireframe (đã tắt trong bản này)

**Capital** (thảo nguyên):

- Hue shift theo noise → cỏ có nhiều màu
- Thêm cỏ nhỏ (lilGrass) ở vùng perlin noise cao
- Thêm hoa (flowers) từ voronoi texture
- Thêm rêu (moss) ở vùng thấp
- Đáy núi tối hơn + đổi màu

**Maritime** (hải đảo):

- Blend theo normal.x (hướng nhìn) → mặt đá khô/ướt
- Thêm splash animation (sóng vỗ) bằng sin()
- Thêm foam fog ở vùng nước

#### 5.5 Normals (đường cong bề mặt)

```
Rock Normal Map (rock_normal.webp)
        │
        ▼
  ┌─ tangentTransform() ──→ rockNormal
  │
  ├─ homepage/trading: perturbNormalArb(perlin, 10×uv) + trading thêm lớp thứ 2
  │
  ├─ capital: perturbNormalArb(diffuse, 15×uv)
  │
  └─ maritime: perturbNormalArb(perlin, uv, strength=20)
        │
        ▼
  perturbedNormal → mix(transitionNormal, transitionWave) → finalNormal
```

#### 5.6 Post-Lighting (sau khi tính đèn)

Sau khi Three.js chuẩn PBR chiếu sáng xong, `outputNode` chỉnh lại:

1. **Capital color correction**: tint theo độ cao + fog thung lũng
2. **Desaturate**: giảm bão hòa màu khi transition đang chạy
3. **Emissive wave**: mặt trước của sóng phát sáng xanh-lục
4. **Distance fog**: hòa vào `uLightColor` theo khoảng cách
5. **Trading fog**: thêm lớp sương mù xanh-dương
6. **Alpha**: fade cạnh cho fortEnergy + fade theo chapter

### 🇬🇧

The mountain material (`useMountainMaterial.js`) is the core shader. It uses Three.js's **TSL (Three Shading Language)** — a node-based shader system where you build shader graphs in JavaScript.

Key concepts:

- **Uniforms**: JS variables that become shader inputs, updated every frame
- **Chapter masks**: `step()` math selects which chapter is active — no if/else branching
- **MeshStandardNodeMaterial**: feeds `colorNode`, `normalNode`, `roughnessNode` into Three's standard PBR lighting, then `outputNode` post-processes the lit result

---

## 6. Chuyển cảnh (Transition) — Hiệu ứng sóng năng lượng

### 🇻🇳

File: `src/state/TransitionContext.jsx`

#### 6.1 State Machine

```
    ┌─────────────────────────────────────────────────┐
    │                                                  │
    ▼                                                  │
  IDLE ──(user picks new chapter)──→ COVER ──(t=1)──→ REVEAL ──(t=1)──→ IDLE
           page ≠ target              │                │
                                      │  uTransition   │  uTransition
                                      │  0 → 1         │  1 → 0
                                      │                │
                                      ▼                ▼
                                Sóng phủ núi     Sóng lộ núi mới
                                (ẩn chapter cũ)   (hiện chapter mới)
                                      │
                                      └─ page = target.page (swap ở đây!)
```

#### 6.2 Thời gian

```js
const COVER_TIME = 1.0 // 1 giây để sóng phủ hết núi
const REVEAL_TIME = 1.0 // 1 giây để sóng lộ núi mới
// Tổng: 2 giây cho mỗi lần chuyển chapter
```

#### 6.3 Transition Wave trong Shader

Sóng năng lượng là gì? Đó là một dải sáng di chuyển dọc theo núi:

```
mountainHeight = smoothstep(0, 400, length(posL - (-20, 65, 3.4)))
                + noise_offset
                + pixelNoise

transitionWave = smoothstep(
    1 - 2×transitionSize,   // cạnh dưới
    1,                        // cạnh trên
    transition + 1.8 × mountainHeight  // vị trí sóng + độ cao núi
)
```

- `mountainHeight`: khoảng cách từ đỉnh núi → tạo gradient từ đỉnh xuống chân
- `transition`: 0→1 khi cover, 1→0 khi reveal
- `transitionSize`: ~0.04-0.06, kiểm tra độ rộng của sóng
- Kết quả: `transitionWave` = 1 ở vùng đã phủ, 0 ở vùng chưa phủ

Khi `transitionWave = 1`:

- Màu diffuse bị thay bằng `transitionColor` (perlin noise × normal length)
- Roughness = 1 (mờ hoàn toàn)
- Thêm emissive sáng xanh-lục ở rìa sóng

#### 6.4 Mood Interpolation

Mỗi chapter có `mood` (màu sắc, độ sáng). Khi chuyển chapter, mood được **lerp mượt**:

```js
const k = Math.min(1, dt * 2.5) // ~2.5 giây để hội tụ
mood.bgDark.lerp(target.bgDark, k)
mood.fog.lerp(target.fog, k)
// ... tương tự cho bgLight, dirCol, cloud, amb, dir, env
```

### 🇬🇧

The transition is a **2-phase state machine**:

1. **IDLE** → user picks a new chapter → enter COVER
2. **COVER**: `uTransition` ramps 0→1 over 1 second. A noisy energy wave sweeps down the mountain, hiding the current chapter. At `transition=1`, swap `progress.page` to the new chapter.
3. **REVEAL**: `uTransition` ramps 1→0 over 1 second. The wave retreats, revealing the new chapter's look.
4. Back to **IDLE**.

The wave shape is driven by `mountainHeight` (distance from the peak), so it naturally follows the mountain's silhouette.

---

## 7. Camera — Di chuyển giữa các chương

### 🇻🇳

File: `src/components/CameraRig.jsx`

Camera di chuyển dọc theo **đường cong Catmull-Rom** được tạo từ các điểm trong file GLB:

```
mountains.glb
├── CameraPath.geometry  →  camCurve   (đường đi camera)
└── TargetPath.geometry  →  targetCurve (điểm nhìn)
```

Mỗi chapter có `camT` (0→1) xác định vị trí trên đường cong:

```
camT = 1.0  ←── Home (đỉnh, cuối path)
camT = 0.74 ←── Trading
camT = 0.5  ←── Capital
camT = 0.0  ←── Marine (đầu path, nhưng dùng camera override)
```

Khi chuyển chapter, camera **lerp mượt** giữa 2 vị trí:

```js
// Phase cover: blend 0 → 0.5
// Phase reveal: blend 0.5 → 1
const overall = anim.phase === 'cover' ? anim.t * 0.5 : 0.5 + anim.t * 0.5
progress.camBlend = smoothstep(0, 1, overall)

// Camera rig resolve:
pos.lerpVectors(posA, posB, camBlend)
tgt.lerpVectors(tgtA, tgtB, camBlend)
camera.position.copy(pos)
camera.lookAt(tgt)
```

> **Lưu ý:** CameraRig hiện tại bị comment out (`// useFrame(() => {...})`) — camera đang dùng OrbitControls để di chuyển tự do.

### 🇬🇧

The camera follows a **CatmullRomCurve3** built from polyline vertices in the GLB file. Each chapter's `camT` samples a point along this curve. During transitions, the camera lerps between the "from" and "to" viewpoints using a smoothstep-eased blend factor.

---

## 8. Các thành phần khác / Other Components

### Background (`Background.jsx` + `useBackgroundMaterial.js`)

**🇻🇳:** Sky dome hình cầu, luôn recenter theo camera. Vẽ gradient bầu trời + mây procedural. Trading có thêm "data lines" (đường kẻ ngang phát sáng). Khi transition, hòa sang màu `uTransitionColor`.

**🇬🇧:** A sky dome that re-centers on the camera each frame. Renders a vertical gradient + procedural cloud bands. Trading adds faint horizontal "data" lines. During transitions, blends toward a wash color.

### Clouds (`useCloudMaterial.js`)

**🇻🇳:** Mây là các **instanced quads** (nhiều tấm phẳng xếp chồng). Mỗi quad có seed riêng → noise khác nhau. UV.y bị méo bởi 3 lớp noise cuộn → tạo hình mây. Chỉ hiện ở homepage, bị "guillotine" (cắt từ dưới lên) khi rời home.

**🇬🇧:** Clouds are instanced quads with per-instance seeds. UV.y is distorted by 3 scrolling noise layers to create billowing shapes. Only visible on homepage; a screen-space "guillotine" wipe erases them bottom-up when leaving.

### Peaks (`Peaks.jsx` + `usePeakMaterial.js`)

**🇻🇳:** 3 đỉnh núi phụ từ `Homepage.glb`, chỉ hiện ở homepage. Material có tuyết bay (windy snow) cuộn theo thời gian + bump map perlin. Fade out khi rời home.

**🇬🇧:** 3 backdrop peak meshes from `Homepage.glb`, homepage-only. Material adds scrolling windy snow + perlin bump. Fades out via `uTransition` when leaving home.

### Capital (`Capital.jsx`)

**🇻🇳:** Thảo nguyên + núi nền từ `capital-min.glb`. Chỉ hiện khi `page === 2`. Dùng `useChapterVisible` để toggle visibility.

**🇬🇧:** Prairie + background mountains from `capital-min.glb`. Only visible when `page === 2`. Uses `useChapterVisible` to toggle.

### Maritime (`Maritime.jsx` + `useWaterMaterial.js`)

**🇻🇳:** Biển từ `maritime.glb`. Water material tạo sóng bằng tổng các hàm sin, 3 lớp normal map animated, specular + translucency, foam sparkle. Reflection được approximate (không có planar reflection trong WebGPU).

**🇬🇧:** Sea plane from `maritime.glb`. Water shader builds rippling surface from sum-of-sines height + 3 animated normal-map layers + specular/translucency + foam. Reflection is approximated (no planar reflection in WebGPU).

---

## 9. Thuật ngữ cần biết / Key Terms

| Term                    | Giải nghĩa                                                            |
| ----------------------- | --------------------------------------------------------------------- |
| **Uniform**             | Biến từ JS truyền vào shader, cập nhật mỗi frame                      |
| **TSL**                 | Three Shading Language — cách viết shader bằng JS (node-based)        |
| **GLSL**                | OpenGL Shading Language — ngôn ngữ shader gốc (file `.glsl`)          |
| **step(edge, x)**       | Trả về 0 nếu x < edge, 1 nếu x ≥ edge                                 |
| **smoothstep(a, b, x)** | Hermite interpolation: 0 khi x≤a, 1 khi x≥b, mượt ở giữa              |
| **mix(a, b, t)**        | Linear interpolation: a×(1-t) + b×t                                   |
| **PBR**                 | Physically Based Rendering — mô hình chiếu sáng vật lý                |
| **Normal map**          | Texture giả lập chi tiết bề mặt (bumps, dents) mà không thêm geometry |
| **Emissive**            | Màu tự phát sáng, không cần đèn chiếu                                 |
| **CatmullRomCurve3**    | Đường cong nội suy qua các điểm, mượt tự nhiên                        |
| **Instanced mesh**      | Vẽ nhiều bản sao cùng geometry với hiệu suất cao                      |
| **WebGPU**              | API đồ họa thế hệ mới, thay thế WebGL                                 |
| **Leva**                | Thư viện UI controls cho React (dropdown, sliders)                    |

---

## Tóm tắt nhanh / Quick Summary

```
User clicks chapter → TransitionContext chạy COVER (1s) → REVEAL (1s)
                    → uPage thay đổi → shader chọn chapter mới
                    → camera lerp → mood lerp → lights/sky/fog mượt mà

Một núi. Một material. Năm kiểu nhìn. Không if/else.
One mountain. One material. Five looks. No if/else.
```
