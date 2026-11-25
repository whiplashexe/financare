import { ApiError } from '@/lib/api/error';
import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
export const applyApiError = <T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[]
): string | null => {
  if (!(error instanceof ApiError)) return 'something wrong';
  let matched = false;
  const unmatched: string[] = [];

  for (const [key, messages] of Object.entries(error.errors ?? {})) {
    const message = messages[0];
    if (!message) continue;
    if (fields.includes(key as Path<T>)) {
      setError(key as Path<T>, { message });
      matched = true;
    } else {
      unmatched.push(message);
    }
  }

  if (unmatched.length) return unmatched[0];
  if (matched) return null;

  if (error.status === 429) {
    return error.retryAfter
      ? `too much retries, try again in ${error.retryAfter} seconds`
      : `too much retries, try again later`;
  }
  return error.message;
};
