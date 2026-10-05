import type { Role } from './rbac';

/** The signed-in admin, as returned by `/v1/admin/auth/*` and `GET /v1/admin/me`. Kept in memory only (spec §6.2). */
export type Admin = {
  id: string;
  email: string;
  name: string;
  role: Role;
  mfaEnabled: boolean;
  permissions: string[];
};

let admin: Admin | null = null;
const listeners = new Set<() => void>();

export const session = {
  get admin() {
    return admin;
  },
  set(next: Admin | null) {
    admin = next;
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  },
};
