<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuX } from 'svelte-icons-pack/lu';
	import {
		DEFAULT_CONVERSATION_MODEL,
		DEFAULT_COMPRESSION_MODEL,
		DEFAULT_READER_MODEL,
		DEFAULT_TODO_MODEL,
		EMBEDDING_MODEL
	} from '$lib/config/models';

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

	let models = $state<Model[]>([]);
	let selectedConversationModel = $state<string>('');
	let selectedCompressionModel = $state<string>('');
	let selectedReaderModel = $state<string>('');
	let selectedTodoModel = $state<string>('');
	let selectedEmbeddingModel = $state<string>('');
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isExporting = $state(false);
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
				settings.selected_compression_model || DEFAULT_COMPRESSION_MODEL;
			selectedReaderModel = settings.selected_reader_model || DEFAULT_READER_MODEL;
			selectedTodoModel = settings.selected_todo_model || DEFAULT_TODO_MODEL;
			selectedEmbeddingModel = settings.selected_embedding_model || EMBEDDING_MODEL;

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
					selected_reader_model: selectedReaderModel,
					selected_todo_model: selectedTodoModel,
					selected_embedding_model: selectedEmbeddingModel
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

	// Handle data export
	async function handleExport() {
		isExporting = true;
		errorMessage = null;

		try {
			const response = await fetch('/api/export');

			if (response.status === 429) {
				const retryAfter = response.headers.get('Retry-After');
				const minutes = retryAfter ? Math.ceil(parseInt(retryAfter) / 60) : 60;
				errorMessage = `Export limit reached. Try again in ${minutes} minute${minutes > 1 ? 's' : ''}.`;
				return;
			}

			if (!response.ok) {
				throw new Error('Failed to export data');
			}

			// Get filename from Content-Disposition header or use default
			const contentDisposition = response.headers.get('Content-Disposition');
			const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
			const filename = filenameMatch ? filenameMatch[1] : `asura-export-${new Date().toISOString().split('T')[0]}.json`;

			// Download the file
			const blob = await response.blob();
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = filename;
			document.body.appendChild(a);
			a.click();
			document.body.removeChild(a);
			URL.revokeObjectURL(url);
		} catch (error) {
			console.error('[SettingsModal] Export failed:', error);
			errorMessage = 'Failed to export data. Please try again.';
		} finally {
			isExporting = false;
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
					<label for="conversation-model">Conversation Model</label>
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
					<label for="compression-model">Artisan Cut Model</label>
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
					<label for="reader-model">E-Reader Model</label>
					<select id="reader-model" bind:value={selectedReaderModel}>
						{#each models.filter(m => m.model_type === 'text_generation') as model}
							<option value={model.model_identifier}>
								{model.model_name} ({model.provider})
							</option>
						{/each}
					</select>
					<p class="help-text">Used for article processing and summarization</p>
				</div>

				<div class="settings-section">
					<label for="todo-model">Todo Model</label>
					<select id="todo-model" bind:value={selectedTodoModel}>
						{#each models.filter(m => m.model_type === 'text_generation') as model}
							<option value={model.model_identifier}>
								{model.model_name} ({model.provider})
							</option>
						{/each}
					</select>
					<p class="help-text">Used for todo mode conversations</p>
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

				<!-- Error Message -->
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}

				<!-- Save Button -->
				<button class="save-btn" onclick={handleSave} disabled={isSaving}>
					{isSaving ? 'Saving...' : 'Save Changes'}
				</button>

				<!-- Data Export Section -->
				<div class="export-section">
					<div class="section-divider"></div>
					<p class="export-label">Data Export</p>
					<button class="export-btn" onclick={handleExport} disabled={isExporting}>
						{isExporting ? 'Exporting...' : 'Export All Data'}
					</button>
					<p class="help-text">Download all your data as JSON (1 export per hour)</p>
				</div>
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

	.error-message {
		background: hsla(0, 70%, 50%, 0.1);
		border: 1px solid hsla(0, 70%, 50%, 0.3);
		color: hsl(0, 70%, 60%);
		padding: 8px 12px;
		font-size: 11px;
		margin-bottom: 12px;
	}

	.export-section {
		margin-top: 8px;
	}

	.section-divider {
		border-top: 1px solid hsl(var(--border));
		margin: 16px 0;
	}

	.export-label {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		margin-bottom: 8px;
	}

	.export-btn {
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

	.export-btn:hover:not(:disabled) {
		border-color: hsl(var(--foreground));
	}

	.export-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
</style>
