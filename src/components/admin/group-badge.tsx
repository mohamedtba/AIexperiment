import { Sparkles, Wand2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { getDictionary } from '@/i18n';
import { toStudentGroup } from '@/types';

const t = getDictionary();

/**
 * Displays the study group of a student.
 *
 * The two groups are an administrative label only: the assistant behaves the
 * same way in both, so the badge exists to let the teacher read the results
 * group by group, not to announce a difference to the student.
 */
export function GroupBadge({
  group,
  className,
}: {
  group: string | null | undefined;
  className?: string;
}) {
  const value = toStudentGroup(group);

  return (
    <Badge variant={value === 'AI_GUIDEE' ? 'ai' : 'neutral'} className={className}>
      {value === 'AI_GUIDEE' ? (
        <Wand2 className="h-3 w-3" aria-hidden />
      ) : (
        <Sparkles className="h-3 w-3" aria-hidden />
      )}
      {t.groups[value]}
    </Badge>
  );
}