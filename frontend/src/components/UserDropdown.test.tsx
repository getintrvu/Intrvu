import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import UserDropdown from './UserDropdown';

const signOut = vi.fn();

vi.mock('../auth/AuthProvider', () => ({
  useAuth: () => ({ email: 'bhavikrohit22@gmail.com', signOut, getToken: async () => 't' }),
}));
vi.mock('../hooks/useUsage', () => ({
  useUsage: () => ({ usage: { used: 6, limit: 10, remaining: 4 }, refresh: vi.fn() }),
}));

it('opens leftwards from the right edge so it cannot run off the panel', () => {
  render(<UserDropdown onClose={() => undefined} />);
  const menu = screen.getByRole('menu');
  expect(menu.className).toContain('right-2');
  expect(menu.className).not.toContain('left-');
  expect(menu.className).toContain('max-w-[calc(100vw-1rem)]');
});

it('shows the account, the quota and the actions', () => {
  render(<UserDropdown onClose={() => undefined} />);
  expect(screen.getByText('bhavikrohit22@gmail.com')).toBeInTheDocument();
  expect(screen.getByText('4 of 10 analyses left')).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Sign out' })).toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: /Delete my IntrvuFit data/ })).toBeInTheDocument();
});

it('asks for confirmation before deleting and can be cancelled', () => {
  render(<UserDropdown onClose={() => undefined} />);
  fireEvent.click(screen.getByRole('menuitem', { name: /Delete my IntrvuFit data/ }));
  expect(screen.getByText(/Your account stays active/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByText(/Your account stays active/)).not.toBeInTheDocument();
});

it('closes on Escape and signs out on request', () => {
  const onClose = vi.fn();
  render(<UserDropdown onClose={onClose} />);
  fireEvent.keyDown(document, { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('menuitem', { name: 'Sign out' }));
  expect(signOut).toHaveBeenCalled();
});
