import { describe, expect, it } from 'vitest';
import { loadStories } from '../features/kit/stories';
import { a11yViolations, renderUi } from '../test/render';

const groups = loadStories();
const all = groups.flatMap((g) => g.stories.map((s) => ({ id: `${g.title} / ${s.name}`, Component: s.Component })));

/** Spec §5 lists these primitives; each must appear in at least one story (and so in Ladle, the gallery and these checks). */
const required = [
  'Button', 'IconButton', 'Card', 'KpiTile', 'Badge', 'Chip', 'TabPills', 'Tabs', 'Segmented', 'Switch', 'Checkbox', 'Select', 'Input',
  'Textarea', 'NumberInput', 'TimeInput', 'DatePicker', 'FileDrop', 'AudioPreview', 'ImagePicker', 'DataTable', 'EmptyState', 'ErrorState',
  'Skeleton', 'ConfirmDialog', 'Drawer', 'toast', 'Tooltip', 'PhonePreview', 'LiveDot', 'Sparkline', 'StatBar', 'SidebarNav', 'PageHeader',
  'SectionCard', 'DragList', 'AuditStamp',
]; // prettier-ignore

describe('a11y check', () => {
  it('does catch a real problem (so a clean result means something)', async () => {
    const { container } = renderUi(
      <div>
        <button type="button" />
        {/* eslint-disable-next-line jsx-a11y/alt-text -- the missing alt is the point of this test */}
        <img src="x.png" />
      </div>,
    );
    const found = await a11yViolations(container);
    expect(found.some((v) => v.startsWith('button-name'))).toBe(true);
    expect(found.some((v) => v.startsWith('image-alt'))).toBe(true);
  });
});

describe('stories', () => {
  it('cover every primitive from spec §5', () => {
    const sources = import.meta.glob<string>('./*.stories.tsx', { eager: true, query: '?raw', import: 'default' });
    const text = Object.values(sources).join('\n');
    const missing = required.filter((name) => !new RegExp(`<${name}\\b|\\b${name}\\.`).test(text));
    expect(missing).toEqual([]);
    expect(all.length).toBeGreaterThanOrEqual(25);
  });

  it.each(all)('$id renders with no accessibility violations', async ({ Component }) => {
    const { container } = renderUi(<Component />);
    expect(container).not.toBeEmptyDOMElement();
    expect(await a11yViolations(container)).toEqual([]);
  });
});
