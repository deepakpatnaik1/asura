<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuFlame, LuX } from 'svelte-icons-pack/lu';
	import { PERSONAS, PERSONA_NAMES } from '$lib/config/personas';
	import { TIMING } from '$lib/config/timing';

	interface Props {
		/** Whether the menu is open */
		isOpen: boolean;
		/** Close the menu */
		onClose: () => void;
		/** Callback after successful nuke */
		onNukeComplete: (bucket: string) => void;
		/** Reference to the trigger button for positioning */
		triggerRef?: HTMLElement | null;
	}

	let { isOpen, onClose, onNukeComplete, triggerRef = null }: Props = $props();

	// Active countdown state
	let activeBucket = $state<string | null>(null);
	let progress = $state(0);
	let timer: number | null = null;

	// Counts for each bucket
	interface NukeCounts {
		personas: Record<string, number>;
		content: Record<string, number>;
		canvases: { designer: number; whiteboard: number };
		productivity: { todos: number; diary: number };
	}
	let counts = $state<NukeCounts | null>(null);

	// Menu position (calculated from trigger when open)
	let menuStyle = $state('');

	// Fetch counts when menu opens
	$effect(() => {
		if (isOpen) {
			fetchCounts();
		}
	});

	async function fetchCounts() {
		try {
			const response = await fetch('/api/nuke/counts');
			if (response.ok) {
				counts = await response.json();
			}
		} catch (error) {
			console.error('Failed to fetch nuke counts:', error);
		}
	}

	$effect(() => {
		if (isOpen && triggerRef) {
			const rect = triggerRef.getBoundingClientRect();
			// Position menu to the left of the trigger, vertically centered in viewport
			// Use top positioning with max-height constraint to prevent overflow
			const menuHeight = Math.min(500, window.innerHeight - 100); // Cap at 500px or viewport - padding
			const top = Math.max(50, (window.innerHeight - menuHeight) / 2); // Center vertically with min top
			menuStyle = `top: ${top}px; left: ${rect.left}px; max-height: ${menuHeight}px;`;
		}
	});

	// Bucket definitions
	const CONTENT_BUCKETS = [
		{ id: 'content:raw', label: 'Raw', description: 'Text/PDFs without artisan cut' },
		{ id: 'content:artisan', label: 'Artisan Cut', description: 'Text/PDFs with artisan cut' },
		{ id: 'content:everyone', label: 'Everyone', description: 'Shared across all personas' },
		{ id: 'content:images', label: 'Images', description: 'Uploaded images' },
		{ id: 'content:linked', label: 'Live-linked', description: 'Obsidian files' }
	] as const;

	const CANVAS_BUCKETS = [
		{ id: 'canvas:designer', label: 'Designer', description: 'Eva\'s character canvases' },
		{ id: 'canvas:whiteboard', label: 'Whiteboard', description: 'Gunnar\'s whiteboard canvases' }
	] as const;

	const PRODUCTIVITY_BUCKETS = [
		{ id: 'productivity:diary', label: 'Founder diary', description: 'Achievement log' },
		{ id: 'productivity:todos', label: 'Todos + tags', description: 'Tasks and vocabulary' }
	] as const;

	function startCountdown(bucketId: string) {
		// If already counting down on this bucket, do nothing
		if (activeBucket === bucketId) return;

		// Cancel any existing countdown
		cancelCountdown();

		// Start new countdown
		activeBucket = bucketId;
		progress = 0;

		const interval = 50;
		const increment = (interval / TIMING.countdownDuration) * 100;

		timer = window.setInterval(() => {
			progress += increment;
			if (progress >= 100) {
				executeNuke(bucketId);
			}
		}, interval);
	}

	function cancelCountdown() {
		if (timer) {
			clearInterval(timer);
			timer = null;
		}
		activeBucket = null;
		progress = 0;
	}

	async function executeNuke(bucketId: string) {
		// Stop timer
		if (timer) {
			clearInterval(timer);
			timer = null;
		}

		const bucket = activeBucket;
		activeBucket = null;
		progress = 0;

		if (!bucket) return;

		try {
			const response = await fetch('/api/nuke', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ bucket })
			});

			if (!response.ok) {
				console.error('Nuke failed:', await response.text());
				return;
			}

			// Dispatch window event for cross-component communication
			window.dispatchEvent(new CustomEvent('nuke-complete', { detail: { bucket } }));

			// Refresh counts to update UI
			fetchCounts();
		} catch (err) {
			console.error('Nuke error:', err);
		}
	}

	function handleClose() {
		cancelCountdown();
		onClose();
	}

	function handleClickOutside(event: MouseEvent) {
		const target = event.target as HTMLElement;
		// Don't close if clicking the menu or the trigger button
		if (!target.closest('.nuke-menu-container') && !target.closest('.nuke-wrapper')) {
			handleClose();
		}
	}

	// Cleanup on unmount
	$effect(() => {
		return () => {
			if (timer) {
				clearInterval(timer);
			}
		};
	});
</script>

<svelte:document onclick={(e) => isOpen && handleClickOutside(e)} onkeydown={(e) => e.key === 'Escape' && isOpen && handleClose()} />

{#if isOpen}
	<div class="nuke-menu-container" style={menuStyle}>
		<div class="nuke-menu">
			<div class="menu-header">
				<span class="menu-title">Nuke what?</span>
				<button class="close-btn" onclick={handleClose}>
					<Icon src={LuX} size="12" />
				</button>
			</div>

			<!-- CONVERSATIONS section -->
			<div class="section">
				<div class="section-label">CONVERSATIONS</div>
				{#each PERSONA_NAMES as personaName}
					{@const persona = PERSONAS[personaName]}
					{@const bucketId = `persona:${personaName}`}
					{@const isActive = activeBucket === bucketId}
					{@const count = counts?.personas[personaName] || 0}
					<button
						class="bucket-item"
						class:active={isActive}
						class:empty={count === 0}
						onclick={() => isActive ? cancelCountdown() : startCountdown(bucketId)}
						style="--bucket-accent: {persona.accentColor}"
						disabled={count === 0}
					>
						<span class="bucket-label">{persona.displayName} ({count})</span>
						{#if isActive}
							<div class="progress-bar" style="width: {progress}%"></div>
							<span class="cancel-hint">click to cancel</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- CONTENT section -->
			<div class="section">
				<div class="section-label">CONTENT</div>
				{#each CONTENT_BUCKETS as bucket}
					{@const isActive = activeBucket === bucket.id}
					{@const contentType = bucket.id.split(':')[1]}
					{@const count = counts?.content[contentType] || 0}
					<button
						class="bucket-item"
						class:active={isActive}
						class:empty={count === 0}
						onclick={() => isActive ? cancelCountdown() : startCountdown(bucket.id)}
						disabled={count === 0}
					>
						<span class="bucket-label">{bucket.label} ({count})</span>
						<span class="bucket-description">{bucket.description}</span>
						{#if isActive}
							<div class="progress-bar" style="width: {progress}%"></div>
							<span class="cancel-hint">click to cancel</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- CANVASES section -->
			<div class="section">
				<div class="section-label">CANVASES</div>
				{#each CANVAS_BUCKETS as bucket}
					{@const isActive = activeBucket === bucket.id}
					{@const canvasType = bucket.id.split(':')[1] as 'designer' | 'whiteboard'}
					{@const count = counts?.canvases[canvasType] || 0}
					<button
						class="bucket-item"
						class:active={isActive}
						class:empty={count === 0}
						onclick={() => isActive ? cancelCountdown() : startCountdown(bucket.id)}
						disabled={count === 0}
					>
						<span class="bucket-label">{bucket.label} ({count})</span>
						<span class="bucket-description">{bucket.description}</span>
						{#if isActive}
							<div class="progress-bar" style="width: {progress}%"></div>
							<span class="cancel-hint">click to cancel</span>
						{/if}
					</button>
				{/each}
			</div>

			<!-- PRODUCTIVITY section -->
			<div class="section">
				<div class="section-label">PRODUCTIVITY</div>
				{#each PRODUCTIVITY_BUCKETS as bucket}
					{@const isActive = activeBucket === bucket.id}
					{@const target = bucket.id.split(':')[1]}
					{@const count = target === 'diary' ? (counts?.productivity.diary || 0) : (counts?.productivity.todos || 0)}
					<button
						class="bucket-item"
						class:active={isActive}
						class:empty={count === 0}
						onclick={() => isActive ? cancelCountdown() : startCountdown(bucket.id)}
						disabled={count === 0}
					>
						<span class="bucket-label">{bucket.label} ({count})</span>
						<span class="bucket-description">{bucket.description}</span>
						{#if isActive}
							<div class="progress-bar" style="width: {progress}%"></div>
							<span class="cancel-hint">click to cancel</span>
						{/if}
					</button>
				{/each}
			</div>
		</div>
	</div>
{/if}

<style>
	.nuke-menu-container {
		position: fixed;
		z-index: 1000;
	}

	.nuke-menu {
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		min-width: 220px;
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
		overflow-y: auto;
		max-height: inherit;
	}

	.menu-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding: 10px 12px;
		border-bottom: 1px solid hsl(var(--border));
	}

	.menu-title {
		font-size: 11px;
		font-weight: 600;
		color: hsl(var(--foreground));
	}

	.close-btn {
		background: none;
		border: none;
		cursor: pointer;
		color: hsl(var(--muted-foreground));
		padding: 2px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.close-btn:hover {
		color: hsl(var(--foreground));
	}

	.section {
		padding: 8px 0;
		border-bottom: 1px solid hsl(var(--border));
	}

	.section:last-child {
		border-bottom: none;
	}

	.section-label {
		font-size: 9px;
		font-weight: 600;
		color: hsl(var(--muted-foreground));
		padding: 0 12px 6px;
		letter-spacing: 0.5px;
	}

	.bucket-item {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		width: 100%;
		padding: 8px 12px;
		background: none;
		border: none;
		cursor: pointer;
		position: relative;
		overflow: hidden;
		text-align: left;
		transition: background 0.15s;
	}

	.bucket-item:hover {
		background: hsl(var(--accent));
	}

	.bucket-item.active {
		background: rgba(220, 38, 38, 0.1);
	}

	.bucket-item.empty {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.bucket-item.empty:hover {
		background: none;
	}

	.bucket-label {
		font-size: 11px;
		font-weight: 500;
		color: hsl(var(--foreground));
	}

	.bucket-item[style*="--bucket-accent"] .bucket-label {
		color: var(--bucket-accent);
	}

	.bucket-description {
		font-size: 9px;
		color: hsl(var(--muted-foreground));
		margin-top: 2px;
	}

	.progress-bar {
		position: absolute;
		left: 0;
		bottom: 0;
		height: 2px;
		background: rgb(220, 38, 38);
		transition: width 50ms linear;
	}

	.cancel-hint {
		font-size: 8px;
		color: rgb(220, 38, 38);
		margin-top: 4px;
		font-style: italic;
	}
</style>
