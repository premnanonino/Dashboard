/**
 * Token Bucket Rate Limiter (O(1) time & space per client bucket)
 * Smoothly refills tokens based on monotonic elapsed time and enforces burst capacity.
 */

interface BucketState {
  tokens: number;
  lastRefillMs: number;
}

export class TokenBucketRateLimiter {
  private readonly capacity: number;
  private readonly refillPerSec: number;
  private readonly buckets: Map<string, BucketState>;
  private totalAllowed: number;
  private totalRejected: number;
  private lastAvailableTokens: number;

  constructor(capacity = 120, refillPerSec = 25) {
    this.capacity = capacity;
    this.refillPerSec = refillPerSec;
    this.buckets = new Map<string, BucketState>();
    this.totalAllowed = 0;
    this.totalRejected = 0;
    this.lastAvailableTokens = capacity;
  }

  public consume(clientKey: string, cost = 1): {
    allowed: boolean;
    remaining: number;
    limit: number;
    resetAfterSec: number;
  } {
    const now = Date.now();
    let bucket = this.buckets.get(clientKey);
    if (!bucket) {
      bucket = { tokens: this.capacity, lastRefillMs: now };
      this.buckets.set(clientKey, bucket);
    }

    const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
    if (elapsedSec > 0) {
      bucket.tokens = Math.min(this.capacity, bucket.tokens + elapsedSec * this.refillPerSec);
      bucket.lastRefillMs = now;
    }

    if (bucket.tokens >= cost) {
      bucket.tokens -= cost;
      this.totalAllowed += 1;
      this.lastAvailableTokens = Math.floor(bucket.tokens);
      const missing = this.capacity - bucket.tokens;
      return {
        allowed: true,
        remaining: Math.floor(bucket.tokens),
        limit: this.capacity,
        resetAfterSec: Math.ceil(missing / this.refillPerSec),
      };
    }

    this.totalRejected += 1;
    this.lastAvailableTokens = Math.floor(bucket.tokens);
    const deficit = cost - bucket.tokens;
    return {
      allowed: false,
      remaining: 0,
      limit: this.capacity,
      resetAfterSec: Math.ceil(deficit / this.refillPerSec),
    };
  }

  public getStats() {
    return {
      algorithm: 'Token Bucket',
      capacity: this.capacity,
      availableTokens: this.lastAvailableTokens,
      refillPerSec: this.refillPerSec,
      totalAllowed: this.totalAllowed,
      totalRejected: this.totalRejected,
    };
  }
}
