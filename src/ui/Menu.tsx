import * as Dropdown from '@radix-ui/react-dropdown-menu';
import { Ellipsis } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { IconButton } from './IconButton';

export type MenuItem = { key: string; label: string; icon?: ReactNode; onSelect: () => void; danger?: boolean; disabled?: boolean };

type Props = {
  items: MenuItem[];
  /** Names the trigger, e.g. "More actions for Steady Under Pressure". */
  label?: string;
  /** Custom trigger; default is the three-dot button from the design. */
  trigger?: ReactNode;
};

/** Row actions menu (Radix: arrow keys, type-ahead, Esc, focus returns to the trigger). */
export function Menu({ items, label = 'More actions', trigger }: Props) {
  return (
    <Dropdown.Root>
      <Dropdown.Trigger asChild>
        {trigger ?? (
          <IconButton label={label}>
            <Ellipsis size={18} aria-hidden />
          </IconButton>
        )}
      </Dropdown.Trigger>
      <Dropdown.Portal>
        <Dropdown.Content
          align="end"
          sideOffset={6}
          className="z-50 min-w-44 rounded-tile border border-border-strong bg-surface p-1.5 shadow-xl"
        >
          {items.map((i) => (
            <Dropdown.Item
              key={i.key}
              disabled={i.disabled}
              onSelect={i.onSelect}
              className={cn(
                'flex h-9 cursor-default select-none items-center gap-2.5 rounded-input px-2.5 text-body outline-none data-[disabled]:opacity-50 data-[highlighted]:bg-surface-alt',
                i.danger ? 'text-danger-text' : 'text-text',
              )}
            >
              {i.icon}
              {i.label}
            </Dropdown.Item>
          ))}
        </Dropdown.Content>
      </Dropdown.Portal>
    </Dropdown.Root>
  );
}
