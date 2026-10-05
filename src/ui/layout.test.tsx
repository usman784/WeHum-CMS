import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { Card, SectionCard } from './Card';
import { DragList, reorder } from './DragList';
import { AuditStamp, PageHeader } from './PageHeader';
import { PhonePreview } from './PhonePreview';

describe('PageHeader', () => {
  it('renders the single h1 with overline, subtitle, badge and actions', () => {
    renderUi(
      <PageHeader
        overline="Sessions · Edit"
        title="Steady Under Pressure"
        subtitle="15 min"
        badge={<span>Draft</span>}
        actions={<button type="button">Publish</button>}
      />,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Steady Under Pressure');
    expect(screen.getByText('Sessions · Edit')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Publish' })).toBeInTheDocument();
  });

  it('the back button is a real link with a name', () => {
    renderUi(<PageHeader title="Edit" backTo="/sessions" backLabel="Back to sessions" />);
    expect(screen.getByRole('link', { name: 'Back to sessions' })).toHaveAttribute('href', '/sessions');
  });
});

describe('AuditStamp', () => {
  it('shows who and how long ago, with a machine-readable time and the UTC time on focus', async () => {
    const at = new Date(Date.now() - 2 * 60_000);
    renderUi(<AuditStamp by="Lena" at={at} />);
    expect(screen.getByText(/Edited by Lena ·/)).toHaveTextContent('2 min. ago');
    expect(screen.getByText('2 min. ago')).toHaveAttribute('datetime', at.toISOString());
    await userEvent.tab();
    expect(await screen.findByRole('tooltip')).toHaveTextContent(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2} UTC$/);
  });

  it('works without a name', () => {
    renderUi(<AuditStamp verb="Autosaved" at={new Date()} />);
    expect(screen.getByText(/Autosaved ·/)).toHaveTextContent('just now');
  });
});

describe('Card', () => {
  it('SectionCard has a heading and an action slot', () => {
    renderUi(
      <>
        <Card>Plain</Card>
        <SectionCard title="Needs attention" description="Fix these" action={<a href="/x">Open</a>}>
          body
        </SectionCard>
      </>,
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Needs attention' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open' })).toBeInTheDocument();
  });
});

describe('PhonePreview', () => {
  it('pins the dark tokens inside the frame, whatever the CMS theme is', () => {
    document.documentElement.dataset.theme = 'light';
    renderUi(<PhonePreview caption="Preview · Thu">card</PhonePreview>);
    const frame = screen.getByText('card');
    expect(frame).toHaveAttribute('data-theme', 'dark');
    expect(screen.getByRole('complementary', { name: 'App preview' })).toBeInTheDocument();
  });
});

describe('DragList', () => {
  const items = [
    { id: 'a', name: 'Transcendent' },
    { id: 'b', name: 'Mindfulness' },
    { id: 'c', name: 'Breathing' },
  ];

  it('reorder() moves one item and leaves the input untouched', () => {
    expect(reorder(items, 0, 2).map((i) => i.id)).toEqual(['b', 'c', 'a']);
    expect(reorder(items, 2, 0).map((i) => i.id)).toEqual(['c', 'a', 'b']);
    expect(items.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });

  it('reorder() returns the same array when nothing changes or an index is out of range', () => {
    expect(reorder(items, 1, 1)).toBe(items);
    expect(reorder(items, -1, 1)).toBe(items);
    expect(reorder(items, 0, 9)).toBe(items);
  });

  it('renders an ordered list with one named handle per item and screen-reader instructions', () => {
    renderUi(
      <DragList
        label="Theme order"
        items={items}
        itemKey={(i) => i.id}
        itemLabel={(i) => i.name}
        onReorder={() => {}}
        renderItem={(i) => i.name}
      />,
    );
    expect(screen.getByRole('list', { name: 'Theme order' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Transcendent', 'Mindfulness', 'Breathing']);
    const handle = screen.getByRole('button', { name: 'Reorder Mindfulness' });
    expect(handle).toHaveAccessibleDescription(/press Space to pick up, use the arrow keys to move/);
  });

  it('keyboard: Space picks up, arrow moves, Space drops → onReorder gets the new order', async () => {
    // jsdom has no layout: give each row a box so the list can tell which row is under the moved one.
    const rect = (top: number) => ({
      top,
      bottom: top + 56,
      left: 0,
      right: 300,
      width: 300,
      height: 56,
      x: 0,
      y: top,
      toJSON: () => ({}),
    });
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
      const li = this.closest('li');
      const index = li ? [...(li.parentElement?.children ?? [])].indexOf(li) : 0;
      return rect(index * 56) as DOMRect;
    });
    const onReorder = vi.fn();
    renderUi(
      <DragList
        label="Theme order"
        items={items}
        itemKey={(i) => i.id}
        itemLabel={(i) => i.name}
        onReorder={onReorder}
        renderItem={(i) => i.name}
      />,
    );
    screen.getByRole('button', { name: 'Reorder Transcendent' }).focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard(' ');
    expect(onReorder).toHaveBeenCalledTimes(1);
    expect(onReorder.mock.calls[0]?.[0].map((i: { id: string }) => i.id)).toEqual(['b', 'a', 'c']);
  });

  it('handles are disabled when the list is locked', () => {
    renderUi(
      <DragList
        label="Theme order"
        items={items}
        itemKey={(i) => i.id}
        itemLabel={(i) => i.name}
        onReorder={() => {}}
        renderItem={(i) => i.name}
        disabled
      />,
    );
    expect(screen.getByRole('button', { name: 'Reorder Breathing' })).toBeDisabled();
  });
});
