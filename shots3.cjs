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

  const nav = async (label) => { await page.getByRole('link', { name: label, exact: true }).first().click(); };
  await nav('Settings');
  for (const [n, label] of [['general', 'General'], ['team', 'Team & roles'], ['membership', 'Membership'], ['releases', 'App & releases'], ['legal', 'Legal & privacy'], ['audit', 'Audit log']]) {
    await page.getByText(label, { exact: true }).first().click().catch((e) => console.log('tab fail', label));
    await shot('d19-settings-' + n);
  }
  await nav('Users');
  await page.waitForTimeout(1500);
  await page.getByText('demo@wehum.app').first().click().catch(() => console.log('user click fail'));
  await shot('d17-user-detail');
  await nav('Analytics');
  await page.getByText('30 days', { exact: true }).first().click().catch(() => {});
  await shot('d02-analytics-30d');
  await browser.close();
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
