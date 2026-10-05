import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import UserDropdown from './UserDropdown';

const signOut = vi.fn();
let byok: { provider: 'gemini' | 'openai'; apiKey: string } | null = null;

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ email: 'bhavikrohit22@gmail.com', signOut, getToken: async () => 't' }),
}));
vi.mock('../hooks/useUsage', () => ({
  useUsage: () => ({ usage: { used: 6, limit: 10, remaining: 4 }, refresh: vi.fn() }),
}));
vi.mock('../hooks/useByok', () => ({ useByok: () => ({ byok, loaded: true }) }));

const open = (props: Partial<{ onClose: () => void; onOpenSettings: () => void }> = {}) =>
  render(<UserDropdown onClose={props.onClose ?? (() => undefined)} onOpenSettings={props.onOpenSettings ?? (() => undefined)} />);

beforeEach(() => {
  byok = null;
});

it('opens leftwards from the right edge so it cannot run off the panel', () => {
  open();
  const menu = screen.getByRole('menu');
  expect(menu.className).toContain('right-2');
  expect(menu.className).not.toContain('left-');
  expect(menu.className).toContain('max-w-[calc(100vw-1rem)]');
});

it('shows the account, the quota and the actions', () => {
  open();
  expect(screen.getByText('bhavikrohit22@gmail.com')).toBeInTheDocument();
  expect(screen.getByText('4 of 10 analyses left')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'AI settings' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Delete my IntrvuFit data/ })).toBeInTheDocument();
});

it('opens the AI settings', () => {
  const onOpenSettings = vi.fn();
  open({ onOpenSettings });
  fireEvent.click(screen.getByRole('menuitem', { name: 'AI settings' }));
  expect(onOpenSettings).toHaveBeenCalled();
});

it('says so instead of showing the daily quota when the user brings their own key', () => {
  byok = { provider: 'openai', apiKey: 'sk-abcdefghijklmnopqrstuv' };
  open();
  expect(screen.getByText(/Using your own OpenAI key/)).toBeInTheDocument();
  expect(screen.queryByText('4 of 10 analyses left')).not.toBeInTheDocument();
});

it('asks for confirmation before deleting and can be cancelled', () => {
  open();
  fireEvent.click(screen.getByRole('menuitem', { name: /Delete my IntrvuFit data/ }));
  expect(screen.getByText(/Your account\s+stays active/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText(/Your account\s+stays active/)).not.toBeInTheDocument();
});

it('closes on Escape and signs out on request', () => {
  const onClose = vi.fn();
  open({ onClose });
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalled();
});
