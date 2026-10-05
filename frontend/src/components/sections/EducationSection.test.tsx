import { render, screen } from '@testing-library/react';
import EducationSection from './EducationSection';
import type { AnalysisData } from '../../types/AnalysisData';

const data = (degreeFound: string, fieldOfStudy: string, passed = true) =>
  ({
    job_fit_score: { label: 'Good Match' },
    resume_quality_score: { label: 'Needs Polish' },
    detailed_analysis: {
      education_certifications: {
        score: { pointsAwarded: passed ? 20 : 0, maxPoints: 20, rating: passed ? 'Requirement Met' : 'Requirement Not Met', passed },
        analysis: { degreeFound, fieldOfStudy, degreeType: "Bachelor's", suggestedImprovements: 'Add a degree.' },
      },
    },
  }) as unknown as AnalysisData;

describe('degree label', () => {
  it('does not repeat a field of study the degree text already contains', () => {
    render(<EducationSection analysisData={data('B.Tech in Computer Science and Engineering', 'Computer Science and Engineering')} />);
    expect(screen.getByText('B.Tech in Computer Science and Engineering')).toBeInTheDocument();
  });

  it('adds the field when the degree text does not name it', () => {
    render(<EducationSection analysisData={data('BCA', 'Computer Applications')} />);
    expect(screen.getByText('BCA in Computer Applications')).toBeInTheDocument();
  });

  it('keeps the in-progress note', () => {
    render(<EducationSection analysisData={data('B.Tech in Computer Science (in progress)', 'Computer Science')} />);
    expect(screen.getByText('B.Tech in Computer Science (in progress)')).toBeInTheDocument();
  });

  it('shows the suggestion instead when the requirement is not met', () => {
    render(<EducationSection analysisData={data('None', '', false)} />);
    expect(screen.getByText('Add a degree.')).toBeInTheDocument();
    expect(screen.getByText('No matched education found.')).toBeInTheDocument();
  });
});
