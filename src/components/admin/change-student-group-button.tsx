'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';
import { toStudentGroup } from '@/types';

const t = getDictionary();

/**
 * Moves a student from one group to the other.
 *
 * Offered because a student may easily be filed in the wrong group on the day:
 * changing the label does not touch the conversation nor the versions already
 * written, so a correction is always safe.
 */
export function ChangeStudentGroupButton({
  studentId,
  group,
}: {
  studentId: string;
  group: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const current = toStudentGroup(group);

  async function move(next: 'AI_LIBRE' | 'AI_GUIDEE') {
    setLoading(true);
    try {
      const response = await fetch(`/api/admin/students/${studentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ group: next }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      setOpen(false);
      toast.success(`${t.students.groupChanged} : ${t.groups[next]}`);
      router.refresh();
    } catch (caught) {
      toast.error(caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="xs"
        onClick={() => setOpen(true)}
        className="text-muted-foreground"
      >
        {t.students.changeGroup}
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.students.changeGroupTitle}</DialogTitle>
            <DialogDescription>{t.students.changeGroupIntro}</DialogDescription>
          </DialogHeader>

          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(['AI_LIBRE', 'AI_GUIDEE'] as const).map((value) => (
              <button
                key={value}
                type="button"
                disabled={loading || value === current}
                onClick={() => void move(value)}
                className={cn(
                  'rounded-lg border p-3 text-left text-sm font-medium transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  'disabled:cursor-not-allowed disabled:opacity-55',
                  value === current
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:bg-muted/50',
                )}
              >
                <span className="flex items-center gap-2">
                  {value === current ? (
                    <Check className="h-4 w-4 text-primary" aria-hidden />
                  ) : null}
                  {t.groups[value]}
                </span>
              </button>
            ))}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)} disabled={loading}>
              {t.common.cancel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}