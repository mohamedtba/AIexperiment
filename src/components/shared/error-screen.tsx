'use client';

import { DatabaseZap, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/alert';
import { getDictionary } from '@/i18n';
import { isDatabaseError } from '@/lib/errors';

const t = getDictionary();

/**
 * Error screen used by the `error.tsx` boundaries of the administrator and
 * student areas. A MongoDB outage (wrong `DATABASE_URL`, unreachable cluster,
 * IP not allowed) is a configuration problem, so it gets an explicit message
 * instead of the generic one.
 */
export function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const databaseDown = isDatabaseError(error);

  return (
    <Card className="mx-auto mt-6 max-w-xl">
      <CardContent className="pt-5 sm:pt-6">
        <EmptyState
          icon={
            databaseDown ? (
              <DatabaseZap className="h-6 w-6" />
            ) : (
              <TriangleAlert className="h-6 w-6" />
            )
          }
          title={databaseDown ? t.errors.databaseTitle : t.errors.genericTitle}
          description={databaseDown ? t.errors.databaseBody : t.errors.genericBody}
          action={<Button onClick={reset}>{t.common.retry}</Button>}
        />
      </CardContent>
    </Card>
  );
}