/** @type {import('@ladle/react').UserConfig} */
export default {
  stories: 'src/**/*.stories.tsx',
  defaultStory: 'ui--button--variants',
  outDir: 'dist-stories',
  addons: { theme: { enabled: true, defaultState: 'dark' }, a11y: { enabled: true } },
};
