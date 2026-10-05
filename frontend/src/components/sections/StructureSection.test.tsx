import { render, screen } from '@testing-library/react';
import StructureSection from './StructureSection';
import type { AnalysisData } from '../../types/AnalysisData';

const data = (atsIssues: { issue: string; detail: string; points: number }[]) =>
  ({
    job_fit_score: { label: 'Good Match' },
    resume_quality_score: { label: 'Needs Polish' },
    detailed_analysis: {
      resume_structure: {
        score: { pointsAwarded: 27, maxPoints: 30, rating: 'Excellent', completedMustHave: 4, totalMustHave: 4, completedNiceToHave: 3, totalNiceToHave: 7 },
        analysis: {
          sectionStatus: [
            { section: 'Work Experience', type: 'must-have', status: 'Completed' },
            { section: 'Certifications', type: 'nice-to-have', status: 'Missing' },
          ],
          missingRequiredSections: [],
          atsIssues,
          suggestedImprovements: 'Add a professional summary.',
        },
      },
    },
  }) as unknown as AnalysisData;

it('shows which sections are included, but no rating or coverage percentages (spec 12.4)', () => {
  render(<StructureSection analysisData={data([])} />);
  expect(screen.getByText('Work Experience')).toBeInTheDocument();
  expect(screen.getByText('Not included')).toBeInTheDocument();
  expect(screen.queryByText(/Coverage/)).not.toBeInTheDocument();
  expect(screen.queryByText(/%/)).not.toBeInTheDocument();
  expect(screen.queryByText('Excellent')).not.toBeInTheDocument();
  expect(screen.queryByText('Formatting issues')).not.toBeInTheDocument();
});

it('lists formatting issues in plain language when there are some', () => {
  render(
    <StructureSection
      analysisData={data([
        { issue: 'Multi-column or table layout', detail: 'Text sits side by side.', points: -1 },
        { issue: 'Non-standard section heading', detail: '"My Journey" may not be recognised.', points: -1 },
      ])}
    />,
  );
  expect(screen.getByText('Formatting issues')).toBeInTheDocument();
  expect(screen.getByText(/Multi-column or table layout\./)).toBeInTheDocument();
  expect(screen.getByText(/"My Journey" may not be recognised/)).toBeInTheDocument();
});
