import { useMemo } from 'react';
import { PageHeader } from '../../ui/PageHeader';
import { loadStories } from './stories';

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-');

/**
 * Component gallery at `/kit` (not in production builds): every UI primitive on one page, in the current theme.
 * Playwright runs the accessibility and contrast checks here in dark and light.
 */
export function KitPage() {
  const groups = useMemo(loadStories, []);
  return (
    <>
      <PageHeader title="UI kit" subtitle="Every primitive from spec §5. Switch the theme in the top bar to check both." />
      <nav aria-label="Component groups" className="flex flex-wrap gap-2">
        {groups.map((g) => (
          <a
            key={g.title}
            href={`#${slug(g.title)}`}
            className="rounded-full border border-border-strong bg-surface px-3 py-1.5 text-sm font-semibold text-text-soft hover:border-outline"
          >
            {g.title}
          </a>
        ))}
      </nav>
      {groups.map((g) => (
        <section key={g.title} id={slug(g.title)} aria-labelledby={`${slug(g.title)}-title`} className="flex scroll-mt-4 flex-col gap-4">
          <h2 id={`${slug(g.title)}-title`} className="border-b border-border pb-2 text-h2">
            {g.title}
          </h2>
          {g.stories.map((s) => (
            <div key={s.name} data-story={`${g.title}/${s.name}`} className="flex flex-col gap-3">
              <h3 className="text-overline uppercase text-text-muted">{s.name}</h3>
              <s.Component />
            </div>
          ))}
        </section>
      ))}
    </>
  );
}
