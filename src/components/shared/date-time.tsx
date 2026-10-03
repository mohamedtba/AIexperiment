'use client';

import * as React from 'react';
import { formatDateFr, formatDateTimeFr, formatTimeFr } from '@/lib/utils';

interface DateTimeProps {
  value: string | Date | null | undefined;
  className?: string;
  /** "datetime" (default), "date" or "time". */
  mode?: 'datetime' | 'date' | 'time';
  placeholder?: string;
}

/**
 * Formats a date in French on the client (local time zone).
 * The initial value is produced during SSR to avoid any layout shift, and the
 * value is then refreshed in the browser locale.
 */
export function DateTime({
  value,
  className,
  mode = 'datetime',
  placeholder = '—',
}: DateTimeProps) {
  const format = React.useCallback(
    (input: string | Date) => {
      if (mode === 'date') return formatDateFr(input);
      if (mode === 'time') return formatTimeFr(input);
      return formatDateTimeFr(input);
    },
    [mode],
  );

  const [label, setLabel] = React.useState(() =>
    value ? format(value) : placeholder,
  );

  React.useEffect(() => {
    setLabel(value ? format(value) : placeholder);
  }, [value, format, placeholder]);

  if (!value) {
    return <span className={className}>{placeholder}</span>;
  }

  const iso = value instanceof Date ? value.toISOString() : new Date(value).toISOString();

  return (
    <time dateTime={iso} className={className} suppressHydrationWarning>
      {label}
    </time>
  );
}

/** "il y a 5 min" style relative label, in French. */
export function RelativeTime({
  value,
  className,
}: {
  value: string | Date | null | undefined;
  className?: string;
}) {
  const [label, setLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!value) {
      setLabel(null);
      return;
    }
    const date = value instanceof Date ? value : new Date(value);
    setLabel(relativeLabel(date));
    const timer = window.setInterval(() => setLabel(relativeLabel(date)), 60_000);
    return () => window.clearInterval(timer);
  }, [value]);

  if (!value) return <span className={className}>—</span>;
  if (!label) return <DateTime value={value} className={className} />;

  return (
    <time
      dateTime={(value instanceof Date ? value : new Date(value)).toISOString()}
      className={className}
      title={formatDateTimeFr(value)}
    >
      {label}
    </time>
  );
}

function relativeLabel(date: Date): string {
  const diffSeconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (diffSeconds < 45) return "à l'instant";
  const minutes = Math.round(diffSeconds / 60);
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return `il y a ${days} j`;
}