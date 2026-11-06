/**
 * SlidingWindowSpendTracker using a bounded timestamped queue for O(1) amortized
 * rolling spend velocity calculation and billing anomaly detection.
 *
 * Time Complexity:
 *  - record(epochMs, amountUsd): O(1) amortized
 *  - evaluate(nowEpochMs): O(1) amortized eviction of expired events
 */

interface WindowEntry {
  epochMs: number;
  amountUsd: number;
}

export class SlidingWindowSpendTracker {
  private readonly windowMs: number;
  private readonly queue: WindowEntry[];
  private headIndex: number;
  private runningSumUsd: number;
  private anomalyThresholdPerMinUsd: number;

  constructor(windowSeconds = 300, anomalyThresholdPerMinUsd = 18.0) {
    this.windowMs = windowSeconds * 1000;
    this.queue = [];
    this.headIndex = 0;
    this.runningSumUsd = 0;
    this.anomalyThresholdPerMinUsd = anomalyThresholdPerMinUsd;
  }

  private prune(nowEpochMs: number): void {
    const cutoff = nowEpochMs - this.windowMs;
    while (this.headIndex < this.queue.length && this.queue[this.headIndex].epochMs < cutoff) {
      this.runningSumUsd -= this.queue[this.headIndex].amountUsd;
      this.headIndex += 1;
    }
    if (this.runningSumUsd < 0) {
      this.runningSumUsd = 0;
    }
    // Periodic compaction to keep backing array small
    if (this.headIndex > 256 && this.headIndex * 2 >= this.queue.length) {
      this.queue.splice(0, this.headIndex);
      this.headIndex = 0;
    }
  }

  public record(epochMs: number, amountUsd: number): void {
    this.prune(epochMs);
    this.queue.push({ epochMs, amountUsd });
    this.runningSumUsd += amountUsd;
  }

  public getStats(nowEpochMs = Date.now()) {
    this.prune(nowEpochMs);
    const activeCount = this.queue.length - this.headIndex;
    const windowMinutes = this.windowMs / 60000;
    const burnPerMin = windowMinutes > 0 ? this.runningSumUsd / windowMinutes : 0;

    return {
      windowSeconds: Math.round(this.windowMs / 1000),
      eventsInWindow: activeCount,
      currentBurnPerMinUsd: Number(burnPerMin.toFixed(4)),
      anomalyDetected: burnPerMin > this.anomalyThresholdPerMinUsd,
    };
  }
}
