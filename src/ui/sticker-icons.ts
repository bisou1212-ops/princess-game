import { bowlIcon, bubblesIcon, candyIcon, choiceIcon, dressIcon, flowerIcon, giftIcon, letterIcon, potIcon, strawberryIcon } from './icons';
import { mapIcon } from '../scenes/map/map-screen';

/**
 * 스티커 그림 (stickers.json 의 icon 이름 → SVG). 있는 아이콘은 다시 쓰고, 없는 것만 여기서 그린다.
 */
const W = 'stroke="#fff" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"';
const svg = (inner: string) => `<svg viewBox="0 0 64 64" aria-hidden="true">${inner}</svg>`;

const ICONS: Record<string, () => string> = {
  heart: () => svg(`<path d="M32 54C14 42 8 32 8 23a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 9-6 19-24 31z" fill="#ff7fb8" ${W}/><circle cx="22" cy="22" r="4" fill="#fff" opacity=".7"/>`),
  star: () => svg(`<path d="M32 6l7.6 15.4 17 2.5-12.3 12 2.9 16.9L32 44.8l-15.2 8 2.9-16.9-12.3-12 17-2.5z" fill="#ffd36e" ${W}/>`),
  crown: () => svg(`<path d="M8 48l4-28 12 12 8-18 8 18 12-12 4 28z" fill="#ffd36e" ${W}/><rect x="8" y="46" width="48" height="8" rx="3" fill="#ffb84d" ${W}/><circle cx="32" cy="38" r="4" fill="#ff7fb8"/>`),
  chat: () => svg(`<path d="M10 14h44a4 4 0 0 1 4 4v20a4 4 0 0 1-4 4H28l-12 10v-10h-6a4 4 0 0 1-4-4V18a4 4 0 0 1 4-4z" fill="#9fd8ff" ${W}/><g fill="#fff"><circle cx="22" cy="28" r="3.5"/><circle cx="32" cy="28" r="3.5"/><circle cx="42" cy="28" r="3.5"/></g>`),
  flower: () => flowerIcon('#ff8fc4'),
  strawberry: () => strawberryIcon('#ff6f8a'),
  pot: () => potIcon('#ffb38a'),
  letter: () => letterIcon('#c9a8ff'),
  smile: () => choiceIcon('happy'),
  cake: () => svg(`<ellipse cx="32" cy="52" rx="26" ry="6" fill="#e9e2f5"/><path d="M12 30v18q0 6 20 6t20-6V30z" fill="#ffb8d6" ${W}/><ellipse cx="32" cy="30" rx="20" ry="7" fill="#fff6fa" ${W}/>
    <path d="M32 22V10" stroke="#ffd36e" stroke-width="4" stroke-linecap="round"/><path d="M32 4q4 4 0 7-4-3 0-7z" fill="#ff9a3a"/><circle cx="24" cy="28" r="3" fill="#ff6f8a"/><circle cx="40" cy="29" r="3" fill="#ff6f8a"/>`),
  can: () => svg(`<path d="M18 24h30l-3 28H21z" fill="#9fd8ff" ${W}/><path d="M46 30q12 2 10 16" fill="none" stroke="#9fd8ff" stroke-width="6" stroke-linecap="round"/><path d="M20 32L6 22" stroke="#9fd8ff" stroke-width="6" stroke-linecap="round"/>
    <g fill="#74c0ff"><circle cx="5" cy="30" r="2.5"/><circle cx="9" cy="36" r="2.5"/><circle cx="3" cy="40" r="2.5"/></g>`),
  cards: () => cards('#c9a8ff', '#ff9ccf'),
  'cards-gold': () => cards('#ffd36e', '#ffb84d'),
  eyes: () => eyes('#9fd8ff'),
  'eyes-gold': () => eyes('#ffd36e'),
  bowl: () => bowlIcon(),
  bubbles: () => bubblesIcon(),
  dress: () => dressIcon('#ff9ccf', 'puffy'),
  sofa: () => svg(`<rect x="8" y="26" width="48" height="20" rx="8" fill="#c9a8ff" ${W}/><rect x="14" y="16" width="36" height="16" rx="7" fill="#d9c4ff" ${W}/><rect x="10" y="44" width="6" height="8" rx="2" fill="#b07fd8"/><rect x="48" y="44" width="6" height="8" rx="2" fill="#b07fd8"/>`),
  balloon: () => svg(`<path d="M22 46q-2 6 4 12M42 44q2 6-2 14" fill="none" stroke="#b9a8d0" stroke-width="2"/><ellipse cx="22" cy="26" rx="13" ry="16" fill="#ff8fc4" ${W}/><ellipse cx="42" cy="24" rx="13" ry="16" fill="#9fd8ff" ${W}/><circle cx="17" cy="20" r="3" fill="#fff" opacity=".7"/>`),
  bag: () => giftIcon('#ff9ccf'),
  map: () => mapIcon(),
  candy: () => candyIcon(),
};

function cards(a: string, b: string): string {
  return svg(`<rect x="8" y="12" width="26" height="38" rx="6" fill="${a}" ${W} transform="rotate(-12 21 31)"/><rect x="30" y="12" width="26" height="38" rx="6" fill="${b}" ${W} transform="rotate(10 43 31)"/>
    <path d="M43 40c-5-3.5-7-6-7-8.5a3.4 3.4 0 0 1 7-1.4 3.4 3.4 0 0 1 7 1.4c0 2.5-2 5-7 8.5z" fill="#fff" transform="rotate(10 43 31)"/>`);
}

function eyes(c: string): string {
  return svg(`<circle cx="32" cy="34" r="24" fill="${c}" ${W}/><ellipse cx="23" cy="32" rx="6" ry="8" fill="#fff"/><ellipse cx="41" cy="32" rx="6" ry="8" fill="#fff"/>
    <circle cx="24" cy="34" r="3.5" fill="#5a4a6b"/><circle cx="42" cy="34" r="3.5" fill="#5a4a6b"/><path d="M26 46q6 4 12 0" fill="none" stroke="#5a4a6b" stroke-width="3" stroke-linecap="round"/>`);
}

export function stickerIcon(name: string): string {
  return (ICONS[name] ?? ICONS.star)();
}

/** HUD 앨범 버튼: 하트 스티커가 붙은 작은 책 */
export function albumIcon(): string {
  return svg(`<rect x="10" y="8" width="44" height="50" rx="6" fill="#ffd36e" ${W}/><rect x="10" y="8" width="9" height="50" rx="4" fill="#ffb84d"/>
    <circle cx="38" cy="26" r="9" fill="#ff8fc4" ${W}/><path d="M38 31c-4-2.6-5.5-4.6-5.5-6.4a2.7 2.7 0 0 1 5.5-1.1 2.7 2.7 0 0 1 5.5 1.1c0 1.8-1.5 3.8-5.5 6.4z" fill="#fff"/>
    <path d="M28 44h20M28 50h14" stroke="#fff" stroke-width="3" stroke-linecap="round"/>`);
}
