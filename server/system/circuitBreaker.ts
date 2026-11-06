import type { CircuitState } from '../../shared/types.ts';

/**
 * 3-State Circuit Breaker (CLOSED -> OPEN -> HALF_OPEN)
 * Protects upstream Telnyx REST API calls against cascading timeouts and 5xx bursts.
 */

export class CircuitBreaker {
  private state: CircuitState;
  private failureCount: number;
  private successCount: number;
  private readonly failureThreshold: number;
  private readonly recoveryTimeoutMs: number;
  private readonly halfOpenSuccessThreshold: number;
  private openedAtMs: number;
  private lastStateChangeAt: string;
  private readonly upstreamTarget: string;

  constructor(
    upstreamTarget = 'https://api.telnyx.com/v2',
    failureThreshold = 3,
    recoveryTimeoutMs = 15000,
    halfOpenSuccessThreshold = 2,
  ) {
    this.upstreamTarget = upstreamTarget;
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.successCount = 0;
    this.failureThreshold = failureThreshold;
    this.recoveryTimeoutMs = recoveryTimeoutMs;
    this.halfOpenSuccessThreshold = halfOpenSuccessThreshold;
    this.openedAtMs = 0;
    this.lastStateChangeAt = new Date().toISOString();
  }

  private transitionTo(nextState: CircuitState): void {
    if (this.state !== nextState) {
      this.state = nextState;
      this.lastStateChangeAt = new Date().toISOString();
      if (nextState === 'OPEN') {
        this.openedAtMs = Date.now();
        this.successCount = 0;
      } else if (nextState === 'CLOSED') {
        this.failureCount = 0;
        this.successCount = 0;
      } else if (nextState === 'HALF_OPEN') {
        this.successCount = 0;
      }
    }
  }

  public async execute<T>(operation: () => Promise<T>, fallback: () => T): Promise<{
    data: T;
    fromFallback: boolean;
  }> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.openedAtMs >= this.recoveryTimeoutMs) {
        this.transitionTo('HALF_OPEN');
      } else {
        return { data: fallback(), fromFallback: true };
      }
    }

    try {
      const result = await operation();
      this.recordSuccess();
      return { data: result, fromFallback: false };
    } catch {
      this.recordFailure();
      return { data: fallback(), fromFallback: true };
    }
  }

  public recordSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      this.successCount += 1;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.transitionTo('CLOSED');
      }
    } else if (this.state === 'CLOSED') {
      this.failureCount = Math.max(0, this.failureCount - 1);
      this.successCount += 1;
    }
  }

  public recordFailure(): void {
    this.failureCount += 1;
    if (this.state === 'HALF_OPEN' || this.failureCount >= this.failureThreshold) {
      this.transitionTo('OPEN');
    }
  }

  public reset(): void {
    this.transitionTo('CLOSED');
  }

  public getStats() {
    if (this.state === 'OPEN' && Date.now() - this.openedAtMs >= this.recoveryTimeoutMs) {
      this.transitionTo('HALF_OPEN');
    }
    return {
      state: this.state,
      failureCount: this.failureCount,
      failureThreshold: this.failureThreshold,
      successCount: this.successCount,
      lastStateChangeAt: this.lastStateChangeAt,
      upstreamTarget: this.upstreamTarget,
    };
  }
}
