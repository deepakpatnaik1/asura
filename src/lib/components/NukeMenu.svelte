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

	// Menu position (calculated from trigger when open)
	let menuStyle = $state('');

	$effect(() => {
		if (isOpen && triggerRef) {
			const rect = triggerRef.getBoundingClientRect();
			menuStyle = `bottom: ${window.innerHeight - rect.top + 8}px; left: ${rect.left}px;`;
		}
	});

	// Bucket definitions
	const CONTENT_BUCKETS = [
		{ id: 'content:ephemeral', label: 'Ephemeral', description: 'Unprocessed pastes' },
		{ id: 'content:strategic', label: 'Strategic', description: 'Processed, non-canon' },
		{ id: 'content:canon', label: 'Canon', description: 'Foundational docs' }
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

			onNukeComplete(bucket);
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

<svelte:document onclick={(e) => isOpen && handleClickOutside(e)} />

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
					<button
						class="bucket-item"
						class:active={isActive}
						onclick={() => isActive ? cancelCountdown() : startCountdown(bucketId)}
						style="--bucket-accent: {persona.accentColor}"
					>
						<span class="bucket-label">{persona.displayName}</span>
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
					<button
						class="bucket-item"
						class:active={isActive}
						onclick={() => isActive ? cancelCountdown() : startCountdown(bucket.id)}
					>
						<span class="bucket-label">{bucket.label}</span>
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
					<button
						class="bucket-item"
						class:active={isActive}
						onclick={() => isActive ? cancelCountdown() : startCountdown(bucket.id)}
					>
						<span class="bucket-label">{bucket.label}</span>
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
		overflow: hidden;
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
