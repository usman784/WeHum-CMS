import { act, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../lib/api';
import { a11yViolations, renderUi } from '../test/render';
import { Button } from './Button';
import { ConfirmDialog, Dialog, Drawer } from './Dialog';
import { Menu } from './Menu';
import { toast } from './Toast';
import { Tooltip } from './Tooltip';

afterEach(() => act(() => toast.clear()));

function Opener({ children }: { children: (open: boolean, set: (o: boolean) => void) => React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Open</Button>
      {children(open, setOpen)}
    </>
  );
}

describe('Dialog', () => {
  it('opens as a named modal, traps focus, closes with Esc and returns focus to the opener', async () => {
    renderUi(
      <Opener>
        {(open, set) => (
          <Dialog
            open={open}
            onOpenChange={set}
            title="Invite member"
            description="They get an email."
            footer={<Button>Send invite</Button>}
          >
            <input aria-label="Email" />
          </Dialog>
        )}
      </Opener>,
    );
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Invite member' });
    expect(dialog).toHaveAccessibleDescription('They get an email.');
    expect(dialog).toContainElement(document.activeElement as HTMLElement);
    for (let i = 0; i < 6; i++) {
      await userEvent.tab();
      expect(dialog).toContainElement(document.activeElement as HTMLElement);
    }
    expect(await a11yViolations(dialog)).toEqual([]);
    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open' })).toHaveFocus());
  });

  it('the close button closes it', async () => {
    renderUi(<Opener>{(open, set) => <Drawer open={open} onOpenChange={set} title="Edit challenge" />}</Opener>);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
});

describe('ConfirmDialog', () => {
  it('confirms and cancels', async () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    renderUi(<ConfirmDialog open onOpenChange={onOpenChange} title="End the offer?" confirmLabel="End offer" onConfirm={onConfirm} />);
    await userEvent.click(screen.getByRole('button', { name: 'End offer' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('typed confirmation: the button stays off until the exact text is typed', async () => {
    const onConfirm = vi.fn();
    renderUi(
      <ConfirmDialog
        open
        onOpenChange={() => {}}
        danger
        title="Delete account and data"
        typeToConfirm="DELETE Anna"
        confirmLabel="Delete account"
        onConfirm={onConfirm}
      />,
    );
    const confirm = screen.getByRole('button', { name: 'Delete account' });
    const input = screen.getByRole('textbox', { name: /Type DELETE Anna to confirm/ });
    expect(confirm).toBeDisabled();
    await userEvent.type(input, 'delete anna');
    expect(confirm).toBeDisabled();
    await userEvent.clear(input);
    await userEvent.type(input, 'DELETE Anna');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('forgets the typed text when it is closed and opened again', async () => {
    renderUi(
      <Opener>
        {(open, set) => (
          <ConfirmDialog
            open={open}
            onOpenChange={set}
            title="Delete"
            typeToConfirm="DELETE"
            confirmLabel="Delete it"
            onConfirm={() => {}}
          />
        )}
      </Opener>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.type(screen.getByRole('textbox'), 'DELETE');
    expect(screen.getByRole('button', { name: 'Delete it' })).toBeEnabled();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Delete it' })).toBeDisabled();
  });

  it('shows the busy state while the action runs', () => {
    renderUi(<ConfirmDialog open onOpenChange={() => {}} title="Delete" confirmLabel="Delete it" loading onConfirm={() => {}} />);
    expect(screen.getByRole('button', { name: 'Delete it' })).toBeDisabled();
  });
});

describe('toast', () => {
  it('shows success and info messages', async () => {
    renderUi(<div />);
    act(() => {
      toast.success('Session published');
      toast.info('3 new users', 'Refresh the list to see them.');
    });
    expect(await screen.findByText('Session published')).toBeInTheDocument();
    expect(screen.getByText('Refresh the list to see them.')).toBeInTheDocument();
  });

  it('apiError shows the API message with its traceId', async () => {
    renderUi(<div />);
    act(() => void toast.apiError(new ApiError('INTERNAL', 500, 'Could not save the theme.', undefined, 'trace-7f3a91')));
    expect(await screen.findByText('Could not save the theme.')).toBeInTheDocument();
    expect(screen.getByText('Reference: trace-7f3a91')).toBeInTheDocument();
  });

  it('apiError falls back to a plain message for an unknown error', async () => {
    renderUi(<div />);
    act(() => void toast.apiError('boom', 'Could not save.'));
    expect(await screen.findByText('Could not save.')).toBeInTheDocument();
  });

  it('can be dismissed', async () => {
    renderUi(<div />);
    act(() => void toast.success('Saved'));
    await userEvent.click(await screen.findByRole('button', { name: 'Dismiss' }));
    await waitFor(() => expect(screen.queryByText('Saved')).not.toBeInTheDocument());
  });
});

describe('Tooltip', () => {
  it('appears on keyboard focus and is tied to the trigger', async () => {
    renderUi(
      <Tooltip content="2026-10-08 05:00 UTC">
        <button type="button">Oct 8, 07:00</button>
      </Tooltip>,
    );
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('2026-10-08 05:00 UTC');
    expect(screen.getByRole('button', { name: 'Oct 8, 07:00' })).toHaveAccessibleDescription('2026-10-08 05:00 UTC');
  });

  it('renders only the child when there is nothing to say', async () => {
    renderUi(
      <Tooltip content="">
        <button type="button">Plain</button>
      </Tooltip>,
    );
    await userEvent.tab();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});

describe('Menu', () => {
  it('opens from the trigger, runs the chosen action, and skips disabled items', async () => {
    const dup = vi.fn();
    const del = vi.fn();
    renderUi(
      <Menu
        label="More actions for Steady Under Pressure"
        items={[
          { key: 'dup', label: 'Duplicate', onSelect: dup },
          { key: 'del', label: 'Delete', onSelect: del, disabled: true, danger: true },
        ]}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Steady Under Pressure' }));
    expect(screen.getByRole('menuitem', { name: 'Delete' })).toHaveAttribute('aria-disabled', 'true');
    await userEvent.click(screen.getByRole('menuitem', { name: 'Duplicate' }));
    expect(dup).toHaveBeenCalledTimes(1);
    expect(del).not.toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole('menu')).not.toBeInTheDocument());
  });

  it('works from the keyboard', async () => {
    const arch = vi.fn();
    renderUi(
      <Menu
        items={[
          { key: 'dup', label: 'Duplicate', onSelect: () => {} },
          { key: 'arch', label: 'Archive', onSelect: arch },
        ]}
      />,
    );
    await userEvent.tab();
    await userEvent.keyboard('{Enter}');
    await screen.findByRole('menu');
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(arch).toHaveBeenCalledTimes(1);
  });
});
