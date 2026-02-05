<script lang="ts">
  interface Props {
    size?: 'sm' | 'md' | 'lg';
    class?: string;
    className?: string;
  }

  let { size = 'md', class: classProp = '', className = '' }: Props = $props();

  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
  };

  const combinedClass = $derived(`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${sizeClasses[size]} ${classProp} ${className}`.trim());
</script>

<div class={combinedClass} role="status">
  <span class="sr-only">Loading...</span>
</div>
