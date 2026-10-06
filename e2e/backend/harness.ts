import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { resolve } from 'node:path';

/**
 * Harness for the tests that run against the REAL backend (spec §13 "E2E against local backend").
 * It needs the backend repo next to this one and the docker-compose services (Postgres, Redis) running.
 * Everything uses its own database (`wehum_e2e`) and Redis DB index, so dev data is never touched.
 *
 * Ports differ per machine; override with E2E_DATABASE_URL, E2E_REDIS_URL, E2E_BACKEND_DIR.
 */
export const BACKEND_DIR = resolve(process.env.E2E_BACKEND_DIR ?? '../backend');
export const DATABASE_URL = process.env.E2E_DATABASE_URL ?? 'postgresql://wehum:wehum@localhost:5432/wehum_e2e';
export const REDIS_URL = process.env.E2E_REDIS_URL ?? 'redis://localhost:6379/14';
export const API = 'http://localhost:3000';
export const CMS = 'http://localhost:4173';
export const LOG = resolve('test-results/backend.log');
const PID = resolve('test-results/backend.pid');

export const OWNER = { email: 'owner@wehum.app', password: 'E2e-owner-password-2026' };
export const ROLES = ['admin', 'editor', 'moderator'] as const;
export const roleEmail = (role: string) => (role === 'owner' ? OWNER.email : `${role}@wehum.app`);

/**
 * Access tokens live 65 s here instead of 10 min, so the tests can watch a real token expire and be renewed.
 * (Not shorter: the socket asks for a new token 60 s before the end, so anything under 60 s would refresh in a loop.)
 */
export const ACCESS_TTL_SEC = 65;

/** Storage for uploads. Defaults match the backend's docker compose (MinIO on :9000); set E2E_S3_ENDPOINT if yours differs. */
export const S3_ENDPOINT = process.env.E2E_S3_ENDPOINT ?? 'http://localhost:9000';
export const S3_BUCKET = 'wehum-e2e';

/** ffmpeg / ffprobe from the backend's own dev dependencies, so nothing needs installing system-wide. */
const tool = (code: string) => {
  try {
    return backendNode(code).trim();
  } catch {
    return undefined;
  }
};

/** A stand-in for RevenueCat's REST API (offerings, promotional grants, subscriber reads and deletes). */
export const RC_URL = 'http://127.0.0.1:3999';
export const RC_WEBHOOK_SECRET = 'e2e-webhook-secret';
let rcServer: Server | undefined;
function startFakeRevenueCat() {
  if (rcServer) return Promise.resolve();
  const grants = new Map<string, number>(); // app user id → promotional end (ms)
  rcServer = createServer((req, res) => {
    const send = (status: number, body: unknown) => {
      res.writeHead(status, { 'content-type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      const path = decodeURIComponent(new URL(req.url ?? '/', RC_URL).pathname);
      const promo = path.match(/^\/v1\/subscribers\/([^/]+)\/entitlements\/premium\/promotional$/);
      const sub = path.match(/^\/v1\/subscribers\/([^/]+)$/);
      if (req.method === 'POST' && promo) {
        grants.set(promo[1]!, (JSON.parse(raw || '{}') as { end_time_ms: number }).end_time_ms);
        return send(201, {});
      }
      if (req.method === 'GET' && sub) {
        const end = grants.get(sub[1]!);
        if (!end) return send(404, {});
        const product = 'rc_promo_premium_custom';
        return send(200, {
          subscriber: {
            entitlements: {
              premium: { product_identifier: product, expires_date: new Date(end).toISOString(), purchase_date: new Date().toISOString() },
            },
            subscriptions: {
              [product]: { period_type: 'normal', store: 'promotional', unsubscribe_detected_at: null, billing_issues_detected_at: null },
            },
          },
        });
      }
      if (req.method === 'DELETE' && sub) {
        grants.delete(sub[1]!);
        return send(200, { deleted: true });
      }
      if (req.method === 'POST' && path.startsWith('/v2/projects/')) return send(200, { is_current: true });
      send(404, {});
    });
  });
  return new Promise<void>((done) => rcServer!.listen(3999, '127.0.0.1', () => done()));
}

/** One key per run, kept on disk: a restarted API must still read the two-step secrets it stored (tests restart it). */
const KEY = resolve('test-results/backend.key');
const totpKey = () => {
  if (!existsSync(KEY)) writeFileSync(KEY, randomBytes(32).toString('base64'));
  return readFileSync(KEY, 'utf8');
};

const env = () => ({
  ...process.env,
  S3_ENDPOINT,
  S3_BUCKET,
  S3_REGION: 'us-east-1',
  S3_ACCESS_KEY: process.env.E2E_S3_ACCESS_KEY ?? 'minio',
  S3_SECRET_KEY: process.env.E2E_S3_SECRET_KEY ?? 'minio12345',
  S3_FORCE_PATH_STYLE: 'true',
  CDN_BASE_URL: `${S3_ENDPOINT}/${S3_BUCKET}`,
  FFMPEG_PATH: process.env.FFMPEG_PATH ?? tool("console.log(require('ffmpeg-static'))") ?? 'ffmpeg',
  FFPROBE_PATH: process.env.FFPROBE_PATH ?? tool("console.log(require('@ffprobe-installer/ffprobe').path)") ?? 'ffprobe',
  NODE_ENV: 'development',
  APP_ROLE: 'api',
  PORT: '3000',
  PUBLIC_API_URL: API,
  CMS_ORIGINS: CMS,
  ADMIN_APP_URL: CMS,
  DATABASE_URL,
  REDIS_URL,
  LOG_LEVEL: 'info',
  SMTP_URL: '', // no mail server: the backend prints each email to its log, where the tests read the links
  ADMIN_ACCESS_TTL_SEC: String(ACCESS_TTL_SEC),
  TOTP_ENC_KEY_BASE64: totpKey(),
  REVENUECAT_API_KEY_V2: 'e2e-rc-key',
  REVENUECAT_PROJECT_ID: 'e2e',
  REVENUECAT_BASE_URL: RC_URL,
  REVENUECAT_WEBHOOK_SECRET: RC_WEBHOOK_SECRET,
  SEED_OWNER_EMAIL: OWNER.email,
  SEED_OWNER_PASSWORD: OWNER.password,
});

/** Run a small script with the backend's own node_modules (pg, ioredis), so this repo needs neither. */
function backendNode(script: string, extra: Record<string, string> = {}) {
  return execFileSync(process.execPath, ['-e', script], { cwd: BACKEND_DIR, env: { ...process.env, ...extra }, encoding: 'utf8' });
}

/** Run one SQL statement on the e2e database and return the rows. */
export function sql<T = Record<string, unknown>>(text: string, params: unknown[] = []): T[] {
  const out = backendNode(
    `const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.U});await c.connect();
     const r=await c.query(process.env.Q,JSON.parse(process.env.P));await c.end();console.log(JSON.stringify(r.rows))})().catch(e=>{console.error(e.message);process.exit(1)})`,
    { U: DATABASE_URL, Q: text, P: JSON.stringify(params) },
  );
  return JSON.parse(out) as T[];
}

/** Clear rate-limit counters and pending sign-in steps, so one test never trips the limits for the next. */
export function flushRedis() {
  backendNode(`const R=require('ioredis');const r=new R(process.env.U);r.flushdb().then(()=>r.quit())`, { U: REDIS_URL });
}

/** Run one Redis command on the e2e Redis DB, e.g. `redis('set', 'k', 'v')`. */
export function redis(...args: string[]) {
  backendNode(`const R=require('ioredis');const r=new R(process.env.U);r.call(...JSON.parse(process.env.A)).then(()=>r.quit())`, {
    U: REDIS_URL,
    A: JSON.stringify(args),
  });
}

/** Put one event on the realtime bus (the backend's `events` channel), as the scheduler would. */
export const publish = (topic: string, payload: unknown) => redis('publish', 'events', JSON.stringify({ topic, payload }));

function createDatabase() {
  const u = new URL(DATABASE_URL);
  const name = u.pathname.slice(1);
  if (!/^[a-z0-9_]+$/.test(name) || !name.includes('e2e'))
    throw new Error(`Refusing to recreate database "${name}": the e2e database name must contain "e2e".`);
  u.pathname = '/postgres';
  backendNode(
    `const {Client}=require('pg');(async()=>{const c=new Client({connectionString:process.env.U});await c.connect();
     await c.query('DROP DATABASE IF EXISTS ${name} WITH (FORCE)');await c.query('CREATE DATABASE ${name}');await c.end()})().catch(e=>{console.error(e.message);process.exit(1)})`,
    { U: u.toString() },
  );
}

/** Admin, editor and moderator accounts with the owner's password and no two-step sign-in yet (each test sets it up). */
export function resetAdmins() {
  sql(`DELETE FROM admin_users WHERE email <> $1`, [OWNER.email]);
  sql(
    `UPDATE admin_users SET mfa_enabled=false, totp_secret=NULL, recovery_codes='{}', failed_logins=0, locked_until=NULL WHERE email=$1`,
    [OWNER.email],
  );
  for (const role of ROLES) {
    sql(
      `INSERT INTO admin_users (id, email, name, role, status, password_hash)
       SELECT gen_random_uuid(), $1, $2, $3::admin_role, 'active', password_hash FROM admin_users WHERE email=$4`,
      [roleEmail(role), `E2E ${role}`, role, OWNER.email],
    );
  }
}

export async function startBackend() {
  if (!existsSync(resolve(BACKEND_DIR, 'package.json'))) throw new Error(`Backend repo not found at ${BACKEND_DIR}. Set E2E_BACKEND_DIR.`);
  mkdirSync(resolve('test-results'), { recursive: true });
  writeFileSync(KEY, randomBytes(32).toString('base64')); // a new key for every run
  createDatabase();
  const e = env();
  execFileSync('npm', ['run', 'db:migrate'], { cwd: BACKEND_DIR, env: e, stdio: 'pipe' });
  execFileSync('npm', ['run', 'seed'], { cwd: BACKEND_DIR, env: e, stdio: 'pipe' });
  flushRedis();
  resetAdmins();

  writeFileSync(LOG, '');
  await createBucket();
  await startFakeRevenueCat();
  // The API and the media worker are separate processes in the backend (APP_ROLE), like in production.
  writeFileSync(PID, JSON.stringify({ api: spawnRole('api'), worker: spawnRole('worker') }));
  await waitForApi(true);
}

function spawnRole(role: 'api' | 'worker') {
  const out = openSync(LOG, 'a');
  const child = spawn(process.execPath, ['-r', '@swc-node/register', 'src/main.ts'], {
    cwd: BACKEND_DIR,
    env: { ...env(), APP_ROLE: role, ...(role === 'worker' && { PORT: '3001' }) },
    stdio: ['ignore', out, out],
    detached: true,
  });
  child.unref();
  return child.pid!;
}

async function waitForApi(up: boolean) {
  const deadline = Date.now() + 60_000;
  for (;;) {
    const ok = await fetch(`${API}/healthz`).then(
      (r) => r.ok,
      () => false,
    );
    if (ok === up) return;
    if (Date.now() > deadline)
      throw new Error(`Backend did not ${up ? 'start' : 'stop'} within 60 s. See ${LOG}:\n${readFileSync(LOG, 'utf8').slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

function pids(): Record<string, number> {
  if (!existsSync(PID)) return {};
  const text = readFileSync(PID, 'utf8');
  if (text.startsWith('{')) return JSON.parse(text) as Record<string, number>;
  return Object.fromEntries(text.split(',').map((p, i) => [`old${i}`, Number(p)])); // "api,worker" from older runs
}
function kill(pid: number | undefined) {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGTERM'); // the whole process group
  } catch {
    // already gone
  }
}

const alive = (pid: number) => {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
};

/**
 * Stop only the API process (the worker keeps running), and wait until it has exited. Not just until /healthz
 * fails: while shutting down it still answers on open keep-alive connections, with its own (old) signing key.
 */
export async function stopApi() {
  const pid = pids().api;
  kill(pid);
  await waitForApi(false);
  const deadline = Date.now() + 30_000;
  while (pid && alive(pid)) {
    if (Date.now() > deadline) process.kill(-pid, 'SIGKILL');
    await new Promise((r) => setTimeout(r, 200));
  }
}

/** Start the API process again with the same settings, and wait until it answers. */
export async function startApi() {
  writeFileSync(PID, JSON.stringify({ ...pids(), api: spawnRole('api') }));
  await waitForApi(true);
}

export function stopBackend() {
  for (const pid of Object.values(pids())) kill(pid);
  rcServer?.close();
  rcServer = undefined;
}

/** Create the test bucket (dev convenience, like the backend's own tests do). */
async function createBucket() {
  backendNode(
    `const {S3Client,CreateBucketCommand,HeadBucketCommand}=require('@aws-sdk/client-s3');(async()=>{
       const c=new S3Client({region:'us-east-1',endpoint:process.env.EP,forcePathStyle:true,credentials:{accessKeyId:process.env.AK,secretAccessKey:process.env.SK}});
       try{await c.send(new HeadBucketCommand({Bucket:process.env.B}))}catch{await c.send(new CreateBucketCommand({Bucket:process.env.B}))}
     })().catch(e=>{console.error(e.message);process.exit(1)})`,
    { EP: S3_ENDPOINT, AK: env().S3_ACCESS_KEY, SK: env().S3_SECRET_KEY, B: S3_BUCKET },
  );
}

/** The newest link of that kind that the backend "emailed" to this address (printed to its log). */
export function emailedLink(to: string, path: 'reset-password' | 'accept-invite'): string {
  const log = readFileSync(LOG, 'utf8');
  const at = log.lastIndexOf(`[mail → ${to}]`);
  const link = at < 0 ? null : log.slice(at).match(new RegExp(`${CMS}/${path}\\?token=[\\w-]+`))?.[0];
  if (!link) throw new Error(`No ${path} email for ${to} in ${LOG}`);
  return link.slice(CMS.length);
}

/** RFC 6238 code for a base32 secret: what an authenticator app would show right now. */
export function totp(secretBase32: string, at = Date.now()): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = '';
  for (const ch of secretBase32.replace(/[\s=]/g, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0');
  const key = Buffer.from(bits.match(/.{8}/g)!.map((b) => parseInt(b, 2)));
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(at / 30_000)));
  const mac = createHmac('sha1', key).update(counter).digest();
  const offset = mac[mac.length - 1]! & 0xf;
  return String((mac.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, '0');
}
