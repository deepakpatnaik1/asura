<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuX } from 'svelte-icons-pack/lu';
	import {
		DEFAULT_CONVERSATION_MODEL,
		DEFAULT_COMPRESSION_MODEL,
		EMBEDDING_MODEL
	} from '$lib/config/models';
	import { DEFAULT_PERSONA } from '$lib/config/personas';

	// Props
	let { open = $bindable(false), onClose }: { open?: boolean; onClose: () => void } = $props();

	// State
	interface Model {
		model_identifier: string;
		model_name: string;
		provider: string;
		model_type: string;
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
	let selectedEmbeddingModel = $state<string>('');
	let selectedPersona = $state<string>(DEFAULT_PERSONA);
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
				settings.selected_conversation_model || DEFAULT_CONVERSATION_MODEL;
			selectedCompressionModel =
				settings.selected_compression_model ||
				DEFAULT_COMPRESSION_MODEL;
			selectedEmbeddingModel = settings.selected_embedding_model || EMBEDDING_MODEL;
			selectedPersona = settings.selected_persona || DEFAULT_PERSONA;

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
					selected_embedding_model: selectedEmbeddingModel,
					selected_persona: selectedPersona
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
			{:else}
				<!-- Model Selection -->
				<div class="settings-section">
					<label for="conversation-model">Conversation Model (Call 1A, 1B)</label>
					<select id="conversation-model" bind:value={selectedConversationModel}>
						{#each models.filter(m => m.model_type === 'text_generation') as model}
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
						{#each models.filter(m => m.model_type === 'text_generation') as model}
							<option value={model.model_identifier}>
								{model.model_name} ({model.provider})
							</option>
						{/each}
					</select>
					<p class="help-text">Used for memory compression and file processing</p>
				</div>

				<div class="settings-section">
					<label for="embedding-model">Embedding Model</label>
					<select id="embedding-model" bind:value={selectedEmbeddingModel}>
						{#each models.filter(m => m.model_type === 'embedding') as model}
							<option value={model.model_identifier}>
								{model.model_name}
							</option>
						{/each}
					</select>
					<p class="help-text">Used for vector embeddings (memory search & file chunks)</p>
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
		background: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		z-index: var(--z-modal);
	}

	.modal-content {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		padding: 20px;
		width: 420px;
		max-width: 90%;
		max-height: 80vh;
		overflow-y: auto;
	}

	.modal-header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		margin-bottom: 20px;
		padding-bottom: 12px;
		border-bottom: 1px solid hsl(var(--border));
	}

	.modal-header h2 {
		font-size: 11px;
		font-weight: 400;
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
		opacity: 0.5;
	}

	.close-btn:hover {
		opacity: 1;
	}

	.settings-section {
		margin-bottom: 12px;
	}

	.settings-section label {
		display: block;
		font-weight: 400;
		margin-bottom: 4px;
		color: hsl(var(--muted-foreground));
		font-size: 11px;
	}

	.settings-section select {
		width: 100%;
		padding: 6px 24px 6px 8px;
		background: transparent;
		background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 5L6 8L9 5' stroke='%23666' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 8px center;
		border: 1px solid hsl(var(--border));
		border-radius: 0;
		color: hsl(var(--foreground));
		font-family: Menlo, Monaco, 'Courier New', monospace;
		font-size: 10px;
		cursor: pointer;
		appearance: none;
	}

	.settings-section select:focus {
		outline: none;
		border-color: hsl(var(--border));
	}

	.help-text {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		margin-top: 4px;
		opacity: 0.5;
	}

	.stats-section {
		border-top: 1px solid hsl(var(--border));
		padding-top: 12px;
		margin: 16px 0 12px 0;
	}

	.stats-section h3 {
		font-size: 11px;
		font-weight: 400;
		color: hsl(var(--muted-foreground));
		margin: 0 0 8px 0;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		padding: 4px 0;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	.stat-value {
		font-weight: 400;
		color: hsl(var(--foreground));
		font-variant-numeric: tabular-nums;
	}

	.save-btn {
		width: 100%;
		padding: 6px;
		background: transparent;
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 0;
		font-weight: 400;
		font-size: 11px;
		cursor: pointer;
	}

	.save-btn:hover:not(:disabled) {
		border-color: hsl(var(--foreground));
	}

	.save-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.loading-state {
		text-align: center;
		padding: 40px;
		color: hsl(var(--muted-foreground));
		font-size: 11px;
	}
</style>
