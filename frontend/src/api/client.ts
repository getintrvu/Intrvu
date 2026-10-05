import { API_BASE_URL } from '../lib/config';
import type { AnalysisData } from '../types/AnalysisData';
import type { JobData } from '../types/JobData';

/** Longer than the backend's function limit (60 s) so the server's own error wins the race. */
const ANALYZE_TIMEOUT_MS = 70_000;
const DEFAULT_TIMEOUT_MS = 15_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface Usage {
  used: number;
  limit: number;
  remaining: number;
}

async function request<T>(path: string, token: string, init: RequestInit = {}, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { ...init.headers, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ApiError(0, 'timeout', 'The analysis took too long. Please try again.');
    }
    throw new ApiError(0, 'network', 'Could not reach the server. Check your connection and try again.');
  }

  if (!response.ok) {
    let code = 'unknown';
    let message = `Request failed (${response.status}).`;
    try {
      const body = await response.json();
      code = body?.error?.code ?? code;
      message = body?.error?.message ?? message;
    } catch {
      /* non-JSON error body: keep the generic message */
    }
    throw new ApiError(response.status, code, message);
  }
  return (await response.json()) as T;
}

/** Maps the extension's job shape to what the API accepts. */
export function toJobPayload(job: JobData) {
  return {
    jobTitle: job.jobTitle || undefined, // empty when LinkedIn's markup hid it; the API has defaults
    company: job.company || undefined,
    description: job.jobDescription,
    url: job.url,
  };
}

export function analyzeResume(file: File, job: JobData, token: string): Promise<AnalysisData> {
  const form = new FormData();
  form.append('resume', file);
  form.append('jobData', JSON.stringify(toJobPayload(job)));
  return request<AnalysisData>('/api/v1/analyze', token, { method: 'POST', body: form }, ANALYZE_TIMEOUT_MS);
}

export function fetchUsage(token: string): Promise<Usage> {
  return request<Usage>('/api/v1/usage', token);
}

/** Deletes IntrvuFit's data for the user. The account itself is shared with other products and is kept. */
export async function deleteMyData(token: string): Promise<void> {
  await request<{ deleted: boolean }>('/api/v1/me/data', token, { method: 'DELETE' });
}

/** Text safe to show to a user. */
export function userMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.code === 'unauthorized') return 'Your session has expired. Please sign in again.';
    return error.message;
  }
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}
