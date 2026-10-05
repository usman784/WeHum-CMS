import { Info } from 'lucide-react';
import { useState } from 'react';
import { ApiError } from '../lib/api';
import { Button } from './Button';
import { ConfirmDialog, Dialog, Drawer } from './Dialog';
import { Input } from './Input';
import { Menu } from './Menu';
import { toast } from './Toast';
import { Tooltip } from './Tooltip';

export default { title: 'ui/Overlays' };

export const Dialogs = () => {
  const [open, setOpen] = useState<'dialog' | 'drawer' | 'confirm' | 'delete' | null>(null);
  const close = (o: boolean) => !o && setOpen(null);
  return (
    <div className="flex flex-wrap gap-3">
      <Button variant="outline" onClick={() => setOpen('dialog')}>
        Open dialog
      </Button>
      <Button variant="outline" onClick={() => setOpen('drawer')}>
        Open drawer
      </Button>
      <Button variant="outline" onClick={() => setOpen('confirm')}>
        Confirm
      </Button>
      <Button variant="danger" onClick={() => setOpen('delete')}>
        Delete user
      </Button>

      <Dialog
        open={open === 'dialog'}
        onOpenChange={close}
        title="Invite member"
        description="They get an email with a link to set a password and 2-step sign-in."
        footer={
          <>
            <Button variant="outline" onClick={() => setOpen(null)}>
              Cancel
            </Button>
            <Button onClick={() => setOpen(null)}>Send invite</Button>
          </>
        }
      >
        <Input label="Email" type="email" placeholder="name@wehum.app" />
      </Dialog>

      <Drawer
        open={open === 'drawer'}
        onOpenChange={close}
        title="Edit challenge"
        footer={<Button onClick={() => setOpen(null)}>Save</Button>}
      >
        <Input label="Name" defaultValue="7 days of calm" />
      </Drawer>

      <ConfirmDialog
        open={open === 'confirm'}
        onOpenChange={close}
        title="End the Founding offer now?"
        description="New members will see the $79/year plan. This cannot be undone."
        confirmLabel="End offer"
        onConfirm={() => setOpen(null)}
      />

      <ConfirmDialog
        open={open === 'delete'}
        onOpenChange={close}
        danger
        title="Delete account and data"
        description="This removes the account and all its data. A store subscription is not cancelled by this."
        typeToConfirm="DELETE Anna"
        confirmLabel="Delete account"
        onConfirm={() => setOpen(null)}
      />
    </div>
  );
};

export const Toasts = () => (
  <div className="flex flex-wrap gap-3">
    <Button variant="outline" onClick={() => toast.success('Session published')}>
      Success toast
    </Button>
    <Button variant="outline" onClick={() => toast.info('3 new users', 'Refresh the list to see them.')}>
      Info toast
    </Button>
    <Button
      variant="outline"
      onClick={() => toast.apiError(new ApiError('INTERNAL', 500, 'Could not save the theme.', undefined, 'trace-7f3a91'))}
    >
      Error toast
    </Button>
  </div>
);

export const TooltipsAndMenu = () => (
  <div className="flex flex-wrap items-center gap-4">
    <Tooltip content="2026-10-08 05:00 UTC">
      <button type="button" className="rounded text-sm text-text-muted underline decoration-dotted underline-offset-4">
        Oct 8, 07:00
      </button>
    </Tooltip>
    <Tooltip content="Only owners and admins can send. You can save a draft.">
      {/* A disabled button cannot be focused, so the wrapper takes focus to show why it is disabled. */}
      {/* eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex */}
      <span tabIndex={0} className="inline-flex rounded-btn">
        <Button disabled>
          <Info size={16} aria-hidden />
          Send
        </Button>
      </span>
    </Tooltip>
    <Menu
      label="More actions for Steady Under Pressure"
      items={[
        { key: 'dup', label: 'Duplicate', onSelect: () => toast.info('Duplicated') },
        { key: 'arch', label: 'Archive', danger: true, onSelect: () => toast.info('Archived') },
        { key: 'del', label: 'Delete', disabled: true, onSelect: () => {} },
      ]}
    />
  </div>
);
