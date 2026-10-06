<script lang="ts">
  import { makeInfo } from '../lib/format';

  let { make }: { make: string } = $props();
  const info = $derived(makeInfo(make));
</script>

<span class="make" title={info.name}>
  <span class="dot {info.key}" aria-hidden="true"></span>{info.short}
</span>

<style>
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
  .chv {
    background: var(--make-chv);
  }
  .frd {
    background: var(--make-frd);
  }
  .tyt {
    background: var(--make-tyt);
  }
</style>
