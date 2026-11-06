import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';

interface TransitionLoaderProps {
  targetLabel: string;
  onComplete: () => void;
}

const BOOT_STEPS = [
  '01. Verifying Token Bucket Gateway & Telnyx v2 Session',
  '02. Indexing E.164 Prefix Trie & Rate-Deck LPM Table',
  '03. Building 24-Bucket Fenwick Billing Tree & Min-Heap',
  '04. Subscribing to CDR Ring Buffer & Consistent Hash Ring',
];

export const TransitionLoader: React.FC<TransitionLoaderProps> = ({
  targetLabel,
  onComplete,
}) => {
  const [stepIndex, setStepIndex] = useState<number>(0);

  useEffect(() => {
    const t1 = window.setTimeout(() => setStepIndex(1), 160);
    const t2 = window.setTimeout(() => setStepIndex(2), 320);
    const t3 = window.setTimeout(() => setStepIndex(3), 480);
    const t4 = window.setTimeout(() => onComplete(), 680);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  const progressFraction = (stepIndex + 1) / BOOT_STEPS.length;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#F6F7F8] text-[#0F172A] p-6"
    >
      <div className="w-full max-w-md border border-[#DCE1E7] bg-white p-8">
        {/* Flat Solid Geometric Reticle Loader — Zero Gradients */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <svg
              width="36"
              height="36"
              viewBox="0 0 36 36"
              fill="none"
              aria-hidden="true"
            >
              <rect x="2" y="2" width="32" height="32" stroke="#DCE1E7" strokeWidth="2" />
              <motion.rect
                x="7"
                y="7"
                width="22"
                height="22"
                stroke="#00875A"
                strokeWidth="2.5"
                animate={{ rotate: 90 }}
                transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
                style={{ originX: '18px', originY: '18px' }}
              />
              <rect x="14" y="14" width="8" height="8" fill="#1D4ED8" />
            </svg>
            <div>
              <div className="font-display text-base font-bold text-[#0F172A]">
                Telnyx Monitor
              </div>
              <div className="font-mono-tabular text-xs text-[#475569]">
                Loading {targetLabel}
              </div>
            </div>
          </div>

          <span className="font-mono-tabular text-sm font-semibold text-[#00875A]">
            {Math.round(progressFraction * 100)}%
          </span>
        </div>

        {/* Solid Flat Progress Bar (Compositor scaleX transform only) */}
        <div className="w-full h-2 bg-[#ECEFF2] overflow-hidden mb-6">
          <motion.div
            className="h-full bg-[#00875A] origin-left"
            initial={{ scaleX: 0.15 }}
            animate={{ scaleX: progressFraction }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>

        {/* Sequential Initialization Steps */}
        <ul className="space-y-2.5 text-xs font-mono-tabular">
          {BOOT_STEPS.map((step, idx) => {
            const done = idx < stepIndex;
            const active = idx === stepIndex;
            return (
              <li
                key={step}
                className={`flex items-center justify-between py-1 border-b border-[#F1F5F9] last:border-b-0 ${
                  done
                    ? 'text-[#00875A]'
                    : active
                      ? 'text-[#0F172A] font-semibold'
                      : 'text-[#94A3B8]'
                }`}
              >
                <span className="truncate pr-3">{step}</span>
                <span className="shrink-0">
                  {done ? 'READY' : active ? 'SYNCING' : 'QUEUED'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </motion.div>
  );
};
