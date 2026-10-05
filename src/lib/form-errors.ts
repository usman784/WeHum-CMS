import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiError } from './api';

type FieldIssue = { path: string; message: string };

/** The `details.fields[]` of a `VALIDATION_FAILED` answer, or an empty list. */
export function fieldIssues(e: unknown): FieldIssue[] {
  if (!(e instanceof ApiError) || e.code !== 'VALIDATION_FAILED') return [];
  const fields = (e.details as { fields?: unknown } | undefined)?.fields;
  return Array.isArray(fields) ? fields.filter((f): f is FieldIssue => typeof f?.path === 'string' && typeof f?.message === 'string') : [];
}

/**
 * Put the API's field errors onto the form (spec §6.1). Returns true when at least one landed on a known field,
 * so the caller can skip the general error message.
 */
export function applyFieldErrors<T extends FieldValues>(e: unknown, setError: UseFormSetError<T>, known: readonly Path<T>[]): boolean {
  let applied = false;
  for (const issue of fieldIssues(e)) {
    const name = known.find((k) => k === issue.path);
    if (name) {
      setError(name, { type: 'server', message: issue.message });
      applied = true;
    }
  }
  return applied;
}

/** One line for a form-level error box. Lockouts say how long to wait. */
export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (!(e instanceof ApiError)) return fallback;
  if (e.code === 'RATE_LIMITED') {
    const sec = (e.details as { retryAfterSec?: number } | undefined)?.retryAfterSec;
    if (typeof sec === 'number' && sec > 0) {
      const min = Math.ceil(sec / 60);
      return `Too many attempts. Try again in ${min} ${min === 1 ? 'minute' : 'minutes'}.`;
    }
    return e.message || 'Too many attempts. Please wait a moment and try again.';
  }
  return e.message || fallback;
}
