'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { getDictionary } from '@/i18n';
import type { StudentGroup } from '@/types';

const t = getDictionary();

/**
 * Filters the student list by study group.
 *
 * The choice is written in the URL rather than kept in React state, so the filter
 * survives a reload and a link to "IA libre" can be shared or bookmarked. The
 * figure next to each button lets the teacher compare the two groups without
 * counting rows.
 */
export function GroupFilter({
  counts,
  active,
  summary,
  total,
  shown,
}: {
  counts: Record<StudentGroup, number>;
  active: StudentGroup | null;
  summary: string;
  total: number;
  shown: number;
}) {
  const pathname = usePathname();

  const options: Array<{ value: StudentGroup | null; label: string; count: number }> = [
    { value: null, label: t.groups.all, count: total },
    { value: 'AI_LIBRE', label: t.groups.AI_LIBRE, count: counts.AI_LIBRE },
    { value: 'AI_GUIDEE', label: t.groups.AI_GUIDEE, count: counts.AI_GUIDEE },
  ];

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div
        role="group"
        aria-label={t.students.filterLabel}
        className="flex flex-wrap gap-1 rounded-lg border border-border bg-card p-1"
      >
        {options.map((option) => {
          const selected = option.value === active;
          return (
            <Link
              key={option.value ?? 'all'}
              href={
                option.value
                  ? `${pathname}?${new URLSearchParams({ groupe: option.value }).toString()}`
                  : pathname
              }
              scroll={false}
              aria-current={selected ? 'true' : undefined}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted hover:text-foreground',
              )}
            >
              {option.label}
              <span className="ml-1.5 tabular-nums opacity-70">{option.count}</span>
            </Link>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground">
        {active !== null && shown !== total
          ? `${shown} / ${total} · ${summary}`
          : summary}
      </p>
    </div>
  );
}