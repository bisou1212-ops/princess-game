/**
 * "톡" 입력 (GDD 7: 조작은 톡·끌기만).
 * 마우스·손가락 모두 Pointer Events로 받고, 짧게 누르고 거의 안 움직였을 때만 톡으로 본다.
 * 두 손가락 이상이 닿아 있으면 톡이 아님(나중에 카메라 돌리기·확대에 사용).
 */
export interface TapOptions {
  maxMovePx?: number;
  maxDurationMs?: number;
}

export function onTap(
  el: HTMLElement,
  handler: (clientX: number, clientY: number) => void,
  opts: TapOptions = {},
): () => void {
  const maxMove = opts.maxMovePx ?? 12;
  const maxDuration = opts.maxDurationMs ?? 500;
  const active = new Map<number, { x: number; y: number; t: number }>();
  let multiTouch = false;

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    if (active.size > 1) multiTouch = true;
  };
  const up = (e: PointerEvent) => {
    const s = active.get(e.pointerId);
    active.delete(e.pointerId);
    if (!s) return;
    const wasMulti = multiTouch;
    if (active.size === 0) multiTouch = false;
    if (wasMulti) return;
    const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    if (moved <= maxMove && performance.now() - s.t <= maxDuration) handler(e.clientX, e.clientY);
  };
  const cancel = (e: PointerEvent) => {
    active.delete(e.pointerId);
    if (active.size === 0) multiTouch = false;
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}
