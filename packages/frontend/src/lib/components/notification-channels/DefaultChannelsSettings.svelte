<script lang="ts">
	import { notificationChannelsStore } from '$lib/stores/notification-channels';
	import { organizationStore } from '$lib/stores/organization';
	import { toastStore } from '$lib/stores/toast';
	import { Badge } from '$lib/components/ui/badge';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import ChannelSelector from './ChannelSelector.svelte';
	import Spinner from '$lib/components/Spinner.svelte';
	import type { NotificationChannel, NotificationEventType } from '$lib/api/notification-channels';
	import AlertTriangle from '@lucide/svelte/icons/alert-triangle';
	import Shield from '@lucide/svelte/icons/shield';
	import Bug from '@lucide/svelte/icons/bug';
	import Bell from '@lucide/svelte/icons/bell';

	let currentOrg = $state<{ id: string } | null>(null);
	organizationStore.subscribe((state) => {
		currentOrg = state.currentOrganization;
	});

	let defaults = $state<Record<NotificationEventType, NotificationChannel[]>>({
		alert: [],
		sigma: [],
		incident: [],
		error: [],
	});
	let defaultsLoading = $state(false);
	let saving = $state<NotificationEventType | null>(null);

	notificationChannelsStore.subscribe((state) => {
		defaults = state.defaults;
		defaultsLoading = state.defaultsLoading;
	});

	// Load defaults when org changes
	$effect(() => {
		if (currentOrg?.id) {
			notificationChannelsStore.loadDefaults(currentOrg.id);
		}
	});

	const eventTypes: {
		type: NotificationEventType;
		label: string;
		description: string;
		icon: typeof AlertTriangle;
	}[] = [
		{
			type: 'alert',
			label: 'Alert Rules',
			description: 'Default channels for threshold-based alert rules',
			icon: Bell,
		},
		{
			type: 'sigma',
			label: 'Sigma Detections',
			description: 'Default channels for Sigma rule detections',
			icon: Shield,
		},
		{
			type: 'incident',
			label: 'Security Incidents',
			description: 'Default channels for new security incidents',
			icon: AlertTriangle,
		},
		{
			type: 'error',
			label: 'Error Tracking',
			description: 'Default channels for new error group notifications',
			icon: Bug,
		},
	];

	async function handleDefaultsChange(eventType: NotificationEventType, channelIds: string[]) {
		if (!currentOrg) return;

		saving = eventType;
		try {
			await notificationChannelsStore.setDefaults(currentOrg.id, eventType, channelIds);
			toastStore.success('Default channels updated');
		} catch (err) {
			toastStore.error(err instanceof Error ? err.message : 'Failed to update defaults');
		} finally {
			saving = null;
		}
	}

	function getSelectedIds(eventType: NotificationEventType): string[] {
		return defaults[eventType]?.map((ch) => ch.id) || [];
	}
</script>

<div class="space-y-4">
	<div>
		<h3 class="text-lg font-medium">Default Channels</h3>
		<p class="text-sm text-muted-foreground">
			Configure which channels receive notifications by default for each event type
		</p>
	</div>

	{#if defaultsLoading}
		<div class="flex items-center justify-center py-8">
			<Spinner size="md" />
			<span class="ml-2 text-sm text-muted-foreground">Loading defaults...</span>
		</div>
	{:else}
		<div class="grid gap-4">
			{#each eventTypes as { type, label, description, icon: Icon }}
				<Card>
					<CardHeader class="pb-3">
						<div class="flex items-center gap-3">
							<div class="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
								<Icon class="h-5 w-5 text-primary" />
							</div>
							<div class="flex-1">
								<CardTitle class="text-base flex items-center gap-2">
									{label}
									{#if saving === type}
										<Spinner size="sm" />
									{/if}
								</CardTitle>
								<CardDescription>{description}</CardDescription>
							</div>
						</div>
					</CardHeader>
					<CardContent>
						<ChannelSelector
							selectedIds={getSelectedIds(type)}
							onSelectionChange={(ids) => handleDefaultsChange(type, ids)}
							disabled={saving === type}
							placeholder="No default channels (use member emails)"
						/>
						{#if getSelectedIds(type).length === 0}
							<p class="text-xs text-muted-foreground mt-2">
								Without default channels, notifications will be sent to organization members
							</p>
						{/if}
					</CardContent>
				</Card>
			{/each}
		</div>
	{/if}
</div>
