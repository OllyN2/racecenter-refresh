<script lang="ts">
  import { flagInfo, type FlagTone } from '../lib/format';

  let { code = null, label = '', tone = null }: { code?: number | null; label?: string; tone?: FlagTone | null } = $props();
  const info = $derived(flagInfo(code));
</script>

<span class="flag {tone ?? info.tone}">
  <span class="swatch" aria-hidden="true"></span>{label || info.label}
</span>

<style>
  .flag {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 4px 10px 4px 8px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    background: var(--surface-2);
    border: 1px solid var(--border);
    white-space: nowrap;
  }
  .swatch {
    width: 12px;
    height: 12px;
    border-radius: 3px;
    background: var(--faint);
    box-shadow: inset 0 0 0 1px var(--border);
  }
  .green .swatch {
    background: var(--good);
  }
  .yellow .swatch {
    background: var(--warning);
  }
  .red .swatch {
    background: var(--critical);
  }
  .white .swatch {
    background: #fff;
    box-shadow: inset 0 0 0 1px var(--axis);
  }
  .checkered .swatch {
    background: repeating-conic-gradient(#0b0b0b 0 25%, #fff 0 50%) 0 0 / 6px 6px;
    box-shadow: inset 0 0 0 1px var(--axis);
  }
  .yellow {
    background: var(--caution-wash);
  }
</style>
