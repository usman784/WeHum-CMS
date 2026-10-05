import { createRequire } from 'node:module';
import type { Page } from '@playwright/test';

const axePath = createRequire(import.meta.url).resolve('axe-core/axe.min.js');

/**
 * Serious and critical axe violations on the current page, one line per element (spec §13: none allowed).
 * Runs in a real browser, so colour contrast is checked against the rendered colours.
 */
export async function seriousViolations(page: Page, scope?: string): Promise<string[]> {
  await page.addScriptTag({ path: axePath });
  return page.evaluate(async (selector) => {
    type Violation = { id: string; impact: string; nodes: { target: string[]; failureSummary: string }[] };
    const axe = (window as unknown as { axe: { run: (context: string | Document) => Promise<{ violations: Violation[] }> } }).axe;
    const { violations } = await axe.run(selector ?? document);
    return violations
      .filter((v) => v.impact === 'serious' || v.impact === 'critical')
      .flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} — ${n.failureSummary.split('\n')[1]?.trim()}`));
  }, scope);
}

/**
 * While a modal dialog or menu is open, the page behind it is hidden from assistive tech and cannot take focus
 * (focus is trapped). axe would still list every button behind it, so check the open layer on its own.
 */
export const OPEN_LAYER = '[role="dialog"], [role="menu"]';

export const bodyBackground = (page: Page) => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
