import { afterEach, beforeEach, vi } from 'vitest';
import { ApiError, KEY_ERROR_CODES, analyzeResume, checkKey, toJobPayload, userMessage } from './client';
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
  vi.spyOn(globalThis, 'fetch').mockImplementation(async () => new Response(JSON.stringify(body), { status }));

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

describe('bring your own key', () => {
  const byok = { provider: 'openai' as const, apiKey: 'sk-proj-abcdefghijklmnopqrstuvwxyz', model: 'gpt-4o' };

  it('sends the key headers with an analysis, and none without a key', async () => {
    const spy = respond(200, {});
    await analyzeResume(file, job, 'tok', byok);
    let headers = spy.mock.calls[0][1]!.headers as Record<string, string>;
    expect(headers['X-LLM-Provider']).toBe('openai');
    expect(headers['X-LLM-Key']).toBe(byok.apiKey);
    expect(headers['X-LLM-Model']).toBe('gpt-4o');
    expect(headers.Authorization).toBe('Bearer tok');

    await analyzeResume(file, job, 'tok');
    headers = spy.mock.calls[1][1]!.headers as Record<string, string>;
    expect(Object.keys(headers)).toEqual(['Authorization']);
  });

  it('never puts the key in the URL or the body', async () => {
    const spy = respond(200, {});
    await analyzeResume(file, job, 'tok', byok);
    expect(String(spy.mock.calls[0][0])).not.toContain(byok.apiKey);
    const form = spy.mock.calls[0][1]!.body as FormData;
    expect(String(form.get('jobData'))).not.toContain(byok.apiKey);
  });

  it('checks a key with a POST carrying only headers', async () => {
    const spy = respond(200, { ok: true, provider: 'openai', model: 'gpt-4o' });
    const result = await checkKey('tok', byok);
    expect(result.ok).toBe(true);
    expect(String(spy.mock.calls[0][0])).toMatch(/\/api\/v1\/key\/check$/);
    expect(spy.mock.calls[0][1]!.method).toBe('POST');
    expect((spy.mock.calls[0][1]!.headers as Record<string, string>)['X-LLM-Key']).toBe(byok.apiKey);
  });

  it('surfaces a rejected key with the server message', async () => {
    respond(400, { error: { code: 'llm_key_rejected', message: 'OpenAI rejected your API key. Check it in Settings.' } });
    await expect(checkKey('tok', byok)).rejects.toMatchObject({ code: 'llm_key_rejected' });
  });

  it('recognises key-related error codes so the UI can point at the settings', () => {
    for (const code of ['llm_key_rejected', 'llm_key_quota', 'llm_model_not_found', 'invalid_llm_key']) {
      expect(KEY_ERROR_CODES.has(code)).toBe(true);
    }
    expect(KEY_ERROR_CODES.has('quota_exceeded')).toBe(false); // our own daily quota is a different problem
    expect(KEY_ERROR_CODES.has('unauthorized')).toBe(false);
  });
});
