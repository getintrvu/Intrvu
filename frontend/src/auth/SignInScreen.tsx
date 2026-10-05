import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import Logo from '../components/Logo';
import { TERMS_URL, missingConfig } from '../lib/config';

const SignInScreen = () => {
  const { signIn } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const missing = missingConfig();

  const handleSignIn = async () => {
    setBusy(true);
    setError(null);
    try {
      await signIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex h-full w-full flex-col items-center justify-center bg-white px-8 text-center">
      <Logo />
      <h1 className="mt-8 text-xl font-bold text-slate-800">See how well you fit the job</h1>
      <p className="mt-2 max-w-xs text-sm text-slate-500">
        Sign in to analyze your resume against any LinkedIn job posting.
      </p>

      <button
        onClick={handleSignIn}
        disabled={busy || missing.length > 0}
        className="mt-6 flex w-full max-w-xs items-center justify-center gap-3 rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm transition hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <GoogleMark />}
        {busy ? 'Waiting for Google…' : 'Continue with Google'}
      </button>

      {error && (
        <p role="alert" className="mt-4 max-w-xs rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          {error}
        </p>
      )}
      {missing.length > 0 && (
        <p role="alert" className="mt-4 max-w-xs rounded-lg border border-orange-200 bg-orange-50 p-3 text-xs text-orange-700">
          This build is missing configuration: {missing.join(', ')}.
        </p>
      )}

      <p className="mt-6 max-w-xs text-xs leading-relaxed text-gray-400">
        Your resume is sent to our server and processed by Google Gemini to produce your analysis. We do not
        store your resume or the job posting. By continuing you agree to the{' '}
        <a href={TERMS_URL} target="_blank" rel="noreferrer" className="underline">
          Terms &amp; Privacy Policy
        </a>
        .
      </p>
    </div>
  );
};

const GoogleMark = () => (
  <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden="true">
    <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
    <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
    <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
  </svg>
);

export default SignInScreen;
