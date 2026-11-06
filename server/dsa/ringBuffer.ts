/**
 * Fixed-Capacity Circular RingBuffer for O(1) bounded memory ingestion of
 * Call Detail Records (CDRs), Messaging Detail Records (MDRs), and SIP events.
 *
 * Time Complexity:
 *  - push(item): O(1)
 *  - toArrayRecentFirst(limit): O(min(N, limit))
 * Space Complexity:
 *  - O(Capacity) fixed array allocation with zero garbage collection spikes
 */

export class RingBuffer<T> {
  private readonly capacity: number;
  private readonly buffer: Array<T | undefined>;
  private head: number;
  private count: number;
  private totalWrites: number;
  private overwriteCount: number;

  constructor(capacity: number) {
    this.capacity = Math.max(1, capacity);
    this.buffer = new Array<T | undefined>(this.capacity);
    this.head = 0;
    this.count = 0;
    this.totalWrites = 0;
    this.overwriteCount = 0;
  }

  public push(item: T): void {
    if (this.count === this.capacity) {
      this.overwriteCount += 1;
    } else {
      this.count += 1;
    }
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;
    this.totalWrites += 1;
  }

  public toArrayRecentFirst(limit = this.count): T[] {
    const take = Math.min(limit, this.count);
    const out: T[] = new Array<T>(take);
    for (let i = 0; i < take; i += 1) {
      const idx = (this.head - 1 - i + this.capacity * 2) % this.capacity;
      out[i] = this.buffer[idx] as T;
    }
    return out;
  }

  public getStats() {
    return {
      capacity: this.capacity,
      currentSize: this.count,
      totalWrites: this.totalWrites,
      overwriteCount: this.overwriteCount,
    };
  }
}
