import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import StartSection from './StartSection';
import { ApiError } from '../../api/client';
import { quotaResetTime } from '../../lib/quota';

const analyzeResume = vi.fn();
let usage: { used: number; limit: number; remaining: number } | null = null;
let byok: { provider: 'gemini'; apiKey: string } | null = null;
let cachedEntry: { key: string; savedAt: number; data: unknown } | null = null;

const job = { url: 'u', jobTitle: 'AI Engineer', company: 'Acme', location: '', jobDescription: 'Build things. '.repeat(20), timestamp: 1 };

vi.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ getToken: async () => 'token' }) }));
vi.mock('../../hooks/useJobData', () => ({ useJobData: () => job }));
vi.mock('../../hooks/useUsage', () => ({ useUsage: () => ({ usage, refresh: vi.fn() }) }));
vi.mock('../../hooks/useByok', () => ({ useByok: () => ({ byok, loaded: true }) }));
vi.mock('../../lib/resumeStore', () => ({
  loadResume: async () => new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' }),
  saveResume: async () => undefined,
  clearResume: async () => undefined,
}));
vi.mock('../../lib/analysisCache', () => ({
  analysisKey: async () => 'key',
  getCachedAnalysis: async () => cachedEntry,
  saveAnalysis: async () => undefined,
}));
vi.mock('../../api/client', async (original) => ({
  ...(await original<typeof import('../../api/client')>()),
  analyzeResume: (...args: unknown[]) => analyzeResume(...args),
}));

const renderStart = () => render(<StartSection onResult={vi.fn()} onOpenSettings={vi.fn()} />);
const mainButton = () => screen.getByRole('button', { name: /Analyze|Daily limit reached|View saved result/ });
const waitForResume = () => screen.findByText('cv.pdf');

beforeEach(() => {
  analyzeResume.mockReset();
  usage = { used: 3, limit: 10, remaining: 7 };
  byok = null;
  cachedEntry = null;
});

describe('when the daily analyses are used up', () => {
  beforeEach(() => {
    usage = { used: 10, limit: 10, remaining: 0 };
  });

  it('disables the button and says so on it', async () => {
    renderStart();
    await waitForResume();
    expect(mainButton()).toBeDisabled();
    expect(mainButton()).toHaveTextContent('Daily limit reached');
  });

  it('shows exactly one message, with the limit and when it resets', async () => {
    renderStart();
    await waitForResume();
    expect(screen.getAllByRole('status')).toHaveLength(1);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    const notice = screen.getByRole('status');
    expect(notice).toHaveTextContent('all 10 of today');
    expect(notice).toHaveTextContent(quotaResetTime());
    expect(screen.queryByText(/0 of 10 analyses left/)).not.toBeInTheDocument(); // no third line saying the same
  });

  it('offers to use your own key, which is not limited', async () => {
    renderStart();
    await waitForResume();
    expect(screen.getByRole('button', { name: 'Use your own key' })).toBeInTheDocument();
  });

  it('does not block people using their own key', async () => {
    byok = { provider: 'gemini', apiKey: 'AIzaSyD-example-key-0123456789abcdef' };
    renderStart();
    await waitForResume();
    expect(mainButton()).toBeEnabled();
    expect(mainButton()).toHaveTextContent('Analyze');
    expect(screen.queryByText(/of today.s analyses/)).not.toBeInTheDocument();
  });

  it('still lets you view a saved result (that costs nothing) but not run a fresh one', async () => {
    cachedEntry = { key: 'key', savedAt: Date.now(), data: {} };
    renderStart();
    await screen.findByRole('button', { name: 'View saved result' });
    expect(mainButton()).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Run a fresh analysis' })).toBeDisabled();
  });
});

describe('when the server says the limit is reached but the count had not caught up', () => {
  it('shows one message (not a red error on top of a warning) and disables the button', async () => {
    analyzeResume.mockRejectedValue(new ApiError(429, 'quota_exceeded', 'You have used all 10 analyses for today. Come back tomorrow.'));
    renderStart();
    await waitForResume();
    expect(mainButton()).toBeEnabled();

    fireEvent.click(mainButton());

    await waitFor(() => expect(mainButton()).toBeDisabled());
    expect(mainButton()).toHaveTextContent('Daily limit reached');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('lifts the block once the usage count shows analyses are available again (a new day)', async () => {
    analyzeResume.mockRejectedValue(new ApiError(429, 'quota_exceeded', 'used up'));
    const { rerender } = renderStart();
    await waitForResume();
    fireEvent.click(mainButton());
    await waitFor(() => expect(mainButton()).toBeDisabled());

    usage = { used: 0, limit: 10, remaining: 10 }; // after midnight UTC
    rerender(<StartSection onResult={vi.fn()} onOpenSettings={vi.fn()} />);

    await waitFor(() => expect(mainButton()).toBeEnabled());
    expect(mainButton()).toHaveTextContent('Analyze');
  });
});

it('still shows other problems as an error', async () => {
  analyzeResume.mockRejectedValue(new ApiError(400, 'invalid_pdf', 'That file is not a valid PDF.'));
  renderStart();
  await waitForResume();
  fireEvent.click(mainButton());
  expect(await screen.findByRole('alert')).toHaveTextContent('That file is not a valid PDF.');
  expect(mainButton()).toBeEnabled();
});
