import { untrack } from 'svelte';
import { getJson, type Fetched } from './api';

export type FeedState<T> = Fetched<T> | { status: 'loading' };

const MAX_BACKOFF_MS = 60_000;
const ONE_SHOT_RETRY_MS = 5_000;

/** Fetches a JSON feed, optionally re-polling every `intervalMs` while the tab is visible. */
export class Feed<T> {
  // Raw: feeds are replaced wholesale, never mutated, so deep proxies on 100 KB+ payloads would be wasted work.
  state = $state.raw<FeedState<T>>({ status: 'loading' });
  updatedAt = $state<Date | null>(null);
  /** null = fetch once (retrying only on network errors). */
  intervalMs: number | null;

  readonly #url: string | null;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #ctrl: AbortController | undefined;
  #failures = 0;
  #running = false;

  /** A null url is a placeholder that never fetches (stays 'loading'). */
  constructor(url: string | null, intervalMs: number | null) {
    this.#url = url;
    this.intervalMs = intervalMs;
  }

  get data(): T | undefined {
    return this.state.status === 'ok' ? this.state.data : undefined;
  }

  /** Starts fetching; returns a stop function so it can be returned from `$effect`. */
  start(): () => void {
    if (!this.#url) return () => {};
    untrack(() => {
      this.#running = true;
      document.addEventListener('visibilitychange', this.#onVisibility);
      void this.#tick();
    });
    return () => this.stop();
  }

  /** Changes the poll rate; going from one-shot or slower polling to faster reschedules the next fetch. */
  setInterval(ms: number | null) {
    if (ms === this.intervalMs) return;
    const before = this.intervalMs;
    this.intervalMs = ms;
    // Speeding up (e.g. a session just went live) must not wait out the slower timer already pending.
    if (this.#running && ms !== null && (before === null || ms < before) && !document.hidden && !this.#failures) {
      clearTimeout(this.#timer);
      this.#timer = setTimeout(() => void this.#tick(), ms);
    }
  }

  /** Fetches again now (e.g. to fill gaps), keeping the current data until the response arrives. */
  refresh() {
    if (!this.#running || document.hidden) return;
    clearTimeout(this.#timer);
    void this.#tick();
  }

  stop() {
    this.#running = false;
    clearTimeout(this.#timer);
    this.#ctrl?.abort();
    document.removeEventListener('visibilitychange', this.#onVisibility);
  }

  #onVisibility = () => {
    if (!this.#running || (this.intervalMs === null && !this.#failures)) return;
    clearTimeout(this.#timer);
    if (document.hidden) this.#ctrl?.abort();
    else void this.#tick();
  };

  async #tick() {
    this.#ctrl?.abort();
    const ctrl = (this.#ctrl = new AbortController());
    let result: Fetched<T>;
    try {
      result = await getJson<T>(this.#url!, ctrl.signal);
    } catch {
      return;
    }
    if (!this.#running || ctrl.signal.aborted) return;

    if (result.status === 'error') {
      this.#failures++;
      // Keep showing the last good data through transient failures.
      if (this.state.status !== 'ok') this.state = result;
    } else {
      this.#failures = 0;
      this.state = result;
      if (result.status === 'ok') this.updatedAt = new Date();
    }
    this.#schedule();
  }

  #schedule() {
    clearTimeout(this.#timer);
    if (document.hidden) return;
    const base = this.intervalMs ?? (this.#failures ? ONE_SHOT_RETRY_MS : null);
    if (base === null) return;
    const delay = this.#failures ? Math.min(MAX_BACKOFF_MS, base * 2 ** (this.#failures - 1)) : base;
    this.#timer = setTimeout(() => void this.#tick(), delay);
  }
}

/**
 * Component-scoped feed: recreated when `url()` changes, re-paced when `interval()` changes,
 * stopped when the component unmounts. Call during component initialisation.
 */
export function useFeed<T>(url: () => string | null, interval: () => number | null): { readonly feed: Feed<T> } {
  // A derived string only notifies when its value changes, so the feed isn't rebuilt (and refetched) just
  // because something url() reads was replaced with an equal value.
  const href = $derived(url());
  const feed = $derived(new Feed<T>(href, null));
  $effect(() => {
    feed.setInterval(interval());
  });
  $effect(() => feed.start());
  return {
    get feed() {
      return feed;
    },
  };
}
