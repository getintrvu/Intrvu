import React from 'react';
import { AlertTriangle, Check, Info, Wrench } from 'lucide-react';
import { getScoreTone, type ScoreTone } from '../utils/scoreDisplay';

const TONES: Record<ScoreTone, { pill: string; square: string; Icon: React.ElementType }> = {
  positive: { pill: 'bg-[#dcfce7] text-[#166534]', square: 'bg-[#22c55e]', Icon: Check },
  warning: { pill: 'bg-[#fef3c7] text-[#92400e]', square: 'bg-[#f59e0b]', Icon: AlertTriangle },
  negative: { pill: 'bg-[#fee2e2] text-[#991b1b]', square: 'bg-[#ef4444]', Icon: Wrench },
  neutral: { pill: 'bg-[#f1f5f9] text-[#475569]', square: 'bg-[#94a3b8]', Icon: Info },
};

/** Compact result badge: a coloured tick square plus the label, e.g. "Good Match". */
const ScoreBadge: React.FC<{ label: string }> = ({ label }) => {
  const { pill, square, Icon } = TONES[getScoreTone(label)];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-[5px] px-2 py-[3px] text-xs font-semibold leading-none ${pill}`}>
      <span className={`flex h-3.5 w-3.5 flex-shrink-0 items-center justify-center rounded-[3px] ${square}`} aria-hidden="true">
        <Icon className="h-2.5 w-2.5 text-white" strokeWidth={3} />
      </span>
      {label}
    </span>
  );
};

export default ScoreBadge;
