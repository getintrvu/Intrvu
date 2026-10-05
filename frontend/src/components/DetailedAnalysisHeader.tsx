import React from 'react';
import { TrendingUp } from 'lucide-react';
import type { AnalysisData } from '../types/AnalysisData';
import ScoreBadge from './ScoreBadge';

interface DetailedAnalysisHeaderProps {
  analysisData: AnalysisData | null;
}

/** Page title with the two overall results. In a narrow panel the badges wrap under the title;
 * when the panel is dragged wide they sit on the same row, to the right. */
const DetailedAnalysisHeader: React.FC<DetailedAnalysisHeaderProps> = ({ analysisData }) => {
  const jobFitLabel = analysisData?.job_fit_score?.label || 'In Progress';
  const qualityLabel = analysisData?.resume_quality_score?.label || 'In Progress';

  return (
    <header className="mx-auto mb-3 flex w-full max-w-4xl flex-wrap items-end justify-between gap-x-4 gap-y-2.5 border-b border-gray-100 pb-3">
      <h1 className="text-xl font-bold tracking-tight text-[#1e293b]">Detailed Analysis</h1>

      <div className="flex flex-col items-start gap-1.5">
        <div className="flex items-center gap-2">
          <span className="flex items-center gap-1 text-xs font-medium text-[#64748b]">
            <TrendingUp className="h-3.5 w-3.5 text-[#4f46e5]" aria-hidden="true" />
            Job Fit
          </span>
          <ScoreBadge label={jobFitLabel} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#64748b]">Resume Quality</span>
          <ScoreBadge label={qualityLabel} />
        </div>
      </div>
    </header>
  );
};

export default DetailedAnalysisHeader;
