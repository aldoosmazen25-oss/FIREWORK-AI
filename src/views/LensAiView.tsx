import React from 'react';
import { LensPanel } from '../components/LensPanel';

export function LensAiView() {
  return (
    <div className="h-[calc(100vh-8.25rem)] min-h-[560px] overflow-hidden rounded-2xl border border-black/[0.06] dark:border-white/[0.08] bg-white dark:bg-[#1A1C24]">
      <LensPanel />
    </div>
  );
}
