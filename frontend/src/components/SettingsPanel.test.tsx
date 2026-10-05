import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, vi } from 'vitest';
import SettingsPanel from './SettingsPanel';
import { ApiError } from '../api/client';
import { clearByok, getByok, saveByok } from '../lib/byok';

const checkKey = vi.fn();

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ getToken: async () => 'token' }) }));
vi.mock('../hooks/useUsage', () => ({
  useUsage: () => ({ usage: { used: 3, limit: 10, remaining: 7 }, refresh: vi.fn() }),
}));
vi.mock('../api/client', async (original) => ({
  ...(await original<typeof import('../api/client')>()),
  checkKey: (...args: unknown[]) => checkKey(...args),
}));

const KEY = 'AIzaSyD-example-key-0123456789abcdef';

beforeEach(async () => {
  checkKey.mockReset();
  await clearByok();
});

const openOwnKey = () => fireEvent.click(screen.getByRole('radio', { name: /My own API key/ }));

it('starts on IntrvuFit AI with the remaining quota and no key fields', () => {
  render(<SettingsPanel onClose={() => undefined} />);
  expect(screen.getByRole('radio', { name: /IntrvuFit AI/ })).toHaveAttribute('aria-checked', 'true');
  expect(screen.getByText(/7 of 10 analyses left today/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/API key/)).not.toBeInTheDocument();
});

it('keeps the key hidden by default and prevents password-manager autofill', () => {
  render(<SettingsPanel onClose={() => undefined} />);
  openOwnKey();
  const input = screen.getByLabelText(/Gemini API key/);
  expect(input).toHaveAttribute('type', 'password');
  expect(input).toHaveAttribute('autocomplete', 'new-password');
  fireEvent.click(screen.getByRole('button', { name: 'Show key' }));
  expect(input).toHaveAttribute('type', 'text');
});

it('verifies the key with the server before saving it, then stores it', async () => {
  checkKey.mockResolvedValue({ ok: true, provider: 'gemini', model: 'gemini-3.5-flash-lite' });
  render(<SettingsPanel onClose={() => undefined} />);
  openOwnKey();
  fireEvent.change(screen.getByLabelText(/Gemini API key/), { target: { value: `  ${KEY}  ` } });
  fireEvent.click(screen.getByRole('button', { name: 'Test & save key' }));

  await waitFor(() => expect(screen.getByText(/Your Gemini key works/)).toBeInTheDocument());
  expect(checkKey).toHaveBeenCalledWith('token', { provider: 'gemini', apiKey: KEY, model: undefined });
  expect(await getByok()).toEqual({ provider: 'gemini', apiKey: KEY });
  expect(screen.getByLabelText(/Gemini API key/)).toHaveValue(''); // the field is cleared after saving
});

it('does not save a key the server rejects, and shows why', async () => {
  checkKey.mockRejectedValue(new ApiError(400, 'llm_key_rejected', 'Gemini rejected your API key. Check it in Settings.'));
  render(<SettingsPanel onClose={() => undefined} />);
  openOwnKey();
  fireEvent.change(screen.getByLabelText(/Gemini API key/), { target: { value: KEY } });
  fireEvent.click(screen.getByRole('button', { name: 'Test & save key' }));

  expect(await screen.findByRole('alert')).toHaveTextContent('Gemini rejected your API key');
  expect(await getByok()).toBeNull();
});

it('switches provider, resets the model and passes the right provider to the check', async () => {
  checkKey.mockResolvedValue({ ok: true, provider: 'openai', model: 'gpt-4o' });
  render(<SettingsPanel onClose={() => undefined} />);
  openOwnKey();
  fireEvent.click(screen.getByRole('radio', { name: 'OpenAI' }));
  expect(screen.getByPlaceholderText('gpt-4o-mini')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText(/OpenAI API key/), { target: { value: 'sk-proj-abcdefghijklmnopqrstuvwxyz' } });
  fireEvent.change(screen.getByLabelText(/Model/), { target: { value: 'gpt-4o' } });
  fireEvent.click(screen.getByRole('button', { name: 'Test & save key' }));

  await waitFor(() => expect(checkKey).toHaveBeenCalled());
  expect(checkKey).toHaveBeenCalledWith('token', { provider: 'openai', apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz', model: 'gpt-4o' });
  await waitFor(async () => expect((await getByok())?.model).toBe('gpt-4o'));
});

it('asks for a key instead of calling the server when the field is empty', () => {
  render(<SettingsPanel onClose={() => undefined} />);
  openOwnKey();
  fireEvent.click(screen.getByRole('button', { name: 'Test & save key' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Paste your Gemini API key first.');
  expect(checkKey).not.toHaveBeenCalled();
});

it('shows a saved key masked and can remove it', async () => {
  await saveByok({ provider: 'openai', apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz' });
  render(<SettingsPanel onClose={() => undefined} />);
  await screen.findByText(/Using your OpenAI key sk-p…wxyz/);
  expect(screen.queryByText(/abcdefghijklmnop/)).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole('button', { name: 'Remove' }));
  await waitFor(async () => expect(await getByok()).toBeNull());
  expect(screen.getByText(/Analyses use IntrvuFit AI again/)).toBeInTheDocument();
});

it('goes back', () => {
  const onClose = vi.fn();
  render(<SettingsPanel onClose={onClose} />);
  fireEvent.click(screen.getByRole('button', { name: 'Back' }));
  expect(onClose).toHaveBeenCalled();
});
