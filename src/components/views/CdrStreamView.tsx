import React, { useState } from 'react';
import { motion } from 'motion/react';
import { Pause, Play } from 'lucide-react';
import type { DetailRecordEvent, RecordType } from '../../../shared/types.ts';

interface CdrStreamViewProps {
  events: DetailRecordEvent[];
  ringBufferStats: {
    capacity: number;
    currentSize: number;
    totalWrites: number;
    overwriteCount: number;
  };
  streamPaused: boolean;
  onToggleStreamPaused: () => void;
}

const TYPE_FILTERS: Array<{ label: string; value: 'ALL' | RecordType }> = [
  { label: 'All Events', value: 'ALL' },
  { label: 'Voice CDR', value: 'CDR' },
  { label: 'Messaging MDR', value: 'MDR' },
  { label: 'SIP Alerts', value: 'SIP_EVENT' },
  { label: 'Billing Ledger', value: 'BILLING_ALERT' },
];

export const CdrStreamView: React.FC<CdrStreamViewProps> = ({
  events,
  ringBufferStats,
  streamPaused,
  onToggleStreamPaused,
}) => {
  const [typeFilter, setTypeFilter] = useState<'ALL' | RecordType>('ALL');

  const filtered = events.filter((ev) => typeFilter === 'ALL' || ev.type === typeFilter);

  return (
    <div className="space-y-6">
      {/* RingBuffer & Stream Control Bar */}
      <div className="border border-[#DCE1E7] bg-white px-5 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-1.5">
          {TYPE_FILTERS.map((tf) => (
            <button
              key={tf.value}
              type="button"
              onClick={() => setTypeFilter(tf.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                typeFilter === tf.value
                  ? 'bg-[#0F172A] text-white'
                  : 'bg-[#F1F5F9] text-[#475569] hover:text-[#0F172A]'
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="font-mono-tabular text-xs text-[#475569]">
            RingBuffer: {ringBufferStats.currentSize}/{ringBufferStats.capacity} slots ·{' '}
            {ringBufferStats.totalWrites} writes
          </div>

          <button
            type="button"
            onClick={onToggleStreamPaused}
            className="inline-flex items-center gap-1.5 border border-[#DCE1E7] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {streamPaused ? (
              <>
                <Play className="w-3.5 h-3.5 text-[#00875A]" />
                <span>Resume SSE</span>
              </>
            ) : (
              <>
                <Pause className="w-3.5 h-3.5 text-[#B45309]" />
                <span>Pause SSE</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* High-Density CDR / MDR / Billing Event Table */}
      <section className="border border-[#DCE1E7] bg-white">
        <div className="px-6 py-4 border-b border-[#DCE1E7] flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Call Detail Records (CDRs) &amp; Billing Event Stream
          </h2>
          <span className="font-mono-tabular text-xs text-[#475569]">
            Showing {filtered.length} bounded ring-buffer entries
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE1E7] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                <th className="py-3 px-6">Record ID</th>
                <th className="py-3 px-4">UTC Time</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">From → To</th>
                <th className="py-3 px-4">Trunk / PoP</th>
                <th className="py-3 px-4 text-right">Units</th>
                <th className="py-3 px-4 text-right">Charge USD</th>
                <th className="py-3 px-6">SIP / Settlement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEFF2] text-sm">
              {filtered.map((ev) => {
                const isError = ev.sipStatus.startsWith('503');
                const isBilling = ev.type === 'BILLING_ALERT';
                return (
                  <motion.tr
                    key={ev.id}
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16 }}
                    className="hover:bg-[#F8FAFC] transition-colors"
                  >
                    <td className="py-3 px-6 font-mono-tabular text-xs font-semibold text-[#0F172A]">
                      {ev.id}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-[#475569]">
                      {ev.timestamp.slice(11, 19)}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs font-medium text-[#334155]">
                      {ev.type} · {ev.direction}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-[#0F172A]">
                      {ev.fromNumber} → {ev.toNumber}
                    </td>
                    <td className="py-3 px-4 font-mono-tabular text-xs text-[#475569]">
                      {ev.trunkName} ({ev.popCode})
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular text-xs text-[#334155]">
                      {ev.durationOrUnits}
                    </td>
                    <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-[#0F172A]">
                      ${ev.chargeUsd.toFixed(4)}
                    </td>
                    <td className="py-3 px-6 font-mono-tabular text-xs font-semibold">
                      <span
                        className={
                          isError
                            ? 'text-[#B91C1C]'
                            : isBilling
                              ? 'text-[#1D4ED8]'
                              : 'text-[#00875A]'
                        }
                      >
                        {ev.sipStatus}
                      </span>
                    </td>
                  </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};
