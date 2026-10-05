import { render, screen } from '@testing-library/react';
import EducationSection from './EducationSection';
import type { AnalysisData } from '../../types/AnalysisData';

const data = (degreeFound: string, fieldOfStudy: string, passed = true, extra: Record<string, unknown> = {}) =>
  ({
    job_fit_score: { label: 'Good Match' },
    resume_quality_score: { label: 'Needs Polish' },
    detailed_analysis: {
      education_certifications: {
        score: { pointsAwarded: passed ? 20 : 0, maxPoints: 20, rating: passed ? 'Requirement Met' : 'Requirement Not Met', passed },
        analysis: { degreeFound, fieldOfStudy, degreeType: "Bachelor's", suggestedImprovements: 'Add a degree.', required: true, requiredField: '', ...extra },
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


describe('what the job asks for', () => {
  it('says there is no penalty when the job does not ask for a degree', () => {
    render(<EducationSection analysisData={data('None', '', true, { required: false })} />);
    expect(screen.getByText(/does not ask for a degree, so there is no education penalty/)).toBeInTheDocument();
    expect(screen.getByText('No degree listed, and none is required.')).toBeInTheDocument();
    expect(screen.queryByText('No matched education found.')).not.toBeInTheDocument();
  });

  it('still shows a degree that is listed when none is required', () => {
    render(<EducationSection analysisData={data('B.Sc. in Biology', 'Biology', true, { required: false })} />);
    expect(screen.getByText('B.Sc. in Biology')).toBeInTheDocument();
  });

  it('mentions the field of study the posting names', () => {
    render(<EducationSection analysisData={data('B.Com', 'Commerce', false, { requiredField: 'Computer Science' })} />);
    expect(screen.getByText('Computer Science')).toBeInTheDocument();
    expect(screen.getByText(/The posting asks for a degree in/)).toBeInTheDocument();
  });
});
