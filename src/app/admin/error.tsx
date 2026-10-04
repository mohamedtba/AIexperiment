'use client';

import { ErrorScreen } from '@/components/shared/error-screen';

/** Error boundary of the administrator area (kept in French, retryable). */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ErrorScreen error={error} reset={reset} />;
}