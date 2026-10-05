import type { ComponentType } from 'react';

type StoryModule = { default?: { title?: string } } & Record<string, unknown>;

export type StoryGroup = { title: string; stories: { name: string; Component: ComponentType }[] };

/** "SortSelectAndColumns" → "Sort select and columns" */
const words = (s: string) =>
  s
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/^./, (c) => c.toUpperCase())
    .replace(/ ([A-Z])/g, (_, c: string) => ` ${c.toLowerCase()}`);

/** Every `ui/*.stories.tsx` file. The same files feed Ladle, this gallery and the automated accessibility tests. */
export function loadStories(): StoryGroup[] {
  const modules = import.meta.glob<StoryModule>('../../ui/*.stories.tsx', { eager: true });
  return Object.entries(modules)
    .map(([path, mod]) => ({
      title: (mod.default?.title ?? path).replace(/^ui\//, ''),
      stories: Object.entries(mod)
        .filter(([name, v]) => name !== 'default' && typeof v === 'function')
        .map(([name, v]) => ({ name: words(name), Component: v as ComponentType })),
    }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
