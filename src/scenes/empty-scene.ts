import * as THREE from 'three';

/** 파스텔 팔레트 (GDD 8.1) */
export const COLORS = {
  sky: 0xbfe6ff, // 파스텔 하늘색
  floor: 0xb8b8bc, // 그레이박스 회색
  cube: 0xffb6d9, // 파스텔 분홍
} as const;

/** 큐브 회전 속도 (라디안/초) — "천천히" */
export const CUBE_SPEED = 0.5;

export interface EmptyScene {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  update(dt: number): void;
}

export function createEmptyScene(aspect: number): EmptyScene {
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(COLORS.sky);
  scene.fog = new THREE.Fog(COLORS.sky, 18, 40);

  const camera = new THREE.PerspectiveCamera(50, aspect, 0.1, 100);
  camera.position.set(4, 4, 7);
  camera.lookAt(0, 0.6, 0);

  // 부드러운 조명: 하늘/땅 반구광 + 그림자용 방향광 1개 (실시간 그림자 최대 1개)
  scene.add(new THREE.HemisphereLight(0xffffff, 0xd9c8e8, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(5, 10, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = -6;
  sun.shadow.camera.right = 6;
  sun.shadow.camera.top = 6;
  sun.shadow.camera.bottom = -6;
  sun.shadow.radius = 4;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshStandardMaterial({ color: COLORS.floor, roughness: 1 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  const cube = new THREE.Mesh(
    new THREE.BoxGeometry(1.2, 1.2, 1.2),
    new THREE.MeshStandardMaterial({ color: COLORS.cube, roughness: 0.5 }),
  );
  cube.position.y = 1.1;
  cube.castShadow = true;
  scene.add(cube);

  return {
    scene,
    camera,
    update(dt) {
      cube.rotation.y += CUBE_SPEED * dt;
      cube.rotation.x += CUBE_SPEED * 0.4 * dt;
    },
  };
}
