<script lang="ts">
	export let data;
</script>

<svelte:head>
	<title>Debug Files - Asura</title>
</svelte:head>

<div class="debug-container">
	<h1>File Processing Debug View</h1>

	{#if data.files.length === 0}
		<p class="no-files">No files uploaded yet.</p>
	{:else}
		<div class="stats-summary">
			<div class="stat">
				<span class="stat-label">Total Files:</span>
				<span class="stat-value">{data.files.length}</span>
			</div>
			<div class="stat">
				<span class="stat-label">Total Chunks:</span>
				<span class="stat-value">{data.files.reduce((sum, f) => sum + f.totalChunks, 0)}</span>
			</div>
		</div>

		{#each data.files as file}
			<div class="file-card">
				<div class="file-header">
					<h2>{file.filename}</h2>
					<span class="file-type">{file.fileType}</span>
				</div>

				<div class="file-stats">
					<div class="stat-row">
						<span class="label">Chunks:</span>
						<span class="value">{file.totalChunks}</span>
					</div>
					<div class="stat-row">
						<span class="label">Original Size:</span>
						<span class="value">{file.totalOriginalChars.toLocaleString()} chars</span>
					</div>
					<div class="stat-row">
						<span class="label">Compressed Size:</span>
						<span class="value">{file.totalCompressedChars.toLocaleString()} chars</span>
					</div>
					<div class="stat-row">
						<span class="label">Compression Ratio:</span>
						<span class="value compression">{file.compressionRatio}% reduction</span>
					</div>
				</div>

				<div class="chunks">
					{#each file.chunks as chunk}
						<div class="chunk">
							<div class="chunk-header">
								<span class="chunk-index">Chunk {chunk.chunkIndex}</span>
								<span class="chunk-stats">
									{chunk.originalLength} → {chunk.compressedLength} chars
									({chunk.compressionRatio}% reduction)
								</span>
								{#if chunk.hasEmbedding}
									<span class="embedding-badge">✓ Embedded</span>
								{:else}
									<span class="embedding-badge no-embedding">✗ No Embedding</span>
								{/if}
							</div>
							<div class="chunk-description">
								{chunk.description || '(no description)'}
							</div>
						</div>
					{/each}
				</div>
			</div>
		{/each}
	{/if}
</div>

<style>
	.debug-container {
		max-width: 1200px;
		margin: 0 auto;
		padding: 2rem;
		font-family: 'SF Mono', Monaco, monospace;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		min-height: 100vh;
	}

	h1 {
		font-size: 24pt;
		margin-bottom: 2rem;
		color: var(--boss-accent);
	}

	.no-files {
		text-align: center;
		padding: 4rem;
		color: hsl(var(--muted-foreground));
	}

	.stats-summary {
		display: flex;
		gap: 2rem;
		margin-bottom: 2rem;
		padding: 1rem;
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
	}

	.stats-summary .stat {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.stat-label {
		font-size: 9pt;
		color: hsl(var(--muted-foreground));
	}

	.stat-value {
		font-size: 16pt;
		font-weight: bold;
		color: var(--boss-accent);
	}

	.file-card {
		background: hsl(var(--card));
		border: 1px solid hsl(var(--border));
		border-radius: 8px;
		padding: 1.5rem;
		margin-bottom: 1.5rem;
	}

	.file-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 1rem;
		padding-bottom: 1rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.file-header h2 {
		font-size: 14pt;
		margin: 0;
		color: hsl(var(--foreground));
	}

	.file-type {
		font-size: 9pt;
		padding: 0.25rem 0.75rem;
		background: var(--boss-accent);
		color: hsl(var(--background));
		border-radius: 4px;
		font-weight: bold;
	}

	.file-stats {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: 0.75rem;
		margin-bottom: 1.5rem;
	}

	.stat-row {
		display: flex;
		justify-content: space-between;
		padding: 0.5rem;
		background: hsl(var(--background));
		border-radius: 4px;
	}

	.stat-row .label {
		font-size: 9pt;
		color: hsl(var(--muted-foreground));
	}

	.stat-row .value {
		font-size: 10pt;
		font-weight: bold;
		color: hsl(var(--foreground));
	}

	.stat-row .value.compression {
		color: var(--boss-accent);
	}

	.chunks {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.chunk {
		background: hsl(var(--background));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		padding: 1rem;
	}

	.chunk-header {
		display: flex;
		align-items: center;
		gap: 1rem;
		margin-bottom: 0.75rem;
		padding-bottom: 0.5rem;
		border-bottom: 1px solid hsl(var(--border));
	}

	.chunk-index {
		font-size: 10pt;
		font-weight: bold;
		color: var(--boss-accent);
	}

	.chunk-stats {
		font-size: 9pt;
		color: hsl(var(--muted-foreground));
		flex: 1;
	}

	.embedding-badge {
		font-size: 8pt;
		padding: 0.25rem 0.5rem;
		background: rgba(139, 195, 74, 0.2);
		color: rgb(139, 195, 74);
		border-radius: 4px;
		font-weight: bold;
	}

	.embedding-badge.no-embedding {
		background: rgba(244, 67, 54, 0.2);
		color: rgb(244, 67, 54);
	}

	.chunk-description {
		font-size: 10pt;
		line-height: 1.6;
		color: hsl(var(--foreground));
		white-space: pre-wrap;
		word-wrap: break-word;
	}
</style>
