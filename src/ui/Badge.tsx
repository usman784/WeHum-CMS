import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Status colours from the design (Main.dc.html `chip()`, Sessions.dc.html access/status). */
const badge = cva('inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-full font-semibold', {
  variants: {
    tone: {
      neutral: 'bg-border text-text-muted',
      success: 'bg-success/15 text-success-text',
      teal: 'bg-teal text-teal-text',
      ember: 'bg-ember/15 text-ember-text',
      warning: 'bg-warning/15 text-warning',
      danger: 'bg-danger/10 text-danger-text',
      info: 'bg-info text-info-text',
      lilac: 'bg-lilac text-lilac-text',
      solid: 'bg-ember text-ember-on',
    },
    size: { md: 'px-2.5 py-1 text-xs', sm: 'px-2 py-0.5 text-overline' },
    caps: { true: 'uppercase tracking-wide', false: '' },
  },
  defaultVariants: { tone: 'neutral', size: 'md', caps: false },
});

export type BadgeTone = NonNullable<VariantProps<typeof badge>['tone']>;

type Props = HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>;

export function Badge({ className, tone, size, caps, ...p }: Props) {
  return <span className={cn(badge({ tone, size, caps }), className)} {...p} />;
}

/** Text-only status, as in table cells ("Published", "Draft"). Colour is never the only signal: the word is the status. */
const statusText: Record<'success' | 'warning' | 'teal' | 'ember' | 'muted', string> = {
  success: 'text-success-text',
  warning: 'text-warning',
  teal: 'text-teal-text',
  ember: 'text-ember-text',
  muted: 'text-text-muted',
};

export function StatusText({ tone, className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone: keyof typeof statusText }) {
  return <span className={cn('text-sm font-semibold', statusText[tone], className)} {...p} />;
}
