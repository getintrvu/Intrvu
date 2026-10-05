import { getJobFitLabel, getResumeQualityLabel, getScoreSymbol, getScoreTone } from './scoreDisplay';

it('uses the same label boundaries as the backend', () => {
  expect([95, 90, 89, 75, 74, 60, 59].map(getJobFitLabel)).toEqual([
    'Great Match',
    'Great Match',
    'Good Match',
    'Good Match',
    'Moderate Match',
    'Moderate Match',
    'Low Fit',
  ]);
  expect([90, 89, 70, 69].map(getResumeQualityLabel)).toEqual([
    'Ready to Impress',
    'Needs Polish',
    'Needs Polish',
    'Refine for Impact',
  ]);
});

it('maps every backend label to a symbol and tone', () => {
  const labels = ['Great Match', 'Good Match', 'Moderate Match', 'Low Fit', 'Ready to Impress', 'Needs Polish', 'Refine for Impact'];
  for (const label of labels) {
    expect(getScoreSymbol(label)).not.toBe('ℹ️');
    expect(getScoreTone(label)).not.toBe('neutral');
  }
});
