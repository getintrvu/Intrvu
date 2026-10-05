import { fireEvent, render, screen } from '@testing-library/react';
import Avatar from './Avatar';

const PICTURE = 'https://lh3.googleusercontent.com/a/abc123=s96-c';

it('shows the profile picture', () => {
  render(<Avatar url={PICTURE} name="Bhavik Rohit" />);
  const img = screen.getByRole('img', { name: "Bhavik Rohit's profile picture" });
  expect(img).toHaveAttribute('src', PICTURE);
  expect(img).toHaveAttribute('referrerpolicy', 'no-referrer');
  expect(img.className).toContain('rounded-full');
  expect(img.className).toContain('object-cover');
});

it('falls back to the initial when the picture cannot be loaded', () => {
  render(<Avatar url={PICTURE} name="bhavik rohit" />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.getByText('B')).toBeInTheDocument();
});

it('shows the initial when there is no picture', () => {
  render(<Avatar name="asha rao" />);
  expect(screen.getByText('A')).toBeInTheDocument();
});

it('shows a generic icon when there is neither a picture nor a name', () => {
  const { container } = render(<Avatar />);
  expect(container.querySelector('svg')).not.toBeNull();
});

it('only loads https pictures', () => {
  for (const url of ['http://example.com/a.png', 'javascript:alert(1)', 'data:image/png;base64,AAAA', '//cdn.example.com/a.png']) {
    const { unmount } = render(<Avatar url={url} name="Zed" />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
    expect(screen.getByText('Z')).toBeInTheDocument();
    unmount();
  }
});

it('gives a new picture a fresh chance after one failed', () => {
  const { rerender } = render(<Avatar url={PICTURE} name="Zed" />);
  fireEvent.error(screen.getByRole('img'));
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  rerender(<Avatar url="https://lh3.googleusercontent.com/a/other=s96-c" name="Zed" />);
  expect(screen.getByRole('img')).toBeInTheDocument();
});

it('can be sized by the caller', () => {
  render(<Avatar url={PICTURE} name="Zed" className="h-8 w-8" />);
  expect(screen.getByRole('img').className).toContain('h-8 w-8');
});
