import { CalendarClock, Target } from 'lucide-react';
import { getDictionary } from '@/i18n';
import { formatDateTimeFr } from '@/lib/utils';

const t = getDictionary();

/** Prominent display of the question of the day, shared by every student. */
export function QuestionCard({
  question,
  sequence,
  startedAt,
}: {
  question: string;
  sequence: number;
  startedAt: string | Date;
}) {
  return (
    <section
      aria-labelledby="question-du-jour"
      className="overflow-hidden rounded-lg border border-primary/20 bg-card shadow-card"
    >
      <div className="flex items-center justify-between gap-3 border-b border-primary/15 bg-primary/5 px-4 py-2.5 sm:px-5">
        <h2
          id="question-du-jour"
          className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary"
        >
          <Target className="h-4 w-4" aria-hidden />
          {t.student.questionTitle}
        </h2>
        <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <CalendarClock className="h-3.5 w-3.5" aria-hidden />
          {t.experiments.experimentNumber.replace('{n}', String(sequence))}
        </span>
      </div>

      <div className="px-4 py-4 sm:px-5 sm:py-5">
        <p className="heading-serif text-lg leading-relaxed text-foreground sm:text-xl">
          {question}
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          {t.student.questionHint} · {t.experiments.startedAt}{' '}
          {formatDateTimeFr(startedAt)}
        </p>
      </div>
    </section>
  );
}