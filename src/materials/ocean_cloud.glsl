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
precision highp float;
uniform float uTime, uTransition;
uniform vec3 uDarkColor, uLightColor;
uniform vec2 uResolution;
uniform sampler2D tPerlin, tNoise, tMouse;
varying float vSeed;
varying vec2 vUv;
varying vec3 vNormal;
void main() {
    vec2 sUv = gl_FragCoord.xy / uResolution;
    float mouse = clamp(texture2D(tMouse, sUv + .1 * (texture2D(tNoise, 0.4 * vUv).g - .5)).r, 0., 1.);
    float time = uTime * .5;
    float strength = 1.;
    vec2 dUv = vUv;
    dUv += .01 * mouse;
    dUv += .2 * (texture2D(tNoise, vUv * .2 + .02 * uTime).r - .5);
    dUv += .1 * (texture2D(tNoise, vUv - .01 * uTime).r - .5);
    float cloud = smoothstep(.5, .1, length(dUv - .5));
    vec3 color = uLightColor * (.9 + .3 * cloud);
    float alpha = 1.;
    alpha *= smoothstep(1., 0.3, uTransition);
    alpha *= min(1., smoothstep(.88, .96, vNormal.b) + smoothstep(0.05, 0.0, uTransition));
    alpha = cloud;
    alpha *= smoothstep(0.2, 0., uTransition);
    gl_FragColor = vec4(color, alpha);
}
