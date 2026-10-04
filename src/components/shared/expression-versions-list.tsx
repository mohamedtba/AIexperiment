import { FileText } from 'lucide-react';
import { EmptyState } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { DateTime } from '@/components/shared/date-time';
import { getDictionary } from '@/i18n';
import { countWords, cn } from '@/lib/utils';
import type { ExpressionVersion } from '@/types';

const t = getDictionary();

interface ExpressionVersionsListProps {
  versions: ExpressionVersion[];
  emptyTitle?: string;
  emptyDescription?: string;
  className?: string;
}

/** Chronological feed of all writing versions (nothing is ever hidden or deleted). */
export function ExpressionVersionsList({
  versions,
  emptyTitle = t.students.expressionEmpty,
  emptyDescription,
  className,
}: ExpressionVersionsListProps) {
  if (versions.length === 0) {
    return <EmptyState icon={<FileText className="h-6 w-6" />} title={emptyTitle} description={emptyDescription} />;
  }

  const latestId = versions.at(-1)?.id;

  return (
    <ol className={cn('space-y-3', className)}>
      {versions.map((version) => {
        const isLatest = version.id === latestId;
        return (
          <li key={version.id}>
            <article
              className={cn(
                'rounded-lg border p-4 shadow-sm',
                isLatest ? 'border-success/30 bg-success-soft/60' : 'border-border bg-card',
              )}
            >
              <header className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">
                  {t.student.version} {version.versionNumber}
                </span>
                {isLatest ? <Badge variant="success">{t.student.latestVersion}</Badge> : null}
                <DateTime
                  value={version.createdAt}
                  className="ml-auto text-xs text-muted-foreground tabular-nums"
                />
              </header>
              <p className="preserve-lines whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {version.content}
              </p>
              <footer className="mt-2 text-xs text-muted-foreground">
                {t.common.plural(countWords(version.content), t.common.word, t.common.words)} ·{' '}
                {t.common.plural(version.content.length, t.common.character, t.common.characters)}
              </footer>
            </article>
          </li>
        );
      })}
    </ol>
  );
}