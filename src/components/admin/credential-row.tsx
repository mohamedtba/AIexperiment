'use client';

import * as React from 'react';
import { Check, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { getDictionary } from '@/i18n';

const t = getDictionary();

/** Displays a credential with its copy button (used by the student dialogs). */
export function CredentialRow({
  label,
  value,
  onCopy,
  copied,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  copied: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 font-mono text-xl font-semibold tracking-[0.2em] text-foreground">
          {value}
        </p>
      </div>
      <Button
        variant="outline"
        size="icon"
        onClick={onCopy}
        aria-label={`${t.common.copy} ${label}`}
      >
        {copied ? (
          <Check className="h-4 w-4 text-success" aria-hidden />
        ) : (
          <Copy className="h-4 w-4" aria-hidden />
        )}
      </Button>
    </div>
  );
}