/**
 * Binary MinHeap Priority Queue for O(N log K) Top-K extraction
 * (e.g., Top-K highest-spend SIP trunks, highest-latency routes, earliest alerts)
 * without sorting the full dataset.
 *
 * Time Complexity:
 *  - push(item): O(log K)
 *  - pop(): O(log K)
 *  - peek(): O(1)
 *  - topK(items, k, compareFn): O(N log K)
 */

export class MinHeap<T> {
  private readonly heap: T[];
  private readonly compare: (a: T, b: T) => number;
  private lastTopKTimeUs: number;

  constructor(compare: (a: T, b: T) => number) {
    this.heap = [];
    this.compare = compare;
    this.lastTopKTimeUs = 0;
  }

  public size(): number {
    return this.heap.length;
  }

  public peek(): T | undefined {
    return this.heap[0];
  }

  public push(item: T): void {
    this.heap.push(item);
    this.bubbleUp(this.heap.length - 1);
  }

  public pop(): T | undefined {
    if (this.heap.length === 0) return undefined;
    const top = this.heap[0];
    const last = this.heap.pop()!;
    if (this.heap.length > 0) {
      this.heap[0] = last;
      this.sinkDown(0);
    }
    return top;
  }

  private bubbleUp(index: number): void {
    let idx = index;
    while (idx > 0) {
      const parentIdx = (idx - 1) >> 1;
      if (this.compare(this.heap[idx], this.heap[parentIdx]) < 0) {
        const tmp = this.heap[idx];
        this.heap[idx] = this.heap[parentIdx];
        this.heap[parentIdx] = tmp;
        idx = parentIdx;
      } else {
        break;
      }
    }
  }

  private sinkDown(index: number): void {
    let idx = index;
    const len = this.heap.length;
    while (true) {
      const leftIdx = (idx << 1) + 1;
      const rightIdx = leftIdx + 1;
      let smallest = idx;

      if (leftIdx < len && this.compare(this.heap[leftIdx], this.heap[smallest]) < 0) {
        smallest = leftIdx;
      }
      if (rightIdx < len && this.compare(this.heap[rightIdx], this.heap[smallest]) < 0) {
        smallest = rightIdx;
      }
      if (smallest === idx) break;

      const tmp = this.heap[idx];
      this.heap[idx] = this.heap[smallest];
      this.heap[smallest] = tmp;
      idx = smallest;
    }
  }

  public static extractTopK<T>(items: T[], k: number, compareAsc: (a: T, b: T) => number): {
    results: T[];
    elapsedUs: number;
  } {
    const startNs = process.hrtime.bigint();
    const minHeap = new MinHeap<T>(compareAsc);

    for (let i = 0; i < items.length; i += 1) {
      const item = items[i];
      if (minHeap.size() < k) {
        minHeap.push(item);
      } else {
        const minTop = minHeap.peek();
        if (minTop !== undefined && compareAsc(item, minTop) > 0) {
          minHeap.pop();
          minHeap.push(item);
        }
      }
    }

    const descending: T[] = [];
    while (minHeap.size() > 0) {
      descending.push(minHeap.pop()!);
    }
    descending.reverse();

    const elapsedUs = Number((Number(process.hrtime.bigint() - startNs) / 1000).toFixed(2));
    return { results: descending, elapsedUs };
  }

  public recordTiming(elapsedUs: number): void {
    this.lastTopKTimeUs = elapsedUs;
  }

  public getStats(activePoolSize: number) {
    return {
      heapSize: activePoolSize,
      comparator: 'MinHeap<SipTrunk>(mtdSpendUsd ASC -> Top-K DESC)',
      lastTopKTimeUs: this.lastTopKTimeUs,
    };
  }
}
