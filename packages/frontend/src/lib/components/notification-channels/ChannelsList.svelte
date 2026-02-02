<script lang="ts">
	import { notificationChannelsStore } from '$lib/stores/notification-channels';
	import { organizationStore } from '$lib/stores/organization';
	import { toastStore } from '$lib/stores/toast';
	import Button from '$lib/components/ui/button/button.svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Switch } from '$lib/components/ui/switch';
	import {
		Table,
		TableBody,
		TableCell,
		TableHead,
		TableHeader,
		TableRow,
	} from '$lib/components/ui/table';
	import {
		AlertDialog,
		AlertDialogAction,
		AlertDialogCancel,
		AlertDialogContent,
		AlertDialogDescription,
		AlertDialogFooter,
		AlertDialogHeader,
		AlertDialogTitle,
	} from '$lib/components/ui/alert-dialog';
	import {
		DropdownMenu,
		DropdownMenuContent,
		DropdownMenuItem,
		DropdownMenuSeparator,
		DropdownMenuTrigger,
	} from '$lib/components/ui/dropdown-menu';
	import CreateChannelDialog from './CreateChannelDialog.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { NotificationChannel } from '$lib/api/notification-channels';
	import Mail from '@lucide/svelte/icons/mail';
	import Webhook from '@lucide/svelte/icons/webhook';
	import Plus from '@lucide/svelte/icons/plus';
	import MoreHorizontal from '@lucide/svelte/icons/more-horizontal';
	import Pencil from '@lucide/svelte/icons/pencil';
	import Trash2 from '@lucide/svelte/icons/trash-2';
	import TestTube from '@lucide/svelte/icons/test-tube';
	import Bell from '@lucide/svelte/icons/bell';

	let channels = $state<NotificationChannel[]>([]);
	let loading = $state(false);

	let currentOrg = $state<{ id: string } | null>(null);
	organizationStore.subscribe((state) => {
		currentOrg = state.currentOrganization;
	});

	notificationChannelsStore.subscribe((state) => {
		channels = state.channels;
		loading = state.loading;
	});

	// Load channels when org changes
	$effect(() => {
		if (currentOrg?.id) {
			notificationChannelsStore.load(currentOrg.id);
		}
	});

	let createDialogOpen = $state(false);
	let editingChannel = $state<NotificationChannel | null>(null);
	let channelToDelete = $state<NotificationChannel | null>(null);
	let deleting = $state(false);
	let testingId = $state<string | null>(null);

	async function handleToggleEnabled(channel: NotificationChannel) {
		if (!currentOrg) return;

		try {
			await notificationChannelsStore.update(channel.id, currentOrg.id, {
				enabled: !channel.enabled,
			});
			toastStore.success(`Channel ${channel.enabled ? 'disabled' : 'enabled'}`);
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to update channel');
		}
	}

	async function handleTest(channel: NotificationChannel) {
		if (!currentOrg) return;

		testingId = channel.id;
		try {
			const result = await notificationChannelsStore.test(channel.id, currentOrg.id);
			if (result.success) {
				toastStore.success('Test notification sent successfully');
			} else {
				toastStore.error(result.error || 'Test failed');
			}
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Test failed');
		} finally {
			testingId = null;
		}
	}

	async function handleDelete() {
		if (!currentOrg || !channelToDelete) return;

		deleting = true;
		try {
			await notificationChannelsStore.delete(channelToDelete.id, currentOrg.id);
			toastStore.success('Channel deleted');
			channelToDelete = null;
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to delete channel');
		} finally {
			deleting = false;
		}
	}

	function getChannelIcon(type: string) {
		return type === 'email' ? Mail : Webhook;
	}

	function formatDate(dateStr: string): string {
		return new Date(dateStr).toLocaleDateString();
	}

	function getConfigSummary(channel: NotificationChannel): string {
		if (channel.type === 'email') {
			const config = channel.config as { recipients: string[] };
			return `${config.recipients.length} recipient${config.recipients.length !== 1 ? 's' : ''}`;
		} else {
			const config = channel.config as { url: string };
			try {
				return new URL(config.url).hostname;
			} catch {
				return config.url;
			}
		}
	}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<div>
			<h3 class="text-lg font-medium">Notification Channels</h3>
			<p class="text-sm text-muted-foreground">
				Manage reusable notification channels for alerts and events
			</p>
		</div>
		<Button onclick={() => (createDialogOpen = true)} class="gap-2">
			<Plus class="h-4 w-4" />
			Add Channel
		</Button>
	</div>

	{#if loading}
		<div class="flex items-center justify-center py-12">
			<Spinner size="md" />
			<span class="ml-2 text-sm text-muted-foreground">Loading channels...</span>
		</div>
	{:else if channels.length === 0}
		<div class="text-center py-12 border rounded-lg">
			<Bell class="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
			<h4 class="font-medium mb-1">No channels configured</h4>
			<p class="text-sm text-muted-foreground mb-4">
				Create notification channels to receive alerts via email or webhooks
			</p>
			<Button onclick={() => (createDialogOpen = true)} class="gap-2">
				<Plus class="h-4 w-4" />
				Create First Channel
			</Button>
		</div>
	{:else}
		<div class="rounded-md border">
			<Table>
				<TableHeader>
					<TableRow>
						<TableHead>Channel</TableHead>
						<TableHead>Type</TableHead>
						<TableHead>Configuration</TableHead>
						<TableHead>Created</TableHead>
						<TableHead class="w-[80px]">Enabled</TableHead>
						<TableHead class="w-[60px]">Actions</TableHead>
					</TableRow>
				</TableHeader>
				<TableBody>
					{#each channels as channel}
						{@const Icon = getChannelIcon(channel.type)}
						<TableRow>
							<TableCell>
								<div class="flex items-center gap-3">
									<div
										class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center"
									>
										<Icon class="h-4 w-4 text-primary" />
									</div>
									<div>
										<div class="font-medium">{channel.name}</div>
										{#if channel.description}
											<div class="text-sm text-muted-foreground">{channel.description}</div>
										{/if}
									</div>
								</div>
							</TableCell>
							<TableCell>
								<Badge variant="outline">{channel.type}</Badge>
							</TableCell>
							<TableCell class="text-sm text-muted-foreground">
								{getConfigSummary(channel)}
							</TableCell>
							<TableCell class="text-sm text-muted-foreground">
								{formatDate(channel.createdAt)}
							</TableCell>
							<TableCell>
								<Switch checked={channel.enabled} onCheckedChange={() => handleToggleEnabled(channel)} />
							</TableCell>
							<TableCell>
								<DropdownMenu>
									<DropdownMenuTrigger>
										<Button variant="ghost" size="icon" class="h-8 w-8">
											<MoreHorizontal class="w-4 h-4" />
										</Button>
									</DropdownMenuTrigger>
									<DropdownMenuContent align="end">
										<DropdownMenuItem onclick={() => (editingChannel = channel)}>
											<Pencil class="w-4 h-4 mr-2" />
											Edit
										</DropdownMenuItem>
										<DropdownMenuItem
											onclick={() => handleTest(channel)}
											disabled={testingId === channel.id}
										>
											{#if testingId === channel.id}
												<Spinner size="sm" className="mr-2" />
											{:else}
												<TestTube class="w-4 h-4 mr-2" />
											{/if}
											Test
										</DropdownMenuItem>
										<DropdownMenuSeparator />
										<DropdownMenuItem
											onclick={() => (channelToDelete = channel)}
											class="text-destructive focus:text-destructive"
										>
											<Trash2 class="w-4 h-4 mr-2" />
											Delete
										</DropdownMenuItem>
									</DropdownMenuContent>
								</DropdownMenu>
							</TableCell>
						</TableRow>
					{/each}
				</TableBody>
			</Table>
		</div>
	{/if}
</div>

<!-- Create/Edit Dialog -->
<CreateChannelDialog
	bind:open={createDialogOpen}
	onSuccess={() => {
		createDialogOpen = false;
	}}
/>

<CreateChannelDialog
	open={!!editingChannel}
	channel={editingChannel}
	onOpenChange={(open) => {
		if (!open) editingChannel = null;
	}}
	onSuccess={() => {
		editingChannel = null;
	}}
/>

<!-- Delete Confirmation -->
<AlertDialog
	open={!!channelToDelete}
	onOpenChange={(open) => {
		if (!open) channelToDelete = null;
	}}
>
	<AlertDialogContent>
		<AlertDialogHeader>
			<AlertDialogTitle>Delete Channel?</AlertDialogTitle>
			<AlertDialogDescription>
				Are you sure you want to delete <strong>{channelToDelete?.name}</strong>? This will remove
				it from all alert rules and events that use it.
			</AlertDialogDescription>
		</AlertDialogHeader>
		<AlertDialogFooter>
			<AlertDialogCancel onclick={() => (channelToDelete = null)}>Cancel</AlertDialogCancel>
			<AlertDialogAction
				onclick={handleDelete}
				class="bg-destructive hover:bg-destructive/90"
				disabled={deleting}
			>
				{deleting ? 'Deleting...' : 'Delete Channel'}
			</AlertDialogAction>
		</AlertDialogFooter>
	</AlertDialogContent>
</AlertDialog>
