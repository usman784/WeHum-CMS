import { execFileSync, spawn } from 'node:child_process';
import { createHmac, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, openSync, readFileSync, writeFileSync } from 'node:fs';
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
  TOTP_ENC_KEY_BASE64: randomBytes(32).toString('base64'),
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
  createDatabase();
  const e = env();
  execFileSync('npm', ['run', 'db:migrate'], { cwd: BACKEND_DIR, env: e, stdio: 'pipe' });
  execFileSync('npm', ['run', 'seed'], { cwd: BACKEND_DIR, env: e, stdio: 'pipe' });
  flushRedis();
  resetAdmins();

  writeFileSync(LOG, '');
  const out = openSync(LOG, 'a');
  await createBucket();
  // The API and the media worker are separate processes in the backend (APP_ROLE), like in production.
  const pids = (['api', 'worker'] as const).map((role) => {
    const child = spawn(process.execPath, ['-r', '@swc-node/register', 'src/main.ts'], {
      cwd: BACKEND_DIR,
      env: { ...e, APP_ROLE: role, ...(role === 'worker' && { PORT: '3001' }) },
      stdio: ['ignore', out, out],
      detached: true,
    });
    child.unref();
    return child.pid;
  });
  writeFileSync(PID, pids.join(','));

  const deadline = Date.now() + 60_000;
  for (;;) {
    try {
      if ((await fetch(`${API}/healthz`)).ok) return;
    } catch {
      // not up yet
    }
    if (Date.now() > deadline) throw new Error(`Backend did not start within 60 s. See ${LOG}:\n${readFileSync(LOG, 'utf8').slice(-2000)}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

export function stopBackend() {
  if (!existsSync(PID)) return;
  for (const pid of readFileSync(PID, 'utf8').split(',')) {
    try {
      process.kill(-Number(pid), 'SIGTERM'); // the whole process group
    } catch {
      // already gone
    }
  }
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
