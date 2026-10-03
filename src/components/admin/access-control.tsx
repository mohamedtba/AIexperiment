'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Lock, ShieldCheck, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert } from '@/components/ui/alert';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';

const t = getDictionary();

interface AccessControlProps {
  initialEnabled: boolean;
  updatedAtLabel: string;
}

/**
 * Global access switch.
 * Turning it OFF increments the access epoch: every student session is
 * invalidated immediately, students are logged out and cannot log in again.
 */
export function AccessControl({ initialEnabled, updatedAtLabel }: AccessControlProps) {
  const router = useRouter();
  const [enabled, setEnabled] = React.useState(initialEnabled);
  const [saving, setSaving] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    setEnabled(initialEnabled);
  }, [initialEnabled]);

  async function apply(next: boolean) {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      setEnabled(next);
      toast.success(t.access.updated);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setSaving(false);
      setConfirmOpen(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span
            className={
              enabled
                ? 'mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success'
                : 'mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-warning/10 text-warning'
            }
            aria-hidden
          >
            {enabled ? <ShieldCheck className="h-4 w-4" /> : <ShieldAlert className="h-4 w-4" />}
          </span>
          <div>
            <p className="text-sm font-semibold">{t.access.toggleTitle}</p>
            <p className="mt-0.5 max-w-md text-sm leading-relaxed text-muted-foreground">
              {t.access.toggleDescription}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3 sm:justify-end">
          <span
            className={
              enabled
                ? 'text-sm font-medium text-success'
                : 'text-sm font-medium text-warning'
            }
          >
            {enabled ? t.access.allowed : t.access.suspended}
          </span>
          <Switch
            checked={enabled}
            label={t.access.toggleTitle}
            disabled={saving}
            onCheckedChange={(next) => {
              if (next) {
                void apply(true);
              } else {
                setConfirmOpen(true);
              }
            }}
          />
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t.admin.accessSince} {updatedAtLabel}
      </p>

      {error ? <Alert tone="destructive">{error}</Alert> : null}

      {!enabled ? (
        <Alert tone="warning" icon={<Lock className="h-4 w-4" />}>
          {ERROR_MESSAGES.STUDENT_ACCESS_DISABLED}
        </Alert>
      ) : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.access.confirmSuspendTitle}</DialogTitle>
            <DialogDescription>{t.access.confirmSuspendBodyAdmin}</DialogDescription>
          </DialogHeader>
          <p className="mt-3 rounded-md bg-muted p-3 text-sm font-medium text-foreground">
            {t.access.confirmSuspendBody}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={saving}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" loading={saving} onClick={() => void apply(false)}>
              {t.access.suspend}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}