import { zodResolver } from '@hookform/resolvers/zod';
import { useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { startSession, type SessionPayload } from '../../../lib/api';
import { applyFieldErrors, errorMessage } from '../../../lib/form-errors';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { authApi, type NextStep } from '../api';
import { loginSchema, type LoginValues } from '../schema';
import { FormMessage } from './AuthLayout';
import { CodeStep } from './CodeStep';
import { EnrollStep } from './EnrollStep';

export type FlowStep = 'password' | 'mfa' | 'enroll';

type Props = {
  /** Re-login dialog: the email is known and cannot be changed (a different admin must not take over the open screen). */
  lockedEmail?: string;
  /** Start at the second step (after accepting an invite, the API already returned the step token). */
  initialStep?: NextStep;
  /** Message above the password form, e.g. why the admin was signed out. */
  notice?: ReactNode;
  /** Tells the parent which step is showing, so it can change the page title. */
  onStepChange?: (step: FlowStep) => void;
  /** Called after the session has started. */
  onSignedIn?: (session: SessionPayload) => void;
  /** Hide "Forgot password?" (inside the re-login dialog a navigation would drop the unsaved form behind it). */
  hideForgot?: boolean;
};

/**
 * The whole sign-in sequence (spec §6.2): password → authenticator code, or → two-step setup on first sign-in.
 * Used by the sign-in page, the accept-invite page and the re-login dialog.
 */
export function LoginFlow({ lockedEmail, initialStep, notice, onStepChange, onSignedIn, hideForgot }: Props) {
  const [step, setStepState] = useState<NextStep | null>(initialStep ?? null);
  const [formError, setFormError] = useState<string | null>(null);
  const { register, handleSubmit, setError, setFocus, resetField, formState } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: lockedEmail ?? '', password: '' },
  });

  const setStep = (s: NextStep | null) => {
    setStepState(s);
    onStepChange?.(s?.step ?? 'password');
  };

  const done = (session: SessionPayload) => {
    startSession(session);
    onSignedIn?.(session);
  };

  /** The step token expired or the account is locked: back to the password form with the reason. */
  const restart = (message: string) => {
    setStep(null);
    setFormError(message);
    resetField('password');
  };

  const onSubmit = handleSubmit(async ({ email, password }) => {
    setFormError(null);
    try {
      setStep(await authApi.login(email, password));
    } catch (e) {
      if (applyFieldErrors(e, setError, ['email', 'password'])) return;
      setFormError(errorMessage(e));
      resetField('password');
      setFocus('password');
    }
  });

  if (step?.step === 'mfa') return <CodeStep mfaToken={step.mfaToken} onDone={done} onRestart={restart} />;
  if (step?.step === 'enroll') return <EnrollStep enrollToken={step.enrollToken} onDone={done} onRestart={restart} />;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
      {formError ? <FormMessage>{formError}</FormMessage> : notice ? <FormMessage tone="info">{notice}</FormMessage> : null}
      <Input
        label="Email"
        type="email"
        placeholder="you@wehum.app"
        autoComplete="username"
        readOnly={!!lockedEmail}
        error={formState.errors.email?.message}
        className="[&_input]:h-12 [&_input]:bg-surface"
        {...register('email')}
      />
      <Input
        label="Password"
        type="password"
        autoComplete="current-password"
        error={formState.errors.password?.message}
        className="[&_input]:h-12 [&_input]:bg-surface"
        {...register('password')}
      />
      {hideForgot ? null : (
        <div className="flex justify-end text-body">
          <Link to="/forgot-password" className="rounded font-semibold text-ember-text hover:text-ember-soft">
            Forgot password?
          </Link>
        </div>
      )}
      <Button type="submit" loading={formState.isSubmitting} className="h-[50px] text-[15px]">
        Sign in
      </Button>
    </form>
  );
}
