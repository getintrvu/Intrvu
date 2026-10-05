import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { SectionType } from '../../App';
import type { AnalysisData } from '../../types/AnalysisData';
import { useAuth } from '../../auth/AuthProvider';
import { analyzeResume, userMessage } from '../../api/client';
import { useJobData } from '../../hooks/useJobData';
import { useUsage } from '../../hooks/useUsage';
import { MAX_PDF_BYTES, MAX_PDF_MB, MIN_JOB_DESCRIPTION_CHARS } from '../../lib/config';
import { analysisKey, getCachedAnalysis, saveAnalysis, type CachedAnalysis } from '../../lib/analysisCache';
import { clearResume, loadResume, saveResume } from '../../lib/resumeStore';

interface StartSectionProps {
  setAnalysisStarted: (started: boolean) => void;
  onSectionChange: (section: SectionType) => void;
  setAnalysisData: (data: AnalysisData) => void;
}

const isPdf = (file: File) => file.type === 'application/pdf' && file.name.toLowerCase().endsWith('.pdf');

const Notice: React.FC<{ tone: 'warn' | 'error'; children: React.ReactNode }> = ({ tone, children }) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
      tone === 'error' ? 'border-red-200 bg-red-50 text-red-600' : 'border-orange-200 bg-orange-50 text-orange-600'
    }`}
  >
    <span>{tone === 'error' ? '❌' : '⚠️'}</span>
    <span>{children}</span>
  </div>
);

const StartSection: React.FC<StartSectionProps> = ({ setAnalysisStarted, onSectionChange, setAnalysisData }) => {
  const { getToken } = useAuth();
  const job = useJobData();
  const { usage, refresh: refreshUsage } = useUsage();

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cached, setCached] = useState<CachedAnalysis | null>(null);

  // Restore the resume from the last session.
  useEffect(() => {
    let active = true;
    loadResume().then((stored) => {
      if (active && stored) {
        setFile(stored);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  const acceptFile = async (candidate?: File) => {
    if (!candidate) return;
    if (!isPdf(candidate)) return setError('Only PDF files are supported. Please choose a .pdf file.');
    if (candidate.size > MAX_PDF_BYTES) return setError(`That file is too large. The maximum size is ${MAX_PDF_MB} MB.`);
    setError(null);
    setFile(candidate);
    try {
      await saveResume(candidate);
    } catch {
      /* keeping it for next time is optional */
    }
  };

  const removeFile = () => {
    setFile(null);
    void clearResume();
  };

  // Look for a saved result for this exact resume and job description.
  const jobDescription = job?.jobDescription;
  useEffect(() => {
    let active = true;
    setCached(null);
    if (file && jobDescription) {
      analysisKey(file, jobDescription)
        .then(getCachedAnalysis)
        .then((entry) => active && setCached(entry))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [file, jobDescription]);

  const descriptionLength = job?.jobDescription?.length ?? 0;
  const hasEnoughDescription = descriptionLength >= MIN_JOB_DESCRIPTION_CHARS;
  const outOfQuota = usage !== null && usage.remaining === 0;
  const ready = !!file && !!job && hasEnoughDescription && !isAnalyzing;
  // Viewing a saved result costs nothing, so it does not depend on the daily quota.
  const canAnalyze = ready && (!outOfQuota || !!cached);

  const showResult = (data: AnalysisData) => {
    setAnalysisData(data);
    setAnalysisStarted(true);
    onSectionChange('results');
  };

  /** `fresh` skips the saved result and runs a new analysis (which replaces it). */
  const handleAnalyze = async (fresh = false) => {
    if (!file || !job) return;
    if (cached && !fresh) return showResult(cached.data);
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeResume(file, job, await getToken());
      void analysisKey(file, job.jobDescription).then((key) => saveAnalysis(key, result));
      setAnalysisData(result);
      setAnalysisStarted(true);
      onSectionChange('results');
    } catch (err) {
      setError(userMessage(err));
    } finally {
      setIsAnalyzing(false);
      void refreshUsage();
    }
  };

  return (
    <div className="relative w-full">
      <div className="mb-8">
        <h2 className="mb-4 text-lg font-semibold text-gray-800">Upload Your Resume</h2>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            void acceptFile(e.dataTransfer.files[0]);
          }}
          className={`rounded-lg border-2 border-dashed p-6 text-center transition-all duration-300 ${
            dragOver
              ? 'scale-105 border-blue-400 bg-blue-50'
              : file
                ? 'border-green-300 bg-green-50'
                : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'
          }`}
        >
          {file ? (
            <div className="mb-4 flex items-center justify-center gap-2 text-green-600">
              <Check className="h-5 w-5" />
              <span className="break-all text-sm font-medium">{file.name}</span>
            </div>
          ) : (
            <>
              <p className="mb-2 text-sm text-gray-600">Drag and drop your PDF resume or click to browse</p>
              <p className="mb-4 text-xs text-gray-500">Maximum file size: {MAX_PDF_MB} MB</p>
            </>
          )}

          <input
            type="file"
            accept="application/pdf,.pdf"
            id="resume-upload"
            className="hidden"
            onChange={(e) => {
              void acceptFile(e.target.files?.[0]);
              e.target.value = ''; // allow choosing the same file again
            }}
          />
          <label
            htmlFor="resume-upload"
            className="inline-block cursor-pointer rounded-lg border border-gray-300 bg-white px-6 py-2 text-sm font-medium text-gray-700 transition-all duration-200 hover:bg-gray-50"
          >
            {file ? 'Change File' : 'Browse Files'}
          </label>
          {file && (
            <button onClick={removeFile} className="ml-3 text-xs text-gray-500 underline hover:text-red-600">
              Remove
            </button>
          )}
        </div>
      </div>

      <button
        onClick={() => void handleAnalyze()}
        disabled={!canAnalyze}
        className={`mb-2 w-full rounded-lg px-6 py-3 text-base font-medium transition-all duration-200 ${
          canAnalyze
            ? 'bg-blue-600 text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-300'
            : 'cursor-not-allowed bg-gray-300 text-gray-500 opacity-60'
        }`}
      >
        {isAnalyzing ? (
          <span className="flex items-center justify-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" />
            Analyzing… this can take up to a minute
          </span>
        ) : cached ? (
          'View saved result'
        ) : (
          'Analyze'
        )}
      </button>

      {cached && !isAnalyzing && (
        <p className="mb-2 text-center text-xs text-gray-500">
          Saved result from {new Date(cached.savedAt).toLocaleString()}. The same resume and job always give the same result.{' '}
          <button
            onClick={() => void handleAnalyze(true)}
            disabled={!ready || outOfQuota}
            className="underline hover:text-blue-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Run a fresh analysis
          </button>
        </p>
      )}

      {usage && (
        <p className="mb-6 text-center text-xs text-gray-500">
          {usage.remaining} of {usage.limit} analyses left today
        </p>
      )}

      {!job && <Notice tone="warn">No job description found yet. Open a LinkedIn job posting first.</Notice>}
      {job && !hasEnoughDescription && (
        <Notice tone="warn">
          The job description is too short (at least {MIN_JOB_DESCRIPTION_CHARS} characters needed). Open a posting with a
          full description.
        </Notice>
      )}
      {outOfQuota && <Notice tone="warn">You have used all your analyses for today. Come back tomorrow.</Notice>}
      {error && <Notice tone="error">{error}</Notice>}
    </div>
  );
};

export default StartSection;
