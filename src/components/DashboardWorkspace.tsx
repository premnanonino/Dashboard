import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Activity,
  ArrowLeft,
  Cpu,
  CreditCard,
  Hash,
  Menu,
  RefreshCw,
  Server,
  X,
} from 'lucide-react';
import type { DashboardSnapshot, DetailRecordEvent } from '../../shared/types.ts';
import { DashboardSkeletonGrid, InlineBarLoader } from './DashboardSkeletons.tsx';
import { BillingFinOpsView } from './views/BillingFinOpsView.tsx';
import { CdrStreamView } from './views/CdrStreamView.tsx';
import { DidInventoryView } from './views/DidInventoryView.tsx';
import { SipTrunksView } from './views/SipTrunksView.tsx';
import { SystemArchitectureView } from './views/SystemArchitectureView.tsx';

export type DashboardTab = 'billing' | 'trunks' | 'dids' | 'stream' | 'architecture';

interface DashboardWorkspaceProps {
  initialTab: DashboardTab;
  initialSnapshot: DashboardSnapshot | null;
  onBackTo3D: () => void;
}

const NAV_ITEMS: Array<{
  id: DashboardTab;
  label: string;
  breadcrumb: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    id: 'billing',
    label: 'Billing & FinOps',
    breadcrumb: 'Telnyx Monitor / Billing & FinOps',
    icon: CreditCard,
  },
  {
    id: 'trunks',
    label: 'SIP Trunks & PoPs',
    breadcrumb: 'Telnyx Monitor / Elastic SIP Trunking',
    icon: Server,
  },
  {
    id: 'dids',
    label: 'DID Prefix Lookup',
    breadcrumb: 'Telnyx Monitor / Phone Numbers & LPM',
    icon: Hash,
  },
  {
    id: 'stream',
    label: 'CDR & Event Stream',
    breadcrumb: 'Telnyx Monitor / Live Detail Records',
    icon: Activity,
  },
  {
    id: 'architecture',
    label: 'System & DSA Core',
    breadcrumb: 'Telnyx Monitor / Backend Architecture',
    icon: Cpu,
  },
];

export const DashboardWorkspace: React.FC<DashboardWorkspaceProps> = ({
  initialTab,
  initialSnapshot,
  onBackTo3D,
}) => {
  const [activeTab, setActiveTab] = useState<DashboardTab>(initialTab);
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(initialSnapshot);
  const [loadingView, setLoadingView] = useState<boolean>(initialSnapshot === null);
  const [syncingApi, setSyncingApi] = useState<boolean>(false);
  const [streamPaused, setStreamPaused] = useState<boolean>(false);
  const [mobileNavOpen, setMobileNavOpen] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchSnapshot = async (fresh = false) => {
    try {
      const res = await fetch(`/api/v1/dashboard${fresh ? '?fresh=1' : ''}`);
      if (!res.ok) {
        throw new Error(`Backend responded with status ${res.status}`);
      }
      const data = (await res.json()) as DashboardSnapshot;
      setSnapshot(data);
      setErrorMessage(null);
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'Failed to load Telnyx telemetry');
    } finally {
      setLoadingView(false);
    }
  };

  useEffect(() => {
    if (!snapshot) {
      fetchSnapshot(true);
    }
  }, []);

  // Subscribe to Server-Sent Events (/api/v1/stream) for live CDR & billing updates
  useEffect(() => {
    if (streamPaused) return;

    const es = new EventSource('/api/v1/stream');
    es.addEventListener('telemetry_tick', (msg) => {
      try {
        const payload = JSON.parse((msg as MessageEvent).data) as {
          event: DetailRecordEvent;
          currentBalanceUsd: number;
          mtdSpendUsd: number;
          pendingUnbilledUsd: number;
        };
        setSnapshot((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            account: {
              ...prev.account,
              currentBalanceUsd: payload.currentBalanceUsd,
              mtdSpendUsd: payload.mtdSpendUsd,
              pendingUnbilledUsd: payload.pendingUnbilledUsd,
              lastSyncedAt: payload.event.timestamp,
            },
            recentEvents: [payload.event, ...prev.recentEvents].slice(0, 40),
            systemMetrics: {
              ...prev.systemMetrics,
              dsaEngines: {
                ...prev.systemMetrics.dsaEngines,
                ringBuffer: {
                  ...prev.systemMetrics.dsaEngines.ringBuffer,
                  totalWrites: prev.systemMetrics.dsaEngines.ringBuffer.totalWrites + 1,
                },
              },
            },
          };
        });
      } catch {
        // Ignore malformed SSE frame
      }
    });

    return () => {
      es.close();
    };
  }, [streamPaused]);

  const handleSyncTelnyx = async () => {
    setSyncingApi(true);
    try {
      const res = await fetch('/api/v1/sync', { method: 'POST' });
      if (res.ok) {
        const data = (await res.json()) as { snapshot: DashboardSnapshot };
        setSnapshot(data.snapshot);
        setErrorMessage(null);
      }
    } finally {
      setSyncingApi(false);
    }
  };

  const handleSelectTab = (tab: DashboardTab) => {
    setActiveTab(tab);
    setMobileNavOpen(false);
    fetchSnapshot(false);
  };

  const currentNav = NAV_ITEMS.find((n) => n.id === activeTab) ?? NAV_ITEMS[0];

  return (
    <div className="min-h-screen flex bg-[#F6F7F8] text-[#0F172A]">
      {/* Desktop Fixed Left Sidebar (248px) */}
      <aside className="hidden lg:flex lg:w-[248px] lg:shrink-0 lg:flex-col lg:justify-between border-r border-[#DCE1E7] bg-white">
        <div>
          <div className="h-16 px-6 flex items-center border-b border-[#DCE1E7]">
            <span className="font-display text-lg font-bold tracking-tight text-[#0F172A] whitespace-nowrap">
              Telnyx Monitor
            </span>
          </div>

          <nav className="p-4 space-y-1" aria-label="Dashboard sections">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleSelectTab(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    active
                      ? 'bg-[#00875A] text-white'
                      : 'text-[#334155] hover:bg-[#F1F5F9] hover:text-[#0F172A]'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 border-t border-[#DCE1E7] space-y-3">
          {snapshot && (
            <div className="text-xs text-[#475569] space-y-1">
              <div className="font-semibold text-[#0F172A] truncate">
                {snapshot.account.organizationName}
              </div>
              <div className="font-mono-tabular text-[11px]">
                {snapshot.account.dataSourceMode}
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onBackTo3D}
            className="w-full inline-flex items-center justify-center gap-2 border border-[#DCE1E7] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A] hover:bg-[#ECEFF2] transition-colors cursor-pointer whitespace-nowrap"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to 3D Topology</span>
          </button>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <div
              className="fixed inset-0 bg-[#0F172A]/40"
              onClick={() => setMobileNavOpen(false)}
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ duration: 0.18 }}
              className="relative z-10 w-64 bg-white border-r border-[#DCE1E7] h-full flex flex-col justify-between p-4"
            >
              <div>
                <div className="flex items-center justify-between pb-4 mb-4 border-b border-[#DCE1E7]">
                  <span className="font-display text-base font-bold text-[#0F172A]">
                    Telnyx Monitor
                  </span>
                  <button
                    type="button"
                    onClick={() => setMobileNavOpen(false)}
                    className="p-1 text-[#475569]"
                    aria-label="Close navigation menu"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <nav className="space-y-1">
                  {NAV_ITEMS.map((item) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => handleSelectTab(item.id)}
                        className={`w-full flex items-center gap-3 px-3.5 py-2.5 text-sm font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          active
                            ? 'bg-[#00875A] text-white'
                            : 'text-[#334155] hover:bg-[#F1F5F9]'
                        }`}
                      >
                        <Icon className="w-4 h-4 shrink-0" />
                        <span>{item.label}</span>
                      </button>
                    );
                  })}
                </nav>
              </div>

              <button
                type="button"
                onClick={onBackTo3D}
                className="w-full inline-flex items-center justify-center gap-2 border border-[#DCE1E7] bg-[#F8FAFC] px-3 py-2 text-xs font-medium text-[#0F172A]"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Back to 3D Topology</span>
              </button>
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Main Content Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Context Header (Breadcrumb on Left, Primary Actions on Right) */}
        <header className="h-16 border-b border-[#DCE1E7] bg-white px-6 flex items-center justify-between gap-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              className="lg:hidden p-1.5 border border-[#DCE1E7] text-[#0F172A]"
              aria-label="Open navigation"
            >
              <Menu className="w-4 h-4" />
            </button>
            <h1 className="font-display text-sm sm:text-base font-semibold text-[#0F172A] truncate">
              {currentNav.breadcrumb}
            </h1>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={onBackTo3D}
              className="hidden sm:inline-flex lg:hidden items-center gap-1.5 border border-[#DCE1E7] bg-white px-3 py-1.5 text-xs font-medium text-[#0F172A] whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>3D View</span>
            </button>

            <button
              type="button"
              disabled={syncingApi}
              onClick={handleSyncTelnyx}
              className="inline-flex items-center gap-2 bg-[#0F172A] px-4 py-2 text-xs font-semibold text-white hover:bg-[#1E293B] disabled:opacity-60 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              {syncingApi ? (
                <InlineBarLoader label="Syncing Telnyx" />
              ) : (
                <>
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>Sync Telnyx</span>
                </>
              )}
            </button>
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-6 max-w-[1440px] w-full mx-auto">
          {errorMessage && (
            <div className="mb-6 border border-[#B91C1C] bg-[#FEF2F2] px-4 py-3 text-xs text-[#991B1B] flex items-center justify-between">
              <span>{errorMessage}</span>
              <button
                type="button"
                onClick={() => fetchSnapshot(true)}
                className="font-semibold underline cursor-pointer"
              >
                Retry
              </button>
            </div>
          )}

          {loadingView || !snapshot ? (
            <DashboardSkeletonGrid />
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
              >
                {activeTab === 'billing' && (
                  <BillingFinOpsView
                    account={snapshot.account}
                    products={snapshot.products}
                    billingGroups={snapshot.billingGroups}
                    invoices={snapshot.invoices}
                    hourlyBuckets={snapshot.hourlyBuckets}
                    alerts={snapshot.alerts}
                    onRefreshDashboard={() => fetchSnapshot(true)}
                  />
                )}

                {activeTab === 'trunks' && (
                  <SipTrunksView
                    trunks={snapshot.trunks}
                    topCostlyTrunks={snapshot.topCostlyTrunks}
                    pops={snapshot.pops}
                    minHeapTimeUs={snapshot.systemMetrics.dsaEngines.minHeap.lastTopKTimeUs}
                    onRefreshDashboard={() => fetchSnapshot(true)}
                  />
                )}

                {activeTab === 'dids' && <DidInventoryView />}

                {activeTab === 'stream' && (
                  <CdrStreamView
                    events={snapshot.recentEvents}
                    ringBufferStats={snapshot.systemMetrics.dsaEngines.ringBuffer}
                    streamPaused={streamPaused}
                    onToggleStreamPaused={() => setStreamPaused((p) => !p)}
                  />
                )}

                {activeTab === 'architecture' && (
                  <SystemArchitectureView
                    metrics={snapshot.systemMetrics}
                    onRefreshDashboard={() => fetchSnapshot(true)}
                  />
                )}
              </motion.div>
            </AnimatePresence>
          )}
        </main>
      </div>
    </div>
  );
};
