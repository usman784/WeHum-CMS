import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useSearchParams } from 'react-router';
import { useSessionState } from '../../hooks/useRole';
import { ApiError } from '../../lib/api';
import { applyFieldErrors, errorMessage } from '../../lib/form-errors';
import type { SignOutReason } from '../../lib/session';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { authApi, type NextStep } from './api';
import { AuthLayout, FormMessage } from './components/AuthLayout';
import { LoginFlow, type FlowStep } from './components/LoginFlow';
import { forgotSchema, inviteSchema, resetSchema, type ForgotValues, type InviteValues, type ResetValues } from './schema';

const titles: Record<FlowStep, { title: string; subtitle: string }> = {
  password: { title: 'Sign in', subtitle: 'Admins and editors only. Ask the owner for an invite.' },
  mfa: { title: 'Two-step sign-in', subtitle: 'Enter the code from your authenticator app.' },
  enroll: { title: 'Set up two-step sign-in', subtitle: 'Every CMS account needs it. It takes a minute.' },
};

const reasons: Record<SignOutReason, string | null> = {
  user: null,
  idle: 'You were signed out after 12 hours without activity.',
  forced: 'You were signed out because your access changed. Sign in again, or ask an owner.',
};

const backToSignIn = (
  <Link to="/login" className="font-semibold text-ember-text hover:text-ember-soft">
    Back to sign in
  </Link>
);

/** Only same-app paths are accepted as the place to return to after sign-in (never another site). */
export const safeNext = (next: string | null) =>
  next && next.startsWith('/') && !next.startsWith('//') && !next.startsWith('/login') ? next : '/';

/** 00 Sign in. */
export function LoginPage() {
  const { status, reason } = useSessionState();
  const [params] = useSearchParams();
  const location = useLocation();
  const [step, setStep] = useState<FlowStep>('password');

  if (status === 'signedIn') return <Navigate to={safeNext(params.get('next'))} replace />;

  const flash = (location.state as { flash?: string } | null)?.flash;
  const notice = flash ?? (reason ? reasons[reason] : null);
  return (
    <AuthLayout {...titles[step]} footer="Protected by two-step verification for admin accounts">
      <LoginFlow notice={notice} onStepChange={setStep} />
    </AuthLayout>
  );
}

/** Forgot password: always the same answer, so nobody can find out which emails have an account. */
export function ForgotPasswordPage() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<ForgotValues>({
    resolver: zodResolver(forgotSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async ({ email }) => {
    setFormError(null);
    try {
      await authApi.forgot(email);
      setSentTo(email);
    } catch (e) {
      if (!applyFieldErrors(e, setError, ['email'])) setFormError(errorMessage(e));
    }
  });

  if (sentTo) {
    return (
      <AuthLayout title="Check your email" footer={backToSignIn}>
        <FormMessage tone="info">
          If <strong className="text-text">{sentTo}</strong> has a CMS account, a link to set a new password is on its way. The link works
          for 30 minutes.
        </FormMessage>
      </AuthLayout>
    );
  }
  return (
    <AuthLayout
      title="Forgot password"
      subtitle="Enter your email and we will send you a link to set a new password."
      footer={backToSignIn}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
        {formError ? <FormMessage>{formError}</FormMessage> : null}
        <Input
          label="Email"
          type="email"
          placeholder="you@wehum.app"
          autoComplete="username"
          error={formState.errors.email?.message}
          className="[&_input]:h-12 [&_input]:bg-surface"
          {...register('email')}
        />
        <Button type="submit" loading={formState.isSubmitting} className="h-[50px] text-[15px]">
          Send link
        </Button>
      </form>
    </AuthLayout>
  );
}

const passwordHelp = 'At least 10 characters.';

function BadLink({ title, text }: { title: string; text: string }) {
  return (
    <AuthLayout title={title} footer={backToSignIn}>
      <FormMessage>{text}</FormMessage>
    </AuthLayout>
  );
}

/** Reset password (link from the email: `/reset-password?token=…`). All sessions of the admin end on success. */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [dead, setDead] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<ResetValues>({
    resolver: zodResolver(resetSchema),
    defaultValues: { password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ password }) => {
    setFormError(null);
    try {
      await authApi.reset(token, password);
      setDone(true);
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TOKEN_INVALID') return setDead(true);
      if (!applyFieldErrors(e, setError, ['password'])) setFormError(errorMessage(e));
    }
  });

  if (done) return <Navigate to="/login" replace state={{ flash: 'Your password was changed. Sign in with the new one.' }} />;
  if (token.length < 20 || dead) {
    return (
      <BadLink
        title="This link no longer works"
        text="Reset links work once and for 30 minutes. Ask for a new one from the sign-in page."
      />
    );
  }
  return (
    <AuthLayout
      title="Set a new password"
      subtitle="You will be signed out everywhere and sign in again with the new password."
      footer={backToSignIn}
    >
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
        {formError ? <FormMessage>{formError}</FormMessage> : null}
        <Input
          label="New password"
          type="password"
          autoComplete="new-password"
          help={passwordHelp}
          error={formState.errors.password?.message}
          className="[&_input]:h-12 [&_input]:bg-surface"
          {...register('password')}
        />
        <Input
          label="Repeat the password"
          type="password"
          autoComplete="new-password"
          error={formState.errors.confirm?.message}
          className="[&_input]:h-12 [&_input]:bg-surface"
          {...register('confirm')}
        />
        <Button type="submit" loading={formState.isSubmitting} className="h-[50px] text-[15px]">
          Save password
        </Button>
      </form>
    </AuthLayout>
  );
}

/** Accept invite (link from the email: `/accept-invite?token=…`): name + password, then the two-step setup. */
export function AcceptInvitePage() {
  const { status } = useSessionState();
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [next, setNext] = useState<NextStep | null>(null);
  const [dead, setDead] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, formState } = useForm<InviteValues>({
    resolver: zodResolver(inviteSchema),
    defaultValues: { name: '', password: '', confirm: '' },
  });

  const onSubmit = handleSubmit(async ({ name, password }) => {
    setFormError(null);
    try {
      setNext(await authApi.acceptInvite(token, name, password));
    } catch (e) {
      if (e instanceof ApiError && e.code === 'TOKEN_INVALID') return setDead(true);
      if (!applyFieldErrors(e, setError, ['name', 'password'])) setFormError(errorMessage(e));
    }
  });

  if (status === 'signedIn') return <Navigate to="/" replace />;
  if (token.length < 20 || dead) {
    return (
      <BadLink
        title="This invitation no longer works"
        text="Invitations work once and for 7 days. Ask an owner or admin to invite you again."
      />
    );
  }
  if (next) {
    return (
      <AuthLayout {...titles[next.step]}>
        <LoginFlow initialStep={next} />
      </AuthLayout>
    );
  }
  return (
    <AuthLayout title="Join the WeHum CMS" subtitle="Choose your name and a password. Next you set up two-step sign-in.">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
        {formError ? <FormMessage>{formError}</FormMessage> : null}
        <Input
          label="Your name"
          autoComplete="name"
          error={formState.errors.name?.message}
          className="[&_input]:h-12 [&_input]:bg-surface"
          {...register('name')}
        />
        <Input
          label="Password"
          type="password"
          autoComplete="new-password"
          help={passwordHelp}
          error={formState.errors.password?.message}
          className="[&_input]:h-12 [&_input]:bg-surface"
          {...register('password')}
        />
        <Input
          label="Repeat the password"
          type="password"
          autoComplete="new-password"
          error={formState.errors.confirm?.message}
          className="[&_input]:h-12 [&_input]:bg-surface"
          {...register('confirm')}
        />
        <Button type="submit" loading={formState.isSubmitting} className="h-[50px] text-[15px]">
          Continue
        </Button>
      </form>
    </AuthLayout>
  );
}
