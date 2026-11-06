import React, { useState } from 'react';
import { RefreshCw, Search } from 'lucide-react';
import type { SipTrunkConnection, TelnyxPopNode } from '../../../shared/types.ts';
import { InlineBarLoader } from '../DashboardSkeletons.tsx';

interface SipTrunksViewProps {
  trunks: SipTrunkConnection[];
  topCostlyTrunks: SipTrunkConnection[];
  pops: TelnyxPopNode[];
  minHeapTimeUs: number;
  onRefreshDashboard: () => Promise<void>;
}

export const SipTrunksView: React.FC<SipTrunksViewProps> = ({
  trunks,
  topCostlyTrunks,
  pops,
  minHeapTimeUs,
  onRefreshDashboard,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [popFilter, setPopFilter] = useState<string>('ALL');
  const [togglingPop, setTogglingPop] = useState<string | null>(null);

  const handleTogglePopFailover = async (popCode: string) => {
    setTogglingPop(popCode);
    try {
      const res = await fetch('/api/v1/system/pop-failover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ popCode }),
      });
      if (res.ok) {
        await onRefreshDashboard();
      }
    } finally {
      setTogglingPop(null);
    }
  };

  const filteredTrunks = trunks.filter((t) => {
    const matchesPop =
      popFilter === 'ALL' || t.primaryPop === popFilter || t.secondaryPop === popFilter;
    const q = searchQuery.trim().toLowerCase();
    const matchesSearch =
      !q ||
      t.name.toLowerCase().includes(q) ||
      t.fqdn.toLowerCase().includes(q) ||
      t.primaryPop.toLowerCase().includes(q);
    return matchesPop && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Top-K Costliest Trunks Extracted via Binary Min-Heap O(N log K) */}
      <section className="border border-[#DCE1E7] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Top-4 Costliest SIP Trunks (Min-Heap Priority Queue)
            </h2>
            <p className="text-xs text-[#475569]">
              Extracted in O(N log K) without full-table sorting · Last heap pass: {minHeapTimeUs} μs
            </p>
          </div>
          <span className="font-mono-tabular text-xs font-semibold text-[#00875A]">
            K = 4 · N = {trunks.length}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {topCostlyTrunks.map((trunk, index) => (
            <div key={trunk.id} className="border border-[#E2E8F0] bg-[#F8FAFC] p-4">
              <div className="flex items-center justify-between font-mono-tabular text-xs text-[#475569] mb-1">
                <span>RANK #{index + 1}</span>
                <span>{trunk.primaryPop}</span>
              </div>
              <div className="font-semibold text-sm text-[#0F172A] truncate">
                {trunk.name}
              </div>
              <div className="font-mono-tabular text-lg font-bold text-[#0F172A] mt-1">
                ${trunk.mtdSpendUsd.toFixed(2)}
              </div>
              <div className="font-mono-tabular text-xs text-[#475569] mt-1">
                ASR {trunk.asrPct}% · PDD {trunk.pddMs}ms
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Regional PoP Consistent Hash Ring Status & Interactive Failover Controls */}
      <section className="border border-[#DCE1E7] bg-white p-6">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Telnyx Edge PoPs &amp; Consistent Hash Failover
            </h2>
            <p className="text-xs text-[#475569]">
              Toggle any PoP into Failover to watch the backend Consistent Hash Ring rebalance
              virtual nodes immediately.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {pops.map((pop) => {
            const isFailover = pop.status === 'Failover';
            const utilPct = Math.round((pop.activeChannels / pop.maxChannels) * 100);
            return (
              <div key={pop.id} className="border border-[#E2E8F0] p-4 flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono-tabular text-sm font-bold text-[#0F172A]">
                      {pop.code} · {pop.city}
                    </span>
                    <span
                      className={`font-mono-tabular text-xs font-semibold ${
                        isFailover ? 'text-[#B91C1C]' : 'text-[#00875A]'
                      }`}
                    >
                      {pop.status}
                    </span>
                  </div>
                  <div className="font-mono-tabular text-xs text-[#475569] mb-3">
                    {pop.region} · RTT {pop.rttMs}ms · Loss {pop.packetLossPct}%
                  </div>
                  <div className="w-full h-1.5 bg-[#ECEFF2] mb-3 overflow-hidden">
                    <div
                      className="h-full"
                      style={{
                        width: `${utilPct}%`,
                        backgroundColor: isFailover ? '#B91C1C' : '#00875A',
                      }}
                    />
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-[#F1F5F9]">
                  <span className="font-mono-tabular text-xs text-[#475569]">
                    {pop.activeChannels} / {pop.maxChannels} ch
                  </span>
                  <button
                    type="button"
                    disabled={togglingPop === pop.code}
                    onClick={() => handleTogglePopFailover(pop.code)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium border transition-colors cursor-pointer whitespace-nowrap ${
                      isFailover
                        ? 'border-[#00875A] text-[#00875A] hover:bg-[#ECFDF5]'
                        : 'border-[#DCE1E7] text-[#334155] hover:bg-[#F8FAFC]'
                    }`}
                  >
                    {togglingPop === pop.code ? (
                      <InlineBarLoader label="Updating" />
                    ) : (
                      <>
                        <RefreshCw className="w-3 h-3" />
                        <span>{isFailover ? 'Restore PoP' : 'Simulate Failover'}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* SIP Connections High-Density Data Table */}
      <section className="border border-[#DCE1E7] bg-white">
        <div className="px-6 py-4 border-b border-[#DCE1E7] flex flex-wrap items-center justify-between gap-4">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Elastic SIP Trunk Connections
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-[#64748B] absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Filter trunk or FQDN..."
                className="border border-[#CBD5E1] bg-[#F8FAFC] pl-8 pr-3 py-1.5 text-xs text-[#0F172A] focus:border-[#00875A] focus:outline-none"
              />
            </div>

            <select
              value={popFilter}
              onChange={(e) => setPopFilter(e.target.value)}
              className="border border-[#CBD5E1] bg-[#F8FAFC] px-2.5 py-1.5 font-mono-tabular text-xs text-[#0F172A]"
            >
              <option value="ALL">All PoPs</option>
              {pops.map((p) => (
                <option key={p.code} value={p.code}>
                  {p.code} ({p.city})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE1E7] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                <th className="py-3 px-6">Trunk Connection</th>
                <th className="py-3 px-4">Auth</th>
                <th className="py-3 px-4">Primary / Failover</th>
                <th className="py-3 px-4 text-right">Channels</th>
                <th className="py-3 px-4 text-right">ASR</th>
                <th className="py-3 px-4 text-right">PDD</th>
                <th className="py-3 px-4 text-right">MOS</th>
                <th className="py-3 px-4 text-right">MTD Spend</th>
                <th className="py-3 px-6">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEFF2] text-sm">
              {filteredTrunks.map((trunk) => (
                <tr key={trunk.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-3.5 px-6">
                    <div className="font-semibold text-[#0F172A]">{trunk.name}</div>
                    <div className="font-mono-tabular text-xs text-[#475569]">{trunk.fqdn}</div>
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs text-[#334155]">
                    {trunk.authMode}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs text-[#0F172A]">
                    {trunk.primaryPop} → {trunk.secondaryPop}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-[#0F172A]">
                    {trunk.activeChannels} / {trunk.maxChannels}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-[#334155]">
                    {trunk.asrPct.toFixed(1)}%
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-[#334155]">
                    {trunk.pddMs} ms
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-xs font-semibold text-[#0F172A]">
                    {trunk.mosScore.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-[#0F172A]">
                    ${trunk.mtdSpendUsd.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-6 font-mono-tabular text-xs font-semibold">
                    <span
                      className={
                        trunk.status === 'Nominal'
                          ? 'text-[#00875A]'
                          : trunk.status === 'Warning'
                            ? 'text-[#B45309]'
                            : 'text-[#B91C1C]'
                      }
                    >
                      {trunk.status}
                    </span>
                  </td>
                </tr>
              ))}
              {filteredTrunks.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-xs text-[#475569]">
                    No SIP trunks matched your filter criteria.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
