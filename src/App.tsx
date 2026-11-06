import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, MotionConfig } from 'motion/react';
import type { DashboardSnapshot, TelnyxPopNode } from '../shared/types.ts';
import { Carrier3DLanding } from './components/Carrier3DLanding.tsx';
import { DashboardWorkspace, type DashboardTab } from './components/DashboardWorkspace.tsx';
import { TransitionLoader } from './components/TransitionLoader.tsx';

const INITIAL_POPS: TelnyxPopNode[] = [
  {
    id: 'pop-iad',
    code: 'IAD1',
    city: 'Ashburn, VA',
    region: 'US-East',
    coords3d: [-1.75, 0.35, 1.05],
    activeChannels: 1420,
    maxChannels: 2500,
    rttMs: 11.4,
    packetLossPct: 0.01,
    status: 'Nominal',
  },
  {
    id: 'pop-ord',
    code: 'ORD1',
    city: 'Chicago, IL',
    region: 'US-Central',
    coords3d: [-2.25, 0.55, -0.35],
    activeChannels: 980,
    maxChannels: 2000,
    rttMs: 16.8,
    packetLossPct: 0.02,
    status: 'Nominal',
  },
  {
    id: 'pop-sjc',
    code: 'SJC1',
    city: 'San Jose, CA',
    region: 'US-West',
    coords3d: [-2.75, 0.15, -1.45],
    activeChannels: 760,
    maxChannels: 1800,
    rttMs: 22.1,
    packetLossPct: 0.01,
    status: 'Nominal',
  },
  {
    id: 'pop-fra',
    code: 'FRA1',
    city: 'Frankfurt, DE',
    region: 'EU-Central',
    coords3d: [1.55, 0.52, 0.72],
    activeChannels: 1140,
    maxChannels: 2200,
    rttMs: 14.2,
    packetLossPct: 0.01,
    status: 'Nominal',
  },
  {
    id: 'pop-lhr',
    code: 'LHR1',
    city: 'London, UK',
    region: 'EU-West',
    coords3d: [0.85, 0.68, -0.58],
    activeChannels: 640,
    maxChannels: 1500,
    rttMs: 18.6,
    packetLossPct: 0.03,
    status: 'Nominal',
  },
  {
    id: 'pop-nrt',
    code: 'NRT1',
    city: 'Tokyo, JP',
    region: 'APAC-East',
    coords3d: [2.68, 0.22, -1.18],
    activeChannels: 510,
    maxChannels: 1400,
    rttMs: 28.4,
    packetLossPct: 0.02,
    status: 'Nominal',
  },
];

type ScreenStage = 'landing-3d' | 'loading' | 'dashboard';

const TAB_LABELS: Record<DashboardTab, string> = {
  billing: 'Billing & FinOps',
  trunks: 'SIP Trunks & PoPs',
  dids: 'DID Prefix Lookup',
  stream: 'CDR & Event Stream',
  architecture: 'System & DSA Core',
};

export default function App() {
  const [stage, setStage] = useState<ScreenStage>('landing-3d');
  const [targetTab, setTargetTab] = useState<DashboardTab>('billing');
  const [snapshot, setSnapshot] = useState<DashboardSnapshot | null>(null);

  // Pre-warm dashboard snapshot from Express backend while on the 3D landing page
  useEffect(() => {
    let active = true;
    fetch('/api/v1/dashboard')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DashboardSnapshot | null) => {
        if (active && data) {
          setSnapshot(data);
        }
      })
      .catch(() => {
        // Handled when entering dashboard
      });
    return () => {
      active = false;
    };
  }, []);

  const handleEnterDashboard = useCallback((tab: DashboardTab = 'billing') => {
    setTargetTab(tab);
    setStage('loading');
    fetch('/api/v1/dashboard?fresh=1')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: DashboardSnapshot | null) => {
        if (data) {
          setSnapshot(data);
        }
      })
      .catch(() => {
        // Fallback handled inside DashboardWorkspace
      });
  }, []);

  const handleLoaderComplete = useCallback(() => {
    setStage('dashboard');
  }, []);

  const handleBackTo3D = useCallback(() => {
    setStage('landing-3d');
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        {stage === 'landing-3d' && (
          <Carrier3DLanding
            key="landing-3d"
            pops={snapshot?.pops ?? INITIAL_POPS}
            onEnterDashboard={handleEnterDashboard}
          />
        )}

        {stage === 'loading' && (
          <TransitionLoader
            key="loading"
            targetLabel={TAB_LABELS[targetTab]}
            onComplete={handleLoaderComplete}
          />
        )}

        {stage === 'dashboard' && (
          <DashboardWorkspace
            key="dashboard"
            initialTab={targetTab}
            initialSnapshot={snapshot}
            onBackTo3D={handleBackTo3D}
          />
        )}
      </AnimatePresence>
    </MotionConfig>
  );
}
