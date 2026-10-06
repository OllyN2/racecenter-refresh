<script lang="ts">
  import { makeInfo } from '../lib/format';
  import chv from '../assets/makes/chv.png';
  import frd from '../assets/makes/frd.png';
  import ram from '../assets/makes/ram.png';
  import tyt from '../assets/makes/tyt.png';

  let { make }: { make: string } = $props();
  const info = $derived(makeInfo(make));

  // Bundled rather than hotlinked: nascar.com sits behind Cloudflare, which blocks image requests and sets cookies.
  // Every logo is fitted into the same 56x24 box (files are 2x) and centered, so wide and square logos line up.
  const LOGOS: Record<string, string> = { chv, frd, tyt, ram };
  const logo = $derived(LOGOS[info.key]);
</script>

{#if logo}
  <img src={logo} alt={info.name} title={info.name} width="56" height="24" />
{:else}
  <span class="make" title={info.name}>
    <span class="dot" aria-hidden="true"></span>{info.short}
  </span>
{/if}

<style>
  img {
    display: block;
    object-fit: contain;
  }
  .make {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.02em;
    color: var(--ink-2);
  }
  .dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--faint);
  }
</style>
