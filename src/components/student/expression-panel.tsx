'use client';

import * as React from 'react';
import { toast } from 'sonner';
import { CheckCircle2, FileText, PencilLine, Send, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { ERROR_MESSAGES } from '@/lib/errors';
import { cn, countWords } from '@/lib/utils';
import type { ExpressionVersion } from '@/types';

const t = getDictionary();

interface ExpressionPanelProps {
  experimentId: string;
  initialVersions: ExpressionVersion[];
  /** Lets the parent keep its tab badge in step with the versions submitted. */
  onCountChange?: (count: number) => void;
}

/**
 * Expression écrite.
 * Each submission creates a new version; previous versions are never modified
 * nor deleted. "Modifier" loads the latest version in the editor and submits a
 * brand new version.
 */
export function ExpressionPanel({
  experimentId,
  initialVersions,
  onCountChange,
}: ExpressionPanelProps) {
  const [versions, setVersions] = React.useState<ExpressionVersion[]>(initialVersions);
  const [draft, setDraft] = React.useState('');
  const [editingFrom, setEditingFrom] = React.useState<number | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const editorRef = React.useRef<HTMLTextAreaElement>(null);
  const feedEndRef = React.useRef<HTMLLIElement>(null);

  React.useEffect(() => {
    setVersions(initialVersions);
  }, [initialVersions, experimentId]);

  // The tab badge must follow the live versions, not the server snapshot.
  React.useEffect(() => {
    onCountChange?.(versions.length);
  }, [versions.length, onCountChange]);

  const latest = versions.at(-1) ?? null;

  function startEdit(version: ExpressionVersion) {
    setEditingFrom(version.versionNumber);
    setDraft(version.content);
    setError(null);
    editorRef.current?.focus();
  }

  function cancelEdit() {
    setEditingFrom(null);
    setDraft('');
    setError(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const content = draft.trim();

    if (!content) {
      setError(ERROR_MESSAGES.EXPRESSION_EMPTY);
      return;
    }
    if (content.length > 5000) {
      setError(ERROR_MESSAGES.EXPRESSION_TOO_LONG);
      return;
    }
    if (submitting) return;

    setSubmitting(true);
    setError(null);

    try {
      // Idempotency key: a retried request never creates a duplicate version.
      const clientRequestId =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

      const endpoint =
        editingFrom !== null
          ? '/api/student/expressions/latest'
          : '/api/student/expressions';
      const method = editingFrom !== null ? 'PATCH' : 'POST';

      const response = await fetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, clientRequestId }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error?.message ?? ERROR_MESSAGES.SERVER_ERROR);
      }

      const data = (await response.json()) as {
        version: { id: string; content: string; versionNumber: number; createdAt: string };
      };

      setVersions((previous) => [
        ...previous,
        {
          id: data.version.id,
          studentId: '',
          experimentId,
          content: data.version.content,
          versionNumber: data.version.versionNumber,
          createdAt: new Date(data.version.createdAt),
        },
      ]);
      setDraft('');
      setEditingFrom(null);
      toast.success(t.student.versionSaved.replace('{n}', String(data.version.versionNumber)));

      window.requestAnimationFrame(() => {
        feedEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : ERROR_MESSAGES.SERVER_ERROR;
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Éditeur */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-lg border border-border bg-card p-4 shadow-card sm:p-5"
      >
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold">
            <FileText className="h-4 w-4 text-success" aria-hidden />
            {t.student.expressionTitle}
          </h3>
          {editingFrom !== null ? (
            <Badge variant="warning">
              {t.student.editingFrom.replace('{n}', String(editingFrom))}
            </Badge>
          ) : latest ? (
            <span className="text-xs text-muted-foreground">
              {t.student.latestVersion} : v{latest.versionNumber}
            </span>
          ) : null}
        </div>

        {editingFrom !== null ? (
          <p className="mb-3 rounded-md bg-warning-soft px-3 py-2 text-xs leading-relaxed text-warning">
            {t.student.editingHint.replace('{n}', String(editingFrom))}
          </p>
        ) : null}

        <Textarea
          ref={editorRef}
          name="expression"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={t.student.expressionPlaceholder}
          rows={9}
          maxLength={5000}
          disabled={submitting}
          aria-label={t.student.expressionTitle}
          className="resize-y text-base leading-relaxed"
        />

        {error ? (
          <Alert tone="destructive" className="mt-3 py-3">
            {error}
          </Alert>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground tabular-nums">
            {t.common.plural(countWords(draft), t.common.word, t.common.words)} ·{' '}
            {draft.length}/5000 {t.common.characters}
          </span>

          <div className="flex items-center gap-2">
            {editingFrom !== null ? (
              <Button type="button" variant="ghost" size="sm" onClick={cancelEdit} disabled={submitting}>
                <X className="h-4 w-4" aria-hidden />
                {t.student.cancelEdit}
              </Button>
            ) : null}
            <Button
              type="submit"
              variant="success"
              loading={submitting}
              disabled={submitting || draft.trim().length === 0}
            >
              <Send className="h-4 w-4" aria-hidden />
              {submitting ? t.student.expressionSending : t.student.expressionSend}
            </Button>
          </div>
        </div>
      </form>

      {/* Historique chronologique */}
      <section aria-label={t.student.expressionTitle} className="space-y-3">
        <h3 className="text-sm font-semibold">
          {t.student.expressionTitle}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {t.common.plural(versions.length, t.common.version, t.common.versions)}
          </span>
        </h3>

        {versions.length === 0 ? (
          <EmptyState
            icon={<FileText className="h-6 w-6" />}
            title={t.student.expressionEmpty}
            description={t.student.expressionEmptyHint}
          />
        ) : (
          <ol className="space-y-3">
            {versions.map((version) => {
              const isLatest = version.id === latest?.id;
              return (
                <li key={version.id}>
                  <article
                    className={cn(
                      'rounded-lg border p-4 shadow-sm',
                      isLatest
                        ? 'border-success/30 bg-success-soft/60'
                        : 'border-border bg-card',
                    )}
                  >
                    <header className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">
                        {t.student.version} {version.versionNumber}
                      </span>
                      {isLatest ? (
                        <Badge variant="success">
                          <CheckCircle2 className="h-3 w-3" aria-hidden />
                          {t.student.latestVersion}
                        </Badge>
                      ) : null}
                      <DateTime
                        value={version.createdAt}
                        className="ml-auto text-xs text-muted-foreground tabular-nums"
                      />
                    </header>

                    <p className="preserve-lines text-sm leading-relaxed text-foreground">
                      {version.content}
                    </p>

                    <footer className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs text-muted-foreground">
                        {t.common.plural(
                          countWords(version.content),
                          t.common.word,
                          t.common.words,
                        )}{' '}
                        · {version.content.length} {t.common.characters}
                      </span>
                      {isLatest ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="xs"
                          onClick={() => startEdit(version)}
                        >
                          <PencilLine className="h-3.5 w-3.5" aria-hidden />
                          {t.student.edit}
                        </Button>
                      ) : null}
                    </footer>
                  </article>
                </li>
              );
            })}
            <li ref={feedEndRef} aria-hidden />
          </ol>
        )}
      </section>
    </div>
  );
}