import { Plus } from 'lucide-react';
import { useState } from 'react';
import { navFor } from '../app/layout/Sidebar';
import { Badge } from './Badge';
import { Button } from './Button';
import { Card } from './Card';
import { DragList } from './DragList';
import { AuditStamp, PageHeader } from './PageHeader';
import { SidebarNav } from './SidebarNav';

export default { title: 'ui/Layout' };

// `as="h2"` only because the gallery page already has its own <h1>. Real screens use the default.
export const PageHeaders = () => (
  <div className="flex flex-col gap-6">
    <PageHeader
      as="h2"
      title="Sessions"
      badge={<Badge caps>142 meditations</Badge>}
      subtitle="Every practice in the app: audio, video and free YouTube links."
      actions={
        <>
          <Button variant="outline">Bulk upload</Button>
          <Button>
            <Plus size={16} aria-hidden />
            New session
          </Button>
        </>
      }
    />
    <AuditStamp by="Lena" at={new Date(Date.now() - 2 * 60_000)} />
  </div>
);

export const EditorHeader = () => (
  <PageHeader
    as="h2"
    overline="Sessions · Edit"
    title="Steady Under Pressure"
    backTo="/sessions"
    backLabel="Back to sessions"
    actions={
      <>
        <AuditStamp verb="Autosaved" at={new Date(Date.now() - 2 * 60_000)} />
        <Button variant="outline">Save draft</Button>
        <Button>Publish</Button>
      </>
    }
  />
);

type Theme = { id: string; name: string; count: number };

export const DragToReorder = () => {
  const [items, setItems] = useState<Theme[]>([
    { id: 't1', name: 'Transcendent', count: 18 },
    { id: 't2', name: 'Loving Kindness', count: 12 },
    { id: 't3', name: 'Mindfulness', count: 24 },
    { id: 't4', name: 'Breathing', count: 31 },
  ]);
  return (
    <Card padded={false} className="max-w-md px-2">
      <DragList
        label="Theme order"
        items={items}
        itemKey={(t) => t.id}
        itemLabel={(t) => t.name}
        onReorder={setItems}
        renderItem={(t, i) => (
          <div className="flex items-center gap-3 pr-3">
            <span className="tabular w-5 text-sm text-text-faint">{i + 1}</span>
            <span className="flex-1 font-semibold">{t.name}</span>
            <span className="tabular text-sm text-text-muted">{t.count} sessions</span>
          </div>
        )}
      />
    </Card>
  );
};

export const SidebarLinksEditor = () => (
  <div className="flex w-sidebar flex-col gap-0.5 rounded-card border border-border bg-sidebar p-3.5">
    <SidebarNav sections={navFor('editor')} />
  </div>
);

export const SidebarLinksModerator = () => (
  <div className="flex w-sidebar flex-col gap-0.5 rounded-card border border-border bg-sidebar p-3.5">
    <SidebarNav sections={navFor('moderator', 7)} />
  </div>
);
