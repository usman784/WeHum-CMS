import type { Config } from 'tailwindcss';

const c = (v: string) => `rgb(var(--c-${v}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: ['selector', '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'), surface: c('surface'), 'surface-alt': c('surface-alt'), input: c('input'),
        border: c('border'), 'border-strong': c('border-strong'), outline: c('outline'),
        text: { DEFAULT: c('text'), body: c('text-body'), soft: c('text-soft'), muted: c('text-muted'), faint: c('text-faint') },
        ember: { DEFAULT: c('ember'), text: c('ember-text'), soft: c('ember-soft'), on: c('on-ember') },
        teal: { DEFAULT: c('teal'), text: c('teal-text') },
        success: c('success'), warning: c('warning'),
        danger: { DEFAULT: c('danger'), text: c('danger-text'), border: c('danger-border') },
        info: { DEFAULT: c('info'), text: c('info-text') },
        lilac: { DEFAULT: c('lilac'), text: c('lilac-text') },
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'sans-serif'] },
      fontSize: {
        h1: ['26px', { lineHeight: '32px', letterSpacing: '-0.4px', fontWeight: '700' }],
        h2: ['18px', { lineHeight: '24px', fontWeight: '700' }],
        h3: ['16px', { lineHeight: '22px', fontWeight: '600' }],
        kpi: ['30px', { lineHeight: '36px', fontWeight: '700' }],
        body: ['14px', { lineHeight: '21px' }],
        sm: ['13px', { lineHeight: '19px' }],
        xs: ['12px', { lineHeight: '17px' }],
        overline: ['11px', { lineHeight: '14px', letterSpacing: '1.2px', fontWeight: '700' }],
      },
      borderRadius: { card: '16px', tile: '12px', input: '10px', btn: '12px' },
      spacing: { sidebar: '248px', gutter: '32px' },
      backgroundImage: {
        vibration: 'linear-gradient(90deg, #3A2A22 0%, #FF7A45 35%, #E5D96B 62%, #4ADE80 100%)',
      },
    },
  },
  plugins: [],
} satisfies Config;
