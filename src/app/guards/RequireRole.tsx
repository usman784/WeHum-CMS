import type { ReactNode } from 'react';
import { useCan } from '../../hooks/useRole';
import type { Action } from '../../lib/rbac';
import { NoPermission } from '../../ui/States';

/** Route guard (spec §6.2): shows the "No permission" state when the role does not allow the page. The API enforces the same rule. */
export function RequireRole({ need, children }: { need: Action; children: ReactNode }) {
  return useCan(need) ? <>{children}</> : <NoPermission className="flex-1" />;
}
