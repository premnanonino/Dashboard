/**
 * FenwickTree (Binary Indexed Tree) for O(log N) dynamic prefix sums and
 * arbitrary time-bucket range queries [leftBucket, rightBucket] over Telnyx billing spend.
 *
 * Time Complexity:
 *  - update(index, delta): O(log N)
 *  - prefixSum(index): O(log N)
 *  - rangeSum(left, right): O(log N)
 * Space Complexity:
 *  - O(N) contiguous Float64Array
 */

export class FenwickTree {
  private readonly size: number;
  private readonly tree: Float64Array;
  private lastRangeQueryTimeUs: number;
  private lastQueryRange: [number, number];

  constructor(size: number) {
    this.size = size;
    this.tree = new Float64Array(size + 1);
    this.lastRangeQueryTimeUs = 0;
    this.lastQueryRange = [0, Math.max(0, size - 1)];
  }

  public update(zeroBasedIndex: number, delta: number): void {
    if (zeroBasedIndex < 0 || zeroBasedIndex >= this.size) return;
    let idx = zeroBasedIndex + 1;
    while (idx <= this.size) {
      this.tree[idx] += delta;
      idx += idx & -idx;
    }
  }

  public prefixSum(zeroBasedIndex: number): number {
    if (zeroBasedIndex < 0) return 0;
    const clamped = Math.min(zeroBasedIndex, this.size - 1);
    let idx = clamped + 1;
    let sum = 0;
    while (idx > 0) {
      sum += this.tree[idx];
      idx -= idx & -idx;
    }
    return sum;
  }

  public rangeSum(leftZeroBased: number, rightZeroBased: number): number {
    const startNs = process.hrtime.bigint();
    const left = Math.max(0, leftZeroBased);
    const right = Math.min(this.size - 1, rightZeroBased);

    let result = 0;
    if (left <= right) {
      result = this.prefixSum(right) - (left > 0 ? this.prefixSum(left - 1) : 0);
    }

    const elapsedUs = Number(process.hrtime.bigint() - startNs) / 1000;
    this.lastRangeQueryTimeUs = Number(elapsedUs.toFixed(2));
    this.lastQueryRange = [left, right];

    return Number(result.toFixed(4));
  }

  public getStats() {
    const total = this.size > 0 ? this.prefixSum(this.size - 1) : 0;
    return {
      bucketCount: this.size,
      totalIndexedSpendUsd: Number(total.toFixed(2)),
      lastRangeQueryTimeUs: this.lastRangeQueryTimeUs,
      lastQueryRange: this.lastQueryRange,
    };
  }
}
