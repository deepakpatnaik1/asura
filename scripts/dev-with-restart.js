#!/usr/bin/env node

/**
 * Dev Server Sidecar
 *
 * Runs alongside Vite and provides restart capability.
 * The sidecar stays alive across restarts - it manages Vite's lifecycle.
 *
 * Features:
 *   - Auto-restart on crash (self-healing)
 *   - Crash loop prevention (max 3 retries in 30s)
 *   - Manual restart via HTTP endpoint
 *
 * Endpoints (port 5199):
 *   GET  /status  - { running: bool, ready: bool }
 *   POST /restart - kills vite, waits, restarts, returns when ready
 */

import { spawn, execSync } from 'child_process';
import http from 'http';

const SIDECAR_PORT = 5199;
const VITE_PORT = 5173;
const READY_TIMEOUT = 30000; // 30s max wait for ready

// Auto-restart config
const AUTO_RESTART_DELAY = 2000; // 2s delay before auto-restart
const CRASH_WINDOW = 30000; // 30s window to track crashes
const MAX_CRASHES = 3; // max crashes in window before giving up

let viteProcess = null;
let isReady = false;
let intentionalKill = false;
let crashTimestamps = [];

/**
 * Check if Vite is responding and fully ready
 */
async function checkViteReady() {
	try {
		const controller = new AbortController();
		const timeout = setTimeout(() => controller.abort(), 2000);

		const res = await fetch(`http://localhost:${VITE_PORT}/`, {
			signal: controller.signal
		});
		clearTimeout(timeout);

		// Check for actual HTML content (not just a response)
		const text = await res.text();
		return text.includes('<!doctype html') || text.includes('<!DOCTYPE html');
	} catch {
		return false;
	}
}

/**
 * Wait for Vite to be fully ready
 */
async function waitForReady(timeout = READY_TIMEOUT) {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		if (await checkViteReady()) {
			return true;
		}
		await new Promise(r => setTimeout(r, 500));
	}

	return false;
}

/**
 * Kill any process on the Vite port
 */
function killPortProcess() {
	try {
		const pids = execSync(`lsof -ti :${VITE_PORT}`, { encoding: 'utf8' }).trim();
		if (pids) {
			for (const pid of pids.split('\n')) {
				try {
					process.kill(parseInt(pid), 'SIGKILL');
				} catch { /* already dead */ }
			}
		}
	} catch { /* no process on port */ }
}

/**
 * Wait for port to be free
 */
async function waitForPortFree(timeout = 10000) {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		try {
			execSync(`lsof -ti :${VITE_PORT}`, { encoding: 'utf8' });
			// Port still in use, wait
			await new Promise(r => setTimeout(r, 200));
		} catch {
			// No process on port - it's free
			return true;
		}
	}

	return false;
}

/**
 * Check if we're in a crash loop
 */
function isInCrashLoop() {
	const now = Date.now();
	// Remove old crashes outside the window
	crashTimestamps = crashTimestamps.filter(t => now - t < CRASH_WINDOW);
	return crashTimestamps.length >= MAX_CRASHES;
}

/**
 * Record a crash
 */
function recordCrash() {
	crashTimestamps.push(Date.now());
}

/**
 * Start Vite dev server
 */
function startVite() {
	isReady = false;

	// Clear caches for clean start
	try {
		execSync('rm -rf node_modules/.vite .svelte-kit', {
			cwd: process.cwd(),
			stdio: 'ignore'
		});
	} catch { /* ignore */ }

	// Sync SvelteKit
	try {
		execSync('npx svelte-kit sync', {
			cwd: process.cwd(),
			stdio: 'ignore'
		});
	} catch { /* ignore */ }

	viteProcess = spawn('npx', ['vite', 'dev'], {
		cwd: process.cwd(),
		stdio: 'inherit',
		detached: false
	});

	viteProcess.on('exit', (code) => {
		console.log(`[Sidecar] Vite exited with code ${code}`);
		isReady = false;
		viteProcess = null;

		// Auto-restart if not intentionally killed
		if (!intentionalKill) {
			recordCrash();

			if (isInCrashLoop()) {
				console.log(`[Sidecar] Crash loop detected (${MAX_CRASHES} crashes in ${CRASH_WINDOW / 1000}s). Waiting for manual restart.`);
				return;
			}

			console.log(`[Sidecar] Vite crashed, auto-restarting in ${AUTO_RESTART_DELAY / 1000}s...`);
			setTimeout(() => {
				if (!intentionalKill && !viteProcess) {
					startVite();
				}
			}, AUTO_RESTART_DELAY);
		}
	});

	// Start checking for ready state
	waitForReady().then(ready => {
		isReady = ready;
		if (ready) {
			console.log('[Sidecar] Vite is ready');
		} else {
			console.log('[Sidecar] Vite failed to become ready');
		}
	});
}

/**
 * Stop Vite
 */
async function stopVite() {
	intentionalKill = true;
	isReady = false;

	if (viteProcess) {
		viteProcess.kill('SIGTERM');
		viteProcess = null;
	}

	// Also kill anything on the port (zombie processes)
	killPortProcess();

	// Wait for port to be free
	await waitForPortFree();

	intentionalKill = false;
}

/**
 * Restart Vite
 */
async function restartVite() {
	// Clear crash history on manual restart
	crashTimestamps = [];

	console.log('[Sidecar] Stopping Vite...');
	await stopVite();

	console.log('[Sidecar] Starting Vite...');
	startVite();

	// Wait for ready
	const ready = await waitForReady();
	console.log(`[Sidecar] Restart complete, ready: ${ready}`);

	return ready;
}

/**
 * Check if something is listening on Vite port
 */
function isViteRunning() {
	try {
		execSync(`lsof -ti :${VITE_PORT}`, { encoding: 'utf8' });
		return true;
	} catch {
		return false;
	}
}

/**
 * HTTP Server
 */
const server = http.createServer(async (req, res) => {
	// CORS headers
	res.setHeader('Access-Control-Allow-Origin', '*');
	res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

	if (req.method === 'OPTIONS') {
		res.writeHead(204);
		res.end();
		return;
	}

	const url = new URL(req.url, `http://localhost:${SIDECAR_PORT}`);

	if (url.pathname === '/status' && req.method === 'GET') {
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({
			running: isViteRunning(),
			ready: isReady
		}));
		return;
	}

	if (url.pathname === '/restart' && req.method === 'POST') {
		const ready = await restartVite();
		res.writeHead(200, { 'Content-Type': 'application/json' });
		res.end(JSON.stringify({ success: ready, ready }));
		return;
	}

	res.writeHead(404);
	res.end('Not Found');
});

// Cleanup on exit
process.on('SIGINT', async () => {
	console.log('\n[Sidecar] Shutting down...');
	await stopVite();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await stopVite();
	process.exit(0);
});

// Start
server.listen(SIDECAR_PORT, () => {
	console.log(`[Sidecar] Running on port ${SIDECAR_PORT}`);
	console.log(`[Sidecar] Auto-restart enabled (max ${MAX_CRASHES} crashes per ${CRASH_WINDOW / 1000}s)`);
	startVite();
});
