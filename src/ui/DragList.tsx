import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  rectSortingStrategy,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { GripVertical } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { cn } from '../lib/cn';

/** New order after moving one item. Exported so the reorder rule can be tested without a pointer. */
export function reorder<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) return items;
  return arrayMove(items, from, to);
}

type Props<T> = {
  /** Names the list, e.g. "Theme order". */
  label: string;
  items: T[];
  itemKey: (item: T) => string;
  /** Used in screen-reader announcements, e.g. the theme name. */
  itemLabel: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /** Receives the full new order. Do the optimistic update and the `PUT …/order` call here. */
  onReorder: (items: T[]) => void;
  disabled?: boolean;
  /** `grid`: items flow in columns (set the columns with `className`, e.g. "grid grid-cols-2 gap-3.5"). */
  layout?: 'list' | 'grid';
  /** Classes for each item. Default: a row with a top border. */
  itemClassName?: string;
  className?: string;
};

/**
 * Drag-to-reorder list (themes, SoS tiles, program days, MOTD dates, sound blocks).
 * Keyboard: focus the handle, Space to pick up, arrow keys to move, Space to drop, Esc to cancel.
 */
export function DragList<T>({
  label,
  items,
  itemKey,
  itemLabel,
  renderItem,
  onReorder,
  disabled,
  layout = 'list',
  itemClassName,
  className,
}: Props<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const ids = items.map(itemKey);
  const name = (id: string | number) => {
    const item = items[ids.indexOf(String(id))];
    return item ? itemLabel(item) : String(id);
  };
  const pos = (id: string | number) => ids.indexOf(String(id)) + 1;

  // The item is "over" its own place the moment it is picked up. Announce a position only when it changes,
  // otherwise that first event would replace the "Picked up…" message before a screen reader can read it.
  const lastOver = useRef<string | number | null>(null);
  const announcements: Announcements = {
    onDragStart: ({ active }) => {
      lastOver.current = active.id;
      return `Picked up ${name(active.id)}. Position ${pos(active.id)} of ${ids.length}.`;
    },
    onDragOver: ({ active, over }) => {
      if (!over || over.id === lastOver.current) return undefined;
      lastOver.current = over.id;
      return `${name(active.id)} is over position ${pos(over.id)} of ${ids.length}.`;
    },
    onDragEnd: ({ active, over }) =>
      over ? `${name(active.id)} dropped at position ${pos(over.id)} of ${ids.length}.` : `${name(active.id)} dropped.`,
    onDragCancel: ({ active }) => `Move cancelled. ${name(active.id)} is back at position ${pos(active.id)}.`,
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    if (!over || active.id === over.id) return;
    const next = reorder(items, ids.indexOf(String(active.id)), ids.indexOf(String(over.id)));
    if (next !== items) onReorder(next);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
      accessibility={{
        announcements,
        screenReaderInstructions: {
          draggable:
            'To reorder, press Space to pick up, use the arrow keys to move, and press Space again to drop. Press Escape to cancel.',
        },
      }}
    >
      <SortableContext items={ids} strategy={layout === 'grid' ? rectSortingStrategy : verticalListSortingStrategy} disabled={disabled}>
        <ol aria-label={label} className={cn(layout === 'list' && 'flex flex-col', className)}>
          {items.map((item, i) => (
            <Row key={ids[i]} id={ids[i]!} label={itemLabel(item)} disabled={disabled} className={itemClassName}>
              {renderItem(item, i)}
            </Row>
          ))}
        </ol>
      </SortableContext>
    </DndContext>
  );
}

function Row({
  id,
  label,
  disabled,
  className,
  children,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id });
  return (
    <li
      ref={setNodeRef}
      style={{
        transform: transform ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)` : undefined,
        transition,
      }}
      className={cn(
        'flex min-h-14 items-center gap-2',
        className ?? 'border-t border-border bg-surface first:border-t-0',
        isDragging && 'relative z-10 rounded-tile border border-ember shadow-xl',
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        disabled={disabled}
        aria-label={`Reorder ${label}`}
        className="flex size-9 shrink-0 cursor-grab touch-none items-center justify-center rounded-input text-text-faint hover:bg-surface-alt hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        {...attributes}
        {...listeners}
      >
        <GripVertical size={18} aria-hidden />
      </button>
      <div className="min-w-0 flex-1">{children}</div>
    </li>
  );
}
