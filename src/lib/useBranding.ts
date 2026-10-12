import { useQuery } from '@tanstack/react-query';
import { authApi } from '../features/auth/api';
import defaultLogo from '../assets/logo.svg';

/** App name and logo set in Settings → App content → Branding. Falls back to WeHum and the bundled logo. */
export function useBranding() {
  const { data } = useQuery({ queryKey: ['public', 'live'], queryFn: authApi.publicLive, refetchInterval: 60_000, staleTime: 30_000, retry: false });
  return { appName: data?.branding?.appName || 'WeHum', logo: data?.branding?.logoUrl || defaultLogo };
}
