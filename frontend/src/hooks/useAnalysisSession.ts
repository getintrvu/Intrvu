import { useCallback, useEffect, useState } from 'react';
import type { AnalysisData } from '../types/AnalysisData';

export type SectionType =
  | 'start'
  | 'keywords'
  | 'experience'
  | 'education'
  | 'skills'
  | 'structure'
  | 'action-verbs'
  | 'measurable-results'
  | 'bullet-effectiveness'
  | 'results';

/**
 * Which screen is showing and which analysis is on display. An analysis belongs to the job it was
 * run for: when a different job posting appears, the old results are cleared and the panel goes
 * back to the start screen. Without that, results for the previous job stay on screen while the
 * status chip already shows the new one.
 *
 * `currentJobKey` is null while no job is detected (for example mid-navigation); that never clears
 * results, only a different job does.
 */
export function useAnalysisSession(currentJobKey: string | null) {
  const [section, setSection] = useState<SectionType>('start');
  const [result, setResult] = useState<{ data: AnalysisData; jobKey: string } | null>(null);

  useEffect(() => {
    if (result && currentJobKey && currentJobKey !== result.jobKey) {
      setResult(null);
      setSection('start');
    }
  }, [currentJobKey, result]);

  const showResult = useCallback((data: AnalysisData, jobKey: string) => {
    setResult({ data, jobKey });
    setSection('results');
  }, []);

  const clearResult = useCallback(() => {
    setResult(null);
    setSection('start');
  }, []);

  return {
    section,
    setSection,
    analysisData: result?.data ?? null,
    analysisStarted: result !== null,
    showResult,
    clearResult,
  };
}
