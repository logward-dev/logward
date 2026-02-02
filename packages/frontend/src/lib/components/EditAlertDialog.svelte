<script lang="ts">
	import { alertsAPI, type AlertRule } from "$lib/api/alerts";
	import { toastStore } from "$lib/stores/toast";
	import * as Dialog from "$lib/components/ui/dialog";
	import Button from "$lib/components/ui/button/button.svelte";
	import Input from "$lib/components/ui/input/input.svelte";
	import Label from "$lib/components/ui/label/label.svelte";
	import Spinner from "$lib/components/Spinner.svelte";
	import { ChannelSelector } from "$lib/components/notification-channels";

	interface Props {
		open: boolean;
		organizationId: string;
		alert: AlertRule | null;
		onSuccess?: () => void;
		onOpenChange?: (open: boolean) => void;
	}

	let {
		open = $bindable(),
		organizationId,
		alert,
		onSuccess,
		onOpenChange,
	}: Props = $props();

	let name = $state("");
	let service = $state("");
	let selectedLevels = $state<Set<string>>(new Set());
	let threshold = $state(10);
	let timeWindow = $state(5);
	let selectedChannelIds = $state<string[]>([]);
	let submitting = $state(false);

	const availableLevels = [
		"debug",
		"info",
		"warn",
		"error",
		"critical",
	] as const;

	function toggleLevel(level: string) {
		const newLevels = new Set(selectedLevels);
		if (newLevels.has(level)) {
			newLevels.delete(level);
		} else {
			newLevels.add(level);
		}
		selectedLevels = newLevels;
	}

	function loadAlertData() {
		if (!alert) return;

		name = alert.name;
		service = alert.service || "";
		selectedLevels = new Set(alert.level);
		threshold = alert.threshold;
		timeWindow = alert.timeWindow;
		selectedChannelIds = alert.channelIds || [];
	}

	$effect(() => {
		if (open && alert) {
			loadAlertData();
		}
	});

	async function handleSubmit() {
		if (!alert) return;

		// Validation
		if (!name.trim()) {
			toastStore.error("Alert name is required");
			return;
		}

		if (selectedLevels.size === 0) {
			toastStore.error("Select at least one log level");
			return;
		}

		if (threshold < 1) {
			toastStore.error("Threshold must be at least 1");
			return;
		}

		if (timeWindow < 1) {
			toastStore.error("Time window must be at least 1 minute");
			return;
		}

		if (selectedChannelIds.length === 0) {
			toastStore.error("Select at least one notification channel");
			return;
		}

		submitting = true;

		try {
			await alertsAPI.updateAlertRule(organizationId, alert.id, {
				name: name.trim(),
				service: service.trim() || null,
				level: Array.from(selectedLevels) as any,
				threshold,
				timeWindow,
				channelIds: selectedChannelIds,
			});

			toastStore.success("Alert rule updated successfully");
			open = false;
			onSuccess?.();
		} catch (error) {
			toastStore.error(
				error instanceof Error
					? error.message
					: "Failed to update alert rule",
			);
		} finally {
			submitting = false;
		}
	}
</script>

<Dialog.Root
	{open}
	onOpenChange={(o) => {
		open = o;
		onOpenChange?.(o);
	}}
>
	<Dialog.Content class="max-w-2xl max-h-[90vh] overflow-y-auto">
		<Dialog.Header>
			<Dialog.Title>Edit Alert Rule</Dialog.Title>
			<Dialog.Description>
				Update the alert rule configuration
			</Dialog.Description>
		</Dialog.Header>

		<form
			class="space-y-4"
			onsubmit={(e) => {
				e.preventDefault();
				handleSubmit();
			}}
		>
			<!-- Alert Name -->
			<div class="space-y-2">
				<Label for="name">Alert Name *</Label>
				<Input
					id="name"
					type="text"
					placeholder="High error rate"
					bind:value={name}
					disabled={submitting}
					required
				/>
			</div>

			<!-- Service Filter -->
			<div class="space-y-2">
				<Label for="service">Service Name (optional)</Label>
				<Input
					id="service"
					type="text"
					placeholder="Leave empty to monitor all services"
					bind:value={service}
					disabled={submitting}
				/>
				<p class="text-xs text-muted-foreground">
					Filter logs by service name. Leave empty to monitor all services.
				</p>
			</div>

			<!-- Log Levels -->
			<div class="space-y-2">
				<Label>Log Levels *</Label>
				<div class="flex flex-wrap gap-2">
					{#each availableLevels as level}
						<Button
							type="button"
							variant={selectedLevels.has(level) ? "default" : "outline"}
							size="sm"
							onclick={() => toggleLevel(level)}
							disabled={submitting}
						>
							{level}
						</Button>
					{/each}
				</div>
				<p class="text-xs text-muted-foreground">
					Select which log levels should trigger this alert
				</p>
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div class="space-y-2">
					<Label for="threshold">Threshold *</Label>
					<Input
						id="threshold"
						type="number"
						min="1"
						bind:value={threshold}
						disabled={submitting}
						required
					/>
					<p class="text-xs text-muted-foreground">Number of logs</p>
				</div>

				<div class="space-y-2">
					<Label for="timeWindow">Time Window *</Label>
					<Input
						id="timeWindow"
						type="number"
						min="1"
						bind:value={timeWindow}
						disabled={submitting}
						required
					/>
					<p class="text-xs text-muted-foreground">Minutes</p>
				</div>
			</div>

			<div class="p-3 bg-muted rounded-md text-sm">
				Alert triggers when <strong>{threshold}</strong> or more logs
				matching the criteria are received within
				<strong>{timeWindow}</strong>
				minute{timeWindow > 1 ? "s" : ""}
			</div>

			<!-- Notification Channels -->
			<div class="space-y-2">
				<Label>Notification Channels *</Label>
				<ChannelSelector
					selectedIds={selectedChannelIds}
					onSelectionChange={(ids) => (selectedChannelIds = ids)}
					disabled={submitting}
					placeholder="Select channels..."
				/>
				<p class="text-xs text-muted-foreground">
					Select channels to receive notifications when alert triggers
				</p>
			</div>
		</form>

		<Dialog.Footer>
			<Button
				type="button"
				variant="outline"
				onclick={() => (open = false)}
				disabled={submitting}
			>
				Cancel
			</Button>
			<Button onclick={handleSubmit} disabled={submitting}>
				{#if submitting}
					<Spinner size="sm" className="mr-2" />
				{/if}
				Save Changes
			</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
