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
  if (shape === 'ribbon') {
    return svg(`<path d="M24 6h16l-3 12 5 6-3 4 14 28H11l14-28-3-4 5-6z" fill="${color}" ${OUTLINE}/>
      <path d="M14 44h36M12 50h40" stroke="#fff" stroke-width="3" opacity=".9"/>
      <path d="M32 22l-9-6v12zM32 22l9-6v12z" fill="#fff" opacity=".9"/><circle cx="32" cy="22" r="3" fill="${color}"/>`);
  }
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
        : shape === 'short'
          ? `<rect x="12" y="26" width="40" height="22" rx="10" fill="${color}"/>`
          : shape === 'ponytail'
            ? `<path d="M46 18c12 2 14 18 8 34-2-12-6-20-12-26z" fill="${color}"/><circle cx="46" cy="18" r="4" fill="#fff"/>`
            : `<rect x="14" y="28" width="36" height="30" rx="12" fill="${color}"/>`;
  return svg(`${extra}<circle cx="32" cy="32" r="18" fill="#ffe9dc"/><path d="M14 32a18 18 0 0 1 36 0q-10-8-18-6-10 1-18 6z" fill="${color}"/>
    <circle cx="26" cy="36" r="2.2" fill="#3d3a4a"/><circle cx="38" cy="36" r="2.2" fill="#3d3a4a"/>`);
}

export function crownIcon(color: string, shape = 'crown'): string {
  if (shape === 'ribbon') {
    return svg(`<path d="M10 40a22 22 0 0 1 44 0" fill="none" stroke="${color}" stroke-width="6" stroke-linecap="round"/>
      <path d="M40 16l-14-8v20zM40 16l14-8v20z" fill="${color}" ${OUTLINE}/><circle cx="40" cy="16" r="4" fill="#fff"/>`);
  }
  if (shape === 'flowers') {
    const f = (x: number, y: number) =>
      `<g transform="translate(${x} ${y})"><circle cx="0" cy="-5" r="4.5" fill="${color}"/><circle cx="5" cy="-1" r="4.5" fill="${color}"/><circle cx="3" cy="5" r="4.5" fill="${color}"/><circle cx="-3" cy="5" r="4.5" fill="${color}"/><circle cx="-5" cy="-1" r="4.5" fill="${color}"/><circle r="3" fill="#ffe680"/></g>`;
    return svg(`<path d="M6 38q26-20 52 0" fill="none" stroke="#86d98f" stroke-width="5" stroke-linecap="round"/>${f(12, 32)}${f(32, 24)}${f(52, 32)}`);
  }
  if (shape === 'tiara') {
    return svg(`<path d="M8 44q24-22 48 0l-4 4q-20-14-40 0z" fill="${color}" ${OUTLINE}/><path d="M32 16l7 10-7 10-7-10z" fill="#fff" stroke="${color}" stroke-width="3"/>`);
  }
  return svg(`<path d="M10 46l-2-28 13 12 11-18 11 18 13-12-2 28z" fill="${color}" ${OUTLINE}/><circle cx="32" cy="36" r="4" fill="#fff"/>`);
}

export function shoesIcon(color: string, shape = 'flat'): string {
  if (shape === 'bunny') {
    return svg(`<path d="M22 22c-4-14 2-18 5-8l1 10zM34 22c0-14 8-16 6-6l-3 8z" fill="#fff" ${OUTLINE}/>
      <path d="M8 42c0-12 10-20 24-20s24 8 24 20v6H8z" fill="${color}" ${OUTLINE}/>
      <circle cx="26" cy="34" r="2.5" fill="#3d3a4a"/><circle cx="38" cy="34" r="2.5" fill="#3d3a4a"/><circle cx="32" cy="39" r="2" fill="#ff8fb0"/>`);
  }
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
  if (shape === 'heart-bag') {
    return svg(`<path d="M12 8l26 30" stroke="#d9d4e2" stroke-width="4" stroke-linecap="round"/>
      <path d="M38 58C22 48 18 40 20 34c2-6 10-8 18-1 8-7 16-5 18 1 2 6-2 14-18 24z" fill="${color}" ${OUTLINE}/>
      <circle cx="38" cy="42" r="3" fill="#fff"/>`);
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
  if (item.kind === 'pickup') {
    if (item.shape === 'strawberry') return strawberryIcon(item.color);
    if (item.shape === 'blueberry') return blueberryIcon(item.color);
    if (item.shape === 'pot') return potIcon(item.color);
  }
  if (item.kind === 'letter') {
    if (item.shape === 'gift') return giftIcon(item.color);
    if (item.shape === 'cookie') return cookieIcon(item.color);
    return letterIcon(item.color);
  }
  if (item.kind === 'furniture') return giftIcon(item.color);
  return flowerIcon(item.color);
}

export function strawberryIcon(color: string): string {
  return svg(`<path d="M32 58C18 48 10 34 14 24c3-7 11-9 18-6 7-3 15-1 18 6 4 10-4 24-18 34z" fill="${color}" ${OUTLINE}/>
    <path d="M20 14l12 6 12-6-4 10H24z" fill="#7fc47a"/>
    <g fill="#fff3b0"><circle cx="24" cy="30" r="2"/><circle cx="36" cy="28" r="2"/><circle cx="30" cy="38" r="2"/><circle cx="40" cy="38" r="2"/><circle cx="24" cy="42" r="2"/><circle cx="32" cy="48" r="2"/></g>`);
}

export function blueberryIcon(color: string): string {
  return svg(`<circle cx="22" cy="40" r="13" fill="${color}" ${OUTLINE}/><circle cx="42" cy="40" r="13" fill="${color}" ${OUTLINE}/>
    <circle cx="32" cy="24" r="13" fill="${color}" ${OUTLINE}/><path d="M36 8q10 0 12 8-10 2-12-8z" fill="#7fc47a"/>`);
}

export function potIcon(color: string): string {
  return svg(`<path d="M16 30h32l-5 26H21z" fill="${color}" ${OUTLINE}/><rect x="12" y="24" width="40" height="9" rx="4" fill="${color}" ${OUTLINE}/>
    <circle cx="32" cy="15" r="9" fill="#86d98f"/><path d="M32 24V14" stroke="#7fc47a" stroke-width="3"/>`);
}

export function letterIcon(color: string): string {
  return svg(`<rect x="8" y="16" width="48" height="34" rx="5" fill="#fffaf3" ${OUTLINE}/><path d="M10 19l22 17 22-17" fill="none" stroke="${color}" stroke-width="4" stroke-linejoin="round"/>
    <path d="M32 44c-6-4-9-7-9-10a4 4 0 0 1 9-2 4 4 0 0 1 9 2c0 3-3 6-9 10z" fill="#ff8fc4"/>`);
}

export function cookieIcon(color: string): string {
  return svg(`<circle cx="32" cy="32" r="24" fill="${color}" ${OUTLINE}/>
    <g fill="#7a4a2a"><circle cx="24" cy="24" r="3.5"/><circle cx="38" cy="22" r="3"/><circle cx="40" cy="38" r="3.5"/><circle cx="26" cy="40" r="3"/><circle cx="32" cy="31" r="2.5"/></g>`);
}

export function giftIcon(color: string): string {
  return svg(`<rect x="10" y="26" width="44" height="30" rx="4" fill="${color}" ${OUTLINE}/><rect x="8" y="18" width="48" height="12" rx="4" fill="${color}" ${OUTLINE}/>
    <rect x="28" y="18" width="8" height="38" fill="#fff"/><path d="M32 18c-8-10-18-6-12 0zM32 18c8-10 18-6 12 0z" fill="#ff8fc4" ${OUTLINE}/>`);
}

/** 기분 얼굴 (GDD 6: 기쁨·슬픔·화남·무서움) */
function face(fill: string, inner: string): string {
  return svg(`<circle cx="32" cy="32" r="27" fill="${fill}" ${OUTLINE}/>${inner}`);
}

export function choiceIcon(name: string): string {
  const eye = (x: number, y = 28) => `<circle cx="${x}" cy="${y}" r="3.5" fill="#5a4a6b"/>`;
  const blush = '<circle cx="17" cy="38" r="4" fill="#ff9ccf" opacity=".6"/><circle cx="47" cy="38" r="4" fill="#ff9ccf" opacity=".6"/>';
  switch (name) {
    case 'happy':
      return face('#ffe38a', `${eye(23)}${eye(41)}${blush}<path d="M20 38q12 12 24 0" fill="none" stroke="#5a4a6b" stroke-width="3.5" stroke-linecap="round"/>`);
    case 'sad':
      return face('#bfe2ff', `${eye(23, 29)}${eye(41, 29)}<path d="M18 22l9 3M46 22l-9 3" stroke="#5a4a6b" stroke-width="3" stroke-linecap="round"/>
        <path d="M22 46q10-9 20 0" fill="none" stroke="#5a4a6b" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M44 34q4 7 0 10q-4-3 0-10z" fill="#74c0ff"/>`);
    case 'angry':
      return face('#ffb3a8', `${eye(23, 31)}${eye(41, 31)}<path d="M16 22l11 5M48 22l-11 5" stroke="#5a4a6b" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M22 45h20" stroke="#5a4a6b" stroke-width="3.5" stroke-linecap="round"/>`);
    case 'scared':
      return face('#d9ccff', `<circle cx="23" cy="27" r="5" fill="#fff" stroke="#5a4a6b" stroke-width="2.5"/><circle cx="41" cy="27" r="5" fill="#fff" stroke="#5a4a6b" stroke-width="2.5"/>
        <circle cx="23" cy="27" r="2" fill="#5a4a6b"/><circle cx="41" cy="27" r="2" fill="#5a4a6b"/>
        <path d="M20 44q3-4 6 0t6 0 6 0 6 0" fill="none" stroke="#5a4a6b" stroke-width="3" stroke-linecap="round"/>`);
    case 'hug':
      return svg(`<path d="M32 54C14 42 8 32 12 22c3-8 13-9 20-2 7-7 17-6 20 2 4 10-2 20-20 32z" fill="#ff8fc4" ${OUTLINE}/>
        <path d="M8 34q8 10 24 10t24-10" fill="none" stroke="#ffd9b8" stroke-width="7" stroke-linecap="round"/>`);
    case 'give-flower':
      return flowerIcon('#ff8fc4');
    case 'sing':
      return svg(`<path d="M24 46V14l26-6v32" fill="none" stroke="#b99cff" stroke-width="5" stroke-linejoin="round"/>
        <ellipse cx="18" cy="46" rx="8" ry="6" fill="#b99cff"/><ellipse cx="44" cy="40" rx="8" ry="6" fill="#b99cff"/>`);
    default:
      return flowerIcon('#ffd76a');
  }
}
