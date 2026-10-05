import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { useRef, useState, type ReactNode } from 'react';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { Input } from './Input';

type DialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  children?: ReactNode;
  /** Buttons row. */
  footer?: ReactNode;
  /** `drawer` slides in from the right at full height (side editors). */
  variant?: 'modal' | 'drawer';
  size?: 'sm' | 'md' | 'lg';
};

const widths = { sm: 'max-w-md', md: 'max-w-xl', lg: 'max-w-3xl' };

/** Modal dialog (Radix: focus trap, Esc to close, focus returns to the opener, `aria-modal`). */
export function Dialog({ open, onOpenChange, title, description, children, footer, variant = 'modal', size = 'md' }: DialogProps) {
  // Our dialogs are opened by state, not by a Radix trigger, so Radix does not know where focus came from.
  // Remember the element that had focus when the dialog opened and give focus back to it on close.
  const opener = useRef<HTMLElement | null>(null);
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Portal>
        <RadixDialog.Overlay className="fixed inset-0 z-40 bg-bg/70 backdrop-blur-sm" />
        <RadixDialog.Content
          onOpenAutoFocus={() => {
            opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
          }}
          onCloseAutoFocus={(e) => {
            if (opener.current?.isConnected) {
              e.preventDefault();
              opener.current.focus();
            }
          }}
          // Radix warns when there is no description; `undefined` says "this dialog has none" on purpose.
          {...(description ? {} : { 'aria-describedby': undefined })}
          className={cn(
            'fixed z-50 flex flex-col gap-4 border border-border bg-surface p-6 shadow-2xl focus:outline-none',
            variant === 'modal'
              ? cn('left-1/2 top-1/2 max-h-[85vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 rounded-card', widths[size])
              : cn('inset-y-0 right-0 size-full rounded-l-card', widths[size]),
          )}
        >
          <div className="flex items-start gap-3">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <RadixDialog.Title className="text-h2">{title}</RadixDialog.Title>
              {description ? <RadixDialog.Description className="text-sm text-text-muted">{description}</RadixDialog.Description> : null}
            </div>
            <RadixDialog.Close asChild>
              <IconButton label="Close">
                <X size={18} aria-hidden />
              </IconButton>
            </RadixDialog.Close>
          </div>
          {children ? <div className="min-h-0 flex-1 overflow-y-auto">{children}</div> : null}
          {footer ? <div className="flex flex-wrap items-center justify-end gap-2.5">{footer}</div> : null}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

/** Side panel for editors that keep the list visible behind (Challenges, Themes). */
export function Drawer(p: Omit<DialogProps, 'variant'>) {
  return <Dialog variant="drawer" {...p} />;
}

type ConfirmProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red confirm button for destructive actions. */
  danger?: boolean;
  /** The admin must type this exact text before the confirm button works (e.g. "DELETE Anna"). */
  typeToConfirm?: string;
  loading?: boolean;
  onConfirm: () => void;
  children?: ReactNode;
};

/** Yes/no dialog. Destructive actions add `typeToConfirm` (spec §10: deleting a user needs DELETE + first name). */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  danger,
  typeToConfirm,
  loading,
  onConfirm,
  children,
}: ConfirmProps) {
  const [typed, setTyped] = useState('');
  const ready = !typeToConfirm || typed.trim() === typeToConfirm;
  const change = (o: boolean) => {
    if (!o) setTyped('');
    onOpenChange(o);
  };
  return (
    <Dialog
      open={open}
      onOpenChange={change}
      title={title}
      description={description}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => change(false)}>
            {cancelLabel}
          </Button>
          <Button variant={danger ? 'danger' : 'primary'} disabled={!ready} loading={loading} onClick={onConfirm}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      {children}
      {typeToConfirm ? (
        <Input
          className={children ? 'mt-4' : undefined}
          label={
            <>
              Type <span className="font-bold text-text">{typeToConfirm}</span> to confirm
            </>
          }
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      ) : null}
    </Dialog>
  );
}
