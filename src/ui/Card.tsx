import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/** Surface container: 16 px radius, 1 px border (design: every `<section>` card). */
export const Card = forwardRef<HTMLDivElement, HTMLAttributes<HTMLDivElement> & { padded?: boolean }>(
  ({ className, padded = true, ...p }, ref) => (
    <div ref={ref} className={cn('rounded-card border border-border bg-surface', padded && 'p-5', className)} {...p} />
  ),
);
Card.displayName = 'Card';

type SectionCardProps = Omit<HTMLAttributes<HTMLElement>, 'title'> & {
  title: ReactNode;
  /** Right side of the header: a link, a button or a badge. */
  action?: ReactNode;
  description?: ReactNode;
  /** `h2` = 18/700 (settings sections), `h3` = 16/600 (cards). Both render an <h2>. */
  size?: 'h2' | 'h3';
};

/** Card with a title row. The section is labelled by its heading. */
export function SectionCard({ title, action, description, size = 'h3', className, children, ...p }: SectionCardProps) {
  return (
    <section className={cn('flex flex-col gap-3.5 rounded-card border border-border bg-surface p-5', className)} {...p}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className={size === 'h2' ? 'text-h2' : 'text-h3'}>{title}</h2>
          {description ? <p className="text-sm text-text-muted">{description}</p> : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
