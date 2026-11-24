import * as THREE from 'three';

/**
 * 표면 무늬 (그래픽 2차 G1): 텍스처 파일 없이 셰이더로 그리는 질감.
 * 세상 좌표(world position)로 무늬를 정하므로 이음매가 없고, 다운로드 용량이 0이다.
 * - paving: 마당 돌바닥 (어긋나게 놓인 네모 돌 + 줄눈 + 돌마다 조금씩 다른 색)
 * - grass: 풀밭 (큰 얼룩 + 잔디 점점)
 * - masonry: 성벽 돌 쌓기 (옆면) / 위는 얼룩
 * - plaster: 집 벽 회반죽 (은은한 얼룩·점)
 * - tiles: 지붕 기와 (가로 줄마다 둥근 끝)
 * - wood: 나뭇결
 * - foliage: 잎 덩어리 (밝고 어두운 무리)
 * - speckle: 흙·바위·디딤돌 (작은 점)
 * 원래 재질 색에 곱하는 방식이라 색칠·밝기는 그대로 따라간다.
 */
export type Pattern = 'paving' | 'grass' | 'masonry' | 'plaster' | 'tiles' | 'wood' | 'foliage' | 'speckle';

/** 배경 재질 이름 → 무늬 */
export const PATTERN_BY_MATERIAL: Record<string, Pattern> = {
  yard: 'paving',
  grass: 'grass',
  meadow: 'grass',
  stone: 'masonry',
  wall_cream: 'plaster',
  wall_pink: 'plaster',
  wall_mint: 'plaster',
  roof: 'tiles',
  roof_pink: 'tiles',
  roof_orange: 'tiles',
  roof_green: 'tiles',
  wood: 'wood',
  trunk: 'wood',
  beam: 'wood',
  leaf: 'foliage',
  leaf2: 'foliage',
  hedge: 'foliage',
  cabbage: 'foliage',
  soil: 'speckle',
  rock: 'speckle',
  path: 'speckle',
};

const NOISE = /* glsl */ `
varying vec3 vPatPos;
varying vec3 vPatNormal;
float patHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float patNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(patHash(i), patHash(i + vec2(1.0, 0.0)), u.x), mix(patHash(i + vec2(0.0, 1.0)), patHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
float patFbm(vec2 p) { return patNoise(p) * 0.6 + patNoise(p * 2.13 + 7.1) * 0.3 + patNoise(p * 4.7 + 3.3) * 0.1; }
/* 면 방향에 맞는 평면 좌표: 위·아래 면은 xz, 옆면은 (가로, y) */
vec2 patPlane(vec3 p, vec3 n) {
  vec3 a = abs(n);
  if (a.y > 0.6) return p.xz;
  return a.x > a.z ? vec2(p.z, p.y) : vec2(p.x, p.y);
}
`;

/** 무늬마다: 재질 색에 곱할 값 m (vec3). p = 세상 좌표, n = 세상 법선 */
const BODY: Record<Pattern, string> = {
  paving: `
    vec2 q = p.xz / vec2(0.9, 0.7);
    q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
    vec2 cell = floor(q);
    vec2 f = fract(q);
    float edge = min(min(f.x, 1.0 - f.x) * 0.9, min(f.y, 1.0 - f.y) * 0.7);
    float grout = smoothstep(0.015, 0.05, edge);
    float tone = patHash(cell) * 0.14 - 0.07;
    float wear = (patFbm(p.xz * 2.5) - 0.5) * 0.08;
    m = vec3(1.0 + tone + wear) * mix(0.78, 1.0, grout);
    m *= mix(vec3(1.0), vec3(1.02, 0.99, 0.95), patHash(cell + 3.0));`,
  grass: `
    float big = patFbm(p.xz * 0.18);
    float mid = patFbm(p.xz * 1.1 + 5.0);
    float dots = step(0.82, patNoise(p.xz * 9.0));
    m = vec3(0.86 + big * 0.24) * mix(vec3(0.97, 1.03, 0.94), vec3(1.04, 1.0, 1.06), mid);
    m *= 1.0 - dots * 0.08;`,
  masonry: `
    vec2 uv = patPlane(p, n);
    if (abs(n.y) > 0.6) {
      m = vec3(0.95 + patFbm(uv * 1.5) * 0.1);
    } else {
      vec2 q = uv / vec2(0.7, 0.35);
      q.x += step(1.0, mod(floor(q.y), 2.0)) * 0.5;
      vec2 cell = floor(q);
      vec2 f = fract(q);
      float edge = min(min(f.x, 1.0 - f.x) * 0.7, min(f.y, 1.0 - f.y) * 0.35);
      float mortar = smoothstep(0.008, 0.03, edge);
      float tone = patHash(cell) * 0.12 - 0.06;
      m = vec3(1.0 + tone + (patFbm(uv * 3.0) - 0.5) * 0.06) * mix(0.82, 1.0, mortar);
    }`,
  plaster: `
    vec2 uv = patPlane(p, n);
    m = vec3(0.96 + patFbm(uv * 0.9) * 0.07 + (patNoise(uv * 22.0) - 0.5) * 0.03);`,
  tiles: `
    float row = p.y / 0.2;
    float fr = fract(row);
    float col = (p.x + p.z) / 0.28 + step(1.0, mod(floor(row), 2.0)) * 0.5;
    float fc = fract(col) - 0.5;
    /* 기와 끝이 둥글게: 줄 아래쪽이 가운데만 내려옴 */
    float lip = smoothstep(0.0, 0.25, fr - (fc * fc) * 0.6);
    float tone = patHash(vec2(floor(col), floor(row))) * 0.1 - 0.05;
    m = vec3(mix(0.8, 1.04, lip) + tone);`,
  wood: `
    vec2 uv = patPlane(p, n);
    float along = abs(n.y) > 0.6 ? uv.x : uv.y;
    float across = abs(n.y) > 0.6 ? uv.y : uv.x;
    float grain = sin(across * 38.0 + patFbm(vec2(across * 3.0, along * 0.6)) * 6.0) * 0.5 + 0.5;
    m = vec3(0.9 + grain * 0.12 + (patNoise(vec2(across * 8.0, along * 0.4)) - 0.5) * 0.06);`,
  foliage: `
    float clump = patFbm(p.xz * 1.6 + p.y * 1.3);
    float leaves = patNoise(vec2(p.x + p.y, p.z - p.y) * 9.0);
    m = vec3(0.82 + clump * 0.3 + (leaves - 0.5) * 0.08) * mix(vec3(1.0), vec3(1.04, 1.06, 0.92), smoothstep(0.55, 0.8, clump));`,
  speckle: `
    vec2 uv = patPlane(p, n);
    m = vec3(0.94 + patFbm(uv * 2.0) * 0.1 - step(0.85, patNoise(uv * 14.0)) * 0.06);`,
};

/** 재질에 무늬를 더한다 (다른 onBeforeCompile 이 있으면 이어서) */
export function addSurfacePattern(mat: THREE.Material, pattern: Pattern): void {
  const prev = mat.onBeforeCompile;
  const prevKey = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    prev?.call(mat, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vPatPos;\nvarying vec3 vPatNormal;')
      .replace(
        '#include <worldpos_vertex>',
        `#include <worldpos_vertex>
vPatPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
vPatNormal = normalize(mat3(modelMatrix) * objectNormal);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${NOISE}`)
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
{
  vec3 p = vPatPos;
  vec3 n = normalize(vPatNormal);
  vec3 m = vec3(1.0);
  ${BODY[pattern]}
  diffuseColor.rgb *= m;
}`,
      );
  };
  mat.customProgramCacheKey = () => `${prevKey()}|pat-${pattern}`;
  mat.needsUpdate = true;
}
