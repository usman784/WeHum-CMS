import { Plus, X } from 'lucide-react';
import { cn } from '../lib/cn';
import { Button } from './Button';
import { IconButton } from './IconButton';

type Props = {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  max?: number;
  maxLength?: number;
  addLabel?: string;
  className?: string;
};

/** A short list of text lines (intentions, sound beds): edit in place, remove, add. Empty lines are dropped by the caller. */
export function ListEditor({ label, items, onChange, placeholder, max = 6, maxLength = 40, addLabel = 'Add', className }: Props) {
  return (
    <fieldset className={cn('flex flex-col gap-2', className)}>
      <legend className="mb-1 text-sm font-semibold text-text-soft">{label}</legend>
      {items.map((v, i) => (
        <div key={i} className="flex items-center gap-2">
          <input
            aria-label={`${label} ${i + 1}`}
            value={v}
            maxLength={maxLength}
            placeholder={placeholder}
            onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))}
            className="h-10 min-w-0 flex-1 rounded-input border border-border-strong bg-input px-3 text-body text-text hover:border-outline"
          />
          <IconButton label={`Remove ${label} ${i + 1}`} onClick={() => onChange(items.filter((_, j) => j !== i))}>
            <X size={16} aria-hidden />
          </IconButton>
        </div>
      ))}
      {items.length < max ? (
        <Button variant="outline" size="sm" className="self-start" onClick={() => onChange([...items, ''])}>
          <Plus size={14} aria-hidden /> {addLabel}
        </Button>
      ) : null}
    </fieldset>
  );
}
