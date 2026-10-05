import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { cn } from '../lib/cn';

const iconButton = cva(
  'inline-flex shrink-0 items-center justify-center transition-colors disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      variant: {
        ghost: 'bg-transparent text-text-muted hover:bg-surface-alt hover:text-text',
        solid: 'border border-border-strong bg-surface text-text hover:border-outline',
        danger: 'bg-transparent text-danger-text hover:bg-danger/10',
      },
      size: { md: 'size-11 rounded-btn', sm: 'size-9 rounded-input' },
    },
    defaultVariants: { variant: 'ghost', size: 'sm' },
  },
);

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> &
  VariantProps<typeof iconButton> & {
    /** Required: an icon-only button has no visible text. */
    label: string;
    children: ReactNode;
  };

export const IconButton = forwardRef<HTMLButtonElement, Props>(
  ({ className, variant, size, label, children, type = 'button', ...p }, ref) => (
    <button ref={ref} type={type} aria-label={label} title={label} className={cn(iconButton({ variant, size }), className)} {...p}>
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';
