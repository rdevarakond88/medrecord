/**
 * Base API client for MedRecord.
 * Spec: docs/api-contracts.md — General Conventions
 * Spec: docs/security-spec.md — Transport Security (H-2: certificate pinning)
 *
 * Wraps pinnedFetch (react-native-ssl-pinning) with:
 *   - TLS certificate pinning — prevents MITM on shared clinic WiFi
 *   - Bearer JWT in Authorization header
 *   - JSON Content-Type
 *   - RFC 7807-style error normalisation into ApiError
 */

import { pinnedFetch } from './pinnedFetch';

// Update this URL after claiming your ngrok static domain in backend/.env
// Format: https://your-domain.ngrok-free.app/v1
export const API_BASE_URL = 'https://lunchbox-saddled-relock.ngrok-free.dev/v1';
const BASE_URL = API_BASE_URL;

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
  // H-2: use pinnedFetch instead of bare fetch — certificate pinning enforced
  const mergedHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Authorization:  `Bearer ${authToken}`,
    ...(options.headers as Record<string, string> | undefined),
  };

  const response = await pinnedFetch(`${BASE_URL}${path}`, {
    method:  options.method as string | undefined,
    headers: mergedHeaders,
    body:    options.body as string | undefined,
  });

  const body = await response.json();

  if (!response.ok) {
    const err = (body as any)?.error ?? {};
    throw new ApiError(
      err.code ?? 'SERVER_ERROR',
      err.message ?? 'An unexpected error occurred',
      response.status,
      err.field,
    );
  }

  return body as T;
}
