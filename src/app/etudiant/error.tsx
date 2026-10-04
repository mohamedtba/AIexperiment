'use client';

import { ErrorScreen } from '@/components/shared/error-screen';

/** Error boundary of the student area (kept in French, retryable). */
export default function StudentError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} />;
}