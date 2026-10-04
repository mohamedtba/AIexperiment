'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { CircleStop } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

/**
 * Stops the running experiment.
 *
 * Nothing is deleted: the experiment becomes ARCHIVED and keeps its whole
 * history, readable in « Expériences précédentes ». Students immediately see the
 * end-of-experiment screen and can no longer send a message nor submit a
 * version. Pressing the button when nothing runs is harmless.
 */
export function StopExperimentButton() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  async function stop() {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/experiments/stop', { method: 'POST' });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      setOpen(false);
      toast.success(data?.stopped ? t.experiments.stopped : t.experiments.nothingToStop);
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <CircleStop className="h-4 w-4" aria-hidden />
        {t.experiments.stop}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.experiments.confirmStopTitle}</DialogTitle>
            <DialogDescription>{t.experiments.confirmStopBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" loading={loading} onClick={() => void stop()}>
              {t.experiments.confirmStop}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}