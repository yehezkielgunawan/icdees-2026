type CacheEntry<V> = { value: V; expiresAt: number };

export class TtlCache<K, V> {
  private readonly now: () => number;
  private readonly entries = new Map<K, CacheEntry<V>>();

  constructor(now: () => number = () => Date.now()) {
    this.now = now;
  }

  set(key: K, value: V, ttlMs: number): void {
    if (!Number.isFinite(ttlMs) || ttlMs <= 0) {
      throw new Error("ttlMs must be a positive number");
    }
    this.entries.set(key, { value, expiresAt: this.now() + ttlMs });
  }

  get(key: K): V | undefined {
    const entry = this.entries.get(key);
    if (!entry) {
      return undefined;
    }
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return undefined;
    }
    return entry.value;
  }

  has(key: K): boolean {
    const entry = this.entries.get(key);
    if (!entry) {
      return false;
    }
    if (this.now() >= entry.expiresAt) {
      this.entries.delete(key);
      return false;
    }
    return true;
  }

  delete(key: K): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}
