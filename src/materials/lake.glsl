#version 300 es
#define varying in
layout(location = 0) out highp vec4 pc_fragColor;
#define gl_FragColor pc_fragColor
#define gl_FragDepthEXT gl_FragDepth
#define texture2D texture
#define textureCube texture
#define texture2DProj textureProj
#define texture2DLodEXT textureLod
#define texture2DProjLodEXT textureProjLod
#define textureCubeLodEXT textureLod
#define texture2DGradEXT textureGrad
#define texture2DProjGradEXT textureProjGrad
#define textureCubeGradEXT textureGrad
precision highp float;
precision highp int;
precision highp sampler2D;
precision highp samplerCube;
precision highp sampler3D;
precision highp sampler2DArray;
precision highp sampler2DShadow;
precision highp samplerCubeShadow;
precision highp sampler2DArrayShadow;
precision highp isampler2D;
precision highp isampler3D;
precision highp isamplerCube;
precision highp isampler2DArray;
precision highp usampler2D;
precision highp usampler3D;
precision highp usamplerCube;
precision highp usampler2DArray;
#define HIGH_PRECISION
#define SHADER_TYPE ShaderMaterial
#define SHADER_NAME 
uniform mat4 viewMatrix;
uniform vec3 cameraPosition;
uniform bool isOrthographic;
const mat3 LINEAR_SRGB_TO_LINEAR_DISPLAY_P3 = mat3(
vec3( 0.8224621, 0.177538, 0.0 ), vec3( 0.0331941, 0.9668058, 0.0 ), vec3( 0.0170827, 0.0723974, 0.9105199 )
);
const mat3 LINEAR_DISPLAY_P3_TO_LINEAR_SRGB = mat3(
vec3( 1.2249401, - 0.2249404, 0.0 ), vec3( - 0.0420569, 1.0420571, 0.0 ), vec3( - 0.0196376, - 0.0786361, 1.0982735 )
);
vec4 LinearSRGBToLinearDisplayP3( in vec4 value ) {
    return vec4( value.rgb * LINEAR_SRGB_TO_LINEAR_DISPLAY_P3, value.a );
}
vec4 LinearDisplayP3ToLinearSRGB( in vec4 value ) {
    return vec4( value.rgb * LINEAR_DISPLAY_P3_TO_LINEAR_SRGB, value.a );
}
vec4 LinearTransferOETF( in vec4 value ) {
    return value;
}
vec4 sRGBTransferOETF( in vec4 value ) {
    return vec4( mix( pow( value.rgb, vec3( 0.41666 ) ) * 1.055 - vec3( 0.055 ), value.rgb * 12.92, vec3( lessThanEqual( value.rgb, vec3( 0.0031308 ) ) ) ), value.a );
}
vec4 linearToOutputTexel( vec4 value ) {
    return ( sRGBTransferOETF( value ) );
}
float luminance( const in vec3 rgb ) {
    const vec3 weights = vec3( 0.2126, 0.7152, 0.0722 );
    return dot( weights, rgb );
}
uniform sampler2D tDiffuse, tMouse, tNoiseNormal, tNoise;
uniform float uTime, uChapter, uTransition;
uniform vec2 uResolution;
uniform vec3 uTransitionColor;
varying vec4 vReflectUv;
varying vec2 vUv;
varying vec3 vViewPosition, vNormal;
mat3 getTangentFrame(const in vec3 eyePos, const in vec3 surfaceNormal, const in vec2 uv) {
    vec3 posDx = dFdx(eyePos);
    vec3 posDy = dFdy(eyePos);
    vec2 uvDx = dFdx(uv);
    vec2 uvDy = dFdy(uv);
    uvDx = max(uvDx, vec2(1e-2));
    uvDy = max(uvDy, vec2(1e-2));
    uvDx = min(uvDx, vec2(1.));
    uvDy = min(uvDy, vec2(1.));
    vec3 N = surfaceNormal;
    vec3 q1perp = cross(posDy, N);
    vec3 q0perp = cross(N, posDx);
    vec3 T = q1perp * uvDx.x + q0perp * uvDy.x;
    vec3 B = q1perp * uvDx.y + q0perp * uvDy.y;
    float det = max(dot(T, T), dot(B, B));
    float scale = (det == 0.0) ? 0.0 : inversesqrt(det);
    return mat3(T * scale, B * scale, N);
}
vec2 rotateUV(vec2 uv, float rotation) {
    vec2 mid = vec2(.5);
    return vec2(cos(rotation) * (uv.x - mid.x) + sin(rotation) * (uv.y - mid.y) + mid.x, cos(rotation) * (uv.y - mid.y) - sin(rotation) * (uv.x - mid.x) + mid.y);
}
void main() {
    float time = uTime * .03;
    float roughness = .1;
    float mouse = clamp(texture2D(tMouse, gl_FragCoord.xy / uResolution).r, 0., 1.);
    vec3 color = vec3(.42, .8, 1.);
    color *= .6 + .5 * smoothstep(-.0, .4, length(vUv - .5));
    vec3 normal = vNormal;
    vec2 dUv = rotateUV(vUv, .4);
    dUv += (.05 + .05 * (mouse - .5)) * texture2D(tNoise, 6. * vUv + vec2(-.5, .2) * time).rg;
    mat3 tbn = getTangentFrame(-vViewPosition, normal, dUv);
    vec3 nTex = texture2D(tNoiseNormal, 3. * dUv + uTime * .02).rgb * 2. - 1.;
    nTex += texture2D(tNoiseNormal, 5. * dUv - uTime * .017).rgb * 2. - 1.;
    nTex.xy *= 1. + .1 * mouse;
    normal = normalize(tbn * nTex);
    vec4 reflectUv = vReflectUv;
    reflectUv.rgb += normal;
    vec4 reflexion = texture2DProj(tDiffuse, reflectUv);
    reflexion.rgb *= 1. + 2.2 * smoothstep(0.7, 0., length(reflexion.rgb));
    vec3 lightPos = vec3(10., 10., 0.);
    vec3 lightDir = normalize(lightPos - vViewPosition);
    vec3 viewDir = normalize(-vViewPosition);
    vec3 halfwayDir = normalize(lightDir + viewDir);
    float spec = pow(max(dot(normal, halfwayDir), 0.0), 1. - roughness);
    vec3 specular = (reflexion.rgb + .6) * spec;
    color = mix(color, reflexion.rgb, .5 * spec + .78);
    color += specular;
    color = mix(color, uTransitionColor, smoothstep(0., 0.5, uTransition));
    float alpha = 1.;
    alpha *= smoothstep(1., 0.8, uTransition);
    gl_FragColor = vec4(color, alpha);
}
