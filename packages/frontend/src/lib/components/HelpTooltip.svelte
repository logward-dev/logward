<script lang="ts">
  import { browser } from '$app/environment';
  import * as Tooltip from '$lib/components/ui/tooltip';
  import Button from '$lib/components/ui/button/button.svelte';
  import HelpCircle from '@lucide/svelte/icons/help-circle';
  import X from '@lucide/svelte/icons/x';

  interface Props {
    /** Unique ID for this tooltip (used for dismissal persistence) */
    id: string;
    /** Help text to display */
    text: string;
    /** Optional link to documentation */
    docsLink?: string;
    /** Size of the help icon */
    size?: 'sm' | 'md';
    /** Allow permanent dismissal */
    dismissable?: boolean;
  }

  let {
    id,
    text,
    docsLink,
    size = 'sm',
    dismissable = true
  }: Props = $props();

  const DISMISSED_KEY = 'logward_dismissed_tooltips';

  let isDismissed = $state(false);

  // Check if this tooltip was dismissed
  $effect(() => {
    if (!browser) return;

    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      if (dismissed) {
        const dismissedIds = JSON.parse(dismissed) as string[];
        isDismissed = dismissedIds.includes(id);
      }
    } catch (e) {
      console.error('Failed to load dismissed tooltips:', e);
    }
  });

  function dismiss() {
    if (!browser) return;

    try {
      const dismissed = localStorage.getItem(DISMISSED_KEY);
      const dismissedIds = dismissed ? JSON.parse(dismissed) as string[] : [];

      if (!dismissedIds.includes(id)) {
        dismissedIds.push(id);
        localStorage.setItem(DISMISSED_KEY, JSON.stringify(dismissedIds));
      }

      isDismissed = true;
    } catch (e) {
      console.error('Failed to dismiss tooltip:', e);
    }
  }

  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
</script>

{#if !isDismissed}
  <Tooltip.Root>
    <Tooltip.Trigger asChild>
      <button
        class="inline-flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-full hover:bg-muted p-0.5"
        aria-label="Help"
      >
        <HelpCircle class={iconSize} />
      </button>
    </Tooltip.Trigger>
    <Tooltip.Content class="max-w-xs">
      <div class="space-y-2">
        <p class="text-sm">{text}</p>
        <div class="flex items-center justify-between gap-2">
          {#if docsLink}
            <a
              href={docsLink}
              target="_blank"
              rel="noopener noreferrer"
              class="text-xs text-primary hover:underline"
            >
              Learn more
            </a>
          {:else}
            <span></span>
          {/if}
          {#if dismissable}
            <button
              onclick={dismiss}
              class="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1"
            >
              <X class="w-3 h-3" />
              Don't show again
            </button>
          {/if}
        </div>
      </div>
    </Tooltip.Content>
  </Tooltip.Root>
{/if}
