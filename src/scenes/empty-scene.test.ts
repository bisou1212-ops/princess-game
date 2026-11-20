import { describe, it, expect } from 'vitest';
import { createEmptyScene, CUBE_SPEED } from './empty-scene';

describe('빈 씬 (M0)', () => {
  it('바닥과 큐브가 있고, 큐브가 천천히 회전한다', () => {
    const s = createEmptyScene(16 / 9);
    const meshes = s.scene.children.filter((o) => (o as { isMesh?: boolean }).isMesh);
    expect(meshes).toHaveLength(2);
    const cube = meshes[1];
    s.update(1);
    expect(cube.rotation.y).toBeCloseTo(CUBE_SPEED);
  });
});
