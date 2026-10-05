import type { Admin } from '../../../lib/session';
import { Dialog } from '../../../ui/Dialog';
import { signOut } from '../api';
import { LoginFlow } from './LoginFlow';

/**
 * The session ended while a screen was open (spec §10). The screen and any unsaved form stay as they are;
 * the admin signs in again on top and carries on. Closing the dialog signs out for real.
 */
export function ReLoginDialog({ admin, open }: { admin: Admin; open: boolean }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && void signOut('user')}
      title="Sign in again"
      description="Your session ended. Sign in to continue. Nothing you typed on this page is lost."
      size="sm"
    >
      {/* Mounted only while open, so every time it opens the form starts empty. */}
      {open ? <LoginFlow lockedEmail={admin.email} hideForgot /> : null}
    </Dialog>
  );
}
