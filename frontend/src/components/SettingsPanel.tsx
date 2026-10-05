import React, { useState } from 'react';
import { ArrowLeft, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Sparkles } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider';
import { checkKey, userMessage } from '../api/client';
import { useByok } from '../hooks/useByok';
import { PROVIDERS, clearByok, maskKey, saveByok, type Provider } from '../lib/byok';
import { useUsage } from '../hooks/useUsage';

interface SettingsPanelProps {
  onClose: () => void;
}

type Status = { kind: 'idle' } | { kind: 'checking' } | { kind: 'ok'; message: string } | { kind: 'error'; message: string };

const optionClass = (selected: boolean) =>
  `flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
    selected ? 'border-[#4f46e5] bg-[#eef2ff]' : 'border-gray-200 bg-white hover:bg-gray-50'
  }`;

const SettingsPanel: React.FC<SettingsPanelProps> = ({ onClose }) => {
  const { getToken } = useAuth();
  const { byok } = useByok();
  const { usage } = useUsage();

  const [useOwnKey, setUseOwnKey] = useState<boolean | null>(null); // null: follow the saved setting
  const [provider, setProvider] = useState<Provider | null>(null);
  const [apiKey, setApiKey] = useState('');
  const [model, setModel] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: 'idle' });

  const own = useOwnKey ?? !!byok;
  const chosenProvider: Provider = provider ?? byok?.provider ?? 'gemini';
  const chosenModel = model ?? byok?.model ?? '';
  const info = PROVIDERS[chosenProvider];
  const busy = status.kind === 'checking';

  const handleSave = async () => {
    const candidate = { provider: chosenProvider, apiKey: apiKey.trim(), model: chosenModel.trim() || undefined };
    if (!candidate.apiKey) return setStatus({ kind: 'error', message: `Paste your ${info.label} API key first.` });
    setStatus({ kind: 'checking' });
    try {
      const result = await checkKey(await getToken(), candidate);
      await saveByok(candidate);
      setApiKey('');
      setStatus({ kind: 'ok', message: `Your ${info.label} key works (${result.model}). Analyses will use it from now on.` });
    } catch (err) {
      setStatus({ kind: 'error', message: userMessage(err) });
    }
  };

  const handleRemove = async () => {
    await clearByok();
    setUseOwnKey(false);
    setApiKey('');
    setStatus({ kind: 'ok', message: 'Your key was removed from this browser. Analyses use IntrvuFit AI again.' });
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col overflow-y-auto bg-white">
      <header className="flex items-center gap-2 border-b border-gray-100 px-3 py-3">
        <button
          onClick={onClose}
          className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
          aria-label="Back"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-bold text-[#1e293b]">AI settings</h1>
      </header>

      <div className="space-y-4 px-4 py-4">
        <p className="text-[13px] leading-relaxed text-gray-500">Choose which AI analyzes your resume.</p>

        <div className="space-y-2" role="radiogroup" aria-label="AI source">
          <button role="radio" aria-checked={!own} onClick={() => setUseOwnKey(false)} className={optionClass(!own)}>
            <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#4f46e5]" />
            <span>
              <span className="block text-sm font-semibold text-gray-800">IntrvuFit AI</span>
              <span className="block text-xs text-gray-500">
                Built in, nothing to set up.
                {usage ? ` ${usage.remaining} of ${usage.limit} analyses left today.` : ''}
              </span>
            </span>
          </button>

          <button role="radio" aria-checked={own} onClick={() => setUseOwnKey(true)} className={optionClass(own)}>
            <KeyRound className="mt-0.5 h-4 w-4 flex-shrink-0 text-[#4f46e5]" />
            <span>
              <span className="block text-sm font-semibold text-gray-800">My own API key</span>
              <span className="block text-xs text-gray-500">Use your Gemini or OpenAI account. No daily limit from us; your provider bills you.</span>
            </span>
          </button>
        </div>

        {own && (
          <div className="space-y-3 rounded-xl border border-gray-200 p-3">
            {byok && (
              <div className="flex items-center justify-between gap-2 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-800">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4" />
                  Using your {PROVIDERS[byok.provider].label} key {maskKey(byok.apiKey)}
                </span>
                <button onClick={() => void handleRemove()} className="font-medium underline hover:text-green-950">
                  Remove
                </button>
              </div>
            )}

            <fieldset>
              <legend className="mb-1.5 text-xs font-medium text-gray-600">Provider</legend>
              <div className="grid grid-cols-2 gap-2">
                {(Object.keys(PROVIDERS) as Provider[]).map((id) => (
                  <button
                    key={id}
                    role="radio"
                    aria-checked={chosenProvider === id}
                    onClick={() => {
                      setProvider(id);
                      setModel('');
                      setStatus({ kind: 'idle' });
                    }}
                    className={`rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                      chosenProvider === id ? 'border-[#4f46e5] bg-[#eef2ff] text-[#4338ca]' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {PROVIDERS[id].label}
                  </button>
                ))}
              </div>
            </fieldset>

            <div>
              <label htmlFor="byok-key" className="mb-1.5 block text-xs font-medium text-gray-600">
                {info.label} API key
              </label>
              <div className="relative">
                <input
                  id="byok-key"
                  // "new-password" and the extra attributes stop browsers and password managers from
                  // autofilling an unrelated saved login into this field.
                  type={showKey ? 'text' : 'password'}
                  autoComplete="new-password"
                  spellCheck={false}
                  data-lpignore="true"
                  data-1p-ignore="true"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setStatus({ kind: 'idle' });
                  }}
                  placeholder={byok && byok.provider === chosenProvider ? 'Paste a new key to replace' : info.keyExample}
                  className="w-full rounded-lg border border-gray-300 py-2 pl-3 pr-10 font-mono text-[13px] focus:border-[#4f46e5] focus:outline-none focus:ring-2 focus:ring-[#c7d2fe]"
                />
                <button
                  type="button"
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                >
                  {showKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <a href={info.keyUrl} target="_blank" rel="noreferrer noopener" className="mt-1 inline-block text-xs text-[#4f46e5] underline">
                Get a {info.label} API key
              </a>
            </div>

            <div>
              <label htmlFor="byok-model" className="mb-1.5 block text-xs font-medium text-gray-600">
                Model <span className="font-normal text-gray-400">(optional)</span>
              </label>
              <input
                id="byok-model"
                type="text"
                autoComplete="off"
                spellCheck={false}
                value={chosenModel}
                onChange={(e) => {
                  setModel(e.target.value);
                  setStatus({ kind: 'idle' });
                }}
                placeholder={info.defaultModel}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-[13px] focus:border-[#4f46e5] focus:outline-none focus:ring-2 focus:ring-[#c7d2fe]"
              />
              <p className="mt-1 text-xs text-gray-400">Leave blank to use {info.defaultModel}.</p>
            </div>

            <button
              onClick={() => void handleSave()}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#4f46e5] px-4 py-2.5 text-sm font-medium text-white hover:bg-[#4338ca] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Checking your key…' : 'Test & save key'}
            </button>
          </div>
        )}

        <div aria-live="polite">
          {status.kind === 'ok' && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-xs text-green-800">{status.message}</p>}
          {status.kind === 'error' && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-700">{status.message}</p>}
        </div>

        <p className="text-[11px] leading-relaxed text-gray-400">
          Your key is stored only in this browser and removed when you sign out. It is sent to our server with each analysis so we
          can call your provider for you; we never store or log it. Use a key you can revoke, and set a spending limit with your
          provider.
        </p>
      </div>
    </div>
  );
};

export default SettingsPanel;
