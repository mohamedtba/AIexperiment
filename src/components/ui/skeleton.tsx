import { cn } from '@/lib/utils';

export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn('animate-pulse rounded-md bg-muted', className)}
      aria-hidden
      {...props}
    />
  );
}

export function CardSkeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn('card-surface p-5', className)} {...props}>
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-8 w-2/3" />
      <Skeleton className="mt-4 h-3 w-1/2" />
    </div>
  );
}

export function FeedSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <div className="space-y-3" aria-label="Chargement en cours">
      {Array.from({ length: rows }).map((_, index) => (
        <div
          key={index}
          className={cn(
            'flex',
            index % 2 === 0 ? 'justify-start' : 'justify-end',
          )}
        >
          <Skeleton className={cn('h-16 w-3/4 rounded-lg', index % 2 === 0 ? '' : 'bg-primary/10')} />
        </div>
      ))}
    </div>
  );
}