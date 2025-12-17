import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [sveltekit()],
	server: {
		proxy: {
			// Proxy Supabase storage requests to avoid Safari cross-origin blocking
			'/storage': {
				target: 'http://localhost:54321',
				changeOrigin: true
			}
		}
	}
});
