<script lang="ts">
  import { feeds } from '../lib/api';

  let { series }: { series: number } = $props();

  interface AudioMap {
    audio_config: { driver_name: string; base_url: string; stream_ios: string; requiresAuth: boolean }[];
  }

  let status = $state<'idle' | 'loading' | 'playing' | 'error'>('idle');
  let audio = $state<HTMLAudioElement>();
  let hls: { destroy(): void } | null = null;

  // NRN's radio call is the one scanner stream NASCAR leaves open; driver and officials channels need a subscription.
  async function start() {
    if (!audio) return;
    status = 'loading';
    try {
      const map: AudioMap = await (await fetch(feeds.audio(series))).json();
      const nrn = map.audio_config.find((a) => !a.requiresAuth);
      if (!nrn) throw new Error('No free stream');
      const src = nrn.base_url + nrn.stream_ios;
      if (audio.canPlayType('application/vnd.apple.mpegurl')) {
        audio.src = src;
      } else {
        // Browsers without built-in HLS (desktop Chrome/Firefox) load hls.js only when someone presses play.
        const { default: Hls } = await import('hls.js/light');
        if (!Hls.isSupported()) throw new Error('HLS not supported');
        const h = new Hls({ enableWorker: false, lowLatencyMode: true });
        h.loadSource(src);
        h.attachMedia(audio);
        hls = h;
      }
      await audio.play();
      status = 'playing';
    } catch {
      stop();
      status = 'error';
    }
  }

  function stop() {
    hls?.destroy();
    hls = null;
    if (audio) {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    }
    status = 'idle';
  }

  $effect(() => () => hls?.destroy());
</script>

<button class="radio" aria-pressed={status === 'playing'} onclick={() => (status === 'idle' || status === 'error' ? start() : stop())}>
  <span class="icon" aria-hidden="true">{status === 'playing' ? '■' : '▶'}</span>
  {status === 'loading' ? 'Connecting…' : status === 'error' ? 'Radio unavailable' : 'NRN radio'}
</button>
<audio bind:this={audio}></audio>

<style>
  .radio {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 4px 10px;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--surface);
    color: var(--ink);
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }
  .radio:hover {
    background: var(--surface-2);
  }
  .radio[aria-pressed='true'] {
    background: var(--accent-wash);
    border-color: var(--accent);
  }
  .icon {
    color: var(--accent);
    font-size: 10px;
  }
</style>
