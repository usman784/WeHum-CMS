import { Check, Copy, Download } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { renderSVG } from 'uqr';
import { ApiError, type SessionPayload } from '../../../lib/api';
import { errorMessage } from '../../../lib/form-errors';
import { Button } from '../../../ui/Button';
import { Checkbox } from '../../../ui/Checkbox';
import { Input } from '../../../ui/Input';
import { Skeleton } from '../../../ui/Skeleton';
import { authApi, type EnrollStart } from '../api';
import { totpCode } from '../schema';
import { FormMessage } from './AuthLayout';

type Props = {
  enrollToken: string;
  onDone: (session: SessionPayload) => void;
  onRestart: (message: string) => void;
};

/** "JBSWY3DPEHPK3PXP" → "JBSW Y3DP EHPK 3PXP": easier to type by hand. */
const grouped = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

/**
 * First sign-in (or after an invite): set up two-step sign-in (spec §6.2).
 * 1. Scan the QR code (or type the key) and enter one code to prove the app works.
 * 2. Save the 10 recovery codes. The session starts only after the admin confirms they are saved.
 */
export function EnrollStep({ enrollToken, onDone, onRestart }: Props) {
  const [setup, setSetup] = useState<EnrollStart | null>(null);
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<(SessionPayload & { recoveryCodes: string[] }) | null>(null);

  useEffect(() => {
    let alive = true;
    authApi
      .enrollStart(enrollToken)
      .then((s) => alive && setSetup(s))
      .catch((e: unknown) => alive && onRestart(errorMessage(e)));
    return () => {
      alive = false;
    };
    // The token identifies this attempt; `onRestart` is a fresh function on every parent render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enrollToken]);

  // The QR code is a fixed black-on-white image in both themes: scanners need the contrast.
  const qr = useMemo(() => (setup ? renderSVG(setup.otpauthUri, { border: 2, ecc: 'M' }) : null), [setup]);

  const submit = async (raw: string) => {
    const parsed = totpCode.safeParse(raw);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? 'Check the code');
    setBusy(true);
    setError(null);
    try {
      setDone(await authApi.enrollConfirm(enrollToken, parsed.data));
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'TOKEN_INVALID' || e.code === 'RATE_LIMITED' || e.code === 'INVALID_STATE'))
        return onRestart(errorMessage(e));
      setError(errorMessage(e));
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  if (done) return <RecoveryCodes codes={done.recoveryCodes} email={done.admin.email} onContinue={() => onDone(done)} />;

  return (
    <form
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        void submit(value);
      }}
      noValidate
      className="flex flex-col gap-[18px]"
    >
      <ol className="flex list-decimal flex-col gap-1 pl-5 text-sm text-text-body">
        <li>Install an authenticator app (Google Authenticator, 1Password, Authy).</li>
        <li>Scan this code with the app.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-3 rounded-[14px] border border-border-strong bg-surface p-4">
        {qr ? (
          <div
            role="img"
            aria-label="QR code for your authenticator app"
            className="size-44 overflow-hidden rounded-input bg-white p-1"
            dangerouslySetInnerHTML={{ __html: qr }}
          />
        ) : (
          <Skeleton className="size-44" />
        )}
        <div className="flex flex-col items-center gap-1 text-center">
          <span className="text-xs text-text-muted">Cannot scan? Type this key into the app:</span>
          {setup ? (
            <code className="tabular select-all break-all text-sm font-semibold" data-testid="totp-secret">
              {grouped(setup.secret)}
            </code>
          ) : (
            <Skeleton className="h-4 w-52" />
          )}
        </div>
      </div>
      <Input
        label="6-digit code"
        value={value}
        onChange={(e) => setValue(e.target.value.replace(/[^\d\s]/g, ''))}
        error={error ?? undefined}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={7}
        disabled={busy || !setup}
        className="[&_input]:text-center [&_input]:text-xl [&_input]:tabular-nums [&_input]:tracking-[0.3em]"
      />
      <Button type="submit" loading={busy} disabled={!setup} className="h-[50px] text-[15px]">
        Turn on two-step sign-in
      </Button>
    </form>
  );
}

/** The 10 one-time codes, shown once. Continue stays off until the admin says they are saved. */
export function RecoveryCodes({ codes, email, onContinue }: { codes: string[]; email: string; onContinue: () => void }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `WeHum CMS recovery codes for ${email}\nEach code works once.\n\n${codes.join('\n')}\n`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setCopied(false); // clipboard blocked: the codes are on screen and can be downloaded
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wehum-cms-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col gap-[18px]">
      <FormMessage tone="info">
        <strong className="text-text">Save these recovery codes now.</strong> They are shown only once. If you lose your phone, one of them
        signs you in. Each code works once.
      </FormMessage>
      <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 rounded-[14px] border border-border-strong bg-surface p-4">
        {codes.map((c) => (
          <li key={c} className="tabular text-center font-mono text-body font-semibold">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex gap-2.5">
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={copy}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? 'Copied' : 'Copy'}
        </Button>
        <Button type="button" variant="outline" size="sm" className="flex-1" onClick={download}>
          <Download size={16} aria-hidden />
          Download
        </Button>
      </div>
      <span aria-live="polite" className="sr-only">
        {copied ? 'Recovery codes copied.' : ''}
      </span>
      <Checkbox label="I have saved these codes in a safe place" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
      <Button type="button" disabled={!saved} onClick={onContinue} className="h-[50px] text-[15px]">
        Continue to the CMS
      </Button>
    </div>
  );
}
