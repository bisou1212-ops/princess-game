import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import castleEnvUrl from '../../assets/models/env-castle.glb?url';
import flowerEnvUrl from '../../assets/models/env-flower-kingdom.glb?url';
import seaEnvUrl from '../../assets/models/env-sea-kingdom.glb?url';
import { toonMaterial, type SurfaceRole } from '../../core/toon';
import { PATTERN_BY_MATERIAL, addSurfacePattern } from '../../core/surface-patterns';
import { createGrassTufts } from './grass-tufts';

/**
 * Blender로 만든 장소 배경 (scripts/blender/build_castle_env.py → env-*.glb).
 * - 보이는 모습만 바꾼다. 충돌·길찾기는 그대로 배치 JSON(courtyard.json 등)이 맡는다.
 * - 재질 하나 = 물체 하나로 합쳐져 있어 그리기 호출이 적다.
 * - 버텍스 컬러 = 구운 AO(구석의 은은한 그늘). 재질 색에 곱해진다.
 * - "water" 는 일렁이는 물 셰이더로 바꾼다.
 * 불러오지 못하면 null — 장면은 예전 도형 배경을 쓴다.
 */
const URLS: Record<string, string> = { castle: castleEnvUrl, 'flower-kingdom': flowerEnvUrl, 'sea-kingdom': seaEnvUrl };
const templates = new Map<string, THREE.Object3D>();

export async function preloadEnv(id: string | undefined): Promise<boolean> {
  if (!id || templates.has(id)) return !!id;
  const url = URLS[id];
  if (!url) return false;
  try {
    const gltf = await new GLTFLoader().loadAsync(url);
    templates.set(id, gltf.scene);
    return true;
  } catch (err) {
    console.warn('배경 모델을 불러오지 못해 도형 배경을 씁니다.', err);
    return false;
  }
}

export interface EnvInstance {
  root: THREE.Group;
  /** 톡 판정에 쓸 표면들 (땅·벽 …) */
  surfaces: THREE.Object3D[];
  update(elapsed: number): void;
}

/** 재질 이름 → 느낌 */
const ROLE: Record<string, SurfaceRole> = { glass: 'gem', gold: 'gem', basin: 'gem' };
/** 바람에 흔들리는 것: 높이(m)에 비례해 살랑 (잎은 많이, 산울타리는 조금) */
const SWAY: Record<string, number> = { leaf: 0.05, leaf2: 0.05, hedge: 0.025, cabbage: 0.015 };

/** 그림자를 드리우지 않는 넓은 바닥 (그림자 맵을 아끼고 땅이 얼룩지지 않게) */
const FLAT = new Set(['grass', 'yard', 'path', 'soil', 'meadow', 'sand', 'wetsand', 'foam']);
/**
 * AO를 얼마나 진하게 (1 = 구운 그대로). 파스텔 화풍이라 은은하게.
 * 꼭짓점이 적은 큰 면(고깔 지붕·벽)은 모서리 그늘이 면 전체로 번지므로 약하게, 반짝이는 것은 없이.
 */
const AO_STRENGTH: Record<string, number> = {
  roof: 0, roof_pink: 0, roof_orange: 0, roof_green: 0, glass: 0, gold: 0,
  stone: 0.35, trim: 0.4, wall_pink: 0.4, wall_cream: 0.4, wall_mint: 0.4,
};
const AO_DEFAULT = 0.6;

/**
 * 색 다듬기 (그래픽 2차 G1): 너무 하얗게 바랜 파스텔을 조금 진하게. [채도 더하기, 밝기 더하기] (HSL)
 * 땅·잎이 또렷해지면 공주·친구가 더 잘 보인다.
 */
const TINT: Record<string, [number, number]> = {
  grass: [0.16, -0.08],
  meadow: [0.18, -0.09],
  yard: [0.04, -0.04],
  hedge: [0.12, -0.05],
  leaf: [0.1, -0.04],
  leaf2: [0.1, -0.04],
  path: [0.05, -0.03],
};

export function createEnv(id: string | undefined): EnvInstance | null {
  const t = id ? templates.get(id) : undefined;
  if (!t) return null;
  const root = new THREE.Group();
  const scene = t.clone(true);
  root.add(scene);
  const surfaces: THREE.Object3D[] = [];
  const grassMeshes: THREE.Mesh[] = [];
  const avoid: THREE.Mesh[] = [];
  let grassColor = new THREE.Color(0x9fd88f);
  let water: THREE.ShaderMaterial | THREE.MeshPhysicalMaterial | null = null;
  const waterTime = { value: 0 };

  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const src = mesh.material as THREE.MeshStandardMaterial;
    const name = (src.name || '').replace(/^env_/, '');
    const geo = mesh.geometry;
    const ao = geo.getAttribute('color') as THREE.BufferAttribute | undefined;
    if (ao) {
      // 구운 AO 를 은은하게: c' = 1 - k(1 - c)
      const k = AO_STRENGTH[name] ?? AO_DEFAULT;
      for (let i = 0; i < ao.count; i++) {
        for (let c = 0; c < 3; c++) {
          const v = ao.getComponent(i, c);
          ao.setComponent(i, c, 1 - k * (1 - v));
        }
      }
      ao.needsUpdate = true;
    }
    if (name === 'water') {
      water = createWaterMaterial(src.color, waterTime);
      mesh.material = water;
      mesh.renderOrder = 1;
      return;
    }
    if (name === 'grass' || name === 'meadow') {
      grassMeshes.push(mesh);
      grassColor = src.color.clone();
    } else if (name === 'path' || name === 'soil' || name === 'yard') avoid.push(mesh);
    const color = src.color.clone(); // 원본(템플릿)은 그대로 두고 복사본만 다듬음
    const tint = TINT[name];
    if (tint) color.offsetHSL(0, tint[0], tint[1]);
    const mat = toonMaterial({ color, vertexColors: !!ao }, ROLE[name] ?? 'plain');
    if (SWAY[name]) addWindSway(mat, waterTime, SWAY[name]);
    // 돌바닥·풀·벽돌·기와·나뭇결 무늬 (그래픽 2차 G1)
    const pattern = PATTERN_BY_MATERIAL[name];
    if (pattern) addSurfacePattern(mat, pattern);
    mesh.material = mat;
    mesh.castShadow = !FLAT.has(name);
    mesh.receiveShadow = true;
    surfaces.push(mesh);
  });

  // 풀밭 위 풀 덤불 (바람에 살랑)
  const tufts = createGrassTufts({ meshes: grassMeshes, avoid, color: grassColor }, waterTime);
  if (tufts) root.add(tufts);

  return {
    root,
    surfaces,
    update(elapsed) {
      waterTime.value = elapsed;
    },
  };
}

/** 일렁이는 물: 맑은 하늘색 + 천천히 움직이는 물결 반짝임 (텍스처 없이 셰이더로) */
function createWaterMaterial(color: THREE.Color, time: { value: number }): THREE.MeshPhysicalMaterial {
  const m = new THREE.MeshPhysicalMaterial({
    color: color.clone(),
    roughness: 0.08,
    metalness: 0,
    clearcoat: 1,
    clearcoatRoughness: 0.05,
    transparent: true,
    opacity: 0.82,
    envMapIntensity: 1.2,
  });
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWaterPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWaterPos;\nuniform float uTime;')
      .replace(
        '#include <color_fragment>',
        `#include <color_fragment>
float r = length(vWaterPos.xz);
float w1 = sin(r * 9.0 - uTime * 2.2);
float w2 = sin(vWaterPos.x * 5.0 + uTime * 1.3) * sin(vWaterPos.z * 6.0 - uTime * 1.1);
float ripple = smoothstep(0.75, 1.0, w1 * 0.6 + w2 * 0.5);
diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0), ripple * 0.55);`,
      );
  };
  m.customProgramCacheKey = () => 'env-water';
  return m;
}

/** 잎·덤불이 바람에 살랑: 꼭짓점을 높이에 비례해 천천히 밀었다 당긴다 (배경은 물체 좌표 = 세상 좌표) */
function addWindSway(m: THREE.Material, time: { value: number }, amount: number): void {
  const prev = m.onBeforeCompile;
  m.onBeforeCompile = (shader, renderer) => {
    prev?.call(m, shader, renderer);
    shader.uniforms.uWindTime = time;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform float uWindTime;')
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
float windH = max(transformed.y - 0.3, 0.0);
float windW = sin(uWindTime * 1.6 + transformed.x * 0.35 + transformed.z * 0.25) + 0.4 * sin(uWindTime * 3.1 + transformed.x * 1.3);
transformed.x += windW * windH * ${amount.toFixed(3)};
transformed.z += windW * windH * ${(amount * 0.5).toFixed(3)};`,
      );
  };
  m.customProgramCacheKey = () => `wind-${amount}`;
}
