<script lang="ts">
  import { goto } from '$app/navigation';
  import { shortcutsStore } from '$lib/stores/shortcuts';
  import { layoutStore } from '$lib/stores/layout';
  import { formatKey } from '$lib/utils/keyboard';
  import * as Command from '$lib/components/ui/command';
  import LayoutDashboard from '@lucide/svelte/icons/layout-dashboard';
  import FileText from '@lucide/svelte/icons/file-text';
  import FolderKanban from '@lucide/svelte/icons/folder-kanban';
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
  import GitBranch from '@lucide/svelte/icons/git-branch';
  import Bug from '@lucide/svelte/icons/bug';
  import Shield from '@lucide/svelte/icons/shield';
  import Settings from '@lucide/svelte/icons/settings';
  import PanelLeftClose from '@lucide/svelte/icons/panel-left-close';
  import Keyboard from '@lucide/svelte/icons/keyboard';
  import RefreshCw from '@lucide/svelte/icons/refresh-cw';
  import Moon from '@lucide/svelte/icons/moon';

  let open = $state(false);

  $effect(() => {
    const unsubscribe = shortcutsStore.subscribe((s) => {
      open = s.commandPaletteOpen;
    });
    return unsubscribe;
  });

  function handleOpenChange(newOpen: boolean) {
    if (newOpen) {
      shortcutsStore.openCommandPalette();
    } else {
      shortcutsStore.closeCommandPalette();
    }
  }

  const navItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, shortcut: 'g d' },
    { label: 'Projects', href: '/dashboard/projects', icon: FolderKanban, shortcut: 'g p' },
    { label: 'Logs', href: '/dashboard/search', icon: FileText, shortcut: 'g s' },
    { label: 'Traces', href: '/dashboard/traces', icon: GitBranch, shortcut: 'g t' },
    { label: 'Alerts', href: '/dashboard/alerts', icon: AlertTriangle, shortcut: 'g a' },
    { label: 'Errors', href: '/dashboard/errors', icon: Bug, shortcut: 'g r' },
    { label: 'Security', href: '/dashboard/security', icon: Shield, shortcut: 'g e' },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings, shortcut: 'g x' },
  ];

  function navigate(href: string) {
    goto(href);
    shortcutsStore.closeCommandPalette();
  }

  function runAction(fn: () => void) {
    fn();
    shortcutsStore.closeCommandPalette();
  }
</script>

<Command.Dialog bind:open onOpenChange={handleOpenChange}>
  <Command.Input placeholder="Type a command or search..." />
  <Command.List>
    <Command.Empty>No results found.</Command.Empty>

    <Command.Group heading="Navigation">
      {#each navItems as item}
        {@const Icon = item.icon}
        <Command.Item value={`Navigate to ${item.label}`} onSelect={() => navigate(item.href)}>
          <Icon class="w-4 h-4 mr-2 text-muted-foreground" />
          <span>{item.label}</span>
          {#if item.shortcut}
            <Command.Shortcut>{formatKey(item.shortcut)}</Command.Shortcut>
          {/if}
        </Command.Item>
      {/each}
    </Command.Group>

    <Command.Separator />

    <Command.Group heading="Quick Actions">
      <Command.Item value="Toggle sidebar" onSelect={() => runAction(() => layoutStore.toggleSidebar())}>
        <PanelLeftClose class="w-4 h-4 mr-2 text-muted-foreground" />
        <span>Toggle Sidebar</span>
      </Command.Item>
      <Command.Item value="Reload page" onSelect={() => runAction(() => window.location.reload())}>
        <RefreshCw class="w-4 h-4 mr-2 text-muted-foreground" />
        <span>Reload Page</span>
      </Command.Item>
      <Command.Item value="Toggle dark mode theme" onSelect={() => runAction(() => {
        const html = document.documentElement;
        html.classList.toggle('dark');
      })}>
        <Moon class="w-4 h-4 mr-2 text-muted-foreground" />
        <span>Toggle Theme</span>
      </Command.Item>
      <Command.Item value="Keyboard shortcuts help" onSelect={() => {
        shortcutsStore.closeCommandPalette();
        // Small delay to let command palette close first
        setTimeout(() => shortcutsStore.openHelpModal(), 100);
      }}>
        <Keyboard class="w-4 h-4 mr-2 text-muted-foreground" />
        <span>Keyboard Shortcuts</span>
        <Command.Shortcut>?</Command.Shortcut>
      </Command.Item>
    </Command.Group>
  </Command.List>
</Command.Dialog>
