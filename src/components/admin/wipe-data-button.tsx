'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Eraser, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';

const t = getDictionary();

interface Counts {
  aiMessages: number;
  expressionVersions: number;
  experiments: number;
  accounts: number;
}

/**
 * Permanently deletes the students' conversations and written versions.
 *
 * The accounts always survive: losing the class credentials because the
 * transcripts were cleared would be an absurd trade. The button is guarded three
 * times — a dialog listing the exact figures, an optional and clearly worded
 * checkbox for the experiments, and a confirmation word that has to be typed —
 * because nothing here can be undone.
 */
export function WipeDataButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [counts, setCounts] = React.useState<Counts | null>(null);
  const [wiping, setWiping] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [includeExperiments, setIncludeExperiments] = React.useState(false);
  const [confirm, setConfirm] = React.useState('');

  // The figures are read when the dialog opens: they must describe what is in the
  // database right now, not what was stored an hour ago.
  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch('/api/admin/data');
        const data = await response.json().catch(() => null);
        if (!response.ok) throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
        if (cancelled) return;
        setCounts({
          aiMessages: data.counts?.aiMessages ?? 0,
          expressionVersions: data.counts?.expressionVersions ?? 0,
          experiments: data.counts?.experiments ?? 0,
          accounts: data.accounts ?? 0,
        });
      } catch (caught) {
        if (!cancelled) {
          setError(
            caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR,
          );
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open]);

  const confirmed = confirm.trim() === t.settings.dataConfirmWord;
  const nothingToDelete =
    counts !== null &&
    counts.aiMessages === 0 &&
    counts.expressionVersions === 0 &&
    (counts.experiments === 0 || !includeExperiments);

  async function wipe() {
    setWiping(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'SUPPRIMER', experiments: includeExperiments }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      const deleted = data.deleted ?? {};
      toast.success(
        t.settings.dataWipedDetail
          .replace('{messages}', String(deleted.aiMessages ?? 0))
          .replace('{versions}', String(deleted.expressionVersions ?? 0)),
      );
      setOpen(false);
      setConfirm('');
      setIncludeExperiments(false);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setWiping(false);
    }
  }

  return (
    <>
      <Button type="button" variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Eraser className="h-4 w-4" aria-hidden />
        {t.settings.dataWipe}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          setOpen(next);
          if (!next) {
            setConfirm('');
            setError(null);
            setIncludeExperiments(false);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <TriangleAlert className="h-5 w-5 text-destructive" aria-hidden />
              {t.settings.dataWipeTitle}
            </DialogTitle>
            <DialogDescription>{t.settings.dataWipeBody}</DialogDescription>
          </DialogHeader>

          <div className="mt-2 space-y-4">
            <Alert tone="destructive">{t.settings.dataWarning}</Alert>

            {counts ? (
              <dl className="divide-y divide-border rounded-lg border border-border">
                <CountRow
                  label={t.settings.dataMessages}
                  value={counts.aiMessages}
                  destructive
                />
                <CountRow
                  label={t.settings.dataVersions}
                  value={counts.expressionVersions}
                  destructive
                />
                {includeExperiments ? (
                  <CountRow
                    label={t.settings.dataExperiments}
                    value={counts.experiments}
                    destructive
                  />
                ) : null}
                <CountRow
                  label={t.settings.dataAccountsKept}
                  value={counts.accounts}
                  destructive={false}
                />
              </dl>
            ) : (
              <p className="text-sm text-muted-foreground">{t.common.loading}</p>
            )}

            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={includeExperiments}
                disabled={wiping}
                onChange={(event) => setIncludeExperiments(event.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-destructive"
              />
              <span>
                <span className="block text-sm font-medium">
                  {t.settings.dataExperimentsOptional}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {t.settings.dataExperimentsOptionalHint}
                </span>
              </span>
            </label>

            <div className="space-y-2">
              <Label htmlFor="wipe-confirm">{t.settings.dataConfirmLabel}</Label>
              <input
                id="wipe-confirm"
                type="text"
                value={confirm}
                disabled={wiping}
                autoComplete="off"
                spellCheck={false}
                onChange={(event) => setConfirm(event.target.value)}
                placeholder={t.settings.dataConfirmWord}
                className="h-9 w-full rounded-md border border-border bg-card px-3 font-mono text-sm tracking-widest focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-55"
              />
            </div>

            {error ? <Alert tone="destructive">{error}</Alert> : null}
            {nothingToDelete && !error ? (
              <p className="text-sm text-muted-foreground">{t.settings.dataNothing}</p>
            ) : null}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={wiping}>
              {t.common.cancel}
            </Button>
            <Button
              variant="destructive"
              loading={wiping}
              disabled={!confirmed || nothingToDelete}
              onClick={() => void wipe()}
            >
              {wiping ? t.settings.dataWiping : t.settings.dataWipe}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function CountRow({
  label,
  value,
  destructive,
}: {
  label: string;
  value: number;
  destructive: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2.5">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd
        className={
          destructive
            ? 'text-sm font-semibold tabular-nums text-destructive'
            : 'text-sm font-semibold tabular-nums text-success'
        }
      >
        {value}
      </dd>
    </div>
  );
}