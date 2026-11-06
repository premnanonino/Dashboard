import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ArrowDownToLine,
  Check,
  ChevronRight,
  DollarSign,
  SlidersHorizontal,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react';
import type {
  BillingAccountOverview,
  BillingAlertRule,
  BillingGroupSummary,
  BillingProductBreakdown,
  HourlyBillingBucket,
  TelnyxInvoice,
} from '../../../shared/types.ts';
import { InlineBarLoader } from '../DashboardSkeletons.tsx';

interface BillingFinOpsViewProps {
  account: BillingAccountOverview;
  products: BillingProductBreakdown[];
  billingGroups: BillingGroupSummary[];
  invoices: TelnyxInvoice[];
  hourlyBuckets: HourlyBillingBucket[];
  alerts: BillingAlertRule[];
  onRefreshDashboard: () => Promise<void>;
}

interface FenwickRangeResult {
  startHour: number;
  endHour: number;
  bucketCount: number;
  totalSpendUsd: number;
  totalCalls: number;
  totalMessages: number;
  fenwickQueryTimeUs: number;
}

export const BillingFinOpsView: React.FC<BillingFinOpsViewProps> = ({
  account,
  products,
  billingGroups,
  invoices,
  hourlyBuckets,
  alerts,
  onRefreshDashboard,
}) => {
  const [startHour, setStartHour] = useState<number>(0);
  const [endHour, setEndHour] = useState<number>(23);
  const [rangeResult, setRangeResult] = useState<FenwickRangeResult | null>(null);
  const [hoveredBucket, setHoveredBucket] = useState<HourlyBillingBucket | null>(null);

  const [configOpen, setConfigOpen] = useState<boolean>(false);
  const [budgetCapInput, setBudgetCapInput] = useState<string>(
    String(account.monthlyBudgetCapUsd),
  );
  const [autoRechargeEnabled, setAutoRechargeEnabled] = useState<boolean>(
    account.autoRecharge.enabled,
  );
  const [thresholdInput, setThresholdInput] = useState<string>(
    String(account.autoRecharge.thresholdUsd),
  );
  const [rechargeAmountInput, setRechargeAmountInput] = useState<string>(
    String(account.autoRecharge.rechargeAmountUsd),
  );

  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<string | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<TelnyxInvoice | null>(null);

  useEffect(() => {
    setBudgetCapInput(String(account.monthlyBudgetCapUsd));
    setAutoRechargeEnabled(account.autoRecharge.enabled);
    setThresholdInput(String(account.autoRecharge.thresholdUsd));
    setRechargeAmountInput(String(account.autoRecharge.rechargeAmountUsd));
  }, [account]);

  useEffect(() => {
    let cancelled = false;
    const fetchRange = async () => {
      try {
        const s = Math.min(startHour, endHour);
        const e = Math.max(startHour, endHour);
        const res = await fetch(`/api/v1/billing/range?startHour=${s}&endHour=${e}`);
        if (!res.ok) return;
        const data = (await res.json()) as FenwickRangeResult;
        if (!cancelled) {
          setRangeResult(data);
        }
      } catch {
        // Ignore transient network errors
      }
    };
    fetchRange();
    return () => {
      cancelled = true;
    };
  }, [startHour, endHour, account.mtdSpendUsd]);

  const handleTopUp = async (amountUsd: number) => {
    setBusyAction(`topup-${amountUsd}`);
    setActionFeedback(null);
    try {
      const res = await fetch('/api/v1/billing/topup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amountUsd }),
      });
      if (res.ok) {
        await onRefreshDashboard();
        setActionFeedback(
          `Credited $${amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })} to ${account.accountId}`,
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSimulateSpike = async () => {
    setBusyAction('spike');
    setActionFeedback(null);
    try {
      const res = await fetch('/api/v1/billing/simulate-spike', {
        method: 'POST',
      });
      if (res.ok) {
        const data = (await res.json()) as { injectedEvents: number; addedSpendUsd: number };
        await onRefreshDashboard();
        setActionFeedback(
          `Ingested ${data.injectedEvents} burst CDRs (+$${data.addedSpendUsd.toFixed(2)} spend indexed in Fenwick Tree)`,
        );
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusyAction('config');
    setActionFeedback(null);
    try {
      const res = await fetch('/api/v1/billing/config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          monthlyBudgetCapUsd: Number(budgetCapInput) || account.monthlyBudgetCapUsd,
          autoRecharge: {
            enabled: autoRechargeEnabled,
            thresholdUsd: Number(thresholdInput) || account.autoRecharge.thresholdUsd,
            rechargeAmountUsd: Number(rechargeAmountInput) || account.autoRecharge.rechargeAmountUsd,
          },
        }),
      });
      if (res.ok) {
        await onRefreshDashboard();
        setConfigOpen(false);
        setActionFeedback('Updated Telnyx monthly budget cap and auto-recharge rules.');
      }
    } finally {
      setBusyAction(null);
    }
  };

  const handleExportCsv = () => {
    const lines = [
      ['Section', 'ID / SKU', 'Label / Period', 'Volume / Status', 'Amount USD'].join(','),
      ...products.map((p) =>
        ['Product Spend', p.skuCode, `"${p.productName}"`, `"${p.volumeFormatted}"`, p.mtdCostUsd.toFixed(2)].join(','),
      ),
      ...invoices.map((inv) =>
        ['Invoice', inv.id, `"${inv.billingPeriod}"`, inv.status, inv.totalUsd.toFixed(2)].join(','),
      ),
    ];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `telnyx-billing-ledger-${account.cycleStart}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    setActionFeedback(`Exported telnyx-billing-ledger-${account.cycleStart}.csv`);
  };

  const budgetUtilizationPct = Math.min(
    100,
    Math.round((account.mtdSpendUsd / Math.max(1, account.monthlyBudgetCapUsd)) * 1000) / 10,
  );
  const maxHourlyTotal = Math.max(
    1,
    ...hourlyBuckets.map((b) => b.totalSpendUsd),
  );
  const normStart = Math.min(startHour, endHour);
  const normEnd = Math.max(startHour, endHour);

  return (
    <div className="space-y-6">
      {/* FinOps Action Bar */}
      <div className="border border-[#DCE1E7] bg-white px-5 py-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 text-xs text-[#475569]">
          <span className="font-mono-tabular font-semibold text-[#0F172A]">
            {account.accountId}
          </span>
          <span aria-hidden="true">·</span>
          <span>Cycle {account.cycleStart} to {account.cycleEnd}</span>
          <span aria-hidden="true">·</span>
          <span>{account.daysRemaining} days remaining</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleTopUp(500)}
            className="inline-flex items-center gap-1.5 border border-[#DCE1E7] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F6F7F8] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {busyAction === 'topup-500' ? (
              <InlineBarLoader label="Crediting" />
            ) : (
              <>
                <DollarSign className="w-3.5 h-3.5 text-[#00875A]" />
                <span>Top Up +$500</span>
              </>
            )}
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={() => handleTopUp(2000)}
            className="inline-flex items-center gap-1.5 bg-[#00875A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#006E49] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {busyAction === 'topup-2000' ? (
              <InlineBarLoader label="Crediting" />
            ) : (
              <span>Top Up +$2,000</span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setConfigOpen((prev) => !prev)}
            className={`inline-flex items-center gap-1.5 border px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              configOpen
                ? 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]'
                : 'border-[#DCE1E7] bg-white text-[#0F172A] hover:bg-[#F6F7F8]'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>Auto-Recharge &amp; Cap</span>
          </button>

          <button
            type="button"
            disabled={busyAction !== null}
            onClick={handleSimulateSpike}
            className="inline-flex items-center gap-1.5 border border-[#DCE1E7] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F6F7F8] disabled:opacity-50 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {busyAction === 'spike' ? (
              <InlineBarLoader label="Simulating" />
            ) : (
              <>
                <Zap className="w-3.5 h-3.5 text-[#B45309]" />
                <span>Simulate Spend Burst</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex items-center gap-1.5 border border-[#DCE1E7] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] hover:bg-[#F6F7F8] transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowDownToLine className="w-3.5 h-3.5 text-[#475569]" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner (Flat solid styling) */}
      <AnimatePresence>
        {actionFeedback && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.16 }}
            className="border border-[#00875A] bg-[#ECFDF5] px-4 py-2.5 flex items-center justify-between text-xs text-[#065F46]"
          >
            <span className="font-mono-tabular font-medium">{actionFeedback}</span>
            <button
              type="button"
              onClick={() => setActionFeedback(null)}
              className="text-[#065F46] hover:text-[#0F172A] cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Collapsible Auto-Recharge & Monthly Cap Configuration Form */}
      <AnimatePresence>
        {configOpen && (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.18 }}
            onSubmit={handleSaveConfig}
            className="border border-[#1D4ED8] bg-white p-5"
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-display text-sm font-semibold text-[#0F172A]">
                  Telnyx Auto-Recharge &amp; Monthly Budget Guardrail
                </h3>
                <p className="text-xs text-[#475569]">
                  Payment method on file: {account.autoRecharge.paymentMethodBrand} ••••{' '}
                  {account.autoRecharge.paymentMethodLast4}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConfigOpen(false)}
                className="text-xs text-[#475569] hover:text-[#0F172A] cursor-pointer"
              >
                Cancel
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Monthly Budget Cap (USD)
                </label>
                <input
                  type="number"
                  min={500}
                  step={100}
                  value={budgetCapInput}
                  onChange={(e) => setBudgetCapInput(e.target.value)}
                  className="w-full border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono-tabular text-sm text-[#0F172A] focus:border-[#00875A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Auto-Recharge Trigger (&lt; USD)
                </label>
                <input
                  type="number"
                  min={50}
                  step={50}
                  value={thresholdInput}
                  onChange={(e) => setThresholdInput(e.target.value)}
                  className="w-full border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono-tabular text-sm text-[#0F172A] focus:border-[#00875A] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#334155] mb-1">
                  Recharge Amount (USD)
                </label>
                <input
                  type="number"
                  min={100}
                  step={100}
                  value={rechargeAmountInput}
                  onChange={(e) => setRechargeAmountInput(e.target.value)}
                  className="w-full border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2 font-mono-tabular text-sm text-[#0F172A] focus:border-[#00875A] focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 text-xs font-medium text-[#0F172A] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRechargeEnabled}
                    onChange={(e) => setAutoRechargeEnabled(e.target.checked)}
                    className="w-4 h-4 accent-[#00875A]"
                  />
                  <span>Auto-Recharge Active</span>
                </label>

                <button
                  type="submit"
                  disabled={busyAction === 'config'}
                  className="inline-flex items-center gap-1.5 bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E293B] transition-colors cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Save Rules</span>
                </button>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 4-Column Financial KPI Strip (Single-level depth, flat solid colors, tabular-nums) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1.5">
            Current Prepaid Balance
          </div>
          <div className="font-mono-tabular text-2xl font-bold text-[#0F172A] mb-2">
            ${account.currentBalanceUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-[#475569] font-mono-tabular">
            Credit Limit ${account.creditLimitUsd.toLocaleString('en-US', { minimumFractionDigits: 0 })} · Avail $
            {account.availableCreditUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
        </div>

        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1.5">
            Month-to-Date Spend
          </div>
          <div className="font-mono-tabular text-2xl font-bold text-[#0F172A] mb-2">
            ${account.mtdSpendUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="w-full h-1.5 bg-[#ECEFF2] mb-1.5 overflow-hidden">
            <div
              className="h-full bg-[#00875A]"
              style={{ width: `${budgetUtilizationPct}%` }}
            />
          </div>
          <div className="text-xs text-[#475569] font-mono-tabular">
            {budgetUtilizationPct}% of ${account.monthlyBudgetCapUsd.toLocaleString('en-US')} monthly cap
          </div>
        </div>

        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1.5">
            Pending Unbilled Usage
          </div>
          <div className="font-mono-tabular text-2xl font-bold text-[#0F172A] mb-2">
            ${account.pendingUnbilledUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-[#475569] font-mono-tabular">
            Daily Burn ${account.dailyBurnRateUsd.toFixed(2)} / day
          </div>
        </div>

        <div className="border border-[#DCE1E7] bg-white p-5">
          <div className="text-xs font-medium text-[#475569] mb-1.5">
            Projected Cycle Total
          </div>
          <div className="font-mono-tabular text-2xl font-bold text-[#0F172A] mb-2">
            ${account.projectedMonthEndUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </div>
          <div className="text-xs text-[#475569] font-mono-tabular">
            Auto-TopUp {account.autoRecharge.enabled ? `ON (< $${account.autoRecharge.thresholdUsd})` : 'OFF'}
          </div>
        </div>
      </div>

      {/* 24-Hour Spend Chart & Fenwick Tree O(log N) Time-Window Query Workbench */}
      <section className="border border-[#DCE1E7] bg-white p-6">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A]">
              Hourly Carrier Spend &amp; Fenwick Tree Range Query
            </h2>
            <p className="text-xs text-[#475569] mt-0.5">
              Select any hour window below to compute exact spend in O(log N) via the backend
              Binary Indexed Tree.
            </p>
          </div>

          {/* Flat Solid Chart Legend */}
          <div className="flex flex-wrap items-center gap-4 text-xs text-[#334155]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#00875A] inline-block" />
              <span>SIP Trunking</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#1D4ED8] inline-block" />
              <span>Voice API</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#0F766E] inline-block" />
              <span>Messaging</span>
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 bg-[#64748B] inline-block" />
              <span>DID MRC</span>
            </span>
          </div>
        </div>

        {/* Fenwick Range Controls & Live Output */}
        <div className="border border-[#E2E8F0] bg-[#F8FAFC] p-4 mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <label className="font-medium text-[#334155]">
              Window Start:
              <select
                value={startHour}
                onChange={(e) => setStartHour(Number(e.target.value))}
                className="ml-2 border border-[#CBD5E1] bg-white px-2.5 py-1 font-mono-tabular text-[#0F172A]"
              >
                {hourlyBuckets.map((b) => (
                  <option key={b.bucketIndex} value={b.bucketIndex}>
                    {b.hourLabel}
                  </option>
                ))}
              </select>
            </label>

            <label className="font-medium text-[#334155]">
              Window End:
              <select
                value={endHour}
                onChange={(e) => setEndHour(Number(e.target.value))}
                className="ml-2 border border-[#CBD5E1] bg-white px-2.5 py-1 font-mono-tabular text-[#0F172A]"
              >
                {hourlyBuckets.map((b) => (
                  <option key={b.bucketIndex} value={b.bucketIndex}>
                    {b.hourLabel}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {rangeResult && (
            <div className="flex flex-wrap items-center gap-5 font-mono-tabular text-xs">
              <div>
                <span className="text-[#475569]">Range Spend: </span>
                <span className="font-bold text-[#0F172A]">
                  ${rangeResult.totalSpendUsd.toFixed(2)}
                </span>
              </div>
              <div>
                <span className="text-[#475569]">Calls: </span>
                <span className="font-semibold text-[#0F172A]">
                  {rangeResult.totalCalls.toLocaleString()}
                </span>
              </div>
              <div>
                <span className="text-[#475569]">SMS: </span>
                <span className="font-semibold text-[#0F172A]">
                  {rangeResult.totalMessages.toLocaleString()}
                </span>
              </div>
              <div className="text-[#00875A] font-semibold">
                Fenwick Query: {rangeResult.fenwickQueryTimeUs} μs
              </div>
            </div>
          )}
        </div>

        {/* Crisp Flat Stacked SVG Bar Chart — ZERO Gradients */}
        <div className="relative w-full overflow-x-auto">
          <svg
            viewBox="0 0 960 210"
            className="w-full h-52 min-w-[640px]"
            role="img"
            aria-label="24-hour Telnyx spend breakdown by product"
          >
            {/* Horizontal grid lines */}
            {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
              const y = 175 - ratio * 150;
              return (
                <g key={ratio}>
                  <line
                    x1={42}
                    y1={y}
                    x2={948}
                    y2={y}
                    stroke="#E2E8F0"
                    strokeWidth="1"
                  />
                  <text
                    x={36}
                    y={y + 4}
                    textAnchor="end"
                    fill="#64748B"
                    fontSize="10"
                    fontFamily="JetBrains Mono, monospace"
                  >
                    ${(maxHourlyTotal * ratio).toFixed(0)}
                  </text>
                </g>
              );
            })}

            {hourlyBuckets.map((b, idx) => {
              const inRange = idx >= normStart && idx <= normEnd;
              const colW = 37.5;
              const barW = 24;
              const x = 48 + idx * colW;
              const scale = 150 / maxHourlyTotal;

              const hSip = b.sipTrunkSpendUsd * scale;
              const hVoice = b.voiceSpendUsd * scale;
              const hMsg = b.messagingSpendUsd * scale;
              const hDid = b.didProratedUsd * scale;

              const ySip = 175 - hSip;
              const yVoice = ySip - hVoice;
              const yMsg = yVoice - hMsg;
              const yDid = yMsg - hDid;

              return (
                <g
                  key={b.bucketIndex}
                  onMouseEnter={() => setHoveredBucket(b)}
                  onMouseLeave={() => setHoveredBucket(null)}
                  onClick={() => {
                    setStartHour(b.bucketIndex);
                    setEndHour(b.bucketIndex);
                  }}
                  className="cursor-pointer"
                  opacity={inRange ? 1 : 0.28}
                >
                  <rect
                    x={x - 3}
                    y={20}
                    width={barW + 6}
                    height={160}
                    fill={hoveredBucket?.bucketIndex === b.bucketIndex ? '#F1F5F9' : 'transparent'}
                  />
                  <motion.rect
                    initial={{ scaleY: 0 }}
                    animate={{ scaleY: 1 }}
                    transition={{ duration: 0.25, delay: idx * 0.012 }}
                    style={{ originY: '175px' }}
                    x={x}
                    y={ySip}
                    width={barW}
                    height={Math.max(0.5, hSip)}
                    fill="#00875A"
                  />
                  <rect
                    x={x}
                    y={yVoice}
                    width={barW}
                    height={Math.max(0.5, hVoice)}
                    fill="#1D4ED8"
                  />
                  <rect
                    x={x}
                    y={yMsg}
                    width={barW}
                    height={Math.max(0.5, hMsg)}
                    fill="#0F766E"
                  />
                  <rect
                    x={x}
                    y={yDid}
                    width={barW}
                    height={Math.max(0.5, hDid)}
                    fill="#64748B"
                  />
                  {idx % 2 === 0 && (
                    <text
                      x={x + barW / 2}
                      y={195}
                      textAnchor="middle"
                      fill="#475569"
                      fontSize="10"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {b.hourLabel.slice(0, 2)}h
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        {/* Hovered Hour Detail Strip */}
        <div className="mt-2 pt-3 border-t border-[#F1F5F9] flex flex-wrap items-center justify-between text-xs font-mono-tabular text-[#475569]">
          {hoveredBucket ? (
            <>
              <span className="font-semibold text-[#0F172A]">
                Hour {hoveredBucket.hourLabel} UTC · Total ${hoveredBucket.totalSpendUsd.toFixed(2)}
              </span>
              <span>
                SIP ${hoveredBucket.sipTrunkSpendUsd.toFixed(2)} · Voice $
                {hoveredBucket.voiceSpendUsd.toFixed(2)} · SMS $
                {hoveredBucket.messagingSpendUsd.toFixed(2)} · DID $
                {hoveredBucket.didProratedUsd.toFixed(2)}
              </span>
            </>
          ) : (
            <span>Hover or click any hourly bar to inspect SKU breakdown or isolate a single hour.</span>
          )}
        </div>
      </section>

      {/* Spend Breakdown by Telnyx Product Line */}
      <section className="border border-[#DCE1E7] bg-white">
        <div className="px-6 py-4 border-b border-[#DCE1E7] flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Spend Breakdown by Telnyx Product
          </h2>
          <span className="font-mono-tabular text-xs text-[#475569]">
            {products.length} metered product lines
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE1E7] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                <th className="py-3 px-6">Product Line</th>
                <th className="py-3 px-4">SKU Code</th>
                <th className="py-3 px-4 text-right">Metered Volume</th>
                <th className="py-3 px-4 text-right">Effective Rate</th>
                <th className="py-3 px-4 text-right">MTD Spend</th>
                <th className="py-3 px-4 text-right">MoM Delta</th>
                <th className="py-3 px-6 w-44">Spend Share</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEFF2] text-sm">
              {products.map((prod) => (
                <tr key={prod.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-3.5 px-6 font-medium text-[#0F172A]">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 shrink-0 inline-block"
                        style={{ backgroundColor: prod.colorHex }}
                      />
                      <span>{prod.productName}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs text-[#475569]">
                    {prod.skuCode}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-[#334155]">
                    {prod.volumeFormatted}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-xs text-[#475569]">
                    {prod.unitRateFormatted}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular font-semibold text-[#0F172A]">
                    ${prod.mtdCostUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                  <td
                    className={`py-3.5 px-4 text-right font-mono-tabular text-xs font-medium ${
                      prod.deltaPct > 0
                        ? 'text-[#B45309]'
                        : prod.deltaPct < 0
                          ? 'text-[#00875A]'
                          : 'text-[#475569]'
                    }`}
                  >
                    {prod.deltaPct > 0 ? `+${prod.deltaPct}%` : `${prod.deltaPct}%`}
                  </td>
                  <td className="py-3.5 px-6">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-2 bg-[#ECEFF2] overflow-hidden">
                        <div
                          className="h-full"
                          style={{
                            width: `${prod.sharePct}%`,
                            backgroundColor: prod.colorHex,
                          }}
                        />
                      </div>
                      <span className="font-mono-tabular text-xs text-[#475569] w-11 text-right">
                        {prod.sharePct.toFixed(1)}%
                      </span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* 2-Column Split: Billing Groups Allocation & FinOps SLA Guardrails */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        <section className="border border-[#DCE1E7] bg-white p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A] mb-1">
              Telnyx Billing Groups &amp; Cost Centers
            </h2>
            <p className="text-xs text-[#475569] mb-5">
              Departmental spend caps across assigned SIP connections and DID pools.
            </p>

            <div className="space-y-4">
              {billingGroups.map((bg) => {
                const pct = Math.min(
                  100,
                  Math.round((bg.mtdSpendUsd / Math.max(1, bg.monthlyCapUsd)) * 1000) / 10,
                );
                const barColor =
                  bg.status === 'Critical'
                    ? '#B91C1C'
                    : bg.status === 'Warning'
                      ? '#B45309'
                      : '#00875A';

                return (
                  <div key={bg.id} className="pb-4 border-b border-[#F1F5F9] last:border-b-0 last:pb-0">
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="font-semibold text-[#0F172A]">{bg.name}</span>
                      <span className="font-mono-tabular font-semibold text-[#0F172A]">
                        ${bg.mtdSpendUsd.toFixed(2)} / ${bg.monthlyCapUsd.toFixed(0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs text-[#475569] mb-2">
                      <span>
                        {bg.costCenter} · {bg.assignedTrunks} trunks · {bg.assignedDids} DIDs
                      </span>
                      <span className="font-mono-tabular font-medium" style={{ color: barColor }}>
                        {pct}% · {bg.status}
                      </span>
                    </div>
                    <div className="w-full h-2 bg-[#ECEFF2] overflow-hidden">
                      <div
                        className="h-full"
                        style={{ width: `${pct}%`, backgroundColor: barColor }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        <section className="border border-[#DCE1E7] bg-white p-6 flex flex-col justify-between">
          <div>
            <h2 className="font-display text-base font-semibold text-[#0F172A] mb-1">
              FinOps &amp; Carrier Guardrail Rules
            </h2>
            <p className="text-xs text-[#475569] mb-5">
              Automated threshold evaluators running on every CDR and billing tick.
            </p>

            <div className="divide-y divide-[#ECEFF2]">
              {alerts.map((al) => {
                const textColor =
                  al.severity === 'Critical'
                    ? 'text-[#B91C1C]'
                    : al.severity === 'Warning'
                      ? 'text-[#B45309]'
                      : 'text-[#00875A]';

                return (
                  <div key={al.id} className="py-3.5 first:pt-0 last:pb-0 flex items-center justify-between gap-4">
                    <div>
                      <div className="text-sm font-medium text-[#0F172A]">{al.name}</div>
                      <div className="font-mono-tabular text-xs text-[#475569] mt-0.5">
                        Rule: {al.thresholdFormatted} · Current: {al.currentFormatted}
                      </div>
                    </div>
                    <span className={`font-mono-tabular text-xs font-semibold shrink-0 ${textColor}`}>
                      {al.severity.toUpperCase()}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 pt-4 border-t border-[#ECEFF2] flex items-center justify-between text-xs text-[#475569]">
            <span className="inline-flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5 text-[#00875A]" />
              <span>Sliding-window anomaly detector active (300s horizon)</span>
            </span>
            <span className="font-mono-tabular text-[#0F172A]">O(1) amortized</span>
          </div>
        </section>
      </div>

      {/* Telnyx Invoices & Statement History Table */}
      <section className="border border-[#DCE1E7] bg-white">
        <div className="px-6 py-4 border-b border-[#DCE1E7] flex items-center justify-between">
          <h2 className="font-display text-base font-semibold text-[#0F172A]">
            Telnyx Invoices &amp; Monthly Statements
          </h2>
          <span className="font-mono-tabular text-xs text-[#475569]">
            Click any statement to inspect line-item charges
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#DCE1E7] bg-[#F8FAFC] text-xs font-semibold text-[#475569]">
                <th className="py-3 px-6">Invoice ID</th>
                <th className="py-3 px-4">Billing Period</th>
                <th className="py-3 px-4">Issued</th>
                <th className="py-3 px-4 text-right">Subtotal</th>
                <th className="py-3 px-4 text-right">E911 &amp; Regulatory</th>
                <th className="py-3 px-4 text-right">Total USD</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-6 text-right">Statement</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ECEFF2] text-sm">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-3.5 px-6 font-mono-tabular font-semibold text-[#0F172A]">
                    {inv.id}
                  </td>
                  <td className="py-3.5 px-4 text-[#334155]">{inv.billingPeriod}</td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs text-[#475569]">
                    {inv.issuedDate}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-[#334155]">
                    ${inv.subtotalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular text-[#475569]">
                    ${inv.regulatoryFeesUsd.toFixed(2)}
                  </td>
                  <td className="py-3.5 px-4 text-right font-mono-tabular font-bold text-[#0F172A]">
                    ${inv.totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="py-3.5 px-4 font-mono-tabular text-xs font-semibold">
                    <span
                      className={
                        inv.status === 'Paid'
                          ? 'text-[#00875A]'
                          : inv.status === 'Open'
                            ? 'text-[#1D4ED8]'
                            : 'text-[#B45309]'
                      }
                    >
                      {inv.status}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-right">
                    <button
                      type="button"
                      onClick={() => setSelectedInvoice(inv)}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-[#1D4ED8] hover:text-[#0F172A] cursor-pointer whitespace-nowrap"
                    >
                      <span>View Breakdown</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Slide-Over Invoice Line-Item Drawer */}
      <AnimatePresence>
        {selectedInvoice && (
          <div className="fixed inset-0 z-50 flex justify-end bg-[#0F172A]/40">
            <motion.div
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-xl bg-white border-l border-[#DCE1E7] h-full overflow-y-auto p-6 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between pb-4 border-b border-[#DCE1E7]">
                  <div>
                    <div className="font-mono-tabular text-xs text-[#00875A] font-semibold">
                      TELNYX BILLING STATEMENT
                    </div>
                    <h3 className="font-display text-xl font-bold text-[#0F172A] mt-0.5">
                      {selectedInvoice.id}
                    </h3>
                    <p className="text-xs text-[#475569] mt-0.5">
                      {selectedInvoice.billingPeriod} · Due {selectedInvoice.dueDate}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedInvoice(null)}
                    className="p-1.5 text-[#475569] hover:text-[#0F172A] cursor-pointer"
                    aria-label="Close invoice drawer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-6 space-y-3">
                  {selectedInvoice.lineItems.map((item) => (
                    <div
                      key={item.description}
                      className="py-3 border-b border-[#F1F5F9] flex items-start justify-between gap-4 text-sm"
                    >
                      <div>
                        <div className="font-medium text-[#0F172A]">{item.description}</div>
                        <div className="font-mono-tabular text-xs text-[#475569] mt-0.5">
                          {item.quantity} × ${item.unitPriceUsd.toFixed(4)}
                        </div>
                      </div>
                      <div className="font-mono-tabular font-semibold text-[#0F172A] shrink-0">
                        ${item.amountUsd.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-8 pt-4 border-t border-[#DCE1E7] space-y-2 font-mono-tabular text-sm">
                <div className="flex justify-between text-[#475569]">
                  <span>Subtotal</span>
                  <span>${selectedInvoice.subtotalUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-[#475569]">
                  <span>E911 &amp; Regulatory Surcharges</span>
                  <span>${selectedInvoice.regulatoryFeesUsd.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-base font-bold text-[#0F172A] pt-2 border-t border-[#ECEFF2]">
                  <span>Total ({selectedInvoice.status})</span>
                  <span>${selectedInvoice.totalUsd.toFixed(2)} USD</span>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
