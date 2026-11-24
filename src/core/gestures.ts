/**
 * 톡 + 끌기 (GDD 7: 조작은 "톡"과 "끌기" 두 가지뿐).
 * 손가락 하나로 짧게 누르면 톡, 누른 채 움직이면 끌기. 두 손가락은 무시(나중에 카메라용).
 */
export interface GestureHandlers {
  onTap?(x: number, y: number): void;
  /** 끌기 시작 위치(처음 누른 곳). false를 돌려주면 이번 끌기는 무시 */
  onDragStart?(x: number, y: number): boolean;
  onDragMove?(x: number, y: number): void;
  onDragEnd?(x: number, y: number): void;
  onDragCancel?(): void;
}

/**
 * moveThreshold: 이만큼 움직이면 끌기 시작 (px)
 * tapSlop·tapMaxMs: 아이 손가락은 누르는 동안 조금 미끄러지고 오래 누르기도 하므로 톡은 넉넉하게 봐준다
 */
export function attachGestures(el: HTMLElement, h: GestureHandlers, moveThreshold = 12, tapMaxMs = 1200, tapSlop = 28): () => void {
  const active = new Map<number, { x: number; y: number; t: number }>();
  let multi = false;
  let dragging: number | null = null;

  const down = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    active.set(e.pointerId, { x: e.clientX, y: e.clientY, t: performance.now() });
    if (active.size > 1) {
      multi = true;
      if (dragging !== null) {
        dragging = null;
        h.onDragCancel?.();
      }
    }
  };

  const move = (e: PointerEvent) => {
    const s = active.get(e.pointerId);
    if (!s || multi) return;
    if (dragging === e.pointerId) {
      h.onDragMove?.(e.clientX, e.clientY);
      return;
    }
    if (dragging === null && Math.hypot(e.clientX - s.x, e.clientY - s.y) > moveThreshold) {
      if (h.onDragStart?.(s.x, s.y)) {
        dragging = e.pointerId;
        try {
          el.setPointerCapture?.(e.pointerId);
        } catch {
          // 이미 끝난 포인터면 붙잡지 않아도 된다
        }
        h.onDragMove?.(e.clientX, e.clientY);
      }
    }
  };

  const up = (e: PointerEvent) => {
    const s = active.get(e.pointerId);
    active.delete(e.pointerId);
    if (!s) return;
    const wasMulti = multi;
    if (active.size === 0) multi = false;
    if (dragging === e.pointerId) {
      dragging = null;
      h.onDragEnd?.(e.clientX, e.clientY);
      return;
    }
    if (wasMulti) return;
    const moved = Math.hypot(e.clientX - s.x, e.clientY - s.y);
    // 끌기가 시작되지 않았다면 (마당처럼 끌기를 안 쓰는 곳) 조금 미끄러져도 톡. 누른 자리를 톡한 것으로 본다
    if (moved <= tapSlop && performance.now() - s.t <= tapMaxMs) h.onTap?.(s.x, s.y);
  };

  const cancel = (e: PointerEvent) => {
    active.delete(e.pointerId);
    if (active.size === 0) multi = false;
    if (dragging === e.pointerId) {
      dragging = null;
      h.onDragCancel?.();
    }
  };

  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);
  el.addEventListener('pointercancel', cancel);
  return () => {
    el.removeEventListener('pointerdown', down);
    el.removeEventListener('pointermove', move);
    el.removeEventListener('pointerup', up);
    el.removeEventListener('pointercancel', cancel);
  };
}
