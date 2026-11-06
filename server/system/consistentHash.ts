/**
 * Consistent Hash Ring with Virtual Nodes (FNV-1a 32-bit hash + O(log V) Binary Search).
 * Deterministically partitions Telnyx SIP trunks and DIDs across regional PoPs and
 * gracefully rebalances when a PoP enters Failover state.
 */

interface RingPoint {
  hash: number;
  popCode: string;
}

export class ConsistentHashRing {
  private readonly virtualNodesPerPop: number;
  private ring: RingPoint[];
  private activePops: Set<string>;
  private partitionDistribution: Record<string, number>;

  constructor(virtualNodesPerPop = 120) {
    this.virtualNodesPerPop = virtualNodesPerPop;
    this.ring = [];
    this.activePops = new Set<string>();
    this.partitionDistribution = {};
  }

  private fnv1a32(input: string): number {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
  }

  public rebuild(popCodes: string[], sampleKeys: string[] = []): void {
    this.activePops = new Set<string>(popCodes);
    this.ring = [];

    for (const popCode of popCodes) {
      for (let v = 0; v < this.virtualNodesPerPop; v += 1) {
        const hash = this.fnv1a32(`${popCode}#vnode-${v}`);
        this.ring.push({ hash, popCode });
      }
    }

    this.ring.sort((a, b) => a.hash - b.hash);

    const counts: Record<string, number> = {};
    for (const pop of popCodes) {
      counts[pop] = 0;
    }
    for (const key of sampleKeys) {
      const target = this.getTargetPop(key);
      if (target) {
        counts[target] = (counts[target] ?? 0) + 1;
      }
    }
    this.partitionDistribution = counts;
  }

  public getTargetPop(routingKey: string): string | null {
    if (this.ring.length === 0) return null;
    const keyHash = this.fnv1a32(routingKey);

    let low = 0;
    let high = this.ring.length - 1;
    let answerIndex = 0;

    while (low <= high) {
      const mid = (low + high) >>> 1;
      if (this.ring[mid].hash >= keyHash) {
        answerIndex = mid;
        high = mid - 1;
      } else {
        low = mid + 1;
      }
    }

    return this.ring[answerIndex].popCode;
  }

  public getStats() {
    return {
      virtualNodesPerPop: this.virtualNodesPerPop,
      totalRingNodes: this.ring.length,
      activePops: this.activePops.size,
      partitionDistribution: this.partitionDistribution,
    };
  }
}
