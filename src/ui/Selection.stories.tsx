import { useState } from 'react';
import { Checkbox } from './Checkbox';
import { Segmented } from './Segmented';
import { Switch } from './Switch';
import { TabPills } from './TabPills';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './Tabs';

export default { title: 'ui/Selection' };

export const FilterPills = () => {
  const [v, setV] = useState('all');
  return (
    <TabPills
      label="Filter sessions"
      value={v}
      onChange={setV}
      options={[
        { value: 'all', label: 'All', count: 142 },
        { value: 'free', label: 'Free for you' },
        { value: 'premium', label: 'Premium' },
        { value: 'scheduled', label: 'Scheduled' },
        { value: 'draft', label: 'Drafts', count: 3 },
        { value: 'sos', label: 'SoS' },
      ]}
    />
  );
};

export const UnderlineTabs = () => (
  <Tabs defaultValue="openings">
    <TabsList aria-label="Block type">
      <TabsTrigger value="openings">Openings</TabsTrigger>
      <TabsTrigger value="core">Core blocks</TabsTrigger>
      <TabsTrigger value="closings">Closings</TabsTrigger>
      <TabsTrigger value="bells" disabled>
        Bells
      </TabsTrigger>
    </TabsList>
    <TabsContent value="openings" className="pt-4 text-sm text-text-muted">
      Openings content
    </TabsContent>
    <TabsContent value="core" className="pt-4 text-sm text-text-muted">
      Core blocks content
    </TabsContent>
    <TabsContent value="closings" className="pt-4 text-sm text-text-muted">
      Closings content
    </TabsContent>
  </Tabs>
);

export const VerticalTabs = () => (
  <Tabs defaultValue="team" orientation="vertical" className="grid grid-cols-[240px_minmax(0,1fr)] items-start gap-5">
    <TabsList aria-label="Settings sections">
      <TabsTrigger value="general">General</TabsTrigger>
      <TabsTrigger value="team">Team &amp; roles</TabsTrigger>
      <TabsTrigger value="legal">Legal &amp; privacy</TabsTrigger>
    </TabsList>
    <div>
      <TabsContent value="general" className="text-sm text-text-muted">
        General settings
      </TabsContent>
      <TabsContent value="team" className="text-sm text-text-muted">
        Team &amp; roles settings
      </TabsContent>
      <TabsContent value="legal" className="text-sm text-text-muted">
        Legal settings
      </TabsContent>
    </div>
  </Tabs>
);

export const SegmentedControl = () => {
  const [access, setAccess] = useState<'free' | 'premium'>('premium');
  const [len, setLen] = useState('30');
  return (
    <div className="flex max-w-md flex-col gap-4">
      <Segmented
        label="Access level"
        value={access}
        onChange={setAccess}
        options={[
          { value: 'free', label: 'Free' },
          { value: 'premium', label: 'Premium' },
        ]}
      />
      <Segmented
        label="Length used"
        value={len}
        onChange={setLen}
        options={[
          { value: '10', label: '10 min' },
          { value: '30', label: '30 min' },
          { value: '45', label: '45 min', disabled: true },
        ]}
      />
    </div>
  );
};

export const Toggles = () => {
  const [a, setA] = useState(false);
  const [b, setB] = useState(true);
  return (
    <div className="flex max-w-lg flex-col gap-4">
      <Switch checked={a} onCheckedChange={setA} label="Maintenance mode" description="Downloads and SoS keep working offline" />
      <Switch
        checked
        disabled
        onCheckedChange={() => {}}
        label="Guests can use the app without an account"
        description="Required by Apple. Keep this on."
      />
      <Checkbox checked={b} onChange={(e) => setB(e.target.checked)} label="Members can download" />
      <Checkbox disabled label="Block links" description="Posts with a link are held for review" />
    </div>
  );
};
