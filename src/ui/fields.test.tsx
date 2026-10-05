import { fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderUi } from '../test/render';
import { Input, SearchInput, Textarea } from './Input';
import { NumberInput } from './NumberInput';
import { Select } from './Select';
import { DatePicker, TimeInput } from './TimeInput';

describe('Input', () => {
  it('is named by its label and described by help and error text', () => {
    renderUi(
      <Input
        label="Support email"
        hint="shown in the app"
        help="Members write here."
        error="Enter a full email address."
        defaultValue="a@"
      />,
    );
    const input = screen.getByRole('textbox', { name: 'Support email' });
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(input).toHaveAccessibleDescription('Enter a full email address. Members write here.');
    expect(screen.getByRole('alert')).toHaveTextContent('Enter a full email address.');
  });

  it('has no aria-invalid and no description when there is no error or help', () => {
    renderUi(<Input label="Title" />);
    const input = screen.getByRole('textbox', { name: 'Title' });
    expect(input).not.toHaveAttribute('aria-invalid');
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('keeps a hidden label for screen readers', () => {
    renderUi(<Input label="Search users" hideLabel />);
    expect(screen.getByRole('textbox', { name: 'Search users' })).toBeInTheDocument();
  });

  it('SearchInput is a labelled search box', async () => {
    const onChange = vi.fn();
    renderUi(<SearchInput label="Search sessions" placeholder="Search…" onChange={onChange} />);
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search sessions' }), 'calm');
    expect(onChange).toHaveBeenCalledTimes(4);
  });
});

describe('Textarea', () => {
  function Body({ max }: { max: number }) {
    const [v, setV] = useState('Hello');
    return <Textarea label="Body" maxLength={max} value={v} onChange={(e) => setV(e.target.value)} />;
  }

  it('shows a live character counter', async () => {
    renderUi(<Body max={150} />);
    expect(screen.getByText('5 / 150')).toBeInTheDocument();
    await userEvent.type(screen.getByRole('textbox', { name: 'Body' }), ' you');
    expect(screen.getByText('9 / 150')).toBeInTheDocument();
  });

  it('never cuts text silently: going past the limit keeps the text and turns the counter red', async () => {
    renderUi(<Body max={8} />);
    const box = screen.getByRole('textbox', { name: 'Body' });
    expect(box).not.toHaveAttribute('aria-invalid');
    await userEvent.type(box, ' world');
    expect(box).toHaveValue('Hello world');
    expect(box).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('11 / 8')).toHaveClass('text-danger-text');
  });

  it('marks a value that is already too long (pasted or loaded) as invalid', () => {
    renderUi(<Textarea label="Title" maxLength={5} value="Too long title" onChange={() => {}} />);
    expect(screen.getByRole('textbox', { name: 'Title' })).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('14 / 5')).toHaveClass('text-danger-text');
  });
});

describe('Select', () => {
  const options = [
    { value: 'breathing', label: 'Breathing' },
    { value: 'sleep', label: 'Sleep' },
  ];

  it('lists the options with a placeholder and reports the choice', async () => {
    const onChange = vi.fn();
    renderUi(
      <Select label="Theme" options={options} placeholder="Choose a theme" defaultValue="" onChange={(e) => onChange(e.target.value)} />,
    );
    const select = screen.getByRole('combobox', { name: 'Theme' });
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Choose a theme', 'Breathing', 'Sleep']);
    await userEvent.selectOptions(select, 'sleep');
    expect(onChange).toHaveBeenCalledWith('sleep');
  });

  it('shows the error and marks the control invalid', () => {
    renderUi(<Select label="Teacher" options={options} error="Pick a teacher." />);
    expect(screen.getByRole('combobox', { name: 'Teacher' })).toHaveAccessibleDescription('Pick a teacher.');
  });

  it('inline layout keeps the label wired to the control', () => {
    renderUi(<Select inline size="sm" label="Theme" options={options} />);
    expect(screen.getByRole('combobox', { name: 'Theme' })).toBeInTheDocument();
  });
});

describe('NumberInput', () => {
  function Num({ initial = 10 as number | null, onChange = vi.fn() }) {
    const [v, setV] = useState<number | null>(initial);
    return (
      <NumberInput
        label="Threshold"
        value={v}
        min={0}
        max={12}
        unit="people"
        onChange={(n) => {
          setV(n);
          onChange(n);
        }}
      />
    );
  }

  it('+ and − change the value and stop at min and max', async () => {
    renderUi(<Num initial={11} />);
    const input = screen.getByRole('spinbutton', { name: 'Threshold' });
    await userEvent.click(screen.getByRole('button', { name: 'Increase' }));
    expect(input).toHaveValue('12');
    expect(screen.getByRole('button', { name: 'Increase' })).toBeDisabled();
    await userEvent.click(screen.getByRole('button', { name: 'Decrease' }));
    expect(input).toHaveValue('11');
  });

  it('arrow keys step the value', async () => {
    renderUi(<Num initial={5} />);
    const input = screen.getByRole('spinbutton', { name: 'Threshold' });
    input.focus();
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowDown}');
    expect(input).toHaveValue('6');
  });

  it('clamps a typed value when the field loses focus', async () => {
    const onChange = vi.fn();
    renderUi(<Num onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Threshold' });
    await userEvent.clear(input);
    await userEvent.type(input, '999');
    await userEvent.tab();
    expect(input).toHaveValue('12');
    expect(onChange).toHaveBeenLastCalledWith(12);
  });

  it('ignores letters and reports null when emptied', async () => {
    const onChange = vi.fn();
    renderUi(<Num onChange={onChange} />);
    const input = screen.getByRole('spinbutton', { name: 'Threshold' });
    await userEvent.clear(input);
    await userEvent.type(input, 'abc');
    expect(input).toHaveValue('');
    await userEvent.tab();
    expect(onChange).toHaveBeenLastCalledWith(null);
    // with no value, both buttons work: they start from the minimum
    expect(screen.getByRole('button', { name: 'Increase' })).toBeEnabled();
  });
});

describe('TimeInput', () => {
  const cities = () =>
    Object.fromEntries(
      screen
        .getAllByRole('listitem')
        .map((li) => li.textContent ?? '')
        .map((t) => [t.replace(/\d.*$/, ''), t.replace(/^\D+/, '')]),
    );

  it('shows Berlin, New York, Lahore and Sydney for a UTC time (northern summer)', () => {
    renderUi(<TimeInput label="Group start time" value="13:00" onChange={() => {}} utcDate="2026-07-01" />);
    expect(screen.getByLabelText('Group start time')).toHaveValue('13:00');
    expect(screen.getByText('UTC')).toBeInTheDocument();
    expect(cities()).toEqual({ Berlin: '15:00', 'New York': '09:00', Lahore: '18:00', Sydney: '23:00' });
  });

  it('local times shift with daylight saving while UTC stays fixed, and a next-day time says so', () => {
    renderUi(<TimeInput label="Group start time" value="13:00" onChange={() => {}} utcDate="2026-12-01" />);
    expect(cities()).toEqual({ Berlin: '14:00', 'New York': '08:00', Lahore: '18:00', Sydney: '00:00next day' });
  });

  it('reports the new time and hides previews for an incomplete value', () => {
    const onChange = vi.fn();
    const { rerender } = renderUi(<TimeInput label="Start" value="13:00" onChange={onChange} utcDate="2026-07-01" />);
    fireEvent.change(screen.getByLabelText('Start'), { target: { value: '21:30' } });
    expect(onChange).toHaveBeenCalledWith('21:30');
    rerender(<TimeInput label="Start" value="" onChange={onChange} utcDate="2026-07-01" />);
    expect(screen.queryByRole('list', { name: 'Local times' })).not.toBeInTheDocument();
  });
});

describe('DatePicker', () => {
  it('is a labelled date input with error wiring', () => {
    renderUi(<DatePicker label="Show from" defaultValue="2026-10-08" error="Pick a date in the future." />);
    const input = screen.getByLabelText('Show from');
    expect(input).toHaveAttribute('type', 'date');
    expect(input).toHaveValue('2026-10-08');
    expect(input).toHaveAccessibleDescription('Pick a date in the future.');
  });
});
