import { Plus, Trash2, Upload } from 'lucide-react';
import { Button } from './Button';
import { IconButton } from './IconButton';

export default { title: 'ui/Button' };

export const Variants = () => (
  <div className="flex flex-wrap gap-3">
    <Button>Publish</Button>
    <Button variant="secondary">Secondary</Button>
    <Button variant="outline">Save draft</Button>
    <Button variant="danger">Delete</Button>
    <Button variant="ghost">Cancel</Button>
  </div>
);

export const SizesAndIcons = () => (
  <div className="flex flex-wrap items-center gap-3">
    <Button>
      <Plus size={16} aria-hidden />
      New session
    </Button>
    <Button variant="outline">
      <Upload size={16} aria-hidden />
      Bulk upload
    </Button>
    <Button size="sm">Small</Button>
    <Button size="sm" variant="outline">
      Small outline
    </Button>
  </div>
);

export const LoadingAndDisabled = () => (
  <div className="flex flex-wrap gap-3">
    <Button loading>Saving</Button>
    <Button disabled>Disabled</Button>
    <Button variant="outline" disabled>
      Disabled outline
    </Button>
  </div>
);

export const IconButtons = () => (
  <div className="flex flex-wrap items-center gap-3">
    <IconButton label="Add">
      <Plus size={18} aria-hidden />
    </IconButton>
    <IconButton label="Upload" variant="solid" size="md">
      <Upload size={18} aria-hidden />
    </IconButton>
    <IconButton label="Delete" variant="danger">
      <Trash2 size={18} aria-hidden />
    </IconButton>
    <IconButton label="Disabled" disabled>
      <Plus size={18} aria-hidden />
    </IconButton>
  </div>
);
