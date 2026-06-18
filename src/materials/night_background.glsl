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
#define OPAQUE

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
uniform sampler2D tNoise, tNearestNoise, tMouse;
uniform vec3 uTransitionColor, uLightColor, uDarkColor;
uniform vec2 uResolution;
uniform float uTime, uPage, uTransition, uTransitionDirection, uChapter, uScrollProgress;
varying vec2 vUv;
vec2 rotateUV(vec2 uv, vec2 mid, float rotation) {
    return vec2(cos(rotation) * (uv.x - mid.x) + sin(rotation) * (uv.y - mid.y) + mid.x, cos(rotation) * (uv.y - mid.y) - sin(rotation) * (uv.x - mid.x) + mid.y);
}
#define PI 3.141592653589793
#define PI2 6.283185307179586
#define PI_HALF 1.5707963267948966
#define RECIPROCAL_PI 0.3183098861837907
#define RECIPROCAL_PI2 0.15915494309189535
#define EPSILON 1e-6
#ifndef saturate
    #define saturate( a ) clamp( a, 0.0, 1.0 )
#endif
#define whiteComplement( a ) ( 1.0 - saturate( a ) )
float pow2( const in float x ) {
    return x*x;
}
vec3 pow2( const in vec3 x ) {
    return x*x;
}
float pow3( const in float x ) {
    return x*x*x;
}
float pow4( const in float x ) {
    float x2 = x*x;
    return x2*x2;
}
float max3( const in vec3 v ) {
    return max( max( v.x, v.y ), v.z );
}
float average( const in vec3 v ) {
    return dot( v, vec3( 0.3333333 ) );
}
highp float rand( const in vec2 uv ) {
    const highp float a = 12.9898, b = 78.233, c = 43758.5453;
    highp float dt = dot( uv.xy, vec2( a, b ) ), sn = mod( dt, PI );
    return fract( sin( sn ) * c );
}
#ifdef HIGH_PRECISION
    float precisionSafeLength( vec3 v ) {
        return length( v );
    }
#else
    float precisionSafeLength( vec3 v ) {
        float maxComponent = max3( abs( v ) );
        return length( v / maxComponent ) * maxComponent;
    }
#endif
struct IncidentLight {
    vec3 color;
    vec3 direction;
    bool visible;
};
struct ReflectedLight {
    vec3 directDiffuse;
    vec3 directSpecular;
    vec3 indirectDiffuse;
    vec3 indirectSpecular;
};
#ifdef USE_ALPHAHASH
    varying vec3 vPosition;
#endif
vec3 transformDirection( in vec3 dir, in mat4 matrix ) {
    return normalize( ( matrix * vec4( dir, 0.0 ) ).xyz );
}
vec3 inverseTransformDirection( in vec3 dir, in mat4 matrix ) {
    return normalize( ( vec4( dir, 0.0 ) * matrix ).xyz );
}
mat3 transposeMat3( const in mat3 m ) {
    mat3 tmp;
    tmp[ 0 ] = vec3( m[ 0 ].x, m[ 1 ].x, m[ 2 ].x );
    tmp[ 1 ] = vec3( m[ 0 ].y, m[ 1 ].y, m[ 2 ].y );
    tmp[ 2 ] = vec3( m[ 0 ].z, m[ 1 ].z, m[ 2 ].z );
    return tmp;
}
bool isPerspectiveMatrix( mat4 m ) {
    return m[ 2 ][ 3 ] == - 1.0;
}
vec2 equirectUv( in vec3 dir ) {
    float u = atan( dir.z, dir.x ) * RECIPROCAL_PI2 + 0.5;
    float v = asin( clamp( dir.y, - 1.0, 1.0 ) ) * RECIPROCAL_PI + 0.5;
    return vec2( u, v );
}
vec3 BRDF_Lambert( const in vec3 diffuseColor ) {
    return RECIPROCAL_PI * diffuseColor;
}
vec3 F_Schlick( const in vec3 f0, const in float f90, const in float dotVH ) {
    float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
    return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
float F_Schlick( const in float f0, const in float f90, const in float dotVH ) {
    float fresnel = exp2( ( - 5.55473 * dotVH - 6.98316 ) * dotVH );
    return f0 * ( 1.0 - fresnel ) + ( f90 * fresnel );
}
// validated

void main() {
    vec2 dUv = vUv;
    vec2 sUv = gl_FragCoord.xy / uResolution;
    dUv.x += 0.01 * uTime;
    float whoWeAre = 1. - step(-0.5, uPage);
    float homepage = step(-0.5, uPage) * (1. - step(0.5, uPage));
    float trading = step(0.5, uPage) * (1. - step(1.5, uPage));
    float capital = step(1.5, uPage) * (1. - step(2.5, uPage));
    float maritime = step(2.5, uPage) * (1. - step(3.5, uPage));
    float fortEnergy = step(3.5, uPage) * (1. - step(4.5, uPage));
    vec2 aUv = vUv + vec2(-0.004 * uTime, 0.002 * uTime);
    float noise = texture2D(tNoise, dUv).r * texture2D(tNoise, aUv).r;
    vec2 dsUv = sUv + 0.5 * (noise - .25);
    float value = length(dsUv - .5) * sUv.y;
    float simpleClouds = texture2D(tNoise, vUv * 2. + vec2(-0.001 * uTime, 0.)).g;
    value = 1. - value;
    value += 0.5 * simpleClouds;
    vec2 ditheredUv = vUv + 0.002 * (rand(gl_FragCoord.xy) - .5);
    float ditheredValue = smoothstep(.2 - trading * .08, 0., length(ditheredUv - vec2(.34, .2)));
    value = mix(value, ditheredValue, trading);
    float energyValue = smoothstep(.15, .25, ditheredUv.y + 0.002 * (rand(gl_FragCoord.xy) - .5) + .03 - .1 * abs(sUv.x - .5));
    energyValue *= smoothstep(.26, .25, vUv.y);
    vec2 feUv = vUv;
    feUv.y *= 2. + .8 * pow2(abs(sUv.x - .5));
    feUv.x *= 1. + .2 * (sUv.x - .5);
    feUv *= 1. + .08 * (texture2D(tNoise, 2. * vUv + vec2(0., .007 * uTime)).r - .5);
    float feClouds = texture2D(tNoise, feUv + .2).r;
    feClouds = smoothstep(0.55, 0., feClouds);
    energyValue += feClouds;
    energyValue = min(energyValue, 1.);
    value = mix(value, energyValue, fortEnergy);
    vec3 color = mix(uDarkColor, uLightColor + .08 * homepage, clamp(value, 0., 1.));
    /* Trading lines behind mountain */
    float lines = texture2D(tNoise, vUv * vec2(8., .1) + vec2(.0, .01 * uTime)).r * .85;
    lines = smoothstep(.5 - .15 * value, .8, lines);
    lines *= smoothstep(0.5, 1., value);
    vec2 uv = vUv * vec2(6., -8.);
    float basic2Noise = texture2D(tNoise, uv * 2.5 * vec2(2., 1.)).r;
    float mouse = clamp(texture2D(tMouse, sUv + 0.1 * vec2(basic2Noise)).r, 0., 1.);
    /* Fort energy stars */
    
    if (fortEnergy == 1.) {
        vec2 starsUv = fract(vUv * 150.);
        /* First layers of stars */
        vec2 starsUniqUv = floor(vUv * 150.) / 150.;
        vec3 uniqNoise = texture2D(tNearestNoise, starsUniqUv).rgb;
        float starMaker = length(starsUv - .5 + 0.4 * vec2(uniqNoise.rg - .5));
        float stars = smoothstep(.05, 0., starMaker);
        stars += .1 * smoothstep(.15, 0., starMaker);
        /* Glow */
        stars *= smoothstep(.7, 1., uniqNoise.b);
        starsUv = fract(vUv * 200.);
        /* Second layers of stars */
        starsUniqUv = floor(vUv * 200.) / 200.;
        uniqNoise = texture2D(tNearestNoise, starsUniqUv + .5).rgb;
        starMaker = length(starsUv - .5 + 0.4 * vec2(uniqNoise.rg - .5));
        float stars2 = smoothstep(.05, 0., starMaker);
        stars2 += .1 * smoothstep(.1, 0., starMaker);
        /* Glow */
        stars2 *= smoothstep(.7, 1., uniqNoise.b);
        starsUv = fract(vUv * 230.);
        /* Third layers of stars */
        starsUniqUv = floor(vUv * 230.) / 230.;
        uniqNoise = texture2D(tNearestNoise, starsUniqUv + .1).rgb;
        starMaker = length(starsUv - .5 + 0.4 * vec2(uniqNoise.rg - .5));
        float stars3 = smoothstep(.05, 0., starMaker);
        stars3 += .1 * smoothstep(.1, 0., starMaker);
        /* Glow */
        stars3 *= smoothstep(.7, 1., uniqNoise.b);
        stars += stars2;
        stars += .8 * stars3;
        stars *= smoothstep(.25, .15, vUv.y);
        stars *= smoothstep(.2, 0., feClouds);
        stars *= .8 + mouse;
        color += stars * (.4 + uLightColor) * fortEnergy;
        color = mix(color, vec3(0.), smoothstep(.5, 1., uChapter));
    }
    color += lines * uLightColor * vec3(.3, .7, .5) * trading;
    float transition = smoothstep(0., 0.2, uTransition);
    color = mix(color, uTransitionColor, transition);
    /* Clouds background for transition */
    
    float count = 4.;
    vec2 fUv = uv + vec2(0.005 * uTime, 0.) + .01 * mouse;
    vec2 cUv = vec2(uv.x, uv.y * (count)) + .01 * mouse;
    cUv.y -= 2.;
    float offset = 1.5 * (smoothstep(0.7 + .2 * texture2D(tNoise, uv * 4.).r, 1., fract(cUv.y)) + floor(cUv.y));
    float cloudShape = (-.01 * abs(sin(uv.x * 50. + offset)) - 0.03 * abs(sin(uv.x * 15. + offset)) - 0.02 * abs(sin(fUv.x * 17. + offset))) * count;
    cUv.y += cloudShape;
    cUv *= 1. + .3 * (texture2D(tNoise, fUv * .3).rg - .5);
    cUv.y += 1. * (texture2D(tNoise, fUv * .4).r - .5);
    cUv.y -= .05 * count * texture2D(tNoise, fUv * 4.).r;
    float cloudRows = fract(cUv.y);
    cloudRows += smoothstep(0.5, 0., cloudRows);
    vec2 sCUv = uv + vec2(.01 * uTime) + .2 * texture2D(tNoise, uv * 1.).r + .05 * vec2(basic2Noise) + .01 * mouse;
    float smallCloudsNoise = texture2D(tNoise, sCUv * 0.1).r;
    float offsetSmallCloudsNoise = texture2D(tNoise, sCUv * 0.1 + vec2(0., -.01)).r;
    vec2 smallClouds = vec2(smoothstep(.5, .62, offsetSmallCloudsNoise), smoothstep(.46, .5, smallCloudsNoise));
    float clouds = mix(cloudRows, smallClouds.r, smallClouds.g);
    clouds = clamp(clouds, 0., 1.);
    vec3 darkColor = vec3(0.737, 0.773, 0.8) * (1. + .13 * whoWeAre);
    vec3 cloudySkyColor = mix(darkColor, vec3(0.961, 0.969, 0.976), clouds);
    color = mix(color, cloudySkyColor, .5 * clamp(.3 * homepage + transition, 0., 1.));
    color = mix(color, cloudySkyColor, whoWeAre);
    /* Homepage chapters background */
    if(homepage == 1.) {
        vec3 seaColor = vec3(0.31, 0.373, 0.427);
        vec3 globeSky = vec3(0.0196, 0.0745, 0.1098);
        color = mix(color, seaColor, smoothstep(2.5, 2.7, uChapter + dUv.y + 0.1 * noise));
        color = mix(color, globeSky, smoothstep(4., 4.1, uChapter));
        color = mix(color, vec3(.11, 0.22, 0.26), smoothstep(4.2, 4.3, uChapter));
    }
    else if(trading == 1.) {
        color *= 1. - (min(1., uChapter));
    }
    gl_FragColor = vec4(color, 1.);
}
