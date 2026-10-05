import { expect, test } from '@playwright/test';
import { bodyBackground, OPEN_LAYER, seriousViolations } from './axe';
import { openAs } from './session';

// The gallery at /kit shows every UI primitive (the same stories Ladle shows). These tests are the
// "component tests + axe; dark/light" exit check of phase P1, run in a real browser.

for (const theme of ['dark', 'light'] as const) {
  test(`every primitive passes axe (incl. colour contrast) in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('wh_theme', t), theme);
    await openAs(page, 'owner', '/kit');
    await expect(page.getByRole('heading', { level: 1, name: 'UI kit' })).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await bodyBackground(page)).toBe(theme === 'dark' ? 'rgb(11, 13, 14)' : 'rgb(247, 245, 242)');
    expect(await page.locator('[data-story]').count()).toBeGreaterThanOrEqual(25);
    expect(await seriousViolations(page)).toEqual([]);
    await page.screenshot({ path: `test-results/p1-kit-${theme}.png`, fullPage: true });
  });

  test(`dialog, typed confirm, menu and toast pass axe in ${theme}`, async ({ page }) => {
    await page.addInitScript((t) => localStorage.setItem('wh_theme', t), theme);
    await openAs(page, 'owner', '/kit');

    await page.getByRole('button', { name: 'Delete user' }).click();
    const dialog = page.getByRole('dialog', { name: 'Delete account and data' });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole('button', { name: 'Delete account' });
    await expect(confirm).toBeDisabled();
    expect(await seriousViolations(page, OPEN_LAYER)).toEqual([]);
    await dialog.getByRole('textbox').fill('DELETE Anna');
    await expect(confirm).toBeEnabled();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByRole('button', { name: 'Delete user' })).toBeFocused();

    await page.getByRole('button', { name: 'Error toast' }).click();
    await expect(page.getByText('Reference: trace-7f3a91').last()).toBeVisible();
    expect(await seriousViolations(page), 'page with a toast showing').toEqual([]);
    await page
      .getByRole('button', { name: /^More actions for Steady Under Pressure$/ })
      .last()
      .click();
    await expect(page.getByRole('menuitem', { name: 'Duplicate' })).toBeVisible();
    expect(await seriousViolations(page, OPEN_LAYER)).toEqual([]);
  });
}

test('table: sort by click, select a row, hide a column', async ({ page }) => {
  await openAs(page, 'owner', '/kit');
  const story = page.locator('[data-story="DataTable/Sort select and columns"]');
  const table = story.getByRole('table', { name: 'Sessions' });
  const first = () => table.getByRole('row').nth(1).getByRole('cell').nth(1);
  await expect(first()).toContainText('Steady Under Pressure');
  await story.getByRole('button', { name: 'Session', exact: true }).click();
  await expect(first()).toContainText('Open Awareness & Silence');
  await story.getByRole('checkbox', { name: 'Select row 1' }).check();
  await expect(story.getByText(/2 selected/)).toBeVisible();
  await expect(story.getByText('Last row opened: nothing yet')).toBeVisible(); // ticking a box did not open the row
  await story.getByRole('button', { name: 'Columns' }).click();
  await page.getByRole('menuitem', { name: 'Hide plays' }).click();
  await expect(table.getByRole('columnheader', { name: 'Plays' })).toHaveCount(0);
});

test('table: 1,000 rows stay light (virtual rows) and scroll to the end', async ({ page }) => {
  await openAs(page, 'owner', '/kit');
  const table = page.locator('[data-story="DataTable/Virtual rows"]').getByRole('table');
  expect(await table.getByRole('row').count()).toBeLessThan(40);
  await table
    .locator('[role="rowgroup"]')
    .last()
    .evaluate((el) => el.scrollTo(0, el.scrollHeight));
  await expect(table.getByText('Session 1000', { exact: true })).toBeVisible();
  expect(await table.getByRole('row').count()).toBeLessThan(40);
});

test('drag list: reorder with the keyboard', async ({ page }) => {
  await openAs(page, 'owner', '/kit');
  const list = page.getByRole('list', { name: 'Theme order' });
  const names = () => list.getByRole('listitem').locator('.font-semibold').allTextContents();
  await expect.poll(names).toEqual(['Transcendent', 'Loving Kindness', 'Mindfulness', 'Breathing']);
  await list.getByRole('button', { name: 'Reorder Transcendent' }).focus();
  // Each step is announced to screen readers; waiting for the announcement also paces the key presses.
  const said = (text: string) => expect(page.getByRole('status').filter({ hasText: text })).toHaveCount(1);
  await page.keyboard.press('Space');
  await said('Picked up Transcendent. Position 1 of 4.');
  await page.keyboard.press('ArrowDown');
  await said('Transcendent is over position 2 of 4.');
  await page.keyboard.press('ArrowDown');
  await said('Transcendent is over position 3 of 4.');
  await page.keyboard.press('Space');
  await said('Transcendent dropped at position 3 of 4.');
  await expect.poll(names).toEqual(['Loving Kindness', 'Mindfulness', 'Transcendent', 'Breathing']);
});

test('drag list: reorder with the mouse', async ({ page }) => {
  await openAs(page, 'owner', '/kit');
  const list = page.getByRole('list', { name: 'Theme order' });
  const names = () => list.getByRole('listitem').locator('.font-semibold').allTextContents();
  await list.scrollIntoViewIfNeeded(); // mouse coordinates are relative to the viewport
  const from = await list.getByRole('button', { name: 'Reorder Breathing' }).boundingBox();
  const to = await list.getByRole('button', { name: 'Reorder Transcendent' }).boundingBox();
  await page.mouse.move(from!.x + from!.width / 2, from!.y + from!.height / 2);
  await page.mouse.down();
  await page.mouse.move(to!.x + to!.width / 2, to!.y + to!.height / 2 - 4, { steps: 12 });
  await page.mouse.up();
  await expect.poll(names).toEqual(['Breathing', 'Transcendent', 'Loving Kindness', 'Mindfulness']);
});

test('time input shows the four local times for the UTC time', async ({ page }) => {
  await openAs(page, 'owner', '/kit');
  const times = page.getByRole('list', { name: 'Local times' });
  await expect(times.getByRole('listitem')).toHaveCount(4);
  await expect(times).toContainText('Berlin15:00'); // 13:00 UTC on 2026-10-08 (summer time)
  await expect(times).toContainText('Lahore18:00');
});
