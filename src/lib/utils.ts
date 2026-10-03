import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Merge conditional class names and resolve Tailwind conflicts. */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** French date + time formatting (server and client share the same helper). */
const dateTimeFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const dateFormatter = new Intl.DateTimeFormat('fr-FR', {
  dateStyle: 'long',
});

const shortDateFormatter = new Intl.DateTimeFormat('fr-FR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function formatDateTimeFr(value: Date | string | number): string {
  const date = toDate(value);
  return date ? dateTimeFormatter.format(date) : '—';
}

export function formatDateFr(value: Date | string | number): string {
  const date = toDate(value);
  return date ? dateFormatter.format(date) : '—';
}

export function formatShortDateFr(value: Date | string | number): string {
  const date = toDate(value);
  return date ? shortDateFormatter.format(date) : '—';
}

export function formatTimeFr(value: Date | string | number): string {
  const date = toDate(value);
  return date
    ? new Intl.DateTimeFormat('fr-FR', { timeStyle: 'short' }).format(date)
    : '—';
}

function toDate(value: Date | string | number): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** ISO date string, safe to pass from server components to client components. */
export function toIso(value: Date | null): string | null {
  return value ? value.toISOString() : null;
}

/** Count words in a French text (approximate, punctuation tolerant). */
export function countWords(text: string): number {
  const matches = text.trim().match(/[\p{L}\p{N}'’-]+/gu);
  return matches ? matches.length : 0;
}

/** Human readable duration in French, e.g. "1 h 12 min". */
export function formatDurationFr(from: Date, to: Date = new Date()): string {
  const diffMs = Math.max(0, to.getTime() - from.getTime());
  const totalMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(totalMinutes / 1440);
  const hours = Math.floor((totalMinutes % 1440) / 60);
  const minutes = totalMinutes % 60;

  const parts: string[] = [];
  if (days > 0) parts.push(`${days} j`);
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0 && days === 0) parts.push(`${minutes} min`);
  if (parts.length === 0) return "moins d'une minute";
  return parts.join(' ');
}

/** "0" -> "aucun", "1" -> "1 élément", "3" -> "3 éléments" style pluralisation helper. */
export function pluralize(count: number, singular: string, plural?: string): string {
  const word = count > 1 ? (plural ?? `${singular}s`) : singular;
  return `${count} ${word}`;
}