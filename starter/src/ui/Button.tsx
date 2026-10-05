import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '../lib/cn';

/** Example `ui` primitive — every other primitive follows this pattern (cva variants + tokens only). */
const button = cva(
  'inline-flex items-center justify-center gap-2 rounded-btn font-sans text-body font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline focus-visible:outline-2 focus-visible:outline-ember-soft',
  {
    variants: {
      variant: {
        primary: 'bg-ember text-ember-on hover:bg-ember-soft',
        secondary: 'bg-surface-alt text-text border border-border-strong hover:border-outline',
        outline: 'bg-transparent text-text border border-outline hover:bg-surface-alt',
        danger: 'bg-danger/10 text-danger-text border border-danger-border hover:bg-danger/20',
        ghost: 'bg-transparent text-text-muted hover:text-text',
      },
      size: { md: 'h-11 px-[18px]', sm: 'h-10 px-4 text-sm' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type Props = ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button> & { loading?: boolean };

export const Button = forwardRef<HTMLButtonElement, Props>(({ className, variant, size, loading, children, disabled, ...p }, ref) => (
  <button ref={ref} className={cn(button({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading} {...p}>
    {loading && <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
    {children}
  </button>
));
Button.displayName = 'Button';
