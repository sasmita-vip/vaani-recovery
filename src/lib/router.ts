import { useCallback, useEffect, useState } from 'react';

export type NavKey =
  | 'overview'
  | 'live'
  | 'escalation'
  | 'ptp'
  | 'history'
  | 'call-detail'
  | 'compliance'
  | 'settings';

export interface Route {
  nav: NavKey;
  callId?: string;
  query: string;
  signIn?: boolean;
}

const PATH_FOR_NAV: Record<NavKey, string> = {
  overview: '/overview',
  live: '/live',
  escalation: '/escalations',
  ptp: '/promises',
  history: '/history',
  'call-detail': '/calls',
  compliance: '/compliance',
  settings: '/settings',
};

const NAV_FOR_PATH: Record<string, NavKey> = {
  overview: 'overview',
  live: 'live',
  escalations: 'escalation',
  promises: 'ptp',
  history: 'history',
  calls: 'call-detail',
  compliance: 'compliance',
  settings: 'settings',
};

export function routeFromHash(hash: string): Route {
  const raw = hash.replace(/^#/, '');
  const [pathPart, searchPart] = raw.split('?');
  const segments = pathPart.split('/').filter(Boolean);
  const query = new URLSearchParams(searchPart ?? '').get('q') ?? '';
  if (segments[0] === 'signin') return { nav: 'overview', query, signIn: true };
  const nav = NAV_FOR_PATH[segments[0] ?? ''] ?? 'overview';

  if (nav === 'call-detail') {
    return segments[1]
      ? { nav: 'call-detail', callId: decodeURIComponent(segments[1]), query }
      : { nav: 'history', query };
  }
  return { nav, query };
}

export function hashFor(nav: NavKey, callId?: string): string {
  if (nav === 'call-detail') {
    return callId ? `#/calls/${encodeURIComponent(callId)}` : '#/history';
  }
  return `#${PATH_FOR_NAV[nav]}`;
}

export function historyHash(query: string): string {
  return query ? `#/history?q=${encodeURIComponent(query)}` : '#/history';
}

export function useHashRoute() {
  const [route, setRoute] = useState<Route>(() => routeFromHash(window.location.hash));

  useEffect(() => {
    const sync = () => setRoute(routeFromHash(window.location.hash));
    if (!window.location.hash) {
      window.history.replaceState(null, '', '#/overview');
      setRoute({ nav: 'overview', query: '' });
    }
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
  }, []);

  const navigate = useCallback((target: string) => {
    const next = target.startsWith('#') ? target : `#${target}`;
    if (window.location.hash === next) {
      // Same hash does not fire hashchange; refresh the route explicitly.
      setRoute(routeFromHash(next));
      return;
    }
    window.location.hash = next;
  }, []);

  return { route, navigate };
}
