/**
 * Base API client for MedRecord.
 * Spec: docs/api-contracts.md — General Conventions
 *
 * Wraps fetch with:
 *   - Bearer JWT in Authorization header
 *   - JSON Content-Type
 *   - RFC 7807-style error normalisation into ApiError
 */

const BASE_URL = 'https://api.medrecord.in/v1';

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status: number,
    public readonly field?: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export async function apiFetch<T>(
  path: string,
  authToken: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...options.headers,
    },
  });

  const body = await response.json();

  if (!response.ok) {
    const err = body.error ?? {};
    throw new ApiError(
      err.code ?? 'SERVER_ERROR',
      err.message ?? 'An unexpected error occurred',
      response.status,
      err.field,
    );
  }

  return body as T;
}
