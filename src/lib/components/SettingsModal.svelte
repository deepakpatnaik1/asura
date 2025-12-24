<script lang="ts">
	import { onMount, onDestroy } from 'svelte';
	import { Icon } from 'svelte-icons-pack';
	import { LuX, LuFlame, LuDownload, LuTrash2 } from 'svelte-icons-pack/lu';
	import { createConfirmation } from '$lib/composables/confirmation.svelte';
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
		cost_per_image: number;
	}

	// All override keys (personas + processors)
	const OVERRIDE_KEYS = ['gunnar', 'kirby', 'samara', 'alicja', 'eva', 'ananya', 'nico', 'embeddings', 'compression', 'chat_compression', 'character_planning', 'image_gen', 'image_edit'] as const;
	type OverrideKey = typeof OVERRIDE_KEYS[number];

	// Persona names for uncensored compression flags
	const PERSONA_NAMES = ['gunnar', 'kirby', 'samara', 'alicja', 'eva', 'ananya', 'nico'] as const;
	type PersonaName = typeof PERSONA_NAMES[number];

	let models = $state<Model[]>([]);
	let modelOverrides = $state<Record<OverrideKey, string>>({
		gunnar: '',
		kirby: '',
		samara: '',
		alicja: '',
		eva: '',
		ananya: '',
		nico: '',
		embeddings: '',
		compression: '',
		chat_compression: '',
		character_planning: '',
		image_gen: '',
		image_edit: ''
	});

	// Per-persona uncensored compression flags
	let uncensoredFlags = $state<Record<PersonaName, boolean>>({
		gunnar: false,
		kirby: false,
		samara: false,
		alicja: false,
		eva: true,
		ananya: false,
		nico: false
	});
	let isLoading = $state(true);
	let isExporting = $state(false);
	let errorMessage = $state<string | null>(null);

	// Google Calendar connection state
	let calendarConnected = $state(false);
	let calendarLoading = $state(false);

	// Backup status
	let lastBackup = $state<string | null>(null);

	// Delete confirmation state
	const deleteConfirm = createConfirmation();

	// Cleanup on unmount
	onDestroy(() => {
		deleteConfirm.cleanup();
	});

	// Delete a model permanently
	async function handleDeleteModel(modelId: string) {
		try {
			const response = await fetch(`/api/models/${encodeURIComponent(modelId)}`, {
				method: 'DELETE'
			});

			if (!response.ok) {
				throw new Error('Failed to delete model');
			}

			// Remove from local state
			models = models.filter(m => m.model_identifier !== modelId);
		} catch (error) {
			console.error('[SettingsModal] Delete failed:', error);
			errorMessage = 'Failed to delete model.';
		}
	}

	// Handle delete button click
	function onDeleteClick(modelId: string, event: MouseEvent) {
		event.stopPropagation();
		if (deleteConfirm.isActive && deleteConfirm.targetId === modelId) {
			deleteConfirm.cancel();
		} else {
			deleteConfirm.start(modelId, () => handleDeleteModel(modelId));
		}
	}

	// Format model type for display
	function formatModelType(type: string): string {
		switch (type) {
			case 'text_generation': return 'text';
			case 'image_generation': return 'image';
			case 'image_edit': return 'edit';
			case 'captioning': return 'caption';
			case 'embedding': return 'embed';
			case 'tool_calling': return 'tools';
			case 'audio_generation': return 'audio';
			case 'audio_transcription': return 'transcribe';
			case 'video_generation': return 'video';
			default: return type;
		}
	}

	// Format price for display
	function formatPrice(price: number): string {
		if (price === 0) return 'free';
		if (price < 0.01) return '<0.01';
		return price.toFixed(2);
	}

	// Fetch data on mount
	onMount(async () => {
		try {
			// Fetch models, settings, calendar status, and backup status in parallel
			const [modelsRes, settingsRes, calendarRes, backupRes] = await Promise.all([
				fetch('/api/models'),
				fetch('/api/settings'),
				fetch('/api/google/calendar/events?days=1'),
				fetch('/api/backup-status')
			]);

			// Check calendar connection status
			if (calendarRes.ok) {
				const calendarData = await calendarRes.json();
				calendarConnected = calendarData.connected === true;
			}

			// Check backup status
			if (backupRes.ok) {
				const backupData = await backupRes.json();
				lastBackup = backupData.lastBackup;
			}

			if (!modelsRes.ok) throw new Error('Failed to fetch models');
			if (!settingsRes.ok) throw new Error('Failed to fetch settings');

			models = await modelsRes.json();
			const settings = await settingsRes.json();

			console.log('[SettingsModal] Settings received:', settings);

			// Build new overrides object to ensure reactivity
			// No fallback logic - NULL values surface as empty (shows errors immediately)
			const newOverrides: Record<OverrideKey, string> = {
				gunnar: '',
				kirby: '',
				samara: '',
				alicja: '',
				eva: '',
				ananya: '',
				nico: '',
				embeddings: '',
				compression: '',
				chat_compression: '',
				character_planning: '',
				image_gen: '',
				image_edit: ''
			};

			// Load model overrides from settings - use exact DB values, no fallbacks
			for (const key of OVERRIDE_KEYS) {
				const columnName = `model_${key}` as keyof typeof settings;
				newOverrides[key] = settings[columnName] || '';
			}

			// Load uncensored compression flags
			const newFlags: Record<PersonaName, boolean> = {
				gunnar: false,
				kirby: false,
				samara: false,
				alicja: false,
				eva: true,
				ananya: false,
				nico: false
			};
			for (const persona of PERSONA_NAMES) {
				const columnName = `compression_uncensored_${persona}` as keyof typeof settings;
				if (settings[columnName] !== undefined) {
					newFlags[persona] = settings[columnName] as boolean;
				}
			}
			uncensoredFlags = newFlags;

			console.log('[SettingsModal] Overrides built:', newOverrides);

			// Replace entire object to ensure reactivity
			modelOverrides = newOverrides;

			isLoading = false;
		} catch (error) {
			console.error('[SettingsModal] Failed to load data:', error);
			errorMessage = 'Failed to load settings. Please try again.';
			isLoading = false;
		}
	});

	// Save a setting to user_settings table
	async function saveSetting(data: Record<string, unknown>) {
		errorMessage = null;

		try {
			const response = await fetch('/api/settings', {
				method: 'PUT',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			});

			if (!response.ok) {
				throw new Error('Failed to save setting');
			}
		} catch (error) {
			console.error('[SettingsModal] Failed to save:', error);
			errorMessage = 'Failed to save setting.';
		}
	}

	// Handle individual override change
	function handleOverrideChange(key: OverrideKey, event: Event) {
		const newModel = (event.target as HTMLSelectElement).value;
		modelOverrides[key] = newModel;
		saveSetting({ [`model_${key}`]: newModel });
	}

	// Handle uncensored compression checkbox change
	function handleUncensoredChange(persona: PersonaName, event: Event) {
		const checked = (event.target as HTMLInputElement).checked;
		uncensoredFlags[persona] = checked;
		saveSetting({ [`compression_uncensored_${persona}`]: checked });
	}

	// Handle overlay click (close modal)
	function handleOverlayClick(event: MouseEvent) {
		if (event.target === event.currentTarget) {
			onClose();
		}
	}

	// Handle Google Calendar connection
	function handleConnectCalendar() {
		// Redirect to OAuth flow
		window.location.href = '/api/google/calendar/authorize';
	}

	// Handle Google Calendar disconnection
	async function handleDisconnectCalendar() {
		calendarLoading = true;
		try {
			const response = await fetch('/api/google/calendar/disconnect', { method: 'DELETE' });
			if (response.ok) {
				calendarConnected = false;
			} else {
				errorMessage = 'Failed to disconnect Google Calendar.';
			}
		} catch {
			errorMessage = 'Failed to disconnect Google Calendar.';
		} finally {
			calendarLoading = false;
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
				: `aether-export-${new Date().toISOString().split('T')[0]}.json`;

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
	const modelsByProvider = $derived.by(() => {
		console.log('[DEBUG] modelsByProvider computing, models count:', models.length);
		const textModels = models.filter((m) => m.model_type === 'text_generation');
		console.log('[DEBUG] text models found:', textModels.length);

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

	// Group embedding models by provider (for Embeddings dropdown)
	const embeddingModelsByProvider = $derived.by(() => {
		console.log('[DEBUG] embeddingModelsByProvider computing, models count:', models.length);
		const embeddingModels = models.filter((m) => m.model_type === 'embedding');
		console.log('[DEBUG] embedding models found:', embeddingModels.length, embeddingModels.map(m => m.model_name));

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

	// Known uncensored model identifiers for character planning
	const UNCENSORED_MODEL_IDS = [
		// Existing
		'sao10k/l3.3-euryale-70b',
		'gryphe/mythomax-l2-13b',
		'nousresearch/hermes-3-llama-3.1-70b',
		'venice-uncensored',
		// New (Dec 2025)
		'nousresearch/hermes-4-70b',
		'nousresearch/hermes-4-405b',
		'anthracite-org/magnum-v4-72b',
		'neversleep/noromaid-20b',
		'neversleep/llama-3.1-lumimaid-8b',
		'thedrummer/rocinante-12b',
		'thedrummer/skyfall-36b-v2',
		'thedrummer/cydonia-24b-v4.1'
	];

	// Group uncensored text models by provider (for Character Planning dropdown)
	const uncensoredModelsByProvider = $derived.by(() => {
		const uncensoredModels = models.filter((m) =>
			m.model_type === 'text_generation' && UNCENSORED_MODEL_IDS.includes(m.model_identifier)
		);

		const grouped = uncensoredModels.reduce((acc, model) => {
			const provider = model.provider;
			if (!acc[provider]) acc[provider] = [];
			acc[provider].push(model);
			return acc;
		}, {} as Record<string, Model[]>);

		for (const provider of Object.keys(grouped)) {
			grouped[provider].sort((a, b) => a.model_name.localeCompare(b.model_name));
		}

		const providers = Object.keys(grouped).sort();
		return providers.map(provider => ({
			provider,
			label: provider.charAt(0).toUpperCase() + provider.slice(1),
			models: grouped[provider]
		}));
	});

	// Group image generation models by provider
	const imageGenModelsByProvider = $derived.by(() => {
		const imgModels = models.filter((m) => m.model_type === 'image_generation');

		const grouped = imgModels.reduce((acc, model) => {
			const provider = model.provider;
			if (!acc[provider]) acc[provider] = [];
			acc[provider].push(model);
			return acc;
		}, {} as Record<string, Model[]>);

		for (const provider of Object.keys(grouped)) {
			grouped[provider].sort((a, b) => a.model_name.localeCompare(b.model_name));
		}

		const providers = Object.keys(grouped).sort();
		return providers.map(provider => ({
			provider,
			label: provider.charAt(0).toUpperCase() + provider.slice(1),
			models: grouped[provider]
		}));
	});

	// Group image editing models by provider
	const imageEditModelsByProvider = $derived.by(() => {
		const editModels = models.filter((m) => m.model_type === 'image_edit');

		const grouped = editModels.reduce((acc, model) => {
			const provider = model.provider;
			if (!acc[provider]) acc[provider] = [];
			acc[provider].push(model);
			return acc;
		}, {} as Record<string, Model[]>);

		for (const provider of Object.keys(grouped)) {
			grouped[provider].sort((a, b) => a.model_name.localeCompare(b.model_name));
		}

		const providers = Object.keys(grouped).sort();
		return providers.map(provider => ({
			provider,
			label: provider.charAt(0).toUpperCase() + provider.slice(1),
			models: grouped[provider]
		}));
	});

	// Group ALL models by provider (for All Models list)
	const allModelsByProvider = $derived.by(() => {
		// Group by provider
		const grouped = models.reduce((acc, model) => {
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
				<!-- Two Column Grid -->
				<div class="settings-grid">
					<div class="column-left">
						<!-- Personas Section -->
						<div class="section-group">
							<h3 class="section-heading">Personas</h3>
							<div class="dropdown-row">
								<label for="gunnar-select">Gunnar</label>
								<input type="checkbox" id="gunnar-uncensored" checked={uncensoredFlags.gunnar} onchange={(e) => handleUncensoredChange('gunnar', e)} title="Use persona model for compression" />
								<select id="gunnar-select" value={modelOverrides.gunnar} onchange={(e) => handleOverrideChange('gunnar', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="kirby-select">Kirby</label>
								<input type="checkbox" id="kirby-uncensored" checked={uncensoredFlags.kirby} onchange={(e) => handleUncensoredChange('kirby', e)} title="Use persona model for compression" />
								<select id="kirby-select" value={modelOverrides.kirby} onchange={(e) => handleOverrideChange('kirby', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="samara-select">Samara</label>
								<input type="checkbox" id="samara-uncensored" checked={uncensoredFlags.samara} onchange={(e) => handleUncensoredChange('samara', e)} title="Use persona model for compression" />
								<select id="samara-select" value={modelOverrides.samara} onchange={(e) => handleOverrideChange('samara', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="alicja-select">Alicja</label>
								<input type="checkbox" id="alicja-uncensored" checked={uncensoredFlags.alicja} onchange={(e) => handleUncensoredChange('alicja', e)} title="Use persona model for compression" />
								<select id="alicja-select" value={modelOverrides.alicja} onchange={(e) => handleOverrideChange('alicja', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="eva-select">Eva</label>
								<input type="checkbox" id="eva-uncensored" checked={uncensoredFlags.eva} onchange={(e) => handleUncensoredChange('eva', e)} title="Use persona model for compression" />
								<select id="eva-select" value={modelOverrides.eva} onchange={(e) => handleOverrideChange('eva', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="ananya-select">Ananya</label>
								<input type="checkbox" id="ananya-uncensored" checked={uncensoredFlags.ananya} onchange={(e) => handleUncensoredChange('ananya', e)} title="Use persona model for compression" />
								<select id="ananya-select" value={modelOverrides.ananya} onchange={(e) => handleOverrideChange('ananya', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="nico-select">Nico</label>
								<input type="checkbox" id="nico-uncensored" checked={uncensoredFlags.nico} onchange={(e) => handleUncensoredChange('nico', e)} title="Use persona model for compression" />
								<select id="nico-select" value={modelOverrides.nico} onchange={(e) => handleOverrideChange('nico', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
						</div>

						<!-- Processes Section -->
						<div class="section-group">
							<h3 class="section-heading">Processes</h3>
							<div class="dropdown-row">
								<label for="embeddings-select">Embeddings</label>
								<select id="embeddings-select" value={modelOverrides.embeddings} onchange={(e) => handleOverrideChange('embeddings', e)}>
									{#each embeddingModelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="compression-select">File artisan cut</label>
								<select id="compression-select" value={modelOverrides.compression} onchange={(e) => handleOverrideChange('compression', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="chat-compression-select">Chat artisan cut</label>
								<select id="chat-compression-select" value={modelOverrides.chat_compression} onchange={(e) => handleOverrideChange('chat_compression', e)}>
									{#each modelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="character-planning-select">Character plan (NSFW)</label>
								<select id="character-planning-select" value={modelOverrides.character_planning} onchange={(e) => handleOverrideChange('character_planning', e)}>
									{#each uncensoredModelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="image-gen-select">Image gen (NSFW)</label>
								<select id="image-gen-select" value={modelOverrides.image_gen} onchange={(e) => handleOverrideChange('image_gen', e)}>
									{#each imageGenModelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
							<div class="dropdown-row">
								<label for="image-edit-select">Image editing (NSFW)</label>
								<select id="image-edit-select" value={modelOverrides.image_edit} onchange={(e) => handleOverrideChange('image_edit', e)}>
									{#each imageEditModelsByProvider as group}
										<optgroup label={group.label}>
											{#each group.models as model}
												<option value={model.model_identifier}>{model.model_name}</option>
											{/each}
										</optgroup>
									{/each}
								</select>
							</div>
						</div>

						<!-- Connections Section -->
						<div class="section-group">
							<h3 class="section-heading">Connections</h3>
							<div class="connection-row">
								<span class="connection-label">Google Calendar</span>
								{#if calendarConnected}
									<span class="connection-status connected">Connected</span>
									<button
										class="connection-btn disconnect"
										onclick={handleDisconnectCalendar}
										disabled={calendarLoading}
									>
										{calendarLoading ? 'Disconnecting...' : 'Disconnect'}
									</button>
								{:else}
									<span class="connection-status">Not connected</span>
									<button
										class="connection-btn connect"
										onclick={handleConnectCalendar}
										disabled={calendarLoading}
									>
										Connect
									</button>
								{/if}
							</div>
						</div>
					</div>
					<div class="column-right">
						<!-- All Models Section -->
						<div class="section-group">
							<h3 class="section-heading">All Models</h3>
							<div class="all-models-list">
								{#each allModelsByProvider as group}
									<div class="provider-group">
										<div class="provider-header">{group.label}</div>
										{#each group.models as model}
											<div class="model-row">
												<span class="model-name">{model.model_name}</span>
												<span class="model-type">{formatModelType(model.model_type)}</span>
												{#if model.model_type === 'image_generation' || model.model_type === 'image_edit' || model.model_type === 'captioning'}
													<span class="model-price" title="Cost per image">${formatPrice(model.cost_per_image ?? 0)}/img</span>
													<span class="model-price"></span>
												{:else}
													<span class="model-price" title="Input cost per million tokens">${formatPrice(model.input_price_per_million)}/M</span>
													<span class="model-price" title="Output cost per million tokens">${formatPrice(model.output_price_per_million)}/M</span>
												{/if}
												<button
													class="delete-btn"
													class:confirming={deleteConfirm.isActive && deleteConfirm.targetId === model.model_identifier}
													style:--progress={deleteConfirm.isActive && deleteConfirm.targetId === model.model_identifier ? `${deleteConfirm.progress}%` : '0%'}
													onclick={(e) => onDeleteClick(model.model_identifier, e)}
													title={deleteConfirm.isActive && deleteConfirm.targetId === model.model_identifier ? 'Click to cancel' : 'Delete model'}
												>
													{#if deleteConfirm.isActive && deleteConfirm.targetId === model.model_identifier}
														<Icon src={LuX} size="12" />
													{:else}
														<Icon src={LuTrash2} size="12" />
													{/if}
												</button>
											</div>
										{/each}
									</div>
								{/each}
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

				<!-- Backup Status -->
				{#if lastBackup}
					<div class="backup-status">Last backup: {lastBackup}</div>
				{/if}
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
		width: 750px;
		max-width: 95%;
		max-height: 80vh;
		overflow-y: auto;
		font-family: "iA Writer Quattro V", system-ui, -apple-system, sans-serif;
		font-size: 8pt;
	}

	.settings-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 40px;
		align-items: start;
	}

	.column-left,
	.column-right {
		min-width: 0;
	}

	.section-group {
		margin-bottom: 20px;
	}

	.section-group:last-child {
		margin-bottom: 0;
	}

	.section-heading {
		font-size: 1.17em;
		font-weight: 400;
		color: hsl(var(--muted-foreground));
		margin: 0 0 8px 12px;
		padding-bottom: 4px;
		border-bottom: 1px solid hsl(var(--border));
	}

	.dropdown-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-left: 24px;
		margin-bottom: 6px;
	}

	.dropdown-row:last-child {
		margin-bottom: 0;
	}

	.dropdown-row label {
		font-size: 8pt;
		font-weight: 400;
		color: hsl(var(--muted-foreground));
	}

	.dropdown-row select {
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

	.dropdown-row select:focus {
		outline: none;
		border-color: hsl(var(--border));
	}

	.dropdown-row select optgroup {
		font-weight: 600;
		font-style: normal;
		color: hsl(var(--muted-foreground));
		background: hsl(var(--background));
	}

	.dropdown-row select option {
		font-weight: 400;
		padding-left: 8px;
	}

	.dropdown-row input[type="checkbox"] {
		width: 12px;
		height: 12px;
		margin-left: auto;
		margin-right: 8px;
		cursor: pointer;
		appearance: none;
		-webkit-appearance: none;
		background: #000;
		border: 1px solid hsl(var(--border));
		border-radius: 2px;
		position: relative;
		flex-shrink: 0;
	}

	.dropdown-row input[type="checkbox"]:checked {
		background: hsl(var(--primary));
		border-color: hsl(var(--primary));
	}

	.dropdown-row input[type="checkbox"]:checked::after {
		content: '';
		position: absolute;
		left: 3px;
		top: 1px;
		width: 4px;
		height: 7px;
		border: solid #000;
		border-width: 0 1.5px 1.5px 0;
		transform: rotate(45deg);
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
	}

	.modal-header h2 {
		font-size: 2em;
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

	.top-row {
		display: flex;
		justify-content: space-between;
		margin-bottom: 24px;
	}

	.top-row .settings-section:last-child {
		margin-left: 0;
		margin-right: 12px;
	}

	/* All Models Section */
	.all-models-section {
		width: 400px;
		flex-shrink: 0;
	}

	.all-models-section label {
		display: block;
		font-weight: 400;
		color: hsl(var(--muted-foreground));
		font-size: 8pt;
		margin-bottom: 8px;
		margin-left: 13px;
	}

	/*
	 * All Models list height formula:
	 * Height = 30(x + y) + 39, where x = personas dropdowns, y = processes dropdowns
	 *
	 * Breakdown:
	 * - Dropdown height: 24px (15.98px content + 6px padding + 2px border)
	 * - Gap between dropdowns: 6px (margin-bottom on .dropdown-row)
	 * - Section 1 (Personas): x × 24 + (x-1) × 6 = 30x - 6
	 * - Section gap: 51px (20px section margin + 23px heading + 8px heading margin)
	 * - Section 2 (Processes): y × 24 + (y-1) × 6 = 30y - 6
	 * - Total: 30x - 6 + 51 + 30y - 6 = 30(x + y) + 39
	 *
	 * Update these counts when adding/removing dropdowns:
	 */
	.all-models-list {
		--personas-count: 7;      /* Gunnar, Kirby, Samara, Alicja, Eva, Ananya, Nico */
		--processes-count: 6;     /* Embeddings, File artisan cut, Chat artisan cut, Character plan (NSFW), Image gen (NSFW), Image editing (NSFW) */
		--dropdown-height: 24px;
		--dropdown-gap: 6px;
		--section-gap: 51px;      /* 20px + 23px + 8px */

		/* Formula: 30(x + y) + 39 */
		height: calc(
			(var(--dropdown-height) + var(--dropdown-gap)) * (var(--personas-count) + var(--processes-count))
			+ var(--section-gap)
			- var(--dropdown-gap) * 2
		);
		overflow-y: auto;
		border: 1px solid hsl(var(--border));
		background: #000;
		margin-left: 24px;
	}

	.provider-group {
		border-bottom: 1px solid hsl(var(--border) / 0.3);
	}

	.provider-group:last-child {
		border-bottom: none;
	}

	.provider-header {
		font-weight: 600;
		font-size: 8pt;
		color: hsl(var(--muted-foreground));
		padding: 4px 8px;
		background: hsl(var(--accent) / 0.3);
	}

	.model-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 3px 8px 3px 16px;
		transition: background 0.15s;
	}

	.model-row:hover {
		background: hsl(var(--accent) / 0.5);
	}

	.model-name {
		flex: 1;
		min-width: 0;
		font-size: 8pt;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.model-type {
		flex-shrink: 0;
		width: 40px;
		font-size: 8pt;
		color: hsl(var(--muted-foreground));
		text-align: center;
	}

	.model-price {
		flex-shrink: 0;
		width: 45px;
		font-size: 8pt;
		color: hsl(var(--muted-foreground));
		text-align: right;
	}

	.model-row .delete-btn {
		flex-shrink: 0;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		background: transparent;
		border: none;
		color: hsl(var(--muted-foreground));
		cursor: pointer;
		transition: all 0.2s ease;
		opacity: 0;
		position: relative;
	}

	.model-row:hover .delete-btn {
		opacity: 1;
	}

	.model-row .delete-btn:hover {
		color: rgb(239, 68, 68);
	}

	.model-row .delete-btn.confirming {
		opacity: 1;
		color: rgb(239, 68, 68);
	}

	.model-row .delete-btn.confirming::before {
		content: '';
		position: absolute;
		inset: 0;
		border-radius: 3px;
		background: linear-gradient(
			to right,
			rgba(239, 68, 68, 0.3) var(--progress, 0%),
			transparent var(--progress, 0%)
		);
	}

	/* Connection row styles */
	.connection-row {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-left: 24px;
		margin-bottom: 6px;
	}

	.connection-label {
		font-size: 8pt;
		color: hsl(var(--muted-foreground));
	}

	.connection-status {
		font-size: 8pt;
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
	}

	.connection-status.connected {
		color: hsl(142, 70%, 45%);
		opacity: 1;
	}

	.connection-btn {
		margin-left: auto;
		padding: 3px 10px;
		font-size: 8pt;
		font-family: inherit;
		border: 1px solid hsl(var(--border));
		border-radius: 0;
		cursor: pointer;
		transition: all 0.15s;
	}

	.connection-btn.connect {
		background: hsl(var(--primary));
		color: hsl(var(--primary-foreground));
		border-color: hsl(var(--primary));
	}

	.connection-btn.connect:hover:not(:disabled) {
		opacity: 0.9;
	}

	.connection-btn.disconnect {
		background: transparent;
		color: hsl(var(--muted-foreground));
	}

	.connection-btn.disconnect:hover:not(:disabled) {
		color: hsl(0, 70%, 60%);
		border-color: hsl(0, 70%, 60%);
	}

	.connection-btn:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}

	.backup-status {
		margin-top: 16px;
		font-size: 7pt;
		color: hsl(var(--muted-foreground));
		opacity: 0.5;
		text-align: right;
	}
</style>
