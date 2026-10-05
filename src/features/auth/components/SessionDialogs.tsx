import { refresh } from '../../../lib/api';
import { formatDuration } from '../../../lib/format';
import { Button } from '../../../ui/Button';
import { Dialog } from '../../../ui/Dialog';
import { signOut } from '../api';
import { useIdleTimeout } from '../hooks/useIdleTimeout';

/** Warning at 11 h 55 min without activity; sign-out at 12 h (spec §6.2). */
export function IdleWarning({ enabled }: { enabled: boolean }) {
  const { secondsLeft, stay } = useIdleTimeout({ enabled, onTimeout: () => void signOut('idle') });
  const keep = () => {
    stay();
    void refresh(); // also tells the server the session is in use
  };
  return (
    <Dialog
      open={secondsLeft !== null}
      // Closing with Esc or the X means "I am here": keep the session.
      onOpenChange={(open) => !open && keep()}
      title="Are you still there?"
      description="You have not used the CMS for a while. For safety you will be signed out soon."
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={() => void signOut('user')}>
            Sign out now
          </Button>
          <Button onClick={keep}>Stay signed in</Button>
        </>
      }
    >
      <p className="text-body text-text-body">
        Signing out in{' '}
        <span role="timer" className="tabular font-bold text-text">
          {formatDuration(secondsLeft ?? 0)}
        </span>
        .
      </p>
    </Dialog>
  );
}
