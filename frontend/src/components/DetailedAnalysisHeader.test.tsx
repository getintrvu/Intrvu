import { render, screen } from '@testing-library/react';
import DetailedAnalysisHeader from './DetailedAnalysisHeader';
import type { AnalysisData } from '../types/AnalysisData';

const data = (fit: string, quality: string) =>
  ({ job_fit_score: { label: fit }, resume_quality_score: { label: quality } }) as unknown as AnalysisData;

it('shows both results as compact badges with the exact labels (no shouting uppercase)', () => {
  render(<DetailedAnalysisHeader analysisData={data('Good Match', 'Ready to Impress')} />);
  expect(screen.getByText('Detailed Analysis')).toBeInTheDocument();
  expect(screen.getByText('Job Fit')).toBeInTheDocument();
  expect(screen.getByText('Resume Quality')).toBeInTheDocument();
  const good = screen.getByText('Good Match');
  expect(good.className).toContain('whitespace-nowrap'); // never wraps onto two lines
  expect(good.className).not.toContain('uppercase');
  expect(screen.getByText('Ready to Impress')).toBeInTheDocument();
});

it('colours the badge by tone', () => {
  const { rerender } = render(<DetailedAnalysisHeader analysisData={data('Good Match', 'Needs Polish')} />);
  expect(screen.getByText('Good Match').className).toContain('#dcfce7');
  expect(screen.getByText('Needs Polish').className).toContain('#fef3c7');
  rerender(<DetailedAnalysisHeader analysisData={data('Low Fit', 'Refine for Impact')} />);
  expect(screen.getByText('Low Fit').className).toContain('#fee2e2');
  expect(screen.getByText('Refine for Impact').className).toContain('#fee2e2');
});

it('renders a neutral placeholder while loading', () => {
  render(<DetailedAnalysisHeader analysisData={null} />);
  expect(screen.getAllByText('In Progress')).toHaveLength(2);
});
