/**
 * 기기 안 저장소 (CLAUDE.md: 진행 상황은 IndexedDB).
 * IndexedDB를 못 쓰는 환경(사생활 보호 모드 등)에서는 메모리에만 두고 게임은 그대로 진행한다.
 */
export interface KeyValueStore {
  get<T>(key: string): Promise<T | undefined>;
  set<T>(key: string, value: T): Promise<void>;
  delete(key: string): Promise<void>;
}

const DB_NAME = 'princess-game';
const STORE = 'kv';

export class MemoryStore implements KeyValueStore {
  private readonly map = new Map<string, unknown>();
  async get<T>(key: string) {
    return structuredClone(this.map.get(key)) as T | undefined;
  }
  async set<T>(key: string, value: T) {
    this.map.set(key, structuredClone(value));
  }
  async delete(key: string) {
    this.map.delete(key);
  }
}

class IdbStore implements KeyValueStore {
  constructor(private readonly db: IDBDatabase) {}

  private run<T>(mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest): Promise<T> {
    return new Promise((resolve, reject) => {
      const tx = this.db.transaction(STORE, mode);
      const req = fn(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(req.result as T);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }

  get<T>(key: string) {
    return this.run<T | undefined>('readonly', (s) => s.get(key));
  }
  async set<T>(key: string, value: T) {
    await this.run('readwrite', (s) => s.put(value, key));
  }
  async delete(key: string) {
    await this.run('readwrite', (s) => s.delete(key));
  }
}

export async function openStore(): Promise<KeyValueStore> {
  if (typeof indexedDB === 'undefined') return new MemoryStore();
  try {
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('IndexedDB blocked'));
    });
    return new IdbStore(db);
  } catch (err) {
    console.warn('IndexedDB를 쓸 수 없어 이번에는 저장하지 않습니다.', err);
    return new MemoryStore();
  }
}
