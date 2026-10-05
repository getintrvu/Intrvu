import { SCORING_VERSION, analysisKey, clearAnalysisCache, getCachedAnalysis, saveAnalysis } from './analysisCache';
import type { AnalysisData } from '../types/AnalysisData';

const pdf = (text: string) => new File([text], 'cv.pdf', { type: 'application/pdf' });
const result = (label: string) => ({ version: SCORING_VERSION, job_fit_score: { label } }) as unknown as AnalysisData;

beforeEach(() => clearAnalysisCache());

describe('analysisKey', () => {
  it('is the same for the same resume bytes and job text, whatever the file name or spacing', async () => {
    const a = await analysisKey(pdf('resume-bytes'), 'We need a Python engineer.\n\nRemote');
    const b = await analysisKey(new File(['resume-bytes'], 'other-name.pdf'), '  we need a  PYTHON engineer. remote ');
    expect(a).toBe(b);
  });

  it('changes when the resume or the job description changes', async () => {
    const base = await analysisKey(pdf('resume-1'), 'job text');
    expect(await analysisKey(pdf('resume-2'), 'job text')).not.toBe(base);
    expect(await analysisKey(pdf('resume-1'), 'different job text')).not.toBe(base);
  });

  it('includes the scoring version so rule changes invalidate old results', async () => {
    expect(await analysisKey(pdf('x'), 'y')).toMatch(new RegExp(`^${SCORING_VERSION}:`));
  });
});

describe('saved results', () => {
  it('returns what was saved and null for unknown keys', async () => {
    await saveAnalysis('k1', result('Good Match'));
    expect((await getCachedAnalysis('k1'))!.data.job_fit_score.label).toBe('Good Match');
    expect(await getCachedAnalysis('nope')).toBeNull();
  });

  it('replaces an existing entry for the same key', async () => {
    await saveAnalysis('k1', result('Low Fit'));
    await saveAnalysis('k1', result('Great Match'));
    expect((await getCachedAnalysis('k1'))!.data.job_fit_score.label).toBe('Great Match');
  });

  it('keeps only the 20 most recent results', async () => {
    for (let i = 0; i < 25; i++) await saveAnalysis(`k${i}`, result(`r${i}`));
    expect(await getCachedAnalysis('k0')).toBeNull();
    expect(await getCachedAnalysis('k24')).not.toBeNull();
    expect(await getCachedAnalysis('k5')).not.toBeNull();
  });

  it('is emptied by clearAnalysisCache', async () => {
    await saveAnalysis('k1', result('x'));
    await clearAnalysisCache();
    expect(await getCachedAnalysis('k1')).toBeNull();
  });
});
