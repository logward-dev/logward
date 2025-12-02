<script lang="ts">
    import { sigmaAPI, type SyncResult } from "$lib/api/sigma";
    import { toastStore } from "$lib/stores/toast";
    import { checklistStore } from "$lib/stores/checklist";
    import * as Dialog from "$lib/components/ui/dialog";
    import Button from "$lib/components/ui/button/button.svelte";
    import Label from "$lib/components/ui/label/label.svelte";
    import Input from "$lib/components/ui/input/input.svelte";
    import SigmaTreeMultiSelect from "$lib/components/SigmaTreeMultiSelect.svelte";
    import Download from "@lucide/svelte/icons/download";
    import Loader2 from "@lucide/svelte/icons/loader-2";
    import CheckCircle from "@lucide/svelte/icons/check-circle";
    import AlertCircle from "@lucide/svelte/icons/alert-circle";

    interface Props {
        open: boolean;
        organizationId: string;
        onOpenChange?: (open: boolean) => void;
        onSuccess?: () => void;
    }

    let {
        open = $bindable(),
        organizationId,
        onOpenChange,
        onSuccess,
    }: Props = $props();

    let syncing = $state(false);
    let syncResult = $state<SyncResult | null>(null);
    let selectedCategories = $state<string[]>([]);
    let selectedRules = $state<string[]>([]);
    let emailRecipientsInput = $state("");
    let webhookUrl = $state("");

    function handleSelectionChange(selection: {
        categories: string[];
        rules: string[];
    }) {
        selectedCategories = selection.categories;
        selectedRules = selection.rules;
    }

    async function handleSync() {
        syncing = true;
        syncResult = null;

        try {
            // Parse email recipients (comma-separated)
            const emailRecipients = emailRecipientsInput
                .split(",")
                .map((e) => e.trim())
                .filter((e) => e.length > 0);

            const result = await sigmaAPI.syncFromSigmaHQ({
                organizationId,
                selection: {
                    categories: selectedCategories,
                    rules: selectedRules,
                },
                autoCreateAlerts: false, // Never create alert rules for Sigma rules
                emailRecipients:
                    emailRecipients.length > 0 ? emailRecipients : undefined,
                webhookUrl: webhookUrl.trim() || undefined,
            });

            syncResult = result;

            if (result.success) {
                toastStore.success(
                    `Sync completed: ${result.imported} imported, ${result.skipped} skipped, ${result.failed} failed`,
                );

                // Mark checklist item as complete if any rules were imported
                if (result.imported > 0) {
                    checklistStore.completeItem('import-sigma-rule');
                }

                onSuccess?.();
            } else {
                toastStore.error("Sync failed");
            }
        } catch (e) {
            toastStore.error(e instanceof Error ? e.message : "Sync failed");
        } finally {
            syncing = false;
        }
    }

    function handleClose() {
        open = false;
        syncResult = null;
        selectedCategories = [];
        selectedRules = [];
        emailRecipientsInput = "";
        webhookUrl = "";
        if (onOpenChange) onOpenChange(false);
    }
</script>

<Dialog.Root
    {open}
    onOpenChange={(o) => {
        open = o;
        if (onOpenChange) onOpenChange(o);
    }}
>
    <Dialog.Content class="max-w-2xl max-h-[90vh] overflow-y-auto">
        <Dialog.Header>
            <Dialog.Title class="flex items-center gap-2">
                <Download class="w-5 h-5" />
                Sync from SigmaHQ
            </Dialog.Title>
            <Dialog.Description>
                Import Sigma rules from the official SigmaHQ repository (2000+
                rules)
            </Dialog.Description>
        </Dialog.Header>

        {#if !syncResult}
            <div class="space-y-6 py-4">
                <div class="space-y-2">
                    <Label>Select Rules to Import</Label>
                    <p class="text-xs text-muted-foreground">
                        Select individual rules or entire categories. Search to
                        quickly find specific rules.
                    </p>
                    <SigmaTreeMultiSelect
                        onSelectionChange={handleSelectionChange}
                    />
                </div>

                <div
                    class="p-3 bg-blue-50 dark:bg-blue-950 rounded-md text-sm mb-4"
                >
                    <p
                        class="text-blue-900 dark:text-blue-100 font-medium mb-2"
                    >
                        Notification Settings (Optional)
                    </p>
                    <p class="text-blue-800 dark:text-blue-200 text-xs">
                        Configure email and webhook notifications for when these
                        Sigma rules match logs.<br />
                        Leave blank for detection-only mode (no notifications).
                    </p>
                </div>

                <div class="space-y-4">
                    <div class="space-y-2">
                        <Label for="emailRecipients"
                            >Email Recipients (optional)</Label
                        >
                        <Input
                            id="emailRecipients"
                            type="text"
                            placeholder="email1@example.com, email2@example.com"
                            bind:value={emailRecipientsInput}
                        />
                        <p class="text-xs text-muted-foreground">
                            Comma-separated list of email addresses for alert
                            notifications
                        </p>
                    </div>

                    <div class="space-y-2">
                        <Label for="webhookUrl">Webhook URL (optional)</Label>
                        <Input
                            id="webhookUrl"
                            type="url"
                            placeholder="https://hooks.example.com/webhook"
                            bind:value={webhookUrl}
                        />
                        <p class="text-xs text-muted-foreground">
                            HTTP endpoint to receive alert notifications (POST
                            requests)
                        </p>
                    </div>
                </div>
            </div>

            <Dialog.Footer>
                <Button
                    variant="outline"
                    onclick={handleClose}
                    disabled={syncing}
                >
                    Cancel
                </Button>
                <Button
                    onclick={handleSync}
                    disabled={syncing ||
                        (selectedCategories.length === 0 &&
                            selectedRules.length === 0)}
                >
                    {#if syncing}
                        <Loader2 class="w-4 h-4 mr-2 animate-spin" />
                        Syncing...
                    {:else}
                        <Download class="w-4 h-4 mr-2" />
                        Import {selectedCategories.length +
                            selectedRules.length} item{selectedCategories.length +
                            selectedRules.length ===
                        1
                            ? ""
                            : "s"}
                    {/if}
                </Button>
            </Dialog.Footer>
        {:else}
            <div class="space-y-4 py-4">
                <div class="flex items-center gap-3">
                    {#if syncResult.success}
                        <CheckCircle class="w-8 h-8 text-green-600" />
                        <div>
                            <h3 class="font-semibold text-lg">
                                Sync Completed
                            </h3>
                            <p class="text-sm text-muted-foreground">
                                Commit: <span class="font-mono text-xs"
                                    >{syncResult.commitHash.substring(
                                        0,
                                        7,
                                    )}</span
                                >
                            </p>
                        </div>
                    {:else}
                        <AlertCircle class="w-8 h-8 text-red-600" />
                        <div>
                            <h3 class="font-semibold text-lg">Sync Failed</h3>
                        </div>
                    {/if}
                </div>

                <div class="grid grid-cols-3 gap-4">
                    <div class="p-3 border rounded-md text-center">
                        <div class="text-2xl font-bold text-green-600">
                            {syncResult.imported}
                        </div>
                        <div class="text-xs text-muted-foreground">
                            Imported
                        </div>
                    </div>
                    <div class="p-3 border rounded-md text-center">
                        <div class="text-2xl font-bold text-yellow-600">
                            {syncResult.skipped}
                        </div>
                        <div class="text-xs text-muted-foreground">Skipped</div>
                    </div>
                    <div class="p-3 border rounded-md text-center">
                        <div class="text-2xl font-bold text-red-600">
                            {syncResult.failed}
                        </div>
                        <div class="text-xs text-muted-foreground">Failed</div>
                    </div>
                </div>

                {#if syncResult.warnings.length > 0}
                    <div class="space-y-2">
                        <h4 class="font-medium text-sm">
                            Warnings ({syncResult.warnings.length})
                        </h4>
                        <div class="max-h-32 overflow-y-auto space-y-1">
                            {#each syncResult.warnings.slice(0, 5) as warning}
                                <div
                                    class="text-xs bg-yellow-50 text-yellow-800 p-2 rounded"
                                >
                                    {warning}
                                </div>
                            {/each}
                            {#if syncResult.warnings.length > 5}
                                <p class="text-xs text-muted-foreground">
                                    ... and {syncResult.warnings.length - 5} more
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}

                {#if syncResult.errors.length > 0}
                    <div class="space-y-2">
                        <h4 class="font-medium text-sm">
                            Errors ({syncResult.errors.length})
                        </h4>
                        <div class="max-h-32 overflow-y-auto space-y-1">
                            {#each syncResult.errors.slice(0, 5) as error}
                                <div
                                    class="text-xs bg-red-50 text-red-800 p-2 rounded font-mono"
                                >
                                    <strong>{error.rule}:</strong>
                                    {error.error}
                                </div>
                            {/each}
                            {#if syncResult.errors.length > 5}
                                <p class="text-xs text-muted-foreground">
                                    ... and {syncResult.errors.length - 5} more
                                </p>
                            {/if}
                        </div>
                    </div>
                {/if}
            </div>

            <Dialog.Footer>
                <Button onclick={handleClose}>Close</Button>
            </Dialog.Footer>
        {/if}
    </Dialog.Content>
</Dialog.Root>
