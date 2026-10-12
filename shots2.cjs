// One-off: every CMS screen incl. tabs and detail pages, full height. usage: ADMIN_PW=... node shots2.cjs <outDir>
const { chromium } = require('@playwright/test');
const crypto = require('crypto'), fs = require('fs'), os = require('os'), path = require('path');
const out = process.argv[2];
fs.mkdirSync(out, { recursive: true });
const mfa = JSON.parse(fs.readFileSync(path.join(os.homedir(), 'wehum-demo-admin-mfa.json'), 'utf8'));
const ids = JSON.parse(fs.readFileSync('/private/tmp/claude-501/doc/ids.json', 'utf8'));
function b32(s) { const a = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; let bits = ''; for (const ch of s.toUpperCase().replace(/=+$/, '')) bits += a.indexOf(ch).toString(2).padStart(5, '0'); const by = []; for (let i = 0; i + 8 <= bits.length; i += 8) by.push(parseInt(bits.slice(i, i + 8), 2)); return Buffer.from(by); }
function totp(at) { const c = Buffer.alloc(8); c.writeBigUInt64BE(BigInt(Math.floor(at / 30))); const h = crypto.createHmac('sha1', b32(mfa.secret)).update(c).digest(); const o = h[h.length - 1] & 15; return String((h.readUInt32BE(o) & 0x7fffffff) % 1000000).padStart(6, '0'); }
async function serverNow() { const r = await fetch('https://api.wehum.app/v1/time'); return new Date(r.headers.get('date')).getTime() / 1000; }

const session = (t) => ids.sessions.find((s) => s.title === t)?.id;
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const shot = async (name, full = true) => { await page.waitForLoadState('networkidle').catch(() => {}); await page.waitForTimeout(1500); await page.screenshot({ path: path.join(out, name + '.png'), fullPage: full }); console.log('saved', name); };
  const go = async (p) => { await page.goto('https://cms.wehum.app' + p); };
  await page.goto('https://cms.wehum.app/login');
  await page.getByLabel('Email').fill('admin@wehum.app');
  await page.getByLabel('Password').fill(process.env.ADMIN_PW);
  await page.getByRole('button', { name: /sign in|log in|continue/i }).click();
  await page.waitForTimeout(1500);
  await page.getByLabel(/code|6-digit|authenticator/i).first().fill(totp(await serverNow()));
  await page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 20000 });
  await page.waitForTimeout(2500);

  const simple = [
    ['d01-dashboard', '/'], ['d02-analytics', '/analytics'], ['d03-sessions', '/sessions'], ['d05-programs', '/programs'],
    ['d06-challenges', '/challenges'], ['d07-daily-messages', '/daily-messages'], ['d08-today', '/today'], ['d09-themes', '/themes'],
    ['d10-teachers', '/teachers'], ['d11-sounds', '/sounds'], ['d12-sos', '/sos'], ['d13-group', '/group-meditation'],
    ['d14-moderation', '/moderation'], ['d15-subscriptions', '/subscriptions'], ['d16-users', '/users'], ['d18-notifications', '/notifications'],
    ['d20-coming-soon', '/coming-soon'],
  ];
  for (const [n, p] of simple) { await go(p); await shot(n); }

  // analytics tabs (buttons/tabs on the page)
  await go('/analytics');
  await page.waitForTimeout(1500);
  const tabs = await page.getByRole('tab').allInnerTexts().catch(() => []);
  console.log('analytics tabs', tabs);
  for (let i = 0; i < tabs.length && i < 6; i++) { await page.getByRole('tab').nth(i).click(); await shot('d02-analytics-tab' + (i + 1)); }

  // session editor, new session, bulk upload
  const rooted = session('Rooted');
  if (rooted) { await go('/sessions/' + rooted); await shot('d04-session-editor-audio'); }
  const yt = ids.sessions.find((s) => s.type === 'youtube')?.id;
  if (yt) { await go('/sessions/' + yt); await shot('d04-session-editor-youtube'); }
  await go('/sessions');
  await page.getByRole('button', { name: /new session/i }).first().click().catch(() => {});
  await shot('d04-session-new', false);
  await go('/sessions');
  await page.getByRole('button', { name: /bulk upload/i }).first().click().catch(() => {});
  await shot('d03-bulk-upload', false);

  // users detail
  await go('/users');
  const row = page.getByRole('link', { name: /demo@wehum.app|Demo/i }).first();
  if (await row.isVisible().catch(() => false)) { await row.click(); await shot('d17-user-detail'); }

  // settings tabs
  for (const [n, label] of [['general', 'General'], ['team', 'Team & roles'], ['membership', 'Membership'], ['releases', 'App & releases'], ['legal', 'Legal & privacy'], ['audit', 'Audit log']]) {
    await go('/settings');
    await page.getByRole('button', { name: label }).or(page.getByRole('tab', { name: label })).or(page.getByText(label, { exact: true })).first().click().catch(() => {});
    await shot('d19-settings-' + n);
  }
  // moderation tabs
  await go('/moderation');
  const mt = await page.getByRole('tab').allInnerTexts().catch(() => []);
  console.log('moderation tabs', mt);
  for (let i = 1; i < mt.length && i < 4; i++) { await page.getByRole('tab').nth(i).click(); await shot('d14-moderation-tab' + (i + 1)); }
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
