<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuX } from 'svelte-icons-pack/lu';

	// Props
	let { open = $bindable(false), onClose }: { open?: boolean; onClose: () => void } = $props();

	// State
	interface Model {
		model_identifier: string;
		model_name: string;
		provider: string;
		context_window: number;
		input_price_per_million: number;
		output_price_per_million: number;
	}

	interface TokenUsage {
		total_input: number;
		total_output: number;
		total_cost_usd: number;
	}

	let models = $state<Model[]>([]);
	let selectedConversationModel = $state<string>('');
	let selectedCompressionModel = $state<string>('');
	let tokenUsage = $state<TokenUsage>({
		total_input: 0,
		total_output: 0,
		total_cost_usd: 0.0
	});
	let isLoading = $state(true);
	let isSaving = $state(false);
	let errorMessage = $state<string | null>(null);

	// Fetch data on mount
	onMount(async () => {
		try {
			// Fetch models
			const modelsRes = await fetch('/api/models');
			if (!modelsRes.ok) {
				throw new Error('Failed to fetch models');
			}
			models = await modelsRes.json();

			// Fetch current settings
			const settingsRes = await fetch('/api/settings');
			if (!settingsRes.ok) {
				throw new Error('Failed to fetch settings');
			}
			const settings = await settingsRes.json();
			selectedConversationModel =
				settings.selected_conversation_model || 'accounts/fireworks/models/qwen3-235b-a22b';
			selectedCompressionModel =
				settings.selected_compression_model ||
				'accounts/fireworks/models/qwen3-235b-a22b-instruct-2507';

			// Fetch token usage
			const tokenRes = await fetch('/api/token-usage');
			if (tokenRes.ok) {
				tokenUsage = await tokenRes.json();
			}

			isLoading = false;
		} catch (error) {
			console.error('[SettingsModal] Failed to load data:', error);
			errorMessage = 'Failed to load settings. Please try again.';
			isLoading = false;
		}
	});

	// Handle save
	async function handleSave() {
		isSaving = true;
		errorMessage = null;

		try {
			const response = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					selected_conversation_model: selectedConversationModel,
					selected_compression_model: selectedCompressionModel,
					selected_persona: 'gunnar' // Keep current persona (not changing in this UI)
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save settings');
			}

			// Success - close modal
			onClose();
		} catch (error) {
			console.error('[SettingsModal] Failed to save:', error);
			errorMessage = 'Failed to save settings. Please try again.';
		} finally {
			isSaving = false;
		}
	}

	// Handle overlay click (close modal)
	function handleOverlayClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}
</script>

{#if open}
	<div class="modal-overlay" onclick={handleOverlayClick} role="dialog" aria-modal="true">
		<div class="modal-content" onclick={(e) => e.stopPropagation()}>
			<!-- Header -->
			<div class="modal-header">
				<h2>Settings</h2>
				<button class="close-btn" onclick={onClose} aria-label="Close settings">
					<Icon src={LuX} size="20" />
				</button>
			</div>

			{#if isLoading}
				<div class="loading-state">Loading settings...</div>
			{:else if errorMessage}
				<div class="error-message">{errorMessage}</div>
			{:else}
				<!-- Model Selection -->
				<div class="settings-section">
					<label for="conversation-model">Conversation Model (Call 1A, 1B)</label>
					<select id="conversation-model" bind:value={selectedConversationModel}>
						{#each models as model}
							<option value={model.model_identifier}>
								{model.model_name} ({model.provider})
							</option>
						{/each}
					</select>
					<p class="help-text">Used for chat responses and thinking</p>
				</div>

				<div class="settings-section">
					<label for="compression-model">Artisan Cut Model (Compression & Files)</label>
					<select id="compression-model" bind:value={selectedCompressionModel}>
						{#each models as model}
							<option value={model.model_identifier}>
								{model.model_name} ({model.provider})
							</option>
						{/each}
					</select>
					<p class="help-text">Used for memory compression and file processing</p>
				</div>

				<!-- Token Usage Stats -->
				<div class="stats-section">
					<h3>This Month's Usage</h3>
					<div class="stat-row">
						<span>Total spend:</span>
						<span class="stat-value">${Number(tokenUsage.total_cost_usd).toFixed(2)}</span>
					</div>
					<div class="stat-row">
						<span>Input tokens:</span>
						<span class="stat-value">{Number(tokenUsage.total_input).toLocaleString()}</span>
					</div>
					<div class="stat-row">
						<span>Output tokens:</span>
						<span class="stat-value">{Number(tokenUsage.total_output).toLocaleString()}</span>
					</div>
				</div>

				<!-- Save Button -->
				<button class="save-btn" onclick={handleSave} disabled={isSaving}>
					{isSaving ? 'Saving...' : 'Save Changes'}
				</button>
			{/if}
		</div>
	</div>
{/if}

<style>
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		background: rgba(0, 0, 0, 0.7);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--z-modal);
		animation: fadeIn 0.15s ease-out;
	}

	@keyframes fadeIn {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.modal-content {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 12px;
		padding: 24px;
		width: 500px;
		max-width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		animation: slideUp 0.2s ease-out;
	}

	@keyframes slideUp {
		from {
			transform: translateY(20px);
			opacity: 0;
		}
		to {
			transform: translateY(0);
			opacity: 1;
		}
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 24px;
	}

	.modal-header h2 {
		font-size: 20px;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0;
	}

	.close-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 4px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 4px;
		transition: all 0.15s ease;
	}

	.close-btn:hover {
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
	}

	.settings-section {
		margin-bottom: 24px;
	}

	.settings-section label {
		display: block;
		font-weight: 600;
		margin-bottom: 8px;
		color: hsl(var(--foreground));
		font-size: 14px;
	}

	.settings-section select {
		width: 100%;
		padding: 10px 12px;
		background: hsl(var(--input));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		color: hsl(var(--foreground));
		font-size: 14px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.settings-section select:hover {
		border-color: hsl(var(--ring));
	}

	.settings-section select:focus {
		outline: none;
		border-color: var(--boss-accent);
		box-shadow: 0 0 0 2px rgba(217, 133, 107, 0.1);
	}

	.help-text {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		margin-top: 6px;
	}

	.stats-section {
		background: hsl(var(--muted));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		padding: 16px;
		margin: 24px 0;
	}

	.stats-section h3 {
		font-size: 14px;
		font-weight: 600;
		color: hsl(var(--foreground));
		margin: 0 0 12px 0;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		padding: 8px 0;
		font-size: 14px;
		color: hsl(var(--muted-foreground));
	}

	.stat-value {
		font-weight: 600;
		color: var(--boss-accent);
		font-variant-numeric: tabular-nums;
	}

	.save-btn {
		width: 100%;
		padding: 12px;
		background: var(--boss-accent);
		color: white;
		border: none;
		border-radius: 6px;
		font-weight: 600;
		font-size: 14px;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.save-btn:hover:not(:disabled) {
		background: rgb(197, 113, 87);
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(217, 133, 107, 0.3);
	}

	.save-btn:active:not(:disabled) {
		transform: translateY(0);
	}

	.save-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.loading-state {
		text-align: center;
		padding: 40px;
		color: hsl(var(--muted-foreground));
	}

	.error-message {
		background: rgba(239, 68, 68, 0.1);
		border: 1px solid rgba(239, 68, 68, 0.3);
		border-radius: 6px;
		padding: 12px;
		color: rgb(248, 113, 113);
		font-size: 14px;
		margin-bottom: 20px;
	}
</style>
