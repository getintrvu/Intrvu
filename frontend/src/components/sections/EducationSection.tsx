import React from 'react';
import { CheckCircle2, AlertTriangle } from 'lucide-react';
import type { AnalysisData } from '../../types/AnalysisData';
import DetailedAnalysisHeader from '../DetailedAnalysisHeader';

interface EducationSectionProps {
  analysisData: AnalysisData | null;
}

const Row: React.FC<{ text: string; matched: boolean }> = ({ text, matched }) => (
  <div className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3 py-3">
    <div className={`flex h-4 w-4 items-center justify-center rounded-[4px] ${matched ? 'bg-[#22c55e]/15' : 'bg-[#f59e0b]/15'}`}>
      {matched ? <CheckCircle2 className="h-3 w-3 text-[#16a34a]" /> : <AlertTriangle className="h-3 w-3 text-[#d97706]" />}
    </div>
    <span className="text-[13px] font-semibold leading-tight text-[#475569]">{text}</span>
  </div>
);

const Empty: React.FC<{ text: string }> = ({ text }) => (
  <p className="rounded-xl border border-dashed border-[#cbd5e1] bg-white p-3 text-center text-[13px] italic text-[#64748b]">{text}</p>
);

const EducationSection: React.FC<EducationSectionProps> = ({ analysisData }) => {
  const education = analysisData?.detailed_analysis.education_certifications;

  if (!analysisData || !education) {
    return (
      <div className="animate-pulse py-8">
        <DetailedAnalysisHeader analysisData={null} />
        <div className="mb-6 mt-8 h-8 w-64 rounded-lg bg-gray-100"></div>
        <div className="h-64 w-full rounded-3xl bg-gray-50"></div>
      </div>
    );
  }

  const { score, analysis } = education;
  const percentage = Math.round((score.pointsAwarded / score.maxPoints) * 100);
  const hasDegree = analysis.degreeFound && analysis.degreeFound !== 'None';
  const degreeLabel = hasDegree
    ? `${analysis.degreeFound}${analysis.fieldOfStudy ? ` in ${analysis.fieldOfStudy}` : ''}`
    : null;

  return (
    <div className="mx-auto flex min-h-full max-w-4xl flex-col py-3">
      <DetailedAnalysisHeader analysisData={analysisData} />

      <div className="mt-2">
        <h2 className="mb-4 text-xl font-black tracking-tight text-[#1e293b]">Education Alignment</h2>

        <div className="rounded-2xl border border-[#e2e8f0] bg-[#f1f5f9] p-4">
          <div className="mb-4 flex items-center justify-between rounded-xl border border-[#d1d5db] bg-[#e5e7eb] px-4 py-3">
            <span className="text-[13px] font-semibold text-[#475569]">Alignment Percentage :</span>
            <span className="text-[13px] font-black text-[#1e293b]">
              {percentage}% ( {score.rating} )
            </span>
          </div>

          <div className="space-y-5">
            <section>
              <h3 className="mb-2 text-[15px] font-extrabold text-[#475569]">Matched</h3>
              <div className="space-y-2.5">
                {score.passed && degreeLabel ? <Row text={degreeLabel} matched /> : <Empty text="No matched education found." />}
              </div>
            </section>

            <section>
              <h3 className="mb-2 text-[15px] font-extrabold text-[#475569]">Missing</h3>
              <div className="space-y-2.5">
                {score.passed ? (
                  <Empty text="No missing requirements." />
                ) : (
                  <Row text={analysis.suggestedImprovements || "A Bachelor's degree or equivalent was not found."} matched={false} />
                )}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default EducationSection;
