/** 화면용 작은 그림(SVG). 글을 못 읽어도 알아볼 수 있게 (GDD 7) */

export function flowerIcon(color: string): string {
  const petals = [0, 72, 144, 216, 288]
    .map((a) => `<ellipse cx="32" cy="17" rx="10" ry="14" fill="${color}" transform="rotate(${a} 32 32)"/>`)
    .join('');
  return `<svg viewBox="0 0 64 64" aria-hidden="true">${petals}<circle cx="32" cy="32" r="9" fill="#fff3b0"/></svg>`;
}

export function candyIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M32 4l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 42.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z" fill="#ffd76a" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="25" cy="26" r="3" fill="#fff" opacity=".8"/>
  </svg>`;
}

export function dressIcon(color: string): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true">
    <path d="M24 6h16l-3 12 5 6-3 4 14 28H11l14-28-3-4 5-6z" fill="${color}" stroke="#fff" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="32" cy="38" r="4" fill="#fff" opacity=".85"/><circle cx="22" cy="48" r="3" fill="#fff" opacity=".7"/><circle cx="42" cy="48" r="3" fill="#fff" opacity=".7"/>
  </svg>`;
}

export function itemIcon(kind: string, color: string): string {
  return kind === 'dress' ? dressIcon(color) : flowerIcon(color);
}
