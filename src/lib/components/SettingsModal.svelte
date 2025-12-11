<script lang="ts">
	import { onMount } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuX, LuFlame, LuDownload } from 'svelte-icons-pack/lu';
	import { DEFAULT_MODEL } from '$lib/config/models';
	import NukeMenu from './NukeMenu.svelte';

	// Props
	let { open = $bindable(false), onClose, onNukeComplete }: { open?: boolean; onClose: () => void; onNukeComplete?: () => void } = $props();

	// Nuke state
	let showNukeMenu = $state(false);
	let nukeButtonRef = $state<HTMLElement | null>(null);

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

	// All override keys (personas + processors)
	const OVERRIDE_KEYS = ['gunnar', 'kirby', 'samara', 'alicja', 'eva', 'embeddings', 'image_gen', 'compression'] as const;
	type OverrideKey = typeof OVERRIDE_KEYS[number];

	let models = $state<Model[]>([]);
	let defaultModel = $state<string>('');
	let modelOverrides = $state<Record<OverrideKey, string>>({
		gunnar: '',
		kirby: '',
		samara: '',
		alicja: '',
		eva: '',
		embeddings: '',
		image_gen: '',
		compression: ''
	});
	let isLoading = $state(true);
	let isExporting = $state(false);
	let errorMessage = $state<string | null>(null);

	// Fetch data on mount
	onMount(async () => {
		try {
			// Fetch models, settings, and overrides in parallel
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
			const overrides: { persona: string; model: string }[] = await overridesRes.json();

			defaultModel = settings.default_model || DEFAULT_MODEL;

			// Initialize all overrides to default model
			for (const key of OVERRIDE_KEYS) {
				modelOverrides[key] = defaultModel;
			}

			// Apply any saved overrides
			for (const override of overrides) {
				if (OVERRIDE_KEYS.includes(override.persona as OverrideKey)) {
					modelOverrides[override.persona as OverrideKey] = override.model;
				}
			}

			isLoading = false;
		} catch (error) {
			console.error('[SettingsModal] Failed to load data:', error);
			errorMessage = 'Failed to load settings. Please try again.';
			isLoading = false;
		}
	});

	// Auto-save default model setting
	async function saveDefaultModel() {
		errorMessage = null;

		try {
			const response = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					default_model: defaultModel
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save settings');
			}
		} catch (error) {
			console.error('[SettingsModal] Failed to save:', error);
			errorMessage = 'Failed to save settings.';
		}
	}

	// Save a model override
	async function saveModelOverride(key: OverrideKey, model: string) {
		errorMessage = null;

		try {
			const response = await fetch('/api/model-overrides', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					persona: key,
					model: model
				})
			});

			if (!response.ok) {
				throw new Error('Failed to save model override');
			}
		} catch (error) {
			console.error('[SettingsModal] Failed to save override:', error);
			errorMessage = 'Failed to save model override.';
		}
	}

	// Handle default model change - cascade to all dropdowns using the old value
	function handleDefaultModelChange(event: Event) {
		const oldDefault = defaultModel;
		const newDefault = (event.target as HTMLSelectElement).value;
		defaultModel = newDefault;

		// Cascade: update all overrides that were using the old default
		for (const key of OVERRIDE_KEYS) {
			if (modelOverrides[key] === oldDefault) {
				modelOverrides[key] = newDefault;
				saveModelOverride(key, newDefault);
			}
		}

		saveDefaultModel();
	}

	// Handle individual override change
	function handleOverrideChange(key: OverrideKey, event: Event) {
		const newModel = (event.target as HTMLSelectElement).value;
		modelOverrides[key] = newModel;
		saveModelOverride(key, newModel);
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

	// Group text generation models by provider, sorted alphabetically within each group
	const modelsByProvider = $derived(() => {
		const textModels = models.filter((m) => m.model_type === 'text_generation');

		// Group by provider
		const grouped = textModels.reduce((acc, model) => {
			const provider = model.provider;
			if (!acc[provider]) acc[provider] = [];
			acc[provider].push(model);
			return acc;
		}, {} as Record<string, Model[]>);

		// Sort models within each provider alphabetically
		for (const provider of Object.keys(grouped)) {
			grouped[provider].sort((a, b) => a.model_name.localeCompare(b.model_name));
		}

		// Return providers in order: Anthropic first, then alphabetically
		const providers = Object.keys(grouped).sort((a, b) => {
			if (a === 'anthropic') return -1;
			if (b === 'anthropic') return 1;
			return a.localeCompare(b);
		});

		return providers.map(provider => ({
			provider,
			label: provider.charAt(0).toUpperCase() + provider.slice(1),
			models: grouped[provider]
		}));
	});

	// Group image generation models by provider (for Image gen dropdown)
	const imageModelsByProvider = $derived(() => {
		const imageModels = models.filter((m) => m.model_type === 'image_generation');

		// Group by provider
		const grouped = imageModels.reduce((acc, model) => {
			const provider = model.provider;
			if (!acc[provider]) acc[provider] = [];
			acc[provider].push(model);
			return acc;
		}, {} as Record<string, Model[]>);

		// Sort models within each provider alphabetically
		for (const provider of Object.keys(grouped)) {
			grouped[provider].sort((a, b) => a.model_name.localeCompare(b.model_name));
		}

		// Return providers alphabetically (fal first since it's the main image provider)
		const providers = Object.keys(grouped).sort((a, b) => {
			if (a === 'fal') return -1;
			if (b === 'fal') return 1;
			return a.localeCompare(b);
		});

		return providers.map(provider => ({
			provider,
			label: provider.charAt(0).toUpperCase() + provider.slice(1),
			models: grouped[provider]
		}));
	});

	// Group embedding models by provider (for Embeddings dropdown)
	const embeddingModelsByProvider = $derived(() => {
		const embeddingModels = models.filter((m) => m.model_type === 'embedding');

		// Group by provider
		const grouped = embeddingModels.reduce((acc, model) => {
			const provider = model.provider;
			if (!acc[provider]) acc[provider] = [];
			acc[provider].push(model);
			return acc;
		}, {} as Record<string, Model[]>);

		// Sort models within each provider alphabetically
		for (const provider of Object.keys(grouped)) {
			grouped[provider].sort((a, b) => a.model_name.localeCompare(b.model_name));
		}

		// Return providers alphabetically (voyage first since it's the main embedding provider)
		const providers = Object.keys(grouped).sort((a, b) => {
			if (a === 'voyage') return -1;
			if (b === 'voyage') return 1;
			return a.localeCompare(b);
		});

		return providers.map(provider => ({
			provider,
			label: provider.charAt(0).toUpperCase() + provider.slice(1),
			models: grouped[provider]
		}));
	});
</script>

<svelte:document onkeydown={(e) => e.key === 'Escape' && open && onClose()} />

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
					<label for="default-model">Default LLM</label>
					<select id="default-model" value={defaultModel} onchange={handleDefaultModelChange}>
						{#each modelsByProvider() as group}
							<optgroup label={group.label}>
								{#each group.models as model}
									<option value={model.model_identifier}>
										{model.model_name}
									</option>
								{/each}
							</optgroup>
						{/each}
					</select>
				</div>

				<!-- Two Column Box -->
				<div class="placeholder-box">
					<div class="two-column-row">
						<div class="column">
							<div class="settings-section inner">
								<label for="gunnar-select">Gunnar</label>
								<select id="gunnar-select" value={modelOverrides.gunnar} onchange={(e) => handleOverrideChange('gunnar', e)}>
									{#each modelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="settings-section inner">
								<label for="kirby-select">Kirby</label>
								<select id="kirby-select" value={modelOverrides.kirby} onchange={(e) => handleOverrideChange('kirby', e)}>
									{#each modelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="settings-section inner">
								<label for="samara-select">Samara</label>
								<select id="samara-select" value={modelOverrides.samara} onchange={(e) => handleOverrideChange('samara', e)}>
									{#each modelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="settings-section inner">
								<label for="alicja-select">Alicja</label>
								<select id="alicja-select" value={modelOverrides.alicja} onchange={(e) => handleOverrideChange('alicja', e)}>
									{#each modelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="settings-section inner">
								<label for="eva-select">Eva</label>
								<select id="eva-select" value={modelOverrides.eva} onchange={(e) => handleOverrideChange('eva', e)}>
									{#each modelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
						</div>
						<div class="column">
							<div class="settings-section inner">
								<label for="embeddings-select">Embeddings</label>
								<select id="embeddings-select" value={modelOverrides.embeddings} onchange={(e) => handleOverrideChange('embeddings', e)}>
									{#each embeddingModelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="settings-section inner">
								<label for="image-gen-select">Image gen</label>
								<select id="image-gen-select" value={modelOverrides.image_gen} onchange={(e) => handleOverrideChange('image_gen', e)}>
									{#each imageModelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="settings-section inner">
								<label for="compression-select">Compression</label>
								<select id="compression-select" value={modelOverrides.compression} onchange={(e) => handleOverrideChange('compression', e)}>
									{#each modelsByProvider() as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
						</div>
					</div>
				</div>

				<!-- Error Message -->
				{#if errorMessage}
					<div class="error-message">{errorMessage}</div>
				{/if}

				<!-- Footer Icons -->
				<div class="footer-icons">
					<button
						class="icon-btn"
						onclick={handleExport}
						disabled={isExporting}
						title="Export all data as JSON"
					>
						<Icon src={LuDownload} size="16" />
					</button>
					<div class="nuke-wrapper">
						<button
							class="icon-btn danger"
							onclick={() => showNukeMenu = !showNukeMenu}
							bind:this={nukeButtonRef}
							title="Delete data"
						>
							<Icon src={LuFlame} size="16" />
						</button>
						<NukeMenu
							isOpen={showNukeMenu}
							onClose={() => showNukeMenu = false}
							onNukeComplete={() => {
								showNukeMenu = false;
								onNukeComplete?.();
							}}
							triggerRef={nukeButtonRef}
						/>
					</div>
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
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		padding: 20px;
		width: 700px;
		max-width: 90%;
		max-height: 80vh;
		overflow-y: auto;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 8pt;
	}

	.two-column-row {
		display: flex;
		gap: 120px;
	}

	.column {
		flex: 1;
		min-width: 0;
	}

	.placeholder-box {
		border: 1px solid hsl(var(--border));
		min-height: 80px;
		padding: 12px;
	}

	/* Footer icons */
	.footer-icons {
		display: flex;
		gap: 12px;
		margin-top: 24px;
	}

	.icon-btn {
		background: none;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		padding: 6px;
		display: flex;
		align-items: center;
		justify-content: center;
		opacity: 0.6;
	}

	.icon-btn:hover:not(:disabled) {
		opacity: 1;
	}

	.icon-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	.icon-btn.danger {
		color: hsl(0, 70%, 60%);
	}

	.icon-btn.danger:hover {
		opacity: 1;
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
		font-size: 8pt;
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
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 24px;
		width: 257px;
		margin-left: 13px;
	}

	.settings-section.inner {
		width: 100%;
		margin-left: 0;
		margin-bottom: 8px;
		justify-content: space-between;
	}

	.settings-section.inner:last-child {
		margin-bottom: 0;
	}

	.settings-section.inner select {
		flex: none;
		width: 150px;
	}

	.settings-section label {
		font-weight: 400;
		color: hsl(var(--muted-foreground));
		font-size: 8pt;
		white-space: nowrap;
	}

	.settings-section select {
		flex: none;
		width: 150px;
		padding: 3px 20px 3px 6px;
		background: #000;
		background-image: url("data:image/svg+xml,%3Csvg width='12' height='12' viewBox='0 0 12 12' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M3 5L6 8L9 5' stroke='%23666' stroke-width='1' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
		background-repeat: no-repeat;
		background-position: right 6px center;
		border: 1px solid hsl(var(--border));
		border-radius: 0;
		color: hsl(var(--foreground));
		font-family: inherit;
		font-size: 8pt;
		cursor: pointer;
		appearance: none;
	}

	.settings-section select:focus {
		outline: none;
		border-color: hsl(var(--border));
	}

	.settings-section select optgroup {
		font-weight: 600;
		font-style: normal;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--background));
	}

	.settings-section select option {
		font-weight: 400;
		padding-left: 8px;
	}

	.loading-state {
		text-align: center;
		padding: 40px;
		color: hsl(var(--muted-foreground));
		font-size: 8pt;
	}

	.error-message {
		background: hsla(0, 70%, 50%, 0.1);
		border: 1px solid hsla(0, 70%, 50%, 0.3);
		color: hsl(0, 70%, 60%);
		padding: 8px 12px;
		font-size: 8pt;
		margin-bottom: 12px;
	}

	.nuke-wrapper {
		position: relative;
		margin-left: auto;
	}
</style>
