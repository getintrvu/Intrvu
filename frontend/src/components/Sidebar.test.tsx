import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import Sidebar from './Sidebar';

let profile: { avatarUrl: string | null; name: string | null; email: string | null } = {
  avatarUrl: 'https://lh3.googleusercontent.com/a/abc123=s96-c',
  name: 'Bhavik Rohit',
  email: 'bhavikrohit22@gmail.com',
};

vi.mock('../auth/AuthProvider', () => ({ useAuth: () => profile }));
vi.mock('./UserDropdown', () => ({ default: () => null }));

const noop = () => undefined;
const renderSidebar = () =>
  render(
    <Sidebar
      activeSection="start"
      onSectionChange={noop}
      analysisStarted={false}
      showUserDropdown={false}
      setShowUserDropdown={noop}
      showFeedbackMenu={false}
      setShowFeedbackMenu={noop}
      onOpenSettings={noop}
    />,
  );

it('shows the signed-in user\'s profile picture on the account button', () => {
  renderSidebar();
  const button = screen.getByRole('button', { name: 'Open user menu' });
  const img = button.querySelector('img');
  expect(img).not.toBeNull();
  expect(img).toHaveAttribute('src', 'https://lh3.googleusercontent.com/a/abc123=s96-c');
});

it('falls back to the initial of the name, then of the email', () => {
  profile = { avatarUrl: null, name: 'Bhavik Rohit', email: 'x@y.com' };
  const first = renderSidebar();
  expect(screen.getByRole('button', { name: 'Open user menu' })).toHaveTextContent('B');
  first.unmount();

  profile = { avatarUrl: null, name: null, email: 'zed@example.com' };
  renderSidebar();
  expect(screen.getByRole('button', { name: 'Open user menu' })).toHaveTextContent('Z');
});
