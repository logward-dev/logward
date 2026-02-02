<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { authStore } from '$lib/stores/auth';
	import { organizationStore } from '$lib/stores/organization';
	import { layoutStore } from '$lib/stores/layout';
	import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '$lib/components/ui/card';
	import { Separator } from '$lib/components/ui/separator';
	import { ChannelsList, DefaultChannelsSettings } from '$lib/components/notification-channels';
	import Bell from '@lucide/svelte/icons/bell';
	import ArrowLeft from '@lucide/svelte/icons/arrow-left';
	import Button from '$lib/components/ui/button/button.svelte';
	import type { OrganizationWithRole } from '@logtide/shared';
	import { canManageMembers } from '@logtide/shared';

	let token: string | null = null;
	let currentOrg = $state<OrganizationWithRole | null>(null);
	let maxWidthClass = $state('max-w-7xl');
	let containerPadding = $state('px-6 py-8');

	$effect(() => {
		const unsubscribe = layoutStore.maxWidthClass.subscribe((value) => {
			maxWidthClass = value;
		});
		return unsubscribe;
	});

	$effect(() => {
		const unsubscribe = layoutStore.containerPadding.subscribe((value) => {
			containerPadding = value;
		});
		return unsubscribe;
	});

	authStore.subscribe((state) => {
		token = state.token;
	});

	organizationStore.subscribe((state) => {
		currentOrg = state.currentOrganization;
	});

	onMount(() => {
		if (!token) {
			goto('/login');
			return;
		}
	});

	let canManage = $derived(currentOrg ? canManageMembers(currentOrg.role) : false);
</script>

<svelte:head>
	<title>Notification Channels - LogTide</title>
</svelte:head>

<div class="container mx-auto space-y-6 {containerPadding} {maxWidthClass}">
	<div>
		<Button variant="ghost" size="sm" href="/dashboard/settings" class="mb-4 -ml-2 gap-2">
			<ArrowLeft class="w-4 h-4" />
			Back to Settings
		</Button>
		<h1 class="text-3xl font-bold tracking-tight">Notification Channels</h1>
		<div class="flex items-center gap-2 mt-2">
			<Bell class="w-4 h-4 text-muted-foreground" />
			<p class="text-muted-foreground">
				Manage how your organization receives notifications
			</p>
		</div>
	</div>

	{#if !canManage}
		<Card>
			<CardContent class="py-8 text-center">
				<p class="text-muted-foreground">
					Only organization admins and owners can manage notification channels.
				</p>
			</CardContent>
		</Card>
	{:else}
		<Card>
			<CardHeader>
				<CardTitle>Channels</CardTitle>
				<CardDescription>
					Create reusable notification channels that can be assigned to alerts, Sigma rules, and
					other events
				</CardDescription>
			</CardHeader>
			<CardContent>
				<ChannelsList />
			</CardContent>
		</Card>

		<Separator />

		<Card>
			<CardHeader>
				<CardTitle>Organization Defaults</CardTitle>
				<CardDescription>
					Set default channels for each event type. These are used when no specific channels are
					configured.
				</CardDescription>
			</CardHeader>
			<CardContent>
				<DefaultChannelsSettings />
			</CardContent>
		</Card>
	{/if}
</div>
