<script lang="ts">
	import {
		detectionPacksAPI,
		type DetectionPackWithStatus,
		type ThresholdMap,
	} from "$lib/api/detection-packs";
	import { toastStore } from "$lib/stores/toast";
	import * as Dialog from "$lib/components/ui/dialog";
	import Button from "$lib/components/ui/button/button.svelte";
	import Input from "$lib/components/ui/input/input.svelte";
	import Label from "$lib/components/ui/label/label.svelte";
	import { Badge } from "$lib/components/ui/badge";
	import Spinner from "$lib/components/Spinner.svelte";
	import Rocket from "@lucide/svelte/icons/rocket";
	import Shield from "@lucide/svelte/icons/shield";
	import Database from "@lucide/svelte/icons/database";
	import CreditCard from "@lucide/svelte/icons/credit-card";
	import CheckCircle from "@lucide/svelte/icons/check-circle";
	import XCircle from "@lucide/svelte/icons/x-circle";

	interface Props {
		open: boolean;
		pack: DetectionPackWithStatus | null;
		organizationId: string;
		onSuccess?: () => void;
		onOpenChange?: (open: boolean) => void;
	}

	let {
		open = $bindable(),
		pack,
		organizationId,
		onSuccess,
		onOpenChange,
	}: Props = $props();

	let customThresholds = $state<ThresholdMap>({});
	let emailRecipients = $state("");
	let webhookUrl = $state("");
	let submitting = $state(false);
	let disabling = $state(false);

	const iconMap: Record<string, typeof Rocket> = {
		rocket: Rocket,
		shield: Shield,
		database: Database,
		"credit-card": CreditCard,
	};

	const categoryColors: Record<string, string> = {
		reliability: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200",
		security: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
		database: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200",
		business: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
	};

	function initializeThresholds() {
		if (!pack) return;

		const initial: ThresholdMap = {};
		for (const rule of pack.rules) {
			const existing = pack.customThresholds?.[rule.id];
			initial[rule.id] = {
				threshold: existing?.threshold ?? rule.threshold,
				timeWindow: existing?.timeWindow ?? rule.timeWindow,
			};
		}
		customThresholds = initial;
	}

	function resetForm() {
		emailRecipients = "";
		webhookUrl = "";
		submitting = false;
		disabling = false;
		initializeThresholds();
	}

	$effect(() => {
		if (open && pack) {
			initializeThresholds();
		}
	});

	$effect(() => {
		if (!open) {
			resetForm();
		}
	});

	async function handleEnable() {
		if (!pack) return;

		const emails = emailRecipients
			.split(",")
			.map((e) => e.trim())
			.filter((e) => e);

		// Basic email validation if provided
		if (emails.length > 0) {
			const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
			const invalidEmails = emails.filter((e) => !emailRegex.test(e));
			if (invalidEmails.length > 0) {
				toastStore.error(`Invalid email addresses: ${invalidEmails.join(", ")}`);
				return;
			}
		}

		submitting = true;

		try {
			await detectionPacksAPI.enablePack(pack.id, {
				organizationId,
				customThresholds,
				emailRecipients: emails.length > 0 ? emails : undefined,
				webhookUrl: webhookUrl.trim() || null,
			});

			toastStore.success(`${pack.name} enabled successfully`);
			resetForm();
			open = false;
			onSuccess?.();
		} catch (error) {
			toastStore.error(
				error instanceof Error ? error.message : "Failed to enable pack"
			);
		} finally {
			submitting = false;
		}
	}

	async function handleDisable() {
		if (!pack) return;

		disabling = true;

		try {
			await detectionPacksAPI.disablePack(pack.id, organizationId);

			toastStore.success(`${pack.name} disabled`);
			resetForm();
			open = false;
			onSuccess?.();
		} catch (error) {
			toastStore.error(
				error instanceof Error ? error.message : "Failed to disable pack"
			);
		} finally {
			disabling = false;
		}
	}

	async function handleUpdateThresholds() {
		if (!pack) return;

		submitting = true;

		try {
			await detectionPacksAPI.updateThresholds(pack.id, {
				organizationId,
				customThresholds,
			});

			toastStore.success("Thresholds updated");
			onSuccess?.();
		} catch (error) {
			toastStore.error(
				error instanceof Error ? error.message : "Failed to update thresholds"
			);
		} finally {
			submitting = false;
		}
	}

	function getLevelColor(level: string): string {
		switch (level) {
			case "debug":
				return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
			case "info":
				return "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200";
			case "warn":
				return "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200";
			case "error":
				return "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200";
			case "critical":
				return "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200";
			default:
				return "bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200";
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
	<Dialog.Content class="max-w-3xl max-h-[90vh] overflow-y-auto">
		{#if pack}
			{@const Icon = iconMap[pack.icon] || Rocket}
			<Dialog.Header>
				<div class="flex items-center gap-3">
					<div
						class="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center"
					>
						<Icon class="w-5 h-5 text-primary" />
					</div>
					<div>
						<Dialog.Title class="flex items-center gap-2">
							{pack.name}
							{#if pack.enabled}
								<Badge variant="default" class="gap-1">
									<CheckCircle class="w-3 h-3" />
									Enabled
								</Badge>
							{:else}
								<Badge variant="secondary">Disabled</Badge>
							{/if}
						</Dialog.Title>
						<Dialog.Description class="mt-1">
							{pack.description}
						</Dialog.Description>
					</div>
				</div>
			</Dialog.Header>

			<div class="space-y-6 py-4">
				<!-- Pack Info -->
				<div class="flex items-center gap-2">
					<Badge class={categoryColors[pack.category]}>
						{pack.category}
					</Badge>
					<span class="text-sm text-muted-foreground">
						{pack.rules.length} alert rules
					</span>
					{#if pack.enabled && pack.generatedRulesCount > 0}
						<span class="text-sm text-muted-foreground">
							({pack.generatedRulesCount} active)
						</span>
					{/if}
				</div>

				<!-- Rules List with Threshold Customization -->
				<div class="space-y-4">
					<h4 class="font-medium text-sm">Alert Rules</h4>
					<div class="space-y-3">
						{#each pack.rules as rule}
							<div class="border rounded-lg p-4 space-y-3">
								<div class="flex items-start justify-between">
									<div>
										<h5 class="font-medium">{rule.name}</h5>
										<p class="text-sm text-muted-foreground">
											{rule.description}
										</p>
									</div>
								</div>

								<div class="flex flex-wrap gap-1">
									{#each rule.level as lvl}
										<Badge variant="outline" class={getLevelColor(lvl)}>
											{lvl}
										</Badge>
									{/each}
								</div>

								<!-- Threshold Inputs -->
								<div class="grid grid-cols-2 gap-4">
									<div class="space-y-1">
										<Label for="threshold-{rule.id}" class="text-xs">
											Threshold
										</Label>
										<Input
											id="threshold-{rule.id}"
											type="number"
											min="1"
											value={customThresholds[rule.id]?.threshold ?? rule.threshold}
											oninput={(e) => {
												const target = e.target as HTMLInputElement;
												customThresholds = {
													...customThresholds,
													[rule.id]: {
														...customThresholds[rule.id],
														threshold: parseInt(target.value) || 1,
													},
												};
											}}
											disabled={submitting || disabling}
										/>
									</div>
									<div class="space-y-1">
										<Label for="timeWindow-{rule.id}" class="text-xs">
											Time Window (min)
										</Label>
										<Input
											id="timeWindow-{rule.id}"
											type="number"
											min="1"
											value={customThresholds[rule.id]?.timeWindow ?? rule.timeWindow}
											oninput={(e) => {
												const target = e.target as HTMLInputElement;
												customThresholds = {
													...customThresholds,
													[rule.id]: {
														...customThresholds[rule.id],
														timeWindow: parseInt(target.value) || 1,
													},
												};
											}}
											disabled={submitting || disabling}
										/>
									</div>
								</div>

								<p class="text-xs text-muted-foreground">
									Alert triggers when {customThresholds[rule.id]?.threshold ??
										rule.threshold} or more logs are received within {customThresholds[
										rule.id
									]?.timeWindow ?? rule.timeWindow} minute{(customThresholds[rule.id]?.timeWindow ?? rule.timeWindow) > 1
										? "s"
										: ""}
								</p>
							</div>
						{/each}
					</div>
				</div>

				<!-- Notification Settings (only for enabling) -->
				{#if !pack.enabled}
					<div class="space-y-4 border-t pt-4">
						<h4 class="font-medium text-sm">Notification Settings</h4>

						<div class="space-y-2">
							<Label for="emails">Email Recipients (optional)</Label>
							<Input
								id="emails"
								type="text"
								placeholder="user@example.com, team@example.com"
								bind:value={emailRecipients}
								disabled={submitting}
							/>
							<p class="text-xs text-muted-foreground">
								Comma-separated list of email addresses. You can add these later
								from the Alerts page.
							</p>
						</div>

						<div class="space-y-2">
							<Label for="webhook">Webhook URL (optional)</Label>
							<Input
								id="webhook"
								type="url"
								placeholder="https://hooks.slack.com/..."
								bind:value={webhookUrl}
								disabled={submitting}
							/>
							<p class="text-xs text-muted-foreground">
								HTTP POST webhook to call when alert triggers
							</p>
						</div>
					</div>
				{/if}
			</div>

			<Dialog.Footer class="flex-col sm:flex-row gap-2">
				{#if pack.enabled}
					<Button
						variant="destructive"
						onclick={handleDisable}
						disabled={disabling || submitting}
						class="gap-2"
					>
						{#if disabling}
							<Spinner size="sm" />
						{:else}
							<XCircle class="w-4 h-4" />
						{/if}
						Disable Pack
					</Button>
					<div class="flex-1"></div>
					<Button
						variant="outline"
						onclick={() => (open = false)}
						disabled={submitting || disabling}
					>
						Cancel
					</Button>
					<Button onclick={handleUpdateThresholds} disabled={submitting || disabling}>
						{#if submitting}
							<Spinner size="sm" className="mr-2" />
						{/if}
						Save Changes
					</Button>
				{:else}
					<Button
						variant="outline"
						onclick={() => (open = false)}
						disabled={submitting}
					>
						Cancel
					</Button>
					<Button onclick={handleEnable} disabled={submitting} class="gap-2">
						{#if submitting}
							<Spinner size="sm" />
						{:else}
							<CheckCircle class="w-4 h-4" />
						{/if}
						Enable Pack
					</Button>
				{/if}
			</Dialog.Footer>
		{/if}
	</Dialog.Content>
</Dialog.Root>
