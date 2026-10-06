export type Tab = 'leaderboard' | 'notes' | 'pits' | 'chart' | 'stages';

export const TABS: { id: Tab; label: string }[] = [
  { id: 'leaderboard', label: 'Leaderboard' },
  { id: 'notes', label: 'Lap notes' },
  { id: 'pits', label: 'Pit stops' },
  { id: 'chart', label: 'Positions' },
  { id: 'stages', label: 'Stages & points' },
];

export interface Route {
  series: number | null;
  raceId: number | null;
  tab: Tab;
}

export function parseHash(hash: string): Route {
  const [series, raceId, tab] = hash.replace(/^#\/?/, '').split('/');
  const s = Number(series);
  const r = Number(raceId);
  return {
    series: [1, 2, 3].includes(s) ? s : null,
    raceId: Number.isInteger(r) && r > 0 ? r : null,
    tab: TABS.some((t) => t.id === tab) ? (tab as Tab) : 'leaderboard',
  };
}

export function href(series: number, raceId: number, tab: Tab = 'leaderboard'): string {
  return `#/${series}/${raceId}${tab === 'leaderboard' ? '' : `/${tab}`}`;
}

class HashRoute {
  current = $state<Route>(parseHash(location.hash));

  constructor() {
    addEventListener('hashchange', () => {
      this.current = parseHash(location.hash);
    });
  }

  /** Points the URL at a race without adding a history entry (used for the default landing race). */
  replace(series: number, raceId: number, tab: Tab = 'leaderboard') {
    history.replaceState(null, '', href(series, raceId, tab));
    this.current = parseHash(location.hash);
  }
}

export const route = new HashRoute();
