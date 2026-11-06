import React, { useState } from 'react';
import { RefreshCw, ShieldAlert, ShieldCheck } from 'lucide-react';
import type { SystemArchitectureMetrics } from '../../../shared/types.ts';
import { InlineBarLoader } from '../DashboardSkeletons.tsx';

interface SystemArchitectureViewProps {
  metrics: SystemArchitectureMetrics;
  onRefreshDashboard: () => Promise<void>;
}

export const SystemArchitectureView: React.FC<SystemArchitectureViewProps> = ({
  metrics,
  onRefreshDashboard,
}) => {
  const [cbBusy, setCbBusy] = useState<boolean>(false);

  const handleCircuitBreakerAction = async (action: 'trip' | 'reset') => {
    setCbBusy(true);
    try {
      const res = await fetch('/api/v1/system/circuit-breaker', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (res.ok) {
        await onRefreshDashboard();
      }
    } finally {
      setCbBusy(false);
    }
  };

  const dsaRows = [
    {
      structure: 'Radix / Prefix Trie',
      modulePath: 'server/dsa/prefixTrie.ts',
      purpose: 'E.164 DID Prefix Autocomplete & Longest-Prefix-Match (LPM) Carrier Tariff Routing',
      timeComplexity: 'O(L) lookup · O(L + M) prefix scan',
      spaceComplexity: 'O(N × L) shared prefix nodes',
      liveTelemetry: `${metrics.dsaEngines.prefixTrie.indexedNumbers} DIDs · ${metrics.dsaEngines.prefixTrie.nodeCount} nodes · ${metrics.dsaEngines.prefixTrie.lastLookupTimeUs} μs`,
    },
    {
      structure: 'Fenwick Tree (Binary Indexed Tree)',
      modulePath: 'server/dsa/fenwickTree.ts',
      purpose: 'Dynamic 24-Hour Telnyx Spend Updates & Arbitrary [t1, t2] Range Sum Queries',
      timeComplexity: 'O(log N) update & rangeSum',
      spaceComplexity: 'O(N) contiguous Float64Array',
      liveTelemetry: `${metrics.dsaEngines.fenwickTree.bucketCount} buckets · $${metrics.dsaEngines.fenwickTree.totalIndexedSpendUsd.toFixed(2)} indexed · ${metrics.dsaEngines.fenwickTree.lastRangeQueryTimeUs} μs`,
    },
    {
      structure: 'Binary Min-Heap Priority Queue',
      modulePath: 'server/dsa/minHeap.ts',
      purpose: 'Top-K Highest-Spend SIP Trunks Extraction Without Full-Dataset Sorting',
      timeComplexity: 'O(N log K) Top-K extraction',
      spaceComplexity: 'O(K) bounded heap array',
      liveTelemetry: `Pool N=${metrics.dsaEngines.minHeap.heapSize} · K=4 · ${metrics.dsaEngines.minHeap.lastTopKTimeUs} μs`,
    },
    {
      structure: 'Circular Ring Buffer',
      modulePath: 'server/dsa/ringBuffer.ts',
      purpose: 'Fixed-Memory Bounded Ingestion of Real-Time CDRs, MDRs & Billing Events',
      timeComplexity: 'O(1) push & O(K) recent read',
      spaceComplexity: 'O(Capacity) zero-GC preallocation',
      liveTelemetry: `${metrics.dsaEngines.ringBuffer.currentSize}/${metrics.dsaEngines.ringBuffer.capacity} slots · ${metrics.dsaEngines.ringBuffer.totalWrites} writes`,
    },
    {
      structure: 'Sliding Window Spend Tracker',
      modulePath: 'server/dsa/slidingWindow.ts',
      purpose: 'Rolling 300s Spend Velocity & Billing Burn Anomaly Detection',
      timeComplexity: 'O(1) amortized append & prune',
      spaceComplexity: 'O(W) active window events',
      liveTelemetry: `${metrics.dsaEngines.slidingWindow.eventsInWindow} events · $${metrics.dsaEngines.slidingWindow.currentBurnPerMinUsd.toFixed(2)}/min`,
    },
  ];

  const popEntries = Object.entries(metrics.consistentHash.partitionDistribution);
  const totalRingKeys = Math.max(
    1,
    popEntries.reduce((acc, [, count]) => acc + count, 0),
  );

  return (
    <div className="space-y-6">
      {/* 4-Column System Design Patterns Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1">
            API Gateway Rate Limiter
          </div>
          <div className="font-mono-tabular text-xl font-bold text-[#0F172A] mb-1">
            {metrics.rateLimiter.availableTokens} / {metrics.rateLimiter.capacity} tokens
          </div>
          <div className="font-mono-tabular text-xs text-[#475569]">
            {metrics.rateLimiter.algorithm} · +{metrics.rateLimiter.refillPerSec}/s · Allowed{' '}
            {metrics.rateLimiter.totalAllowed}
          </div>
        </div>

        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1">
            Upstream Circuit Breaker
          </div>
          <div
            className={`font-mono-tabular text-xl font-bold mb-1 ${
              metrics.circuitBreaker.state === 'CLOSED'
                ? 'text-[#00875A]'
                : metrics.circuitBreaker.state === 'OPEN'
                  ? 'text-[#B91C1C]'
                  : 'text-[#B45309]'
            }`}
          >
            {metrics.circuitBreaker.state}
          </div>
          <div className="font-mono-tabular text-xs text-[#475569]">
            Failures {metrics.circuitBreaker.failureCount}/{metrics.circuitBreaker.failureThreshold} ·
            Successes {metrics.circuitBreaker.successCount}
          </div>
        </div>

        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1">
            Doubly-Linked LRU Cache
          </div>
          <div className="font-mono-tabular text-xl font-bold text-[#0F172A] mb-1">
            {metrics.lruCache.hitRatePct}% Hit Rate
          </div>
          <div className="font-mono-tabular text-xs text-[#475569]">
            {metrics.lruCache.hits} hits · {metrics.lruCache.misses} misses ·{' '}
            {metrics.lruCache.size}/{metrics.lruCache.capacity} slots
          </div>
        </div>

        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1">
            Consistent Hash Ring
          </div>
          <div className="font-mono-tabular text-xl font-bold text-[#0F172A] mb-1">
            {metrics.consistentHash.totalRingNodes} Virtual Nodes
          </div>
          <div className="font-mono-tabular text-xs text-[#475569]">
            {metrics.consistentHash.activePops} active PoPs ×{' '}
            {metrics.consistentHash.virtualNodesPerPop} vnodes
          </div>
        </div>
      </div>

      {/* Interactive Circuit Breaker & Consistent Hash Ring Partition Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <section className="border border-[#DCE1E7] bg-white p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A] mb-1">
              3-State Circuit Breaker Fault Injection
            </h2>
            <p className="text-xs text-[#475569] mb-5">
              Protects upstream Telnyx REST API calls ({metrics.circuitBreaker.upstreamTarget}) with
              automatic fallback to the deterministic Carrier Telemetry Engine when OPEN.
            </p>

            <div className="border border-[#E2E8F0] bg-[#F8FAFC] p-4 font-mono-tabular text-xs space-y-2 mb-5">
              <div className="flex justify-between">
                <span className="text-[#475569]">Current State:</span>
                <span className="font-bold text-[#0F172A]">{metrics.circuitBreaker.state}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">Failure Counter:</span>
                <span>
                  {metrics.circuitBreaker.failureCount} / {metrics.circuitBreaker.failureThreshold}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-[#475569]">Last State Transition:</span>
                <span>{metrics.circuitBreaker.lastStateChangeAt}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              disabled={cbBusy}
              onClick={() => handleCircuitBreakerAction('trip')}
              className="inline-flex items-center gap-1.5 border border-[#B91C1C] bg-white px-4 py-2 text-xs font-semibold text-[#B91C1C] hover:bg-[#FEF2F2] transition-colors cursor-pointer whitespace-nowrap"
            >
              {cbBusy ? (
                <InlineBarLoader label="Updating" />
              ) : (
                <>
                  <ShieldAlert className="w-3.5 h-3.5" />
                  <span>Trip Circuit (Simulate 3 Failures)</span>
                </>
              )}
            </button>

            <button
              type="button"
              disabled={cbBusy}
              onClick={() => handleCircuitBreakerAction('reset')}
              className="inline-flex items-center gap-1.5 bg-[#00875A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#006E49] transition-colors cursor-pointer whitespace-nowrap"
            >
              <ShieldCheck className="w-3.5 h-3.5" />
              <span>Reset to CLOSED</span>
            </button>

            <button
              type="button"
              onClick={onRefreshDashboard}
              className="inline-flex items-center gap-1.5 border border-[#DCE1E7] bg-white px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Probe Cache</span>
            </button>
          </div>
        </section>

        <section className="border border-[#DCE1E7] bg-white p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A] mb-1">
              Consistent Hash Ring Key Distribution
            </h2>
            <p className="text-xs text-[#475569] mb-5">
              FNV-1a 32-bit hashing + O(log V) binary search routing trunks and DIDs across active
              regional PoPs.
            </p>

            <div className="space-y-3">
              {popEntries.map(([popCode, keyCount]) => {
                const share = Math.round((keyCount / totalRingKeys) * 100);
                return (
                  <div key={popCode}>
                    <div className="flex justify-between font-mono-tabular text-xs mb-1">
                      <span className="font-semibold text-[#0F172A]">{popCode}</span>
                      <span className="text-[#475569]">
                        {keyCount} routed keys ({share}%)
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#ECEFF2] overflow-hidden">
                      <div
                        className="h-full bg-[#1D4ED8]"
                        style={{ width: `${share}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Data Structures & Algorithms (DSA) Complexity & Live Telemetry Table */}
      <section className="border border-[#DCE1E7] bg-white">
        <div className="px-6 py-4 border-b border-[#DCE1E7] flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Backend Data Structures &amp; Algorithms (DSA) Core
          </h2>
          <span className="font-mono-tabular text-xs text-[#475569]">
            Zero external DSA libraries · Custom TypeScript implementations
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE1E7] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                <th className="py-3 px-6">Data Structure</th>
                <th className="py-3 px-4">Backend Role</th>
                <th className="py-3 px-4">Time Complexity</th>
                <th className="py-3 px-4">Space Complexity</th>
                <th className="py-3 px-6">Live Runtime Telemetry</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEFF2] text-sm">
              {dsaRows.map((row) => (
                <tr key={row.structure} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-3.5 px-6">
                    <div className="font-semibold text-[#0F172A]">{row.structure}</div>
                    <div className="font-mono-tabular text-xs text-[#475569]">
                      {row.modulePath}
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-xs text-[#334155] max-w-xs">
                    {row.purpose}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs font-semibold text-[#00875A]">
                    {row.timeComplexity}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs text-[#475569]">
                    {row.spaceComplexity}
                  </td>
                  <td className="py-3.5 px-6 font-mono-tabular text-xs text-[#0F172A]">
                    {row.liveTelemetry}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
