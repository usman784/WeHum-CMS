import { z } from 'zod';

/** Form schemas. They mirror the backend DTOs in `admin-auth.controller.ts` so most mistakes are caught before a request. */
const COMMON = new Set(['password', 'password1', 'password123', '1234567890', 'qwertyuiop', 'letmein123', 'wehum12345', 'meditation1']);

export const email = z.string().trim().toLowerCase().min(1, 'Enter your email').email('Enter a valid email address').max(254);

export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128, 'Use at most 128 characters')
  .refine((p) => !COMMON.has(p.toLowerCase()), 'This password is too common');

export const loginSchema = z.object({ email, password: z.string().min(1, 'Enter your password').max(128) });
export type LoginValues = z.infer<typeof loginSchema>;

/** Authenticator codes are 6 digits. Spaces are allowed while typing ("123 456"). */
export const totpCode = z
  .string()
  .transform((v) => v.replace(/\s+/g, ''))
  .pipe(z.string().regex(/^\d{6}$/, 'Enter the 6-digit code'));

/** Recovery codes look like `a1b2c-3d4e5`. Case and outer spaces do not matter. */
export const recoveryCode = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[0-9a-f]{5}-[0-9a-f]{5}$/, 'Recovery codes look like a1b2c-3d4e5');

export const forgotSchema = z.object({ email });
export type ForgotValues = z.infer<typeof forgotSchema>;

const confirmed = <T extends { password: string; confirm: string }>(v: T) => v.password === v.confirm;

export const resetSchema = z
  .object({ password, confirm: z.string() })
  .refine(confirmed, { path: ['confirm'], message: 'The two passwords do not match' });
export type ResetValues = z.infer<typeof resetSchema>;

export const inviteSchema = z
  .object({ name: z.string().trim().min(1, 'Enter your name').max(80, 'Use at most 80 characters'), password, confirm: z.string() })
  .refine(confirmed, { path: ['confirm'], message: 'The two passwords do not match' });
export type InviteValues = z.infer<typeof inviteSchema>;
