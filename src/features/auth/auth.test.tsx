import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Providers } from '../../app/providers';
import { routes } from '../../app/router';
import { ApiError, auth } from '../../lib/api';
import { applyFieldErrors, errorMessage, fieldIssues } from '../../lib/form-errors';
import { createQueryClient, queryClient } from '../../lib/query';
import { session } from '../../lib/session';
import {
  fail,
  MOCK_CODE,
  MOCK_PASSWORD,
  MOCK_RECOVERY,
  mockAdmin,
  mockAuth,
  mockRecoveryCodes,
  mockSession,
  ok,
  url,
} from '../../mocks/handlers';
import { server } from '../../mocks/server';
import { a11yViolations } from '../../test/render';
import { bootstrapSession, signOut } from './api';
import { safeNext } from './Page';
import { forgotSchema, inviteSchema, loginSchema, password, recoveryCode, resetSchema, totpCode } from './schema';

function open(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  render(
    <Providers client={createQueryClient()}>
      <RouterProvider router={router} />
    </Providers>,
  );
  return router;
}

const user = userEvent.setup();
const heading = (name: string) => screen.findByRole('heading', { level: 1, name });
const fillLogin = async (email: string, pw = MOCK_PASSWORD) => {
  await user.type(await screen.findByLabelText('Email'), email);
  await user.type(screen.getByLabelText('Password'), pw);
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
};

beforeEach(() => session.signOut());

describe('schemas', () => {
  it('email is trimmed and lower-cased; bad addresses are rejected', () => {
    expect(loginSchema.parse({ email: '  Raphael@WeHum.app ', password: 'x' }).email).toBe('raphael@wehum.app');
    expect(forgotSchema.safeParse({ email: 'not-an-email' }).success).toBe(false);
    expect(loginSchema.safeParse({ email: '', password: 'x' }).error?.issues[0]?.message).toBe('Enter your email');
    expect(loginSchema.safeParse({ email: 'a@b.co', password: '' }).error?.issues[0]?.message).toBe('Enter your password');
  });

  it('new passwords: at least 10 characters, at most 128, not a common one', () => {
    expect(password.safeParse('short').error?.issues[0]?.message).toBe('Use at least 10 characters');
    expect(password.safeParse('Password123').error?.issues[0]?.message).toBe('This password is too common');
    expect(password.safeParse('x'.repeat(129)).success).toBe(false);
    expect(password.safeParse('correct-horse-battery').success).toBe(true);
  });

  it('authenticator code: exactly 6 digits, spaces allowed while typing', () => {
    expect(totpCode.parse('123 456')).toBe('123456');
    expect(totpCode.safeParse('12345').success).toBe(false);
    expect(totpCode.safeParse('12345a').success).toBe(false);
  });

  it('recovery code: xxxxx-xxxxx, any case', () => {
    expect(recoveryCode.parse('  A1B2C-3D4E5 ')).toBe('a1b2c-3d4e5');
    expect(recoveryCode.safeParse('a1b2c3d4e5').success).toBe(false);
  });

  it('reset and invite: the two passwords must match, the name is required', () => {
    const mismatch = resetSchema.safeParse({ password: 'correct-horse-battery', confirm: 'correct-horse-batterx' });
    expect(mismatch.error?.issues[0]).toMatchObject({ path: ['confirm'], message: 'The two passwords do not match' });
    expect(
      inviteSchema.safeParse({ name: '  ', password: 'correct-horse-battery', confirm: 'correct-horse-battery' }).error?.issues[0]?.message,
    ).toBe('Enter your name');
    expect(inviteSchema.parse({ name: ' Lena ', password: 'correct-horse-battery', confirm: 'correct-horse-battery' }).name).toBe('Lena');
  });

  it('safeNext only accepts paths inside the CMS', () => {
    expect(safeNext('/sessions?tab=drafts')).toBe('/sessions?tab=drafts');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/login?next=/x')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });
});

describe('form errors', () => {
  const validation = new ApiError('VALIDATION_FAILED', 400, 'Invalid input', {
    fields: [{ path: 'email', message: 'Invalid email' }, { path: 'other', message: 'x' }, { nope: 1 }],
  });

  it('reads field issues only from VALIDATION_FAILED', () => {
    expect(fieldIssues(validation)).toEqual([
      { path: 'email', message: 'Invalid email' },
      { path: 'other', message: 'x' },
    ]);
    expect(fieldIssues(new ApiError('INTERNAL', 500, 'x', { fields: [{ path: 'a', message: 'b' }] }))).toEqual([]);
    expect(fieldIssues(new Error('x'))).toEqual([]);
  });

  it('puts issues on known fields and says whether any landed', () => {
    const setError = vi.fn();
    expect(applyFieldErrors<{ email: string; password: string }>(validation, setError, ['email', 'password'])).toBe(true);
    expect(setError).toHaveBeenCalledTimes(1);
    expect(setError).toHaveBeenCalledWith('email', { type: 'server', message: 'Invalid email' });
    expect(applyFieldErrors<{ name: string }>(validation, vi.fn(), ['name'])).toBe(false);
  });

  it('lockout message says how long to wait', () => {
    expect(errorMessage(new ApiError('RATE_LIMITED', 429, 'Too many attempts. Try again in 15 minutes.', { retryAfterSec: 900 }))).toBe(
      'Too many attempts. Try again in 15 minutes.',
    );
    expect(errorMessage(new ApiError('RATE_LIMITED', 429, 'x', { retryAfterSec: 30 }))).toBe('Too many attempts. Try again in 1 minute.');
    expect(errorMessage(new ApiError('RATE_LIMITED', 429, 'Slow down'))).toBe('Slow down');
    expect(errorMessage(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});

describe('sign in', () => {
  it('shows the sign-in page with the live counter, and has no accessibility violations', async () => {
    open('/login');
    expect(await heading('Sign in')).toBeInTheDocument();
    expect(await screen.findByText('18,230')).toBeInTheDocument();
    expect(screen.getByText('meditated together today')).toBeInTheDocument();
    expect(screen.getByLabelText('Password')).toHaveAttribute('autocomplete', 'current-password');
    expect(await a11yViolations()).toEqual([]);
  });

  it('the counter shows a dash when the number cannot be loaded', async () => {
    server.use(http.get(url('/v1/admin/public/live'), () => fail(503, 'DEPENDENCY_DOWN')));
    open('/login');
    expect(await heading('Sign in')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('meditated-today')).toHaveTextContent('—'));
  });

  it('checks the form before any request', async () => {
    let calls = 0;
    server.use(
      http.post(url('/v1/admin/auth/login'), () => {
        calls += 1;
        return fail(401, 'INVALID_CREDENTIALS');
      }),
    );
    open('/login');
    await user.click(await screen.findByRole('button', { name: 'Sign in' }));
    expect(await screen.findByText('Enter your email')).toBeInTheDocument();
    expect(screen.getByText('Enter your password')).toBeInTheDocument();
    expect(calls).toBe(0);
  });

  it('wrong password: says so, clears the password and keeps the email', async () => {
    open('/login');
    await fillLogin('owner@wehum.app', 'wrong-password');
    expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is wrong');
    expect(screen.getByLabelText('Password')).toHaveValue('');
    expect(screen.getByLabelText('Password')).toHaveFocus();
    expect(screen.getByLabelText('Email')).toHaveValue('owner@wehum.app');
    expect(session.state.status).toBe('signedOut');
  });

  it('lockout after too many attempts shows the 15-minute message (spec §6.2)', async () => {
    server.use(
      http.post(url('/v1/admin/auth/login'), () =>
        fail(429, 'RATE_LIMITED', 'Too many attempts. Try again in 15 minutes.', { retryAfterSec: 900 }),
      ),
    );
    open('/login');
    await fillLogin('owner@wehum.app');
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many attempts. Try again in 15 minutes.');
  });

  it('a validation answer from the API lands on the field', async () => {
    server.use(
      http.post(url('/v1/admin/auth/login'), () =>
        fail(400, 'VALIDATION_FAILED', 'Invalid input', { fields: [{ path: 'email', message: 'Invalid email' }] }),
      ),
    );
    open('/login');
    await fillLogin('owner@wehum.app');
    expect(await screen.findByText('Invalid email')).toBeInTheDocument();
    expect(screen.getByLabelText('Email')).toHaveAttribute('aria-invalid', 'true');
  });

  it('password → 6-digit code (submits itself) → signed in, and goes to the page asked for', async () => {
    const router = open(`/login?next=${encodeURIComponent('/themes')}`);
    await fillLogin('Editor@WeHum.app');
    expect(await heading('Two-step sign-in')).toBeInTheDocument();
    const code = screen.getByLabelText('6-digit code');
    expect(code).toHaveFocus();
    expect(code).toHaveAttribute('autocomplete', 'one-time-code');
    await user.type(code, MOCK_CODE);
    expect(await heading('Themes')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/themes');
    expect(session.state).toMatchObject({ status: 'signedIn', admin: { role: 'editor' } });
    expect(auth.token).toBe('mock-access-token');
    // editor: no Settings, no moderation
    const nav = screen.getByRole('navigation', { name: 'CMS navigation' });
    expect(within(nav).queryByRole('link', { name: 'Settings' })).not.toBeInTheDocument();
  });

  it('wrong code: error, the field is cleared, a second try works', async () => {
    open('/login');
    await fillLogin('owner@wehum.app');
    const code = await screen.findByLabelText('6-digit code');
    await user.type(code, '000000');
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not valid');
    expect(screen.getByLabelText('6-digit code')).toHaveValue('');
    await user.type(screen.getByLabelText('6-digit code'), MOCK_CODE);
    expect(await heading('Dashboard')).toBeInTheDocument();
  });

  it('recovery code instead of the app', async () => {
    open('/login');
    await fillLogin('moderator@wehum.app');
    await user.click(await screen.findByRole('button', { name: 'Use a recovery code instead' }));
    const input = screen.getByLabelText('Recovery code');
    await user.type(input, 'not-a-code');
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await screen.findByText('Recovery codes look like a1b2c-3d4e5')).toBeInTheDocument();
    await user.clear(input);
    await user.type(input, MOCK_RECOVERY.toUpperCase());
    await user.click(screen.getByRole('button', { name: 'Verify' }));
    expect(await heading('Dashboard')).toBeInTheDocument();
    expect(session.admin?.role).toBe('moderator');
  });

  it('the 5-minute step expired: back to the password form with the reason', async () => {
    server.use(http.post(url('/v1/admin/auth/mfa/verify'), () => fail(401, 'TOKEN_INVALID', 'This sign-in step expired. Start again.')));
    open('/login');
    await fillLogin('owner@wehum.app');
    await user.type(await screen.findByLabelText('6-digit code'), MOCK_CODE);
    expect(await heading('Sign in')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('This sign-in step expired. Start again.');
    expect(screen.getByLabelText('Password')).toHaveValue('');
  });

  it('already signed in: /login sends you on', async () => {
    session.signIn(mockAdmin('owner'));
    const router = open('/login?next=%2Fsessions');
    expect(await heading('Sessions')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/sessions');
  });

  it.each([
    ['idle', 'You were signed out after 12 hours without activity.'],
    ['forced', 'You were signed out because your access changed.'],
  ] as const)('says why you were signed out (%s)', async (reason, text) => {
    session.signOut(reason);
    open('/login');
    expect(await screen.findByRole('status')).toHaveTextContent(text);
  });
});

describe('first sign-in: two-step setup', () => {
  it('QR code and key → code → 10 recovery codes → continue only after confirming they are saved', async () => {
    open('/login');
    await fillLogin('new@wehum.app');
    expect(await heading('Set up two-step sign-in')).toBeInTheDocument();
    expect(await screen.findByRole('img', { name: 'QR code for your authenticator app' })).toBeInTheDocument();
    expect(screen.getByTestId('totp-secret')).toHaveTextContent('JBSW Y3DP EHPK 3PXP JBSW Y3DP EHPK 3PXP');
    expect(await a11yViolations()).toEqual([]);

    await user.type(screen.getByLabelText('6-digit code'), '111111');
    await user.click(screen.getByRole('button', { name: 'Turn on two-step sign-in' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('That code is not valid');

    await user.type(screen.getByLabelText('6-digit code'), MOCK_CODE);
    await user.click(screen.getByRole('button', { name: 'Turn on two-step sign-in' }));
    const list = await screen.findByRole('list', { name: 'Recovery codes' });
    expect(
      within(list)
        .getAllByRole('listitem')
        .map((li) => li.textContent),
    ).toEqual(mockRecoveryCodes);

    // Not signed in yet: leaving now must not skip the codes.
    expect(session.state.status).toBe('signedOut');
    const go = screen.getByRole('button', { name: 'Continue to the CMS' });
    expect(go).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'I have saved these codes in a safe place' }));
    await user.click(go);
    expect(await heading('Dashboard')).toBeInTheDocument();
    expect(session.state.status).toBe('signedIn');
  });

  it('copy puts all codes with a short explanation on the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    open('/login');
    await fillLogin('new@wehum.app');
    await user.type(await screen.findByLabelText('6-digit code'), MOCK_CODE);
    await user.click(screen.getByRole('button', { name: 'Turn on two-step sign-in' }));
    await screen.findByRole('list', { name: 'Recovery codes' });
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await user.click(screen.getByRole('button', { name: 'Copy' }));
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument();
    const text = writeText.mock.calls[0]?.[0] as string;
    expect(text).toContain('Each code works once.');
    mockRecoveryCodes.forEach((c) => expect(text).toContain(c));
  });

  it('setup cannot start (step expired): back to the password form', async () => {
    server.use(http.post(url('/v1/admin/auth/mfa/enroll'), () => fail(401, 'TOKEN_INVALID', 'This sign-in step expired. Start again.')));
    open('/login');
    await fillLogin('new@wehum.app');
    expect(await screen.findByRole('alert')).toHaveTextContent('This sign-in step expired. Start again.');
    expect(await heading('Sign in')).toBeInTheDocument();
  });
});

describe('forgot and reset password', () => {
  it('forgot: same answer whether or not the email has an account', async () => {
    let body: unknown;
    server.use(
      http.post(url('/v1/admin/auth/forgot'), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );
    open('/login');
    await user.click(await screen.findByRole('link', { name: 'Forgot password?' }));
    expect(await heading('Forgot password')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Email'), ' Nobody@Example.com');
    await user.click(screen.getByRole('button', { name: 'Send link' }));
    expect(await heading('Check your email')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('If nobody@example.com has a CMS account');
    expect(body).toEqual({ email: 'nobody@example.com' });
    await user.click(screen.getByRole('link', { name: 'Back to sign in' }));
    expect(await heading('Sign in')).toBeInTheDocument();
  });

  it('reset: a missing or short token shows the dead-link page without a form', async () => {
    open('/reset-password');
    expect(await heading('This link no longer works')).toBeInTheDocument();
    expect(screen.queryByLabelText('New password')).not.toBeInTheDocument();
  });

  it('reset: checks the password rules, then saves and returns to sign in with a note', async () => {
    let body: unknown;
    server.use(
      http.post(url('/v1/admin/auth/reset'), async ({ request }) => {
        body = await request.json();
        return ok({ ok: true });
      }),
    );
    const token = 'valid-reset-token-0123456789';
    open(`/reset-password?token=${token}`);
    expect(await heading('Set a new password')).toBeInTheDocument();
    expect(screen.getByLabelText('New password')).toHaveAttribute('autocomplete', 'new-password');
    await user.type(screen.getByLabelText('New password'), 'short');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('Use at least 10 characters')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('New password'));
    await user.type(screen.getByLabelText('New password'), 'a-new-long-password');
    await user.type(screen.getByLabelText('Repeat the password'), 'a-new-long-passwore');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('The two passwords do not match')).toBeInTheDocument();
    expect(body).toBeUndefined();
    await user.clear(screen.getByLabelText('Repeat the password'));
    await user.type(screen.getByLabelText('Repeat the password'), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await heading('Sign in')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('Your password was changed. Sign in with the new one.');
    expect(body).toEqual({ token, password: 'a-new-long-password' });
  });

  it('reset: an expired or used link is reported, and the API password rule lands on the field', async () => {
    open('/reset-password?token=expired-reset-token-0123456789');
    await user.type(await screen.findByLabelText('New password'), 'a-new-long-password');
    await user.type(screen.getByLabelText('Repeat the password'), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await heading('This link no longer works')).toBeInTheDocument();
  });

  it('reset: a rule only the server knows shows under the field', async () => {
    server.use(
      http.post(url('/v1/admin/auth/reset'), () =>
        fail(400, 'VALIDATION_FAILED', 'Invalid input', { fields: [{ path: 'password', message: 'This password is too common' }] }),
      ),
    );
    open('/reset-password?token=valid-reset-token-0123456789');
    await user.type(await screen.findByLabelText('New password'), 'a-new-long-password');
    await user.type(screen.getByLabelText('Repeat the password'), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'Save password' }));
    expect(await screen.findByText('This password is too common')).toBeInTheDocument();
  });
});

describe('accept invite', () => {
  it('name + password, then the two-step setup, then the CMS', async () => {
    let body: unknown;
    server.use(
      http.post(url('/v1/admin/auth/accept-invite'), async ({ request }) => {
        body = await request.json();
        return ok({ step: 'enroll', enrollToken: 'mock-enroll-token-0000000000' });
      }),
    );
    const token = 'valid-invite-token-0123456789';
    open(`/accept-invite?token=${token}`);
    expect(await heading('Join the WeHum CMS')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Your name'), 'Lena Fischer');
    await user.type(screen.getByLabelText('Password'), 'a-new-long-password');
    await user.type(screen.getByLabelText('Repeat the password'), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await heading('Set up two-step sign-in')).toBeInTheDocument();
    expect(body).toEqual({ token, name: 'Lena Fischer', password: 'a-new-long-password' });
    await user.type(await screen.findByLabelText('6-digit code'), MOCK_CODE);
    await user.click(screen.getByRole('button', { name: 'Turn on two-step sign-in' }));
    await user.click(await screen.findByRole('checkbox', { name: 'I have saved these codes in a safe place' }));
    await user.click(screen.getByRole('button', { name: 'Continue to the CMS' }));
    expect(await heading('Dashboard')).toBeInTheDocument();
  });

  it('a used or expired invitation is reported', async () => {
    open('/accept-invite?token=expired-invite-token-0123456789');
    await user.type(await screen.findByLabelText('Your name'), 'Lena');
    await user.type(screen.getByLabelText('Password'), 'a-new-long-password');
    await user.type(screen.getByLabelText('Repeat the password'), 'a-new-long-password');
    await user.click(screen.getByRole('button', { name: 'Continue' }));
    expect(await heading('This invitation no longer works')).toBeInTheDocument();
  });

  it('no token: dead-link page', async () => {
    open('/accept-invite');
    expect(await heading('This invitation no longer works')).toBeInTheDocument();
  });
});

describe('session start and end', () => {
  it('page load with a valid cookie: silent refresh signs in without a form', async () => {
    mockAuth.role = 'admin';
    session.reset();
    open('/sessions');
    expect(screen.getByRole('status', { name: 'Loading WeHum CMS' })).toBeInTheDocument();
    await act(() => bootstrapSession());
    expect(await heading('Sessions')).toBeInTheDocument();
    expect(session.state).toMatchObject({ status: 'signedIn', admin: { role: 'admin' } });
  });

  it('page load without a cookie, or with the server down: sign-in page, not an endless spinner', async () => {
    session.reset();
    await bootstrapSession();
    expect(session.state.status).toBe('signedOut');
    session.reset();
    server.use(http.post(url('/v1/admin/auth/refresh'), () => HttpResponse.error()));
    await bootstrapSession();
    expect(session.state.status).toBe('signedOut');
  });

  it('signOut cleans up locally even when the API call fails, and drops cached data', async () => {
    server.use(http.post(url('/v1/admin/auth/logout'), () => HttpResponse.error()));
    session.signIn(mockAdmin('owner'));
    auth.set('tok-1', 'csrf');
    queryClient.setQueryData(['user', 'detail', 'u1'], { email: 'private@example.com' });
    await signOut('idle');
    expect(auth.token).toBeNull();
    expect(session.state).toEqual({ status: 'signedOut', admin: null, reason: 'idle' });
    expect(queryClient.getQueryData(['user', 'detail', 'u1'])).toBeUndefined();
  });

  it('signing out with an expired access token still ends the session on the server (refresh first, then sign out)', async () => {
    const calls: string[] = [];
    server.use(
      http.post(url('/v1/admin/auth/logout'), ({ request }) => {
        const fresh = request.headers.get('authorization') === 'Bearer fresh';
        calls.push(fresh ? 'logout 204' : 'logout 401');
        return fresh ? new HttpResponse(null, { status: 204 }) : fail(401, 'TOKEN_EXPIRED', 'Expired');
      }),
      http.post(url('/v1/admin/auth/refresh'), () => {
        calls.push('refresh 200');
        return ok({ ...mockSession('owner'), accessToken: 'fresh' });
      }),
    );
    session.signIn(mockAdmin('owner'));
    auth.set('stale');
    await signOut();
    expect(calls).toEqual(['logout 401', 'refresh 200', 'logout 204']);
    expect(session.state.status).toBe('signedOut');
    expect(auth.token).toBeNull();
  });

  it('sign-out while offline: the next page load ends the server session instead of silently signing back in', async () => {
    server.use(http.post(url('/v1/admin/auth/logout'), () => HttpResponse.error()));
    session.signIn(mockAdmin('owner'));
    auth.set('tok-1');
    await signOut();
    expect(localStorage.getItem('wh_signout_pending')).toBe('1');

    // Next page load, back online. The cookie would still be good for a silent sign-in.
    mockAuth.role = 'owner';
    const calls: string[] = [];
    server.use(
      http.post(url('/v1/admin/auth/refresh'), () => {
        calls.push('refresh');
        return ok({ ...mockSession('owner'), accessToken: 'only-to-sign-out' });
      }),
      http.post(url('/v1/admin/auth/logout'), ({ request }) => {
        calls.push(`logout ${request.headers.get('authorization')}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    session.reset();
    await bootstrapSession();
    expect(calls).toEqual(['refresh', 'logout Bearer only-to-sign-out']);
    expect(session.state.status).toBe('signedOut');
    expect(auth.token).toBeNull();
    expect(localStorage.getItem('wh_signout_pending')).toBeNull();
  });

  it('sign-out while offline, still offline on the next load: stays signed out and keeps the note for later', async () => {
    localStorage.setItem('wh_signout_pending', '1');
    server.use(http.post(url('/v1/admin/auth/refresh'), () => HttpResponse.error()));
    session.reset();
    await bootstrapSession();
    expect(session.state.status).toBe('signedOut');
    expect(localStorage.getItem('wh_signout_pending')).toBe('1');
  });

  it('session ended mid-work: the page stays, a dialog asks to sign in again with the same email, and work continues', async () => {
    session.signIn(mockAdmin('editor'));
    auth.set('tok-1');
    open('/themes');
    expect(await heading('Themes')).toBeInTheDocument();
    await screen.findByText('Loving Kindness');
    act(() => session.expire());

    const dialog = await screen.findByRole('dialog', { name: 'Sign in again' });
    expect(screen.getByText('Loving Kindness')).toBeInTheDocument(); // the page behind is still mounted
    const email = within(dialog).getByLabelText('Email');
    expect(email).toHaveValue('editor@wehum.app');
    expect(email).toHaveAttribute('readonly');
    expect(within(dialog).queryByRole('link', { name: 'Forgot password?' })).not.toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Password'), MOCK_PASSWORD);
    await user.click(within(dialog).getByRole('button', { name: 'Sign in' }));
    await user.type(await within(dialog).findByLabelText('6-digit code'), MOCK_CODE);
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(session.state.status).toBe('signedIn');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Themes');
  });

  it('closing the re-login dialog signs out for real', async () => {
    session.signIn(mockAdmin('editor'));
    const router = open('/themes');
    await heading('Themes');
    act(() => session.expire());
    const dialog = await screen.findByRole('dialog', { name: 'Sign in again' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(await heading('Sign in')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/login');
    expect(router.state.location.search).toBe('?next=%2Fthemes');
  });

  it('a 401 on any request with a dead refresh cookie opens the re-login dialog (no redirect, no data loss)', async () => {
    server.use(
      http.get(url('/v1/admin/me'), () => fail(401, 'TOKEN_EXPIRED', 'Expired')),
      http.post(url('/v1/admin/auth/refresh'), () => fail(401, 'TOKEN_INVALID', 'Session expired. Sign in again.')),
    );
    session.signIn(mockSession('owner').admin);
    auth.set('stale');
    open('/users');
    await heading('Users & Members');
    const { authApi } = await import('./api');
    await act(() => authApi.me().catch(() => {}));
    expect(await screen.findByRole('dialog', { name: 'Sign in again' })).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search users', hidden: true })).toBeInTheDocument(); // the page is still there behind the dialog (hidden from assistive tech while it is open)
  });
});
