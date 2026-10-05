import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createQueryClient } from '../lib/query';
import { getTheme, initTheme, setTheme } from '../lib/theme';
import { App } from './App';
import { Providers } from './providers';

const shell = () =>
  render(
    <Providers client={createQueryClient()}>
      <App />
    </Providers>,
  );
const htmlTheme = () => document.documentElement.dataset.theme;

describe('shell', () => {
  it('renders in the dark theme by default', () => {
    initTheme();
    shell();
    expect(htmlTheme()).toBe('dark');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('The CMS foundation is ready');
    expect(screen.getByRole('status')).toHaveTextContent('Offline');
    expect(screen.getByRole('button', { name: 'Switch to light theme' })).toBeInTheDocument();
  });

  it('switches to light and back, and remembers the choice', async () => {
    initTheme();
    shell();
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(htmlTheme()).toBe('light');
    expect(localStorage.getItem('wh_theme')).toBe('light');
    await userEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
    expect(htmlTheme()).toBe('dark');
    expect(localStorage.getItem('wh_theme')).toBe('dark');
  });

  it('renders in the light theme when it was saved', () => {
    localStorage.setItem('wh_theme', 'light');
    initTheme();
    shell();
    expect(htmlTheme()).toBe('light');
    expect(screen.getByRole('button', { name: 'Switch to dark theme' })).toBeInTheDocument();
  });

  it('ignores a bad saved value', () => {
    localStorage.setItem('wh_theme', 'pink');
    initTheme();
    expect(getTheme()).toBe('dark');
  });

  it('shows every button variant, with the loading one disabled', () => {
    shell();
    for (const name of ['Primary', 'Secondary', 'Outline', 'Danger', 'Ghost']) expect(screen.getByRole('button', { name })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Loading' })).toBeDisabled();
    setTheme('dark');
  });
});

describe('tokens.css', () => {
  const css = readFileSync('src/styles/tokens.css', 'utf8');
  const vars = (block: string) => [...block.matchAll(/--c-[a-z-]+(?=:)/g)].map((m) => m[0]).sort();
  const [dark = '', light = ''] = css.split(':root[data-theme="light"]');

  it('defines the same set of tokens for dark and light', () => {
    expect(vars(dark).length).toBeGreaterThan(20);
    expect(vars(light)).toEqual(vars(dark));
  });

  it('matches the spec §3 key colours', () => {
    expect(dark).toContain('--c-bg: 11 13 14;');
    expect(dark).toContain('--c-ember: 255 122 69;');
    expect(light).toContain('--c-bg: 247 245 242;');
    expect(light).toContain('--c-ember: 232 98 44;');
  });
});
