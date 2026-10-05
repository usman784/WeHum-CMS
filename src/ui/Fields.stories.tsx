import { useState } from 'react';
import { Input, SearchInput, Textarea } from './Input';
import { NumberInput } from './NumberInput';
import { Select } from './Select';
import { DatePicker, TimeInput } from './TimeInput';

export default { title: 'ui/Fields' };

const themes = [
  { value: 'breathing', label: 'Breathing' },
  { value: 'sleep', label: 'Sleep' },
  { value: 'transcendent', label: 'Transcendent' },
];

export const TextInputs = () => (
  <div className="grid max-w-3xl gap-4 md:grid-cols-2">
    <Input label="Title" defaultValue="Steady Under Pressure" />
    <Input label="Support email" type="email" defaultValue="support@" error="Enter a full email address." />
    <Input label="Tags" hint="comma separated" help="Tags feed the app's search." defaultValue="work stress, morning" />
    <Input label="RevenueCat ID" defaultValue="$RCAnonymousID:8f3a" readOnly />
    <Input label="Small" size="sm" placeholder="Oct 8, 2026" />
    <Input label="Disabled" disabled defaultValue="Locked" />
    <SearchInput label="Search sessions" placeholder="Search title, teacher, tag…" />
  </div>
);

export const TextareaWithCounter = () => {
  const [body, setBody] = useState('Your 13:00 group meditation starts in 10 minutes.');
  const [long, setLong] = useState('x'.repeat(55));
  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <Textarea label="Body" maxLength={150} value={body} onChange={(e) => setBody(e.target.value)} />
      <Textarea
        label="Title"
        rows={2}
        maxLength={50}
        value={long}
        onChange={(e) => setLong(e.target.value)}
        error="The title is too long."
      />
    </div>
  );
};

export const Selects = () => (
  <div className="flex max-w-3xl flex-col gap-4">
    <div className="grid gap-4 md:grid-cols-3">
      <Select label="Theme" options={themes} defaultValue="breathing" />
      <Select
        label="Teacher"
        options={[{ value: 'r', label: 'Raphael' }]}
        placeholder="Choose a teacher"
        error="Pick a teacher."
        defaultValue=""
      />
      <Select label="Disabled" options={themes} disabled defaultValue="sleep" />
    </div>
    <div className="flex flex-wrap gap-4">
      <Select inline size="sm" label="Theme" options={[{ value: '', label: 'All 8' }, ...themes]} defaultValue="" />
      <Select
        inline
        size="sm"
        label="Teacher"
        options={[
          { value: '', label: 'All' },
          { value: 'r', label: 'Raphael' },
        ]}
        defaultValue=""
      />
    </div>
  </div>
);

export const Numbers = () => {
  const [n, setN] = useState<number | null>(10);
  const [posts, setPosts] = useState<number | null>(3);
  return (
    <div className="grid max-w-xl gap-4 md:grid-cols-2">
      <NumberInput
        label="Empty-room threshold"
        help="Under this many people the app shows the quiet-room copy."
        value={n}
        onChange={setN}
        min={0}
        max={500}
        unit="people"
      />
      <NumberInput label="Posts per day" value={posts} onChange={setPosts} min={1} max={10} />
    </div>
  );
};

export const TimeAndDate = () => {
  const [t, setT] = useState('13:00');
  return (
    <div className="grid max-w-3xl gap-4 md:grid-cols-2">
      <TimeInput
        label="Group start time"
        value={t}
        onChange={setT}
        utcDate="2026-10-08"
        help="UTC stays fixed all year. Local times shift with daylight saving."
      />
      <DatePicker label="Show in the library from" defaultValue="2026-10-08" />
    </div>
  );
};
