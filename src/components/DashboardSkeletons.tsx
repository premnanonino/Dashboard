import React from 'react';
import { motion } from 'motion/react';

export const InlineBarLoader: React.FC<{ label?: string }> = ({ label = 'Syncing' }) => {
  return (
    <span className="inline-flex items-center gap-2 font-mono-tabular text-xs">
      <svg
        width="14"
        height="14"
        viewBox="0 0 14 14"
        fill="none"
        aria-hidden="true"
      >
        <rect x="1" y="1" width="12" height="12" stroke="currentColor" strokeOpacity="0.25" strokeWidth="1.5" />
        <motion.rect
          x="3"
          y="3"
          width="8"
          height="8"
          fill="currentColor"
          animate={{ rotate: 90 }}
          transition={{ repeat: Infinity, duration: 0.75, ease: 'linear' }}
          style={{ originX: '7px', originY: '7px' }}
        />
      </svg>
      <span>{label}</span>
    </span>
  );
};

export const DashboardSkeletonGrid: React.FC = () => {
  return (
    <div className="space-y-6" aria-busy="true" aria-label="Loading telemetry">
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((idx) => (
          <div key={idx} className="border border-[#DCE1E7] bg-white p-5">
            <motion.div
              animate={{ opacity: [0.45, 0.9, 0.45] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: idx * 0.1 }}
              className="h-3 w-28 bg-[#E2E8F0] mb-3"
            />
            <motion.div
              animate={{ opacity: [0.45, 0.9, 0.45] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: idx * 0.1 }}
              className="h-7 w-36 bg-[#CBD5E1] mb-2"
            />
            <motion.div
              animate={{ opacity: [0.45, 0.9, 0.45] }}
              transition={{ repeat: Infinity, duration: 1.2, delay: idx * 0.1 }}
              className="h-3 w-44 bg-[#ECEFF2]"
            />
          </div>
        ))}
      </div>

      <div className="border border-[#DCE1E7] bg-white p-6">
        <div className="h-4 w-56 bg-[#E2E8F0] mb-4" />
        <div className="h-44 w-full bg-[#F1F5F9]" />
      </div>

      <div className="border border-[#DCE1E7] bg-white p-6 space-y-3">
        {[0, 1, 2, 3, 4].map((row) => (
          <motion.div
            key={row}
            animate={{ opacity: [0.5, 0.95, 0.5] }}
            transition={{ repeat: Infinity, duration: 1.1, delay: row * 0.08 }}
            className="h-9 w-full bg-[#F1F5F9]"
          />
        ))}
      </div>
    </div>
  );
};
