import { jobKey } from './jobKey';

const POSTING = 'We are hiring a Junior AI Engineer to build LLM features in Python.\n\nRequirements: Python, SQL.';

it('is the same for the same posting however the whitespace or case differs', () => {
  expect(jobKey(POSTING)).toBe(jobKey(`  ${POSTING.toUpperCase().replace(/\n+/g, '   ')}  `));
});

it('differs between different postings, even similar ones', () => {
  const other = POSTING.replace('Junior', 'Senior');
  const keys = new Set([jobKey(POSTING), jobKey(other), jobKey(POSTING + ' Remote.'), jobKey('')]);
  expect(keys.size).toBe(4);
});

it('is short and stable', () => {
  const key = jobKey(POSTING.repeat(200));
  expect(key.length).toBeLessThan(24);
  expect(jobKey(POSTING.repeat(200))).toBe(key);
});
