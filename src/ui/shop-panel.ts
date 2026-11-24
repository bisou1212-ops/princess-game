import type { Speaker } from '../core/tts';
import { countWithUnit, countingWord, getItem } from '../systems/items';
import type { Wallet } from '../systems/rewards';
import { withJosa } from '../systems/random-quests';
import { SHOP_ITEMS, SHOP_NAME, priceOf, shopState } from '../systems/shop';
import { candyIcon, checkIcon } from './icons';
import './shop.css';
import { sfx } from '../core/sound';

/**
 * 별사탕 가게 화면 (GDD 5.3·6).
 * - 진열대: 물건 카드 + 값(별사탕 그림 n개). 모자란 물건도 흐리게만 (빨간 표시 없음)
 * - 고르면 계산대: 빈 별 칸 n개 → 큰 별사탕 버튼을 한 번 톡할 때마다 하나씩 채우며 "하나! 둘!" (세어서 내기)
 * - 다 채우면 "샀어요!" → 진열대로. 모자라면 "n개 더 모으면 살 수 있어요"
 */
export interface ShopDeps {
  speaker: Speaker;
  voice: { lang: string; pitch: number; rate: number };
  wallet: Wallet;
  /** 물건 그림 (data URL 또는 SVG 글) */
  thumb(itemId: string): string;
  /** 사기 (별사탕 내기 + 물건 받기). 성공하면 true */
  onBuy(itemId: string): boolean;
  onClose(): void;
}

export class ShopPanel {
  readonly el: HTMLDivElement;
  private item: string | null = null;
  private paid = 0;

  constructor(parent: HTMLElement, private readonly d: ShopDeps) {
    this.el = document.createElement('div');
    this.el.className = 'shop';
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.el.addEventListener('click', (e) => {
      const b = (e.target as HTMLElement).closest<HTMLElement>('[data-act]');
      if (!b) return;
      const { act, value } = b.dataset;
      if (act === 'close') this.d.onClose();
      else if (act === 'pick' && value) this.pick(value);
      else if (act === 'back') this.showShelf();
      else if (act === 'pay') this.payOne(b);
    });
  }

  get isOpen(): boolean {
    return !this.el.hidden;
  }

  open(): void {
    this.el.hidden = false;
    this.showShelf();
    this.say(`${SHOP_NAME.ko}에 온 걸 환영해요! 무엇을 살까요?`);
  }

  close(): void {
    this.d.speaker.stop();
    this.el.hidden = true;
    this.item = null;
  }

  private img(itemId: string): string {
    const t = this.d.thumb(itemId);
    return t.startsWith('<') ? t : `<img src="${t}" alt="" draggable="false">`;
  }

  private head(title: string, act: 'close' | 'back'): string {
    return `<div class="shop-head">
      <div class="shop-title">${title}</div>
      <div class="shop-candy" aria-label="별사탕">${candyIcon()}<span>${this.d.wallet.candy}</span></div>
      <button class="shop-btn shop-${act}" data-act="${act}" aria-label="${act === 'close' ? '가게 나가기' : '진열대로'}">${act === 'close' ? checkIcon() : backIcon()}</button>
    </div>`;
  }

  /** 진열대 */
  private showShelf(): void {
    this.item = null;
    const cards = SHOP_ITEMS.map(({ item, price }) => {
      const it = getItem(item);
      const st = shopState(this.d.wallet, item);
      const cls = st.can ? '' : st.reason === 'owned' ? 'is-owned' : 'is-short';
      const stars = Array.from({ length: price }, () => `<i>${candyIcon()}</i>`).join('');
      return `<button class="shop-card ${cls}" data-act="pick" data-value="${item}" aria-label="${it.name}, 별사탕 ${price}개">
        <div class="sc-img">${this.img(item)}</div>
        <div class="sc-name">${it.name}</div>
        <div class="sc-price" data-n="${price}">${stars}</div>
        ${st.can === false && st.reason === 'owned' ? '<span class="sc-owned">있어요</span>' : ''}
      </button>`;
    }).join('');
    this.el.innerHTML = `${this.head(SHOP_NAME.ko, 'close')}<div class="shop-shelf">${cards}</div>`;
  }

  /** 물건 고르기 → 계산대 */
  private pick(itemId: string): void {
    const it = getItem(itemId);
    const price = priceOf(itemId)!;
    const st = shopState(this.d.wallet, itemId);
    this.item = itemId;
    this.paid = 0;
    // 모자랄 때는 가진 만큼 연하게 채워서 "몇 개 더"가 눈으로 보이게
    const have = st.can === false && st.reason === 'candy' ? this.d.wallet.candy : 0;
    const slots = Array.from(
      { length: price },
      (_, i) => `<span class="pay-slot ${i < have ? 'is-have' : ''}" data-i="${i}">${candyIcon()}</span>`,
    ).join('');
    let action: string;
    let speech: string;
    if (st.can) {
      action = `<button class="pay-btn" data-act="pay" aria-label="별사탕 하나 내기">${candyIcon()}<span>톡!</span></button>
        <div class="pay-hint">별사탕을 하나씩 톡 해서 내요</div>`;
      speech = `${it.name}! 별사탕 ${countWithUnit(price, '개')}예요. 하나씩 세어서 내 볼까요?`;
    } else if (st.reason === 'owned') {
      action = `<div class="pay-hint">벌써 가지고 있어요!</div>`;
      speech = `${withJosa(it.name, '은')} 벌써 가지고 있어요!`;
    } else {
      action = `<div class="pay-hint">별사탕이 ${countWithUnit(st.missing, '개')} 더 있으면 살 수 있어요.<br>친구 부탁을 들어주고 모아 봐요!</div>`;
      speech = `별사탕이 ${countWithUnit(st.missing, '개')} 더 있으면 살 수 있어요. 친구 부탁을 들어주고 별사탕을 모아 봐요!`;
    }
    this.el.innerHTML = `${this.head(it.name, 'back')}
      <div class="shop-counter">
        <div class="counter-img">${this.img(itemId)}</div>
        <div class="counter-name">${it.name} <small>${it.en}</small></div>
        <div class="pay-slots">${slots}</div>
        ${action}
      </div>`;
    // 이름 → 영어 → 값
    this.d.speaker.speak(`${it.name}!`, {
      ...this.d.voice,
      mood: 'excited',
      onEnd: () =>
        this.d.speaker.speak(`${it.en}!`, {
          lang: 'en-US',
          pitch: this.d.voice.pitch,
          rate: this.d.voice.rate,
          mood: 'excited',
          onEnd: () => this.item === itemId && this.say(speech),
        }),
    });
  }

  /** 별사탕 하나 내기: 빈 칸을 하나 채우고 센다. 다 채우면 사기 */
  private payOne(btn: HTMLElement): void {
    const itemId = this.item;
    if (!itemId) return;
    const price = priceOf(itemId)!;
    if (this.paid >= price) return;
    this.paid++;
    this.el.querySelector(`.pay-slot[data-i="${this.paid - 1}"]`)?.classList.add('is-paid');
    btn.classList.remove('is-pop');
    void btn.offsetWidth;
    btn.classList.add('is-pop');
    const left = this.el.querySelector('.shop-candy span');
    if (left) left.textContent = String(this.d.wallet.candy - this.paid);
    if (this.paid < price) {
      sfx('coin');
      this.say(`${countingWord(this.paid)}!`);
      return;
    }
    // 다 냈다!
    btn.setAttribute('disabled', '');
    if (!this.d.onBuy(itemId)) return this.showShelf();
    const it = getItem(itemId);
    const counter = this.el.querySelector('.shop-counter');
    counter?.classList.add('is-bought');
    sfx('reward');
    counter?.insertAdjacentHTML('beforeend', `<div class="bought">샀어요!</div>`);
    const where = it.kind === 'furniture' ? '성 방 서랍에 넣어 둘게요.' : '드레스룸에서 입어 봐요.';
    // 말이 끝나면 진열대로 (소리가 안 나는 기기에서도 4초 뒤엔 돌아감)
    let back = false;
    const toShelf = () => {
      if (back) return;
      back = true;
      if (this.item === itemId && this.isOpen) this.showShelf();
    };
    this.say(`${countingWord(this.paid)}! 와아, ${withJosa(it.name, '을')} 샀어요! ${where}`, toShelf);
    window.setTimeout(toShelf, 4000);
  }

  private say(text: string, onEnd?: () => void): void {
    this.d.speaker.speak(text, { ...this.d.voice, mood: 'excited', onEnd });
  }
}

function backIcon(): string {
  return `<svg viewBox="0 0 64 64" aria-hidden="true"><path d="M38 14 20 32l18 18" fill="none" stroke="#fff" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
