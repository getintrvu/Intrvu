import { act, renderHook } from '@testing-library/react';
import { useAnalysisSession } from './useAnalysisSession';
import type { AnalysisData } from '../types/AnalysisData';

const result = (title: string) => ({ job_context: { title } }) as unknown as AnalysisData;

const setup = (initialKey: string | null) =>
  renderHook(({ key }: { key: string | null }) => useAnalysisSession(key), { initialProps: { key: initialKey } });

it('starts on the start screen with no results', () => {
  const { result: r } = setup('job-a');
  expect(r.current.section).toBe('start');
  expect(r.current.analysisData).toBeNull();
  expect(r.current.analysisStarted).toBe(false);
});

it('shows the results screen once an analysis finishes', () => {
  const { result: r } = setup('job-a');
  act(() => r.current.showResult(result('Job A'), 'job-a'));
  expect(r.current.section).toBe('results');
  expect(r.current.analysisStarted).toBe(true);
  expect(r.current.analysisData?.job_context.title).toBe('Job A');
});

it('clears the old results and returns to the start screen when a different job appears (the reported bug)', () => {
  const { result: r, rerender } = setup('job-a');
  act(() => r.current.showResult(result('Job A'), 'job-a'));
  act(() => r.current.setSection('keywords')); // the user is deep in the detail tabs

  rerender({ key: 'job-b' });

  expect(r.current.analysisData).toBeNull();
  expect(r.current.analysisStarted).toBe(false);
  expect(r.current.section).toBe('start');
});

it('keeps the results when the same job is seen again', () => {
  const { result: r, rerender } = setup('job-a');
  act(() => r.current.showResult(result('Job A'), 'job-a'));
  rerender({ key: 'job-a' });
  expect(r.current.analysisData).not.toBeNull();
  expect(r.current.section).toBe('results');
});

it('keeps the results while no job is detected (mid-navigation) and when the same job comes back', () => {
  const { result: r, rerender } = setup('job-a');
  act(() => r.current.showResult(result('Job A'), 'job-a'));
  rerender({ key: null });
  expect(r.current.analysisData).not.toBeNull();
  rerender({ key: 'job-a' });
  expect(r.current.analysisData).not.toBeNull();
});

it('does not touch the screen when there are no results to clear', () => {
  const { result: r, rerender } = setup('job-a');
  act(() => r.current.setSection('start'));
  rerender({ key: 'job-b' });
  expect(r.current.section).toBe('start');
});

it('drops results that arrive for a job the user has already left', () => {
  // Analyze was clicked on job A; the user moved on to job B while it ran.
  const { result: r } = setup('job-b');
  act(() => r.current.showResult(result('Job A'), 'job-a'));
  expect(r.current.analysisData).toBeNull();
  expect(r.current.section).toBe('start');
});

it('can be cleared explicitly (Upload new resume)', () => {
  const { result: r } = setup('job-a');
  act(() => r.current.showResult(result('Job A'), 'job-a'));
  act(() => r.current.clearResult());
  expect(r.current.analysisData).toBeNull();
  expect(r.current.section).toBe('start');
});
