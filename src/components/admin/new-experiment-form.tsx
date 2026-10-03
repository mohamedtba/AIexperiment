'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { PlayCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

interface NewExperimentFormProps {
  hasActiveExperiment: boolean;
}

/**
 * Creates a new experiment. Starting a new experiment archives the current one
 * (never deletes anything) and gives every student a fresh conversation.
 */
export function NewExperimentForm({ hasActiveExperiment }: NewExperimentFormProps) {
  const router = useRouter();
  const [question, setQuestion] = React.useState('');
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const trimmed = question.trim();
  const tooShort = trimmed.length > 0 && trimmed.length < 10;

  async function start() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/experiments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      setQuestion('');
      setConfirmOpen(false);
      toast.success(t.experiments.currentTitle);
      router.refresh();
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (trimmed.length < 10) {
      setError(ERROR_MESSAGES.EXPERIMENT_QUESTION_REQUIRED);
      return;
    }
    setError(null);
    if (hasActiveExperiment) {
      setConfirmOpen(true);
      return;
    }
    void start();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3" noValidate>
      <Label htmlFor="question">{t.experiments.questionLabel}</Label>
      <Textarea
        id="question"
        name="question"
        rows={4}
        value={question}
        onChange={(event) => setQuestion(event.target.value)}
        placeholder={t.experiments.questionPlaceholder}
        className="min-h-[120px] resize-y text-base leading-relaxed"
        maxLength={1000}
      />

      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">
          {trimmed.length}/1000 {t.common.characters}
        </span>
        <Button type="submit" loading={loading && !confirmOpen}>
          <PlayCircle className="h-4 w-4" aria-hidden />
          {loading && !confirmOpen ? t.experiments.starting : t.experiments.start}
        </Button>
      </div>

      {tooShort ? (
        <p className="text-xs text-warning">{ERROR_MESSAGES.EXPERIMENT_QUESTION_REQUIRED}</p>
      ) : null}
      {error ? <Alert tone="destructive">{error}</Alert> : null}

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.experiments.confirmArchiveTitle}</DialogTitle>
            <DialogDescription>{t.experiments.confirmArchiveBody}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
            >
              {t.common.cancel}
            </Button>
            <Button loading={loading} onClick={() => void start()}>
              {t.experiments.confirmStart}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}