import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { Button } from './Button';
import { Checkbox } from './Checkbox';
import { IconButton } from './IconButton';
import { Segmented } from './Segmented';
import { Switch } from './Switch';
import { Chip, TabPills } from './TabPills';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

describe('Button', () => {
  it('calls onClick, and not when disabled or loading', async () => {
    const onClick = vi.fn();
    renderUi(
      <>
        <Button onClick={onClick}>Save</Button>
        <Button onClick={onClick} disabled>
          Off
        </Button>
        <Button onClick={onClick} loading>
          Saving
        </Button>
      </>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    await userEvent.click(screen.getByRole('button', { name: 'Off' }));
    await userEvent.click(screen.getByRole('button', { name: 'Saving' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Saving' })).toHaveAttribute('aria-busy', 'true');
  });

  it('applies the variant and size classes from tokens', () => {
    renderUi(
      <Button variant="danger" size="sm">
        Delete
      </Button>,
    );
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('text-danger-text', 'h-10');
  });

  it('IconButton takes its name from `label` and is type=button (never submits a form)', () => {
    renderUi(<IconButton label="Close">x</IconButton>);
    const b = screen.getByRole('button', { name: 'Close' });
    expect(b).toHaveAttribute('type', 'button');
    expect(b).toHaveAttribute('title', 'Close');
  });
});

const pills = [
  { value: 'all', label: 'All' },
  { value: 'free', label: 'Free for you' },
  { value: 'draft', label: 'Drafts', count: 3 },
];

function Pills({ onChange }: { onChange?: (v: string) => void }) {
  const [v, setV] = useState('all');
  return (
    <TabPills
      label="Filter sessions"
      options={pills}
      value={v}
      onChange={(x) => {
        setV(x);
        onChange?.(x);
      }}
    />
  );
}

describe('TabPills', () => {
  it('is a radio group with one checked pill and a count', () => {
    renderUi(<Pills />);
    expect(screen.getByRole('radiogroup', { name: 'Filter sessions' })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: 'All' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Drafts 3' })).not.toBeChecked();
  });

  it('click selects', async () => {
    const onChange = vi.fn();
    renderUi(<Pills onChange={onChange} />);
    await userEvent.click(screen.getByRole('radio', { name: 'Free for you' }));
    expect(onChange).toHaveBeenCalledWith('free');
    expect(screen.getByRole('radio', { name: 'Free for you' })).toBeChecked();
  });

  it('arrow keys move the choice and the focus, and wrap around; only the chosen pill is in the tab order', async () => {
    renderUi(<Pills />);
    await userEvent.tab();
    expect(screen.getByRole('radio', { name: 'All' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: 'Free for you' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Free for you' })).toHaveFocus();
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(screen.getByRole('radio', { name: 'Drafts 3' })).toBeChecked();
    expect(screen.getAllByRole('radio').filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });

  it('Chip remove button calls onRemove', async () => {
    const onRemove = vi.fn();
    renderUi(<Chip onRemove={onRemove}>Sleep</Chip>);
    await userEvent.click(screen.getByRole('button', { name: 'Remove' }));
    expect(onRemove).toHaveBeenCalled();
  });
});

describe('Segmented', () => {
  function Seg() {
    const [v, setV] = useState('10');
    return (
      <Segmented
        label="Length used"
        value={v}
        onChange={setV}
        options={[
          { value: '10', label: '10 min' },
          { value: '30', label: '30 min', disabled: true },
          { value: '45', label: '45 min' },
        ]}
      />
    );
  }

  it('selects by click and skips disabled options with the arrow keys', async () => {
    renderUi(<Seg />);
    expect(screen.getByRole('radio', { name: '10 min' })).toBeChecked();
    expect(screen.getByRole('radio', { name: '30 min' })).toBeDisabled();
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('radio', { name: '45 min' })).toBeChecked();
    await userEvent.click(screen.getByRole('radio', { name: '10 min' }));
    expect(screen.getByRole('radio', { name: '10 min' })).toBeChecked();
  });
});

describe('Switch and Checkbox', () => {
  it('Switch is named by its label, toggles with click and Space, and respects disabled', async () => {
    const onChange = vi.fn();
    function S() {
      const [on, setOn] = useState(false);
      return (
        <Switch
          label="Maintenance mode"
          description="Downloads keep working"
          checked={on}
          onCheckedChange={(v) => {
            setOn(v);
            onChange(v);
          }}
        />
      );
    }
    renderUi(
      <>
        <S />
        <Switch label="Locked" checked disabled onCheckedChange={onChange} />
      </>,
    );
    const sw = screen.getByRole('switch', { name: /Maintenance mode/ });
    expect(sw).not.toBeChecked();
    await userEvent.click(sw);
    expect(sw).toBeChecked();
    sw.focus();
    await userEvent.keyboard(' ');
    expect(sw).not.toBeChecked();
    expect(onChange.mock.calls.map((c) => c[0])).toEqual([true, false]);
    await userEvent.click(screen.getByRole('switch', { name: 'Locked' }));
    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('Checkbox is named by its label, even when the label is visually hidden', async () => {
    const onChange = vi.fn();
    renderUi(
      <>
        <Checkbox label="Members can download" onChange={onChange} />
        <Checkbox label="Select row 1" hideLabel />
      </>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Members can download' }));
    expect(onChange).toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Select row 1' })).toBeInTheDocument();
  });
});

describe('Tabs', () => {
  it('shows the active panel and moves with the arrow keys', async () => {
    renderUi(
      <Tabs defaultValue="a">
        <TabsList aria-label="Block type">
          <TabsTrigger value="a">Openings</TabsTrigger>
          <TabsTrigger value="b">Closings</TabsTrigger>
        </TabsList>
        <TabsContent value="a">Openings list</TabsContent>
        <TabsContent value="b">Closings list</TabsContent>
      </Tabs>,
    );
    expect(screen.getByRole('tab', { name: 'Openings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Openings list');
    await userEvent.tab();
    await userEvent.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'Closings' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tabpanel')).toHaveTextContent('Closings list');
  });
});
