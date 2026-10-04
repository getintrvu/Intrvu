import { afterEach, beforeEach, vi } from 'vitest';
import { ApiError, analyzeResume, toJobPayload, userMessage } from './client';
import type { JobData } from '../types/JobData';

const job: JobData = {
  url: 'https://www.linkedin.com/jobs/view/1/',
  jobTitle: 'Engineer',
  company: 'Acme',
  location: '',
  jobDescription: 'x'.repeat(150),
  timestamp: 1,
};
const file = new File(['%PDF-1.4'], 'cv.pdf', { type: 'application/pdf' });

const respond = (status: number, body: unknown) =>
  vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify(body), { status }));

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('analyzeResume', () => {
  it('sends the PDF and mapped job data with a bearer token', async () => {
    const spy = respond(200, { version: 'v5.0' });
    await analyzeResume(file, job, 'tok');
    const [url, init] = spy.mock.calls[0];
    expect(String(url)).toMatch(/\/api\/v1\/analyze$/);
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const form = init!.body as FormData;
    expect(form.get('resume')).toBeInstanceOf(File);
    expect(JSON.parse(String(form.get('jobData')))).toEqual({
      jobTitle: 'Engineer',
      company: 'Acme',
      description: job.jobDescription,
      url: job.url,
    });
  });

  it('turns API error bodies into ApiError with the server code and message', async () => {
    respond(429, { error: { code: 'quota_exceeded', message: 'All used.' } });
    await expect(analyzeResume(file, job, 't')).rejects.toMatchObject({
      status: 429,
      code: 'quota_exceeded',
      message: 'All used.',
    });
  });

  it('copes with non-JSON error bodies', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('<html>Bad gateway</html>', { status: 502 }));
    await expect(analyzeResume(file, job, 't')).rejects.toMatchObject({ status: 502, code: 'unknown' });
  });

  it('reports network failures in plain language', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(analyzeResume(file, job, 't')).rejects.toMatchObject({ code: 'network' });
  });
});

describe('userMessage', () => {
  it('maps an expired session to a sign-in prompt', () => {
    expect(userMessage(new ApiError(401, 'unauthorized', 'raw'))).toMatch(/sign in again/i);
  });

  it('passes server messages through and hides unknown errors', () => {
    expect(userMessage(new ApiError(400, 'invalid_pdf', 'Not a PDF'))).toBe('Not a PDF');
    expect(userMessage('weird')).toMatch(/something went wrong/i);
  });
});

it('toJobPayload only includes what the API accepts', () => {
  expect(Object.keys(toJobPayload(job)).sort()).toEqual(['company', 'description', 'jobTitle', 'url']);
});
