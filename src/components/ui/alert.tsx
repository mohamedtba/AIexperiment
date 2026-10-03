import * as React from 'react';
import { cn } from '@/lib/utils';

type AlertTone = 'info' | 'success' | 'warning' | 'destructive' | 'ai';

const tones: Record<AlertTone, string> = {
  info: 'border-primary/25 bg-primary/5 text-primary',
  success: 'border-success/30 bg-success/5 text-success',
  warning: 'border-warning/35 bg-warning-soft text-warning',
  destructive: 'border-destructive/30 bg-destructive/5 text-destructive',
  ai: 'border-ai/25 bg-ai-soft text-ai',
};

export interface AlertProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  tone?: AlertTone;
  icon?: React.ReactNode;
  title?: React.ReactNode;
}

export function Alert({
  tone = 'info',
  icon,
  title,
  children,
  className,
  ...props
}: AlertProps) {
  return (
    <div
      role={tone === 'destructive' ? 'alert' : 'status'}
      className={cn('flex gap-3 rounded-lg border p-4 text-sm', tones[tone], className)}
      {...props}
    >
      {icon ? <span className="mt-0.5 shrink-0">{icon}</span> : null}
      <div className="flex min-w-0 flex-col gap-1">
        {title ? <p className="font-semibold leading-tight">{title}</p> : null}
        {children ? <div className="leading-relaxed">{children}</div> : null}
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-border bg-muted/40 px-5 py-10 text-center',
        className,
      )}
    >
      {icon ? <div className="text-muted-foreground">{icon}</div> : null}
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description ? (
          <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action}
    </div>
  );
}