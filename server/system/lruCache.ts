/**
 * Custom Doubly-Linked-List + HashMap LRU Cache with per-entry TTL expiration.
 * Achieves strict O(1) get, O(1) put, and O(1) eviction without relying on Map insertion-order quirks.
 */

interface LruNode<V> {
  key: string;
  value: V;
  expiresAtMs: number;
  prev: LruNode<V> | null;
  next: LruNode<V> | null;
}

export class LruCache<V> {
  private readonly capacity: number;
  private readonly defaultTtlMs: number;
  private readonly map: Map<string, LruNode<V>>;
  private head: LruNode<V> | null;
  private tail: LruNode<V> | null;
  private hits: number;
  private misses: number;
  private evictions: number;

  constructor(capacity = 64, defaultTtlMs = 10000) {
    this.capacity = Math.max(2, capacity);
    this.defaultTtlMs = defaultTtlMs;
    this.map = new Map<string, LruNode<V>>();
    this.head = null;
    this.tail = null;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;
  }

  private unlink(node: LruNode<V>): void {
    if (node.prev) {
      node.prev.next = node.next;
    } else {
      this.head = node.next;
    }
    if (node.next) {
      node.next.prev = node.prev;
    } else {
      this.tail = node.prev;
    }
    node.prev = null;
    node.next = null;
  }

  private pushFront(node: LruNode<V>): void {
    node.prev = null;
    node.next = this.head;
    if (this.head) {
      this.head.prev = node;
    }
    this.head = node;
    if (!this.tail) {
      this.tail = node;
    }
  }

  public get(key: string): V | null {
    const node = this.map.get(key);
    if (!node) {
      this.misses += 1;
      return null;
    }

    if (Date.now() > node.expiresAtMs) {
      this.unlink(node);
      this.map.delete(key);
      this.misses += 1;
      return null;
    }

    this.unlink(node);
    this.pushFront(node);
    this.hits += 1;
    return node.value;
  }

  public put(key: string, value: V, ttlMs = this.defaultTtlMs): void {
    const existing = this.map.get(key);
    const expiresAtMs = Date.now() + ttlMs;

    if (existing) {
      existing.value = value;
      existing.expiresAtMs = expiresAtMs;
      this.unlink(existing);
      this.pushFront(existing);
      return;
    }

    if (this.map.size >= this.capacity && this.tail) {
      const lru = this.tail;
      this.unlink(lru);
      this.map.delete(lru.key);
      this.evictions += 1;
    }

    const fresh: LruNode<V> = {
      key,
      value,
      expiresAtMs,
      prev: null,
      next: null,
    };
    this.pushFront(fresh);
    this.map.set(key, fresh);
  }

  public invalidateAll(): void {
    this.map.clear();
    this.head = null;
    this.tail = null;
  }

  public getStats() {
    const total = this.hits + this.misses;
    const hitRatePct = total > 0 ? Number(((this.hits / total) * 100).toFixed(1)) : 100;
    return {
      capacity: this.capacity,
      size: this.map.size,
      hits: this.hits,
      misses: this.misses,
      evictions: this.evictions,
      hitRatePct,
    };
  }
}
