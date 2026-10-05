import React from 'react';
import { Info, TrendingUp, User, ChevronRight } from 'lucide-react';
import type { AnalysisData } from '../../types/AnalysisData';
import ScoreBadge from '../ScoreBadge';

interface ResultsSectionProps {
  analysisData: AnalysisData | null;
  onUploadNewResume?: () => void;
  onViewDetails?: () => void;
}

interface ScoreCardProps {
  title: string;
  label: string;
  percentage: number;
  icon: React.ReactNode;
  iconBg: string;
  barClass: string;
  tipLabel: string;
  tip: string;
  /** Resume Quality is shown as a tier only: the spec says its number must not be exposed. */
  showScore?: boolean;
}

/** One headline result: title and badge, the percentage as a clear number, a bar, and a tip. */
const ScoreCard: React.FC<ScoreCardProps> = ({ title, label, percentage, icon, iconBg, barClass, tipLabel, tip, showScore = true }) => {
  const pct = Math.max(0, Math.min(100, Math.round(Number(percentage) || 0)));
  return (
    <div className="rounded-[24px] border border-[#f1f5f9] bg-white p-5 shadow-[0_2px_15px_rgba(0,0,0,0.02)]">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex items-center gap-3">
          <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${iconBg}`}>{icon}</div>
          <h2 className="text-base font-bold text-[#1e293b]">{title}</h2>
        </div>
        <ScoreBadge label={label} />
      </div>

      {showScore && (
      <div className="mt-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[28px] font-bold leading-none tabular-nums text-[#1e293b]">
            {pct}
            <span className="ml-0.5 text-base font-semibold text-[#94a3b8]">%</span>
          </span>
          <span className="text-[11px] font-medium text-[#94a3b8]">out of 100</span>
        </div>
        <div
          className="h-2.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]"
          role="progressbar"
          aria-label={title}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className={`h-full rounded-full transition-all duration-1000 ease-out ${barClass}`} style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-1.5 flex justify-between text-[10px] font-medium text-[#94a3b8]" aria-hidden="true">
          <span>0</span>
          <span>50</span>
          <span>100</span>
        </div>
      </div>
      )}

      <div className={`${showScore ? 'mt-4' : 'mt-5'} flex items-start gap-3 rounded-[18px] border border-[#dbeafe] bg-[#eff6ff] p-4`}>
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#3b82f6]" />
        <p className="text-xs leading-relaxed text-[#1e40af]">
          <span className="font-bold">{tipLabel}: </span>
          {tip}
        </p>
      </div>
    </div>
  );
};

const ResultsView: React.FC<ResultsSectionProps> = ({ analysisData, onUploadNewResume, onViewDetails }) => {
  if (!analysisData) {
    return (
      <div className="mx-auto max-w-2xl py-12">
        <div className="text-center">
          <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-b-2 border-indigo-600"></div>
          <p className="font-medium tracking-tight text-gray-500">AI is analyzing your profile...</p>
        </div>
      </div>
    );
  }

  const improvementTip =
    analysisData.detailed_analysis?.keyword_match?.analysis?.suggestedImprovements ||
    'Review the Keywords tab to see which terms from the posting your resume is missing.';

  const qualityTip =
    analysisData.detailed_analysis?.resume_structure?.analysis?.suggestedImprovements ||
    analysisData.detailed_analysis?.measurable_results?.analysis?.suggestedImprovements ||
    'Add clearer impact metrics and make section formatting ATS-friendly.';

  return (
    <div className="mx-auto flex min-h-full max-w-2xl flex-col px-4 py-4">
      <div className="mb-6 text-center">
        <h1 className="mb-1 text-[22px] font-bold tracking-tight text-[#1e293b]">Resume Analysis Results</h1>
        <p className="text-sm font-medium text-[#64748b]">Here&apos;s how your resume matches this job</p>
        {analysisData.job_context?.title && (
          <p className="mt-1 text-xs font-semibold text-[#475569]">
            {analysisData.job_context.title}
            {analysisData.job_context.company ? ` at ${analysisData.job_context.company}` : ''}
          </p>
        )}
        {analysisData.engine?.own_key && (
          <p className="mt-1 text-[11px] text-[#94a3b8]">
            Analyzed with your own {analysisData.engine.provider === 'openai' ? 'OpenAI' : 'Gemini'} key ({analysisData.engine.model})
          </p>
        )}
      </div>

      <div className="flex-grow space-y-4">
        <ScoreCard
          title="Job Fit Score"
          label={analysisData.job_fit_score.label}
          percentage={analysisData.job_fit_score.percentage}
          icon={<TrendingUp className="h-5 w-5 text-[#3b82f6]" />}
          iconBg="bg-[#eff6ff]"
          barClass="bg-gradient-to-r from-[#6366f1] to-[#4f46e5]"
          tipLabel="Improvement tip"
          tip={improvementTip}
        />

        <ScoreCard
          title="Resume Quality"
          label={analysisData.resume_quality_score.label}
          percentage={analysisData.resume_quality_score.percentage}
          icon={<User className="h-5 w-5 text-[#8b5cf6]" />}
          iconBg="bg-[#f5f3ff]"
          barClass="bg-gradient-to-r from-[#22c55e] to-[#16a34a]"
          tipLabel="Pro tip"
          tip={qualityTip}
          showScore={false}
        />

        <div className="flex flex-col items-center gap-3 pt-2">
          <button
            onClick={onViewDetails}
            className="flex w-full max-w-[280px] transform items-center justify-center gap-2 rounded-xl bg-[#4f46e5] px-6 py-3 font-bold text-white shadow-md shadow-indigo-100 transition-all hover:scale-[1.01] hover:bg-[#4338ca] active:scale-[0.99]"
          >
            <span className="text-sm">View Detailed Analysis</span>
            <ChevronRight className="h-4 w-4" />
          </button>

          <button onClick={onUploadNewResume} className="text-xs font-bold text-[#4f46e5] decoration-1 underline-offset-4 hover:underline">
            Upload New Resume
          </button>
        </div>
      </div>
    </div>
  );
};

export default ResultsView;
