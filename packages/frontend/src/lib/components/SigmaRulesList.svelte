<script lang="ts">
    import { sigmaAPI, type SigmaRule } from "$lib/api/sigma";
    import { toastStore } from "$lib/stores/toast";
    import {
        Card,
        CardContent,
        CardHeader,
        CardTitle,
        CardDescription,
    } from "$lib/components/ui/card";
    import { Badge } from "$lib/components/ui/badge";
    import Button from "$lib/components/ui/button/button.svelte";
    import {
        AlertDialog,
        AlertDialogAction,
        AlertDialogCancel,
        AlertDialogContent,
        AlertDialogDescription,
        AlertDialogFooter,
        AlertDialogHeader,
        AlertDialogTitle,
    } from "$lib/components/ui/alert-dialog";
    import EditSigmaChannelsDialog from "$lib/components/EditSigmaChannelsDialog.svelte";
    import Trash2 from "@lucide/svelte/icons/trash-2";
    import Eye from "@lucide/svelte/icons/eye";
    import Bell from "@lucide/svelte/icons/bell";
    import AlertTriangle from "@lucide/svelte/icons/alert-triangle";
    import CheckCircle from "@lucide/svelte/icons/check-circle";

    interface Props {
        rules: SigmaRule[];
        organizationId: string;
        onrefresh?: () => void;
        onview?: (rule: SigmaRule) => void;
    }

    let { rules = [], organizationId, onrefresh, onview }: Props = $props();

    let showDeleteDialog = $state(false);
    let showEditChannelsDialog = $state(false);
    let ruleToDelete = $state<string | null>(null);
    let ruleToEditChannels = $state<SigmaRule | null>(null);

    function handleDeleteKeydown(event: KeyboardEvent) {
        if (event.key === "Enter" && showDeleteDialog && ruleToDelete) {
            event.preventDefault();
            deleteRule(ruleToDelete);
            showDeleteDialog = false;
            ruleToDelete = null;
        }
    }

    async function deleteRule(ruleId: string) {
        try {
            await sigmaAPI.deleteRule(ruleId, organizationId, true);
            toastStore.success("Sigma rule deleted successfully");
            onrefresh?.();
        } catch (e) {
            toastStore.error(
                e instanceof Error ? e.message : "Failed to delete Sigma rule",
            );
        }
    }

    function getLevelColor(level: string): string {
        switch (level) {
            case "informational":
                return "bg-blue-100 text-blue-800";
            case "low":
                return "bg-green-100 text-green-800";
            case "medium":
                return "bg-yellow-100 text-yellow-800";
            case "high":
                return "bg-orange-100 text-orange-800";
            case "critical":
                return "bg-red-100 text-red-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    }

    function getStatusColor(status: string): string {
        switch (status) {
            case "stable":
                return "bg-green-100 text-green-800";
            case "test":
                return "bg-blue-100 text-blue-800";
            case "experimental":
                return "bg-purple-100 text-purple-800";
            case "deprecated":
                return "bg-orange-100 text-orange-800";
            case "unsupported":
                return "bg-red-100 text-red-800";
            default:
                return "bg-gray-100 text-gray-800";
        }
    }
</script>

<div class="grid gap-4">
    {#each rules as rule}
        <Card>
            <CardHeader>
                <div class="flex items-start justify-between">
                    <div class="space-y-1">
                        <div class="flex items-center gap-3">
                            <CardTitle>{rule.title}</CardTitle>
                            <Badge
                                variant="outline"
                                class={getLevelColor(rule.level || "medium")}
                            >
                                {(rule.level || "medium").toUpperCase()}
                            </Badge>
                            <Badge
                                variant="outline"
                                class={getStatusColor(rule.status)}
                            >
                                {rule.status}
                            </Badge>
                        </div>
                        <CardDescription>
                            {rule.description || "No description provided"}
                        </CardDescription>
                        <div
                            class="flex items-center gap-2 text-sm text-muted-foreground mt-1"
                        >
                            <span>Author: {rule.author || "Unknown"}</span>
                            <span>•</span>
                            <span>Date: {rule.date || "Unknown"}</span>
                        </div>
                    </div>
                    <div class="flex gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            class="gap-2"
                            onclick={() => onview?.(rule)}
                        >
                            <Eye class="w-4 h-4" />
                            Details
                        </Button>
                        <Button
                            variant="outline"
                            size="sm"
                            class="gap-2"
                            onclick={() => {
                                ruleToEditChannels = rule;
                                showEditChannelsDialog = true;
                            }}
                        >
                            <Bell class="w-4 h-4" />
                            Channels
                        </Button>
                        <Button
                            variant="destructive"
                            size="sm"
                            class="gap-2"
                            onclick={() => {
                                ruleToDelete = rule.id;
                                showDeleteDialog = true;
                            }}
                        >
                            <Trash2 class="w-4 h-4" />
                            Delete
                        </Button>
                    </div>
                </div>
            </CardHeader>
            <CardContent>
                <div class="flex items-center gap-4 text-sm">
                    <div class="flex items-center gap-2">
                        <span class="font-medium">Conversion Status:</span>
                        {#if rule.conversionStatus === "success"}
                            <span
                                class="flex items-center text-green-600 gap-1"
                            >
                                <CheckCircle class="w-4 h-4" /> Success
                            </span>
                        {:else if rule.conversionStatus === "partial"}
                            <span
                                class="flex items-center text-yellow-600 gap-1"
                            >
                                <AlertTriangle class="w-4 h-4" /> Partial
                            </span>
                        {:else}
                            <span class="flex items-center text-red-600 gap-1">
                                <AlertTriangle class="w-4 h-4" /> Failed
                            </span>
                        {/if}
                    </div>
                    {#if rule.alertRuleId}
                        <div class="flex items-center gap-2">
                            <span class="font-medium">Alert Rule:</span>
                            <Badge variant="secondary">Active</Badge>
                        </div>
                    {/if}
                </div>
                {#if rule.conversionNotes}
                    <div class="mt-2 p-2 bg-muted rounded text-xs font-mono">
                        {rule.conversionNotes}
                    </div>
                {/if}
            </CardContent>
        </Card>
    {/each}
</div>

<AlertDialog bind:open={showDeleteDialog}>
    <AlertDialogContent onkeydown={handleDeleteKeydown}>
        <AlertDialogHeader>
            <AlertDialogTitle>Delete Sigma Rule</AlertDialogTitle>
            <AlertDialogDescription>
                Are you sure you want to delete this Sigma rule? This will also
                delete the associated alert rule if one exists.
            </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
                onclick={() => {
                    if (ruleToDelete) {
                        deleteRule(ruleToDelete);
                    }
                    showDeleteDialog = false;
                    ruleToDelete = null;
                }}
            >
                Delete
            </AlertDialogAction>
        </AlertDialogFooter>
    </AlertDialogContent>
</AlertDialog>

<EditSigmaChannelsDialog
    bind:open={showEditChannelsDialog}
    rule={ruleToEditChannels}
    onSuccess={onrefresh}
/>
