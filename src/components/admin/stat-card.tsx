import type { LucideIcon } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface StatCardProps {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: LucideIcon;
  tone?: 'primary' | 'ai' | 'success' | 'neutral';
  className?: string;
}

const tones = {
  primary: 'bg-primary/10 text-primary',
  ai: 'bg-ai/10 text-ai',
  success: 'bg-success/10 text-success',
  neutral: 'bg-muted text-muted-foreground',
} as const;

/** Clean statistic card used on the administrator dashboard. */
export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = 'primary',
  className,
}: StatCardProps) {
  return (
    <Card className={cn('p-4 sm:p-5', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
            {value}
          </p>
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
        </div>
        <span
          className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-lg', tones[tone])}
          aria-hidden
        >
          <Icon className="h-4 w-4" />
        </span>
      </div>
    </Card>
  );
}