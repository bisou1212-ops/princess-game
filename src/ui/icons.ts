/** 화면용 작은 그림(SVG). 글을 못 읽어도 알아볼 수 있게 (GDD 7) */

const svg = (body: string) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
const OUTLINE = 'stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';

export function flowerIcon(color: string): string {
  const petals = [0, 72, 144, 216, 288]
    .map((a) => `<ellipse cx="32" cy="17" rx="10" ry="14" fill="${color}" transform="rotate(${a} 32 32)"/>`)
    .join('');
  return svg(`${petals}<circle cx="32" cy="32" r="9" fill="#fff3b0"/>`);
}

export function candyIcon(): string {
  return svg(`<path d="M32 4l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 42.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z" fill="#ffd76a" ${OUTLINE}/>
    <circle cx="25" cy="26" r="3" fill="#fff" opacity=".8"/>`);
}

export function dressIcon(color: string, shape = 'basic'): string {
  if (shape === 'puffy') {
    return svg(`<path d="M25 6h14l-2 12 4 4-2 4c12 4 16 14 16 26H9c0-12 4-22 16-26l-2-4 4-4z" fill="${color}" ${OUTLINE}/>
      <path d="M12 50q5 5 10 0 5 5 10 0 5 5 10 0 5 5 10 0" fill="none" stroke="#fff" stroke-width="3"/>`);
  }
  const flowers =
    shape === 'flower'
      ? '<circle cx="20" cy="52" r="4" fill="#fff"/><circle cx="32" cy="53" r="4" fill="#fff"/><circle cx="44" cy="52" r="4" fill="#fff"/><circle cx="32" cy="24" r="3.5" fill="#fff3b0"/>'
      : '<circle cx="32" cy="38" r="4" fill="#fff" opacity=".85"/>';
  return svg(`<path d="M24 6h16l-3 12 5 6-3 4 14 28H11l14-28-3-4 5-6z" fill="${color}" ${OUTLINE}/>${flowers}`);
}

export function hairIcon(color: string, shape = 'long'): string {
  const extra =
    shape === 'pigtails'
      ? `<circle cx="10" cy="30" r="8" fill="${color}"/><circle cx="54" cy="30" r="8" fill="${color}"/><rect x="6" y="34" width="8" height="18" rx="4" fill="${color}"/><rect x="50" y="34" width="8" height="18" rx="4" fill="${color}"/>`
      : shape === 'bun'
        ? `<circle cx="32" cy="9" r="8" fill="${color}"/>`
        : `<rect x="14" y="28" width="36" height="30" rx="12" fill="${color}"/>`;
  return svg(`${extra}<circle cx="32" cy="32" r="18" fill="#ffe9dc"/><path d="M14 32a18 18 0 0 1 36 0q-10-8-18-6-10 1-18 6z" fill="${color}"/>
    <circle cx="26" cy="36" r="2.2" fill="#3d3a4a"/><circle cx="38" cy="36" r="2.2" fill="#3d3a4a"/>`);
}

export function crownIcon(color: string, shape = 'crown'): string {
  if (shape === 'ribbon') {
    return svg(`<path d="M10 40a22 22 0 0 1 44 0" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
      <path d="M40 16l-14-8v20zM40 16l14-8v20z" fill="${color}" ${OUTLINE}/><circle cx="40" cy="16" r="4" fill="#fff"/>`);
  }
  if (shape === 'tiara') {
    return svg(`<path d="M8 44q24-22 48 0l-4 4q-20-14-40 0z" fill="${color}" ${OUTLINE}/><path d="M32 16l7 10-7 10-7-10z" fill="#fff" stroke="${color}" stroke-width="3"/>`);
  }
  return svg(`<path d="M10 46l-2-28 13 12 11-18 11 18 13-12-2 28z" fill="${color}" ${OUTLINE}/><circle cx="32" cy="36" r="4" fill="#fff"/>`);
}

export function shoesIcon(color: string, shape = 'flat'): string {
  if (shape === 'boots') {
    return svg(`<path d="M14 10h14v30l12 4c4 1 6 4 6 8v4H10V14z" fill="${color}" ${OUTLINE}/>`);
  }
  return svg(`<path d="M6 40c10 0 14-8 22-8 6 0 10 6 22 6 6 0 8 4 8 8v4H6z" fill="${color}" ${OUTLINE}/><circle cx="26" cy="36" r="3" fill="#fff"/>`);
}

export function accessoryIcon(color: string, shape = 'necklace'): string {
  if (shape === 'wings') {
    return svg(`<path d="M32 30C22 6 4 10 6 26c1 8 12 10 26 4zM32 30c10-24 28-20 26-4-1 8-12 10-26 4z" fill="${color}" opacity=".85" ${OUTLINE}/>
      <path d="M32 32c-8 14-20 18-22 8M32 32c8 14 20 18 22 8" fill="${color}" opacity=".7" ${OUTLINE}/>`);
  }
  if (shape === 'wand') {
    return svg(`<path d="M16 54L38 22" stroke="#d9d4e2" stroke-width="5" stroke-linecap="round"/>
      <path d="M42 6l4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1z" fill="${color}" ${OUTLINE}/>`);
  }
  return svg(`<path d="M12 12q20 34 40 0" fill="none" stroke="${color}" stroke-width="5" stroke-linecap="round"/>
    <path d="M32 34l8 10-8 10-8-10z" fill="${color}" ${OUTLINE}/>`);
}

/** 안 입기 */
export function noneIcon(): string {
  return svg(`<circle cx="32" cy="32" r="22" fill="none" stroke="#c9bfd8" stroke-width="5" stroke-dasharray="7 7"/>`);
}

export function wardrobeIcon(): string {
  return dressIcon('#ff9ccf');
}

export function checkIcon(): string {
  return svg(`<path d="M16 34l11 11 21-24" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>`);
}

/** 부위·모양에 맞는 옷 그림 */
export function outfitIcon(slot: string, shape: string, color: string): string {
  switch (slot) {
    case 'hair':
      return hairIcon(color, shape);
    case 'crown':
      return crownIcon(color, shape);
    case 'dress':
      return dressIcon(color, shape);
    case 'shoes':
      return shoesIcon(color, shape);
    default:
      return accessoryIcon(color, shape);
  }
}

/** 부위 탭 그림 */
export function slotIcon(slot: string): string {
  const c = '#b99cff';
  return outfitIcon(slot, slot === 'accessory' ? 'wings' : '', c);
}

export function itemIcon(item: { kind: string; color: string; slot?: string; shape?: string }): string {
  if (item.kind === 'outfit' && item.slot) return outfitIcon(item.slot, item.shape ?? '', item.color);
  return flowerIcon(item.color);
}
