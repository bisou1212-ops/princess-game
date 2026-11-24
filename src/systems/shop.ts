import shopJson from '../data/shop.json';
import { hasItem } from './items';
import { isStackable, type Wallet } from './rewards';

/**
 * 별사탕 가게 (GDD 5.3·6). 값은 1~10개 — 별사탕을 하나씩 세어서 낸다.
 * 모자라도 실패·경고 없이 "몇 개 더 모으면 살 수 있어요"만 알려 준다.
 */
export interface ShopItem {
  item: string;
  price: number;
}

const data = shopJson as { name: string; en: string; items: ShopItem[] };
export const SHOP_NAME = { ko: data.name, en: data.en };
export const SHOP_ITEMS: readonly ShopItem[] = data.items.filter((x) => hasItem(x.item));

export function priceOf(itemId: string): number | null {
  return SHOP_ITEMS.find((x) => x.item === itemId)?.price ?? null;
}

export type ShopState = { can: true } | { can: false; reason: 'candy'; missing: number } | { can: false; reason: 'owned' };

/** 지금 이 물건을 살 수 있는지 */
export function shopState(wallet: Wallet, itemId: string): ShopState {
  const price = priceOf(itemId);
  if (price === null) return { can: false, reason: 'candy', missing: Infinity };
  if (!isStackable(itemId) && wallet.has(itemId)) return { can: false, reason: 'owned' };
  if (wallet.candy < price) return { can: false, reason: 'candy', missing: price - wallet.candy };
  return { can: true };
}

/** 사기: 별사탕을 내고 물건을 받는다. 못 사면 false (아무것도 안 바뀜) */
export function buy(wallet: Wallet, itemId: string): boolean {
  if (!shopState(wallet, itemId).can) return false;
  wallet.spend(priceOf(itemId)!);
  wallet.add(itemId);
  return true;
}
