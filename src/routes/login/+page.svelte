<script lang="ts">
	const { data } = $props();

	const errorMessages: Record<string, string> = {
		auth_failed: 'Authentication failed. Please try again.'
	};

	let loading = $state(false);
	let error = $state(data.error ? errorMessages[data.error] ?? data.error : '');

	async function signInWithGoogle() {
		loading = true;
		error = '';

		try {
			const response = await fetch('/api/auth/google', {
				method: 'POST'
			});

			const result = await response.json();

			if (result.error) {
				error = result.error;
				loading = false;
			} else if (result.url) {
				// Redirect to Google OAuth
				window.location.href = result.url;
			}
		} catch (err) {
			error = 'Failed to initiate login. Please try again.';
			loading = false;
		}
	}
</script>

<svelte:head>
	<title>Sign in to Aether</title>
</svelte:head>

<div class="login-container">
	<div class="login-card">
		<div class="brand-header">
			<h1>Aether</h1>
			<p class="subtitle">Founder Psychology. Business Strategy. Next Steps.</p>
		</div>

		{#if error}
			<div class="error-message">
				{error}
			</div>
		{/if}

		<!-- Google's official "Sign in with Google" button -->
		<button class="gsi-material-button" onclick={signInWithGoogle} disabled={loading}>
			<div class="gsi-material-button-state"></div>
			<div class="gsi-material-button-content-wrapper">
				<div class="gsi-material-button-icon">
					<svg
						version="1.1"
						xmlns="http://www.w3.org/2000/svg"
						viewBox="0 0 48 48"
						xmlns:xlink="http://www.w3.org/1999/xlink"
						style="display: block;"
					>
						<path
							fill="#EA4335"
							d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
						></path>
						<path
							fill="#4285F4"
							d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
						></path>
						<path
							fill="#FBBC05"
							d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
						></path>
						<path
							fill="#34A853"
							d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
						></path>
						<path fill="none" d="M0 0h48v48H0z"></path>
					</svg>
				</div>
				<span class="gsi-material-button-contents"
					>{loading ? 'Signing in...' : 'Sign in with Google'}</span
				>
			</div>
		</button>

		<div class="divider">
			<span>secure authentication</span>
		</div>

		<div class="info-text">
			<p class="tech-stack">Powered by Supabase, Anthropic Claude, and Voyage AI</p>
		</div>
	</div>
</div>

<style>
	.login-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background: hsl(var(--background));
		font-family: 'iA Writer Quattro V', system-ui, -apple-system, sans-serif;
	}

	.login-card {
		background: hsl(var(--card));
		padding: 3rem 2.5rem;
		border-radius: 12px;
		border: 1px solid hsl(var(--border));
		box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
		max-width: 540px;
		width: 90%;
	}

	.brand-header {
		margin-bottom: 2.5rem;
		text-align: center;
	}

	h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2.5rem;
		font-weight: 600;
		color: hsl(var(--primary));
		letter-spacing: -0.02em;
	}

	.subtitle {
		margin: 0;
		color: hsl(var(--muted-foreground));
		font-size: 0.95rem;
		font-weight: 400;
		letter-spacing: 0.02em;
	}

	.error-message {
		background: rgba(234, 67, 53, 0.1);
		color: #ff6b6b;
		padding: 0.875rem 1rem;
		border-radius: 6px;
		border: 1px solid rgba(234, 67, 53, 0.2);
		margin-bottom: 1.5rem;
		font-size: 0.9rem;
		line-height: 1.4;
	}

	/* Google's official "Sign in with Google" button styles */
	/* Based on: https://developers.google.com/identity/gsi/web/guides/offerings */
	.gsi-material-button {
		display: block;
		-moz-user-select: none;
		-webkit-user-select: none;
		-ms-user-select: none;
		-webkit-appearance: none;
		background-color: #131314;
		background-image: none;
		border: 1px solid #8E918F;
		-webkit-border-radius: 4px;
		border-radius: 4px;
		-webkit-box-sizing: border-box;
		box-sizing: border-box;
		color: #E3E3E3;
		cursor: pointer;
		font-family: 'Roboto', arial, sans-serif;
		font-size: 14px;
		height: 40px;
		letter-spacing: 0.25px;
		outline: none;
		overflow: hidden;
		padding: 0 12px;
		position: relative;
		text-align: center;
		-webkit-transition:
			background-color 0.218s,
			border-color 0.218s,
			box-shadow 0.218s;
		transition:
			background-color 0.218s,
			border-color 0.218s,
			box-shadow 0.218s;
		vertical-align: middle;
		white-space: nowrap;
		width: auto;
		min-width: 240px;
		margin: 0 auto;
	}

	.gsi-material-button .gsi-material-button-icon {
		height: 20px;
		margin-right: 12px;
		min-width: 20px;
		width: 20px;
	}

	.gsi-material-button .gsi-material-button-content-wrapper {
		-webkit-align-items: center;
		align-items: center;
		display: flex;
		-webkit-flex-direction: row;
		flex-direction: row;
		-webkit-flex-wrap: nowrap;
		flex-wrap: nowrap;
		height: 100%;
		justify-content: center;
		position: relative;
		width: 100%;
	}

	.gsi-material-button .gsi-material-button-contents {
		-webkit-flex-grow: 0;
		flex-grow: 0;
		font-family: 'Roboto', arial, sans-serif;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		vertical-align: top;
	}

	.gsi-material-button .gsi-material-button-state {
		-webkit-transition: opacity 0.218s;
		transition: opacity 0.218s;
		bottom: 0;
		left: 0;
		opacity: 0;
		position: absolute;
		right: 0;
		top: 0;
	}

	.gsi-material-button:disabled {
		cursor: default;
		background-color: #131314;
		border-color: #8E918F;
		opacity: 0.5;
	}

	.gsi-material-button:disabled .gsi-material-button-contents {
		opacity: 38%;
	}

	.gsi-material-button:disabled .gsi-material-button-icon {
		opacity: 38%;
	}

	.gsi-material-button:not(:disabled):active .gsi-material-button-state,
	.gsi-material-button:not(:disabled):focus .gsi-material-button-state {
		background-color: #E3E3E3;
		opacity: 12%;
	}

	.gsi-material-button:not(:disabled):hover {
		-webkit-box-shadow:
			0 1px 2px 0 rgba(0, 0, 0, 0.3),
			0 1px 3px 1px rgba(0, 0, 0, 0.15);
		box-shadow:
			0 1px 2px 0 rgba(0, 0, 0, 0.3),
			0 1px 3px 1px rgba(0, 0, 0, 0.15);
		border-color: #E3E3E3;
	}

	.gsi-material-button:not(:disabled):hover .gsi-material-button-state {
		background-color: #E3E3E3;
		opacity: 8%;
	}

	.divider {
		margin: 2rem 0;
		text-align: center;
		position: relative;
	}

	.divider::before {
		content: '';
		position: absolute;
		left: 0;
		right: 0;
		top: 50%;
		height: 1px;
		background: hsl(var(--border));
	}

	.divider span {
		position: relative;
		background: hsl(var(--card));
		padding: 0 1rem;
		font-size: 0.75rem;
		color: hsl(var(--muted-foreground));
		text-transform: uppercase;
		letter-spacing: 0.1em;
		font-weight: 500;
	}

	.info-text {
		text-align: center;
		font-size: 0.875rem;
		color: hsl(var(--muted-foreground));
		line-height: 1.6;
	}

	.info-text p {
		margin: 0.5rem 0;
	}

	.tech-stack {
		font-size: 0.8rem;
		color: hsl(var(--muted-foreground));
		opacity: 0.7;
	}
</style>
