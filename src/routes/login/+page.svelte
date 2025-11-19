<script lang="ts">
	let loading = $state(false);
	let error = $state('');

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

<div class="login-container">
	<div class="login-card">
		<h1>Welcome to Asura</h1>
		<p class="subtitle">Sign in to continue</p>

		{#if error}
			<div class="error-message">
				{error}
			</div>
		{/if}

		<button class="google-button" onclick={signInWithGoogle} disabled={loading}>
			<svg width="18" height="18" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">
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
			{loading ? 'Signing in...' : 'Sign in with Google'}
		</button>

		<div class="info-text">
			<p>Multiuser authentication powered by Supabase</p>
			<p class="warning">⚠️ RLS disabled - Dev/Testing only</p>
		</div>
	</div>
</div>

<style>
	.login-container {
		display: flex;
		justify-content: center;
		align-items: center;
		min-height: 100vh;
		background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
	}

	.login-card {
		background: white;
		padding: 2.5rem;
		border-radius: 12px;
		box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
		max-width: 400px;
		width: 90%;
	}

	h1 {
		margin: 0 0 0.5rem 0;
		font-size: 2rem;
		color: #333;
		text-align: center;
	}

	.subtitle {
		margin: 0 0 2rem 0;
		color: #666;
		text-align: center;
		font-size: 1rem;
	}

	.error-message {
		background: #fee;
		color: #c33;
		padding: 0.75rem;
		border-radius: 6px;
		margin-bottom: 1rem;
		font-size: 0.9rem;
	}

	.google-button {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.75rem;
		width: 100%;
		padding: 0.875rem;
		background: white;
		border: 2px solid #ddd;
		border-radius: 8px;
		font-size: 1rem;
		font-weight: 500;
		color: #333;
		cursor: pointer;
		transition: all 0.2s;
	}

	.google-button:hover:not(:disabled) {
		background: #f8f8f8;
		border-color: #bbb;
		transform: translateY(-1px);
		box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
	}

	.google-button:disabled {
		opacity: 0.6;
		cursor: not-allowed;
	}

	.info-text {
		margin-top: 2rem;
		text-align: center;
		font-size: 0.85rem;
		color: #666;
	}

	.info-text p {
		margin: 0.25rem 0;
	}

	.warning {
		color: #e67700;
		font-weight: 500;
	}
</style>
