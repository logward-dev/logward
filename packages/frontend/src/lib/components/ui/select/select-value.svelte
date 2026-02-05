<script lang="ts">
	import { cn } from "$lib/utils.js";
	import type { Snippet } from "svelte";
	import type { HTMLAttributes } from "svelte/elements";

	interface Props extends HTMLAttributes<HTMLSpanElement> {
		ref?: HTMLSpanElement | null;
		class?: string;
		placeholder?: string;
		children?: Snippet;
	}

	let {
		ref = $bindable(null),
		class: className,
		placeholder,
		children,
		...restProps
	}: Props = $props();
</script>

<span
	bind:this={ref}
	class={cn("line-clamp-1", className)}
	{...restProps}
>
	{#if children}
		{@render children()}
	{:else if placeholder}
		<span class="text-muted-foreground">{placeholder}</span>
	{/if}
</span>
