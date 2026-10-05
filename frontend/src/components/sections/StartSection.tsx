import React, { useEffect, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import type { AnalysisData } from '../../types/AnalysisData';
import { useAuth } from '../../auth/AuthProvider';
import { ApiError, KEY_ERROR_CODES, analyzeResume, userMessage } from '../../api/client';
import { useJobData } from '../../hooks/useJobData';
import { useUsage } from '../../hooks/useUsage';
import { useByok } from '../../hooks/useByok';
import { PROVIDERS, engineId } from '../../lib/byok';
import { MAX_PDF_BYTES, MAX_PDF_MB, MIN_JOB_DESCRIPTION_CHARS } from '../../lib/config';
import { analysisKey, getCachedAnalysis, saveAnalysis, type CachedAnalysis } from '../../lib/analysisCache';
import { jobKey } from '../../lib/jobKey';
import { quotaResetTime } from '../../lib/quota';
import { clearResume, loadResume, saveResume } from '../../lib/resumeStore';

interface StartSectionProps {
  /** Called with a finished analysis and the key of the job it was run for. */
  onResult: (data: AnalysisData, jobKey: string) => void;
  onOpenSettings: () => void;
}

const isPdf = (file: File) => file.type === 'application/pdf' && file.name.toLowerCase().endsWith('.pdf');

const Notice: React.FC<{ tone: 'warn' | 'error'; children: React.ReactNode; action?: { label: string; onClick: () => void } }> = ({
  tone,
  children,
  action,
}) => (
  <div
    role={tone === 'error' ? 'alert' : 'status'}
    className={`mb-4 flex items-center gap-2 rounded-lg border p-3 text-sm ${
      tone === 'error' ? 'border-red-200 bg-red-50 text-red-600' : 'border-orange-200 bg-orange-50 text-orange-600'
    }`}
  >
    <span>{tone === 'error' ? '❌' : '⚠️'}</span>
    <span>
      {children}
      {action && (
        <>
          {' '}
          <button onClick={action.onClick} className="font-medium underline">
            {action.label}
          </button>
        </>
      )}
    </span>
  </div>
);

const StartSection: React.FC<StartSectionProps> = ({ onResult, onOpenSettings }) => {
  const { getToken } = useAuth();
  const job = useJobData();
  const { usage, refresh: refreshUsage } = useUsage();
  const { byok } = useByok();
  const engine = engineId(byok);

  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<{ message: string; keyProblem: boolean } | null>(null);
  const [cached, setCached] = useState<CachedAnalysis | null>(null);
  // Set when the server says today's analyses are used up, even if the usage count has not loaded yet.
  const [quotaHit, setQuotaHit] = useState(false);

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
    if (!isPdf(candidate)) return setError({ message: 'Only PDF files are supported. Please choose a .pdf file.', keyProblem: false });
    if (candidate.size > MAX_PDF_BYTES) {
      return setError({ message: `That file is too large. The maximum size is ${MAX_PDF_MB} MB.`, keyProblem: false });
    }
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
      analysisKey(file, jobDescription, engine)
        .then(getCachedAnalysis)
        .then((entry) => active && setCached(entry))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [file, jobDescription, engine]);

  const descriptionLength = job?.jobDescription?.length ?? 0;
  const hasEnoughDescription = descriptionLength >= MIN_JOB_DESCRIPTION_CHARS;
  // A new day (or a refreshed count) lifts a quota block that came from the server's answer.
  useEffect(() => {
    if (usage && usage.remaining > 0) setQuotaHit(false);
  }, [usage]);

  // People on their own key are not limited by our daily quota.
  const outOfQuota = !byok && (quotaHit || (usage !== null && usage.remaining === 0));
  const ready = !!file && !!job && hasEnoughDescription && !isAnalyzing;
  // Viewing a saved result costs nothing, so it does not depend on the daily quota.
  const canAnalyze = ready && (!outOfQuota || !!cached);
  const dailyLimit = usage?.limit;

  /** `fresh` skips the saved result and runs a new analysis (which replaces it). */
  const handleAnalyze = async (fresh = false) => {
    if (!file || !job) return;
    if (cached && !fresh) return onResult(cached.data, jobKey(job.jobDescription));
    setIsAnalyzing(true);
    setError(null);
    try {
      const result = await analyzeResume(file, job, await getToken(), byok);
      void analysisKey(file, job.jobDescription, engine).then((key) => saveAnalysis(key, result));
      onResult(result, jobKey(job.jobDescription)); // the job as it was when Analyze was clicked
    } catch (err) {
      if (err instanceof ApiError && err.code === 'quota_exceeded') {
        // One clear message (below the button) instead of an error on top of it.
        setQuotaHit(true);
      } else {
        setError({ message: userMessage(err), keyProblem: err instanceof ApiError && KEY_ERROR_CODES.has(err.code) });
      }
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
        ) : outOfQuota ? (
          'Daily limit reached'
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

      {byok ? (
        <p className="mb-6 text-center text-xs text-gray-500">
          Using your own {PROVIDERS[byok.provider].label} key · no daily limit ·{' '}
          <button onClick={onOpenSettings} className="underline hover:text-blue-700">
            AI settings
          </button>
        </p>
      ) : (
        usage &&
        !outOfQuota && (
          <p className="mb-6 text-center text-xs text-gray-500">
            {usage.remaining} of {usage.limit} analyses left today ·{' '}
            <button onClick={onOpenSettings} className="underline hover:text-blue-700">
              use your own key
            </button>
          </p>
        )
      )}

      {!job && <Notice tone="warn">No job description found yet. Open a LinkedIn job posting first.</Notice>}
      {job && !hasEnoughDescription && (
        <Notice tone="warn">
          The job description is too short (at least {MIN_JOB_DESCRIPTION_CHARS} characters needed). Open a posting with a
          full description.
        </Notice>
      )}
      {outOfQuota && (
        <Notice tone="warn" action={{ label: 'Use your own key', onClick: onOpenSettings }}>
          You have used {dailyLimit ? `all ${dailyLimit}` : 'all'} of today&apos;s analyses. They reset at {quotaResetTime()}.
        </Notice>
      )}
      {error && (
        <Notice tone="error" action={error.keyProblem ? { label: 'Open AI settings', onClick: onOpenSettings } : undefined}>
          {error.message}
        </Notice>
      )}
    </div>
  );
};

export default StartSection;
