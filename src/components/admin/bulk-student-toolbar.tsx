'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { FileDown, FolderInput, Trash2 } from 'lucide-react';
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
import { useRouter } from 'next/navigation';

const t = getDictionary();

/**
 * Bulk actions over the students selected with their row checkboxes.
 *
 * So a teacher can treat the whole class in one pass: download the PDFs of the
 * selected students, move them to the other group, or delete them — with the
 * same confirmation required for a single deletion.
 */
export function BulkStudentToolbar() {
  const router = useRouter();
  const [count, setCount] = React.useState(0);
  const [busy, setBusy] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState<'delete' | 'group' | null>(null);
  const [targetGroup, setTargetGroup] = React.useState<'AI_LIBRE' | 'AI_GUIDEE'>('AI_LIBRE');

  React.useEffect(() => {
    const sync = () => {
      const boxes = Array.from(
        document.querySelectorAll<HTMLInputElement>('input.student-bulk-checkbox:checked:not([data-bulk-select-all])'),
      );
      setCount(boxes.length);
    };
    const onChange = (event: Event) => {
      const target = event.target as HTMLInputElement | null;
      if (target?.matches?.('input[data-bulk-select-all]')) {
        document
          .querySelectorAll<HTMLInputElement>('input.student-bulk-checkbox:not([data-bulk-select-all])')
          .forEach((input) => {
            input.checked = Boolean(target.checked);
          });
      }
      sync();
    };
    sync();
    document.addEventListener('change', onChange);
    return () => document.removeEventListener('change', onChange);
  }, []);

  function selected(): HTMLInputElement[] {
    return Array.from(
      document.querySelectorAll<HTMLInputElement>('input.student-bulk-checkbox:checked:not([data-bulk-select-all])'),
    );
  }

  function setAll(check: boolean) {
    document
      .querySelectorAll<HTMLInputElement>('input.student-bulk-checkbox:not([data-bulk-select-all])')
      .forEach((input) => {
        input.checked = check;
      });
    const all = document.querySelector<HTMLInputElement>('input[data-bulk-select-all]');
    if (all) all.checked = check;
    setCount(check ? document.querySelectorAll('input.student-bulk-checkbox:not([data-bulk-select-all])').length : 0);
  }

  async function bulkDelete() {
    setBusy(true);
    let done = 0;
    for (const input of selected()) {
      try {
        const response = await fetch(`/api/admin/students/${input.value}`, { method: 'DELETE' });
        if (response.ok) done += 1;
      } catch {
        /* skip */
      }
    }
    toast.success(`${done} ${t.students.deletedPlural}`);
    setBusy(false);
    setConfirmOpen(null);
    setAll(false);
    router.refresh();
  }

  async function bulkMoveGroup() {
    setBusy(true);
    let done = 0;
    for (const input of selected()) {
      try {
        const response = await fetch(`/api/admin/students/${input.value}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ group: targetGroup }),
        });
        if (response.ok) done += 1;
      } catch {
        /* skip */
      }
    }
    toast.success(`${done} ${t.students.moveGroupDone}`);
    setBusy(false);
    setConfirmOpen(null);
    setAll(false);
    router.refresh();
  }

  async function bulkExportPdf() {
    const boxes = selected();
    if (boxes.length === 0) return;
    setBusy(true);
    try {
      for (const input of boxes) {
        const response = await fetch(`/api/admin/students/${input.value}/export`);
        if (!response.ok) continue;
        const disposition = response.headers.get('Content-Disposition') ?? '';
        const match = /filename="([^"]+)"/.exec(disposition);
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = match?.[1] ?? `${input.dataset.username}.pdf`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        // Let the browser schedule each download separately.
        await new Promise((resolve) => setTimeout(resolve, 400));
      }
      toast.success(t.students.exportPdfSuccess);
    } catch {
      toast.error(ERROR_MESSAGES.SERVER_ERROR);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sticky bottom-4 z-20 flex flex-wrap items-center gap-3 rounded-xl border border-border bg-card/95 p-3 shadow-popover backdrop-blur">
      <span className="text-sm font-semibold">
        {count} {t.students.selected}
      </span>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => setAll(true)} disabled={busy}>
          {t.students.selectAll}
        </Button>
        <Button size="sm" variant="outline" onClick={() => setAll(false)} disabled={busy || count === 0}>
          {t.students.selectNone}
        </Button>
        <Button size="sm" variant="outline" onClick={() => void bulkExportPdf()} disabled={busy || count === 0}>
          <FileDown className="h-4 w-4" aria-hidden />
          {t.students.exportPdfBulk}
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => setConfirmOpen('group')}
          disabled={busy || count === 0}
        >
          <FolderInput className="h-4 w-4" aria-hidden />
          {t.students.moveGroupBulk}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => setConfirmOpen('delete')}
          disabled={busy || count === 0}
        >
          <Trash2 className="h-4 w-4" aria-hidden />
          {t.students.deleteBulk}
        </Button>
      </div>

      <Dialog open={confirmOpen === 'delete'} onOpenChange={(o) => setConfirmOpen(o ? 'delete' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.students.deleteStudentTitle}</DialogTitle>
            <DialogDescription>{t.students.deleteStudentBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(null)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button variant="destructive" loading={busy} onClick={() => void bulkDelete()}>
              {t.students.deleteStudentConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen === 'group'} onOpenChange={(o) => setConfirmOpen(o ? 'group' : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.students.moveGroupBulkTitle}</DialogTitle>
            <DialogDescription>{t.students.moveGroupBulkBody}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-2 sm:grid-cols-2">
            {(['AI_LIBRE', 'AI_GUIDEE'] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTargetGroup(value)}
                aria-pressed={targetGroup === value}
                className={
                  'rounded-lg border p-3 text-left text-sm font-medium transition-colors ' +
                  (targetGroup === value ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/50')
                }
              >
                {value === 'AI_LIBRE' ? 'IA libre' : 'IA guidée'}
              </button>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(null)} disabled={busy}>
              {t.common.cancel}
            </Button>
            <Button loading={busy} onClick={() => void bulkMoveGroup()}>
              {t.students.moveGroupBulkConfirm}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
