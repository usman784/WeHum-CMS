import { useState, type FormEvent } from 'react';
import { ApiError, type SessionPayload } from '../../../lib/api';
import { errorMessage } from '../../../lib/form-errors';
import { Button } from '../../../ui/Button';
import { Input } from '../../../ui/Input';
import { authApi } from '../api';
import { recoveryCode, totpCode } from '../schema';
import { FormMessage } from './AuthLayout';

type Props = {
  mfaToken: string;
  onDone: (session: SessionPayload) => void;
  /** The 5-minute step token ran out, or the account is locked: start again from the password. */
  onRestart: (message: string) => void;
};

/** Step 2 of sign-in: the 6-digit authenticator code, or one of the recovery codes. */
export function CodeStep({ mfaToken, onDone, onRestart }: Props) {
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (raw: string) => {
    const parsed = (mode === 'code' ? totpCode : recoveryCode).safeParse(raw);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the code');
    setBusy(true);
    setError(null);
    try {
      onDone(await (mode === 'code' ? authApi.verifyCode(mfaToken, parsed.data) : authApi.verifyRecovery(mfaToken, parsed.data)));
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'TOKEN_INVALID' || e.code === 'RATE_LIMITED')) return onRestart(errorMessage(e));
      setError(errorMessage(e));
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submit(value);
  };

  const switchMode = () => {
    setMode(mode === 'code' ? 'recovery' : 'code');
    setValue('');
    setError(null);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-[18px]">
      {mode === 'code' ? (
        <Input
          key="code"
          label="6-digit code"
          help="Open your authenticator app and type the code for WeHum CMS."
          value={value}
          onChange={(e) => {
            const v = e.target.value.replace(/[^\d\s]/g, '');
            setValue(v);
            // Six digits typed or pasted: submit without an extra click.
            if (v.replace(/\s/g, '').length === 6 && !busy) void submit(v);
          }}
          error={error ?? undefined}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- the only field of this step; focus must move here after the password
          autoFocus
          disabled={busy}
          className="[&_input]:text-center [&_input]:text-xl [&_input]:tabular-nums [&_input]:tracking-[0.3em]"
        />
      ) : (
        <Input
          key="recovery"
          label="Recovery code"
          help="One of the 10 codes you saved when you set up two-step sign-in. Each works once."
          placeholder="a1b2c-3d4e5"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          error={error ?? undefined}
          autoComplete="off"
          spellCheck={false}
          // eslint-disable-next-line jsx-a11y/no-autofocus -- same reason as above
          autoFocus
          disabled={busy}
        />
      )}
      <Button type="submit" loading={busy} className="h-[50px] text-[15px]">
        Verify
      </Button>
      <button
        type="button"
        onClick={switchMode}
        className="self-center rounded text-sm font-semibold text-ember-text hover:text-ember-soft"
      >
        {mode === 'code' ? 'Use a recovery code instead' : 'Use the authenticator app instead'}
      </button>
      {mode === 'recovery' ? <FormMessage tone="info">Lost your phone and your codes? Ask a CMS owner for help.</FormMessage> : null}
    </form>
  );
}
