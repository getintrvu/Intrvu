import { render, screen } from '@testing-library/react';
import ResultsView from './ResultsView';
import type { AnalysisData } from '../../types/AnalysisData';

const data = (fit: number, fitLabel: string, q: number, qLabel: string) =>
  ({
    job_fit_score: { percentage: fit, label: fitLabel },
    resume_quality_score: { percentage: q, label: qLabel },
    detailed_analysis: {
      keyword_match: { analysis: { suggestedImprovements: 'Add Kubernetes.' } },
      resume_structure: { analysis: { suggestedImprovements: 'Add a summary.' } },
    },
  }) as unknown as AnalysisData;

it('shows each percentage as text next to the bar rather than floating over it', () => {
  const { container } = render(<ResultsView analysisData={data(43, 'Low Fit', 42, 'Refine for Impact')} />);
  const bars = screen.getAllByRole('progressbar');
  expect(bars.map((b) => b.getAttribute('aria-valuenow'))).toEqual(['43', '42']);
  // the old label was absolutely positioned and overlapped the 50% tick
  expect(container.querySelectorAll('.absolute')).toHaveLength(0);
});

it('uses the same badge style as the detail tabs', () => {
  render(<ResultsView analysisData={data(43, 'Low Fit', 42, 'Refine for Impact')} />);
  for (const label of ['Low Fit', 'Refine for Impact']) {
    const badge = screen.getByText(label);
    expect(badge.className).toContain('whitespace-nowrap');
    expect(badge.className).toContain('#fee2e2');
    expect(badge.className).not.toContain('uppercase');
  }
});

it('clamps out-of-range scores and shows the tips', () => {
  render(<ResultsView analysisData={data(140, 'Great Match', -5, 'Needs Polish')} />);
  expect(screen.getAllByRole('progressbar').map((b) => b.getAttribute('aria-valuenow'))).toEqual(['100', '0']);
  expect(screen.getByText(/Add Kubernetes\./)).toBeInTheDocument();
  expect(screen.getByText(/Add a summary\./)).toBeInTheDocument();
});
