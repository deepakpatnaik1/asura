<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuX, LuPlus, LuTrash2 } from 'svelte-icons-pack/lu';
	import { DEFAULT_MODEL, EMBEDDING_MODEL } from '$lib/config/models';
	import { PERSONAS, PERSONA_NAMES, type PersonaName } from '$lib/config/personas';

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

	interface ModelOverride {
		persona: PersonaName;
		model: string;
	}

	let models = $state<Model[]>([]);
	let defaultModel = $state<string>('');
	let selectedEmbeddingModel = $state<string>('');
	let modelOverrides = $state<ModelOverride[]>([]);
	let isLoading = $state(true);
	let isSaving = $state(false);
	let isExporting = $state(false);
	let errorMessage = $state<string | null>(null);

	// Add override form state
	let showAddOverride = $state(false);
	let newOverridePersona = $state<PersonaName | ''>('');
	let newOverrideModel = $state<string>('');

	// Derived: personas that don't have overrides yet
	const availablePersonas = $derived(
		PERSONA_NAMES.filter((p) => !modelOverrides.some((o) => o.persona === p))
	);

	// Fetch data on mount
	onMount(async () => {
		try {
			// Fetch models and settings in parallel
			const [modelsRes, settingsRes, overridesRes] = await Promise.all([
				fetch('/api/models'),
				fetch('/api/settings'),
				fetch('/api/model-overrides')
			]);

			if (!modelsRes.ok) throw new Error('Failed to fetch models');
			if (!settingsRes.ok) throw new Error('Failed to fetch settings');
			if (!overridesRes.ok) throw new Error('Failed to fetch model overrides');

			models = await modelsRes.json();
			const settings = await settingsRes.json();
			modelOverrides = await overridesRes.json();

			defaultModel = settings.default_model || DEFAULT_MODEL;
			selectedEmbeddingModel = settings.selected_embedding_model || EMBEDDING_MODEL;

			isLoading = false;
		} catch (error) {
			console.error('[SettingsModal] Failed to load data:', error);
			errorMessage = 'Failed to load settings. Please try again.';
			isLoading = false;
		}
	});

	// Handle save (default model + embedding model)
	async function handleSave() {
		isSaving = true;
		errorMessage = null;

		try {
			const response = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					default_model: defaultModel,
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

	// Handle adding a model override
	async function handleAddOverride() {
		if (!newOverridePersona || !newOverrideModel) return;

		errorMessage = null;

		try {
			const response = await fetch('/api/model-overrides', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					persona: newOverridePersona,
					model: newOverrideModel
				})
			});

			if (!response.ok) {
				throw new Error('Failed to add override');
			}

			// Update local state
			modelOverrides = [...modelOverrides, { persona: newOverridePersona, model: newOverrideModel }];

			// Reset form
			showAddOverride = false;
			newOverridePersona = '';
			newOverrideModel = '';
		} catch (error) {
			console.error('[SettingsModal] Failed to add override:', error);
			errorMessage = 'Failed to add override. Please try again.';
		}
	}

	// Handle removing a model override
	async function handleRemoveOverride(persona: PersonaName) {
		errorMessage = null;

		try {
			const response = await fetch('/api/model-overrides', {
				method: 'DELETE',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ persona })
			});

			if (!response.ok) {
				throw new Error('Failed to remove override');
			}

			// Update local state
			modelOverrides = modelOverrides.filter((o) => o.persona !== persona);
		} catch (error) {
			console.error('[SettingsModal] Failed to remove override:', error);
			errorMessage = 'Failed to remove override. Please try again.';
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
			const filename = filenameMatch
				? filenameMatch[1]
				: `asura-export-${new Date().toISOString().split('T')[0]}.json`;

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

	// Get model display name
	function getModelName(modelId: string): string {
		const model = models.find((m) => m.model_identifier === modelId);
		return model ? `${model.model_name}` : modelId;
	}

	// Get persona display name
	function getPersonaName(persona: string): string {
		return PERSONAS[persona]?.displayName ?? persona;
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
				<!-- Default Model Selection -->
				<div class="settings-section">
					<label for="default-model">Default Model</label>
					<select id="default-model" bind:value={defaultModel}>
						{#each models.filter((m) => m.model_type === 'text_generation') as model}
							<option value={model.model_identifier}>
								{model.model_name} ({model.provider})
							</option>
						{/each}
					</select>
					<p class="help-text">Used for all personas unless overridden below</p>
				</div>

				<!-- Model Overrides Section -->
				<div class="settings-section overrides-section">
					<label>Model Overrides</label>

					{#if modelOverrides.length > 0}
						<div class="overrides-list">
							{#each modelOverrides as override}
								<div class="override-item">
									<span class="override-persona">{getPersonaName(override.persona)}</span>
									<span class="override-arrow">&rarr;</span>
									<span class="override-model">{getModelName(override.model)}</span>
									<button
										class="remove-btn"
										onclick={() => handleRemoveOverride(override.persona)}
										aria-label="Remove override"
									>
										<Icon src={LuTrash2} size="12" />
									</button>
								</div>
							{/each}
						</div>
					{/if}

					{#if showAddOverride}
						<div class="add-override-form">
							<select bind:value={newOverridePersona} class="persona-select">
								<option value="">Select persona...</option>
								{#each availablePersonas as persona}
									<option value={persona}>{getPersonaName(persona)}</option>
								{/each}
							</select>
							<select bind:value={newOverrideModel} class="model-select">
								<option value="">Select model...</option>
								{#each models.filter((m) => m.model_type === 'text_generation') as model}
									<option value={model.model_identifier}>
										{model.model_name}
									</option>
								{/each}
							</select>
							<div class="add-override-actions">
								<button
									class="add-btn"
									onclick={handleAddOverride}
									disabled={!newOverridePersona || !newOverrideModel}
								>
									Add
								</button>
								<button
									class="cancel-btn"
									onclick={() => {
										showAddOverride = false;
										newOverridePersona = '';
										newOverrideModel = '';
									}}
								>
									Cancel
								</button>
							</div>
						</div>
					{:else if availablePersonas.length > 0}
						<button class="add-override-btn" onclick={() => (showAddOverride = true)}>
							<Icon src={LuPlus} size="12" />
							Add override
						</button>
					{/if}

					<p class="help-text">Override the default model for specific personas</p>
				</div>

				<!-- Embedding Model Selection -->
				<div class="settings-section">
					<label for="embedding-model">Embedding Model</label>
					<select id="embedding-model" bind:value={selectedEmbeddingModel}>
						{#each models.filter((m) => m.model_type === 'embedding') as model}
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

	/* Overrides Section */
	.overrides-section {
		margin-bottom: 16px;
	}

	.overrides-list {
		margin-bottom: 8px;
	}

	.override-item {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 6px 8px;
		background: hsl(var(--muted) / 0.3);
		border: 1px solid hsl(var(--border));
		margin-bottom: 4px;
		font-size: 10px;
		font-family: Menlo, Monaco, 'Courier New', monospace;
	}

	.override-persona {
		color: hsl(var(--foreground));
		min-width: 60px;
	}

	.override-arrow {
		color: hsl(var(--muted-foreground));
		opacity: 0.5;
	}

	.override-model {
		color: hsl(var(--foreground));
		flex: 1;
	}

	.remove-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 2px;
		opacity: 0.5;
		display: flex;
		align-items: center;
	}

	.remove-btn:hover {
		opacity: 1;
		color: hsl(0, 70%, 60%);
	}

	.add-override-btn {
		display: flex;
		align-items: center;
		gap: 4px;
		background: none;
		border: 1px dashed hsl(var(--border));
		color: hsl(var(--muted-foreground));
		padding: 6px 8px;
		font-size: 10px;
		cursor: pointer;
		width: 100%;
		justify-content: center;
	}

	.add-override-btn:hover {
		border-color: hsl(var(--foreground));
		color: hsl(var(--foreground));
	}

	.add-override-form {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 8px;
	}

	.add-override-form select {
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

	.add-override-actions {
		display: flex;
		gap: 4px;
		margin-top: 4px;
	}

	.add-btn,
	.cancel-btn {
		flex: 1;
		padding: 6px;
		border: 1px solid hsl(var(--border));
		background: transparent;
		color: hsl(var(--foreground));
		font-size: 10px;
		cursor: pointer;
	}

	.add-btn:hover:not(:disabled) {
		border-color: hsl(var(--foreground));
	}

	.add-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.cancel-btn:hover {
		border-color: hsl(var(--foreground));
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
