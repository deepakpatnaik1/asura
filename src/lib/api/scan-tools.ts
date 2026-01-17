/**
 * Scan Tools - Paper mail scanning for Felix
 *
 * Watches /Users/d.patnaik/paper-scans for new PDFs
 * Converts to JPEG for lightweight Grok evaluation
 * Same pattern as Gmail: needs_attention + addressed_at
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs/promises';
import * as path from 'path';
import sharp from 'sharp';
import chokidar from 'chokidar';
import { supabaseAdmin } from '$lib/supabase-admin';

const execAsync = promisify(exec);

const SCAN_FOLDER = '/Users/d.patnaik/paper-scans';
const GMAIL_USER_ID = '8288224b-40c0-41e3-aa30-5bd704533524';

// Track active watcher
let scanWatcher: chokidar.FSWatcher | null = null;

/**
 * Convert PDF to JPEG using pdftoppm + Sharp
 * Returns base64-encoded JPEG
 */
export async function convertPdfToJpeg(pdfPath: string): Promise<string> {
	const tempDir = '/tmp/felix-scans';
	await fs.mkdir(tempDir, { recursive: true });

	const baseName = path.basename(pdfPath, '.pdf');
	const tempPpmBase = path.join(tempDir, baseName);

	try {
		// pdftoppm converts PDF to PPM (first page only with -singlefile)
		// -r 150 = 150 DPI (good balance of quality vs size)
		await execAsync(`pdftoppm -jpeg -r 150 -singlefile "${pdfPath}" "${tempPpmBase}"`);

		const jpegPath = `${tempPpmBase}.jpg`;

		// Read and optimize with Sharp
		const optimizedBuffer = await sharp(jpegPath)
			.jpeg({ quality: 80, mozjpeg: true })
			.toBuffer();

		// Clean up temp file
		await fs.unlink(jpegPath).catch(() => {});

		return optimizedBuffer.toString('base64');
	} catch (error) {
		console.error('[ScanTools] PDF conversion failed:', error);
		throw error;
	}
}

/**
 * Process a new scanned file (PDF or JPEG)
 */
export async function processScannedFile(filePath: string): Promise<void> {
	const fileName = path.basename(filePath);
	const ext = path.extname(filePath).toLowerCase();
	console.log(`[ScanTools] Processing new scan: ${fileName}`);

	try {
		// Check if already processed
		const { data: existing } = await supabaseAdmin
			.from('scanned_documents')
			.select('id')
			.eq('file_path', filePath)
			.single();

		if (existing) {
			console.log(`[ScanTools] Already processed: ${fileName}`);
			return;
		}

		let jpegBase64: string;

		if (ext === '.pdf') {
			// Convert PDF to JPEG
			jpegBase64 = await convertPdfToJpeg(filePath);
			console.log(`[ScanTools] Converted PDF to JPEG: ${(jpegBase64.length / 1024).toFixed(1)}KB`);
		} else if (ext === '.jpg' || ext === '.jpeg') {
			// Already JPEG - optimize with Sharp
			const optimizedBuffer = await sharp(filePath)
				.jpeg({ quality: 80, mozjpeg: true })
				.toBuffer();
			jpegBase64 = optimizedBuffer.toString('base64');
			console.log(`[ScanTools] Optimized JPEG: ${(jpegBase64.length / 1024).toFixed(1)}KB`);
		} else {
			console.log(`[ScanTools] Unsupported file type: ${ext}`);
			return;
		}

		// Store in database (unevaluated - will be picked up by cron)
		const { error } = await supabaseAdmin.from('scanned_documents').insert({
			user_id: GMAIL_USER_ID,
			file_path: filePath,
			file_name: fileName,
			jpeg_base64: jpegBase64,
			scanned_at: new Date().toISOString()
		});

		if (error) {
			console.error('[ScanTools] Failed to store scan:', error);
			return;
		}

		console.log(`[ScanTools] Stored scan: ${fileName}`);
	} catch (error) {
		console.error(`[ScanTools] Error processing ${fileName}:`, error);
	}
}

/**
 * Process a new scanned PDF (legacy alias)
 */
export async function processScannedPdf(pdfPath: string): Promise<void> {
	return processScannedFile(pdfPath);
}

/**
 * Process existing files in the scan folder that aren't already in the database.
 * Called on startup to catch files added while Aether wasn't running.
 */
async function processExistingScans(): Promise<void> {
	try {
		const files = await fs.readdir(SCAN_FOLDER);
		const scanFiles = files.filter(f =>
			f.toLowerCase().endsWith('.pdf') ||
			f.toLowerCase().endsWith('.jpg') ||
			f.toLowerCase().endsWith('.jpeg')
		);

		if (scanFiles.length === 0) {
			console.log('[ScanTools] No existing scans to process');
			return;
		}

		console.log(`[ScanTools] Found ${scanFiles.length} existing scan(s), checking for unprocessed...`);

		for (const file of scanFiles) {
			const filePath = path.join(SCAN_FOLDER, file);

			// Check if already in database
			const { data: existing } = await supabaseAdmin
				.from('scanned_documents')
				.select('id')
				.eq('file_path', filePath)
				.single();

			if (!existing) {
				console.log(`[ScanTools] Processing existing scan: ${file}`);
				await processScannedFile(filePath);
			}
		}
	} catch (error) {
		console.error('[ScanTools] Error processing existing scans:', error);
	}
}

/**
 * Start watching the scan folder
 * Watches for both PDFs and JPEGs (scanner may output either)
 */
export function startScanWatcher(): void {
	if (scanWatcher) {
		console.log('[ScanTools] Watcher already running');
		return;
	}

	console.log(`[ScanTools] Starting watcher on ${SCAN_FOLDER}`);

	// Watch for both PDFs and JPEGs
	scanWatcher = chokidar.watch([`${SCAN_FOLDER}/*.pdf`, `${SCAN_FOLDER}/*.jpg`, `${SCAN_FOLDER}/*.jpeg`], {
		persistent: true,
		ignoreInitial: true, // Watcher ignores existing files (we handle them separately)
		awaitWriteFinish: {
			stabilityThreshold: 2000, // Wait 2s for file to finish writing
			pollInterval: 100
		}
	});

	scanWatcher.on('add', (filePath) => {
		console.log(`[ScanTools] New scan detected: ${filePath}`);
		processScannedFile(filePath);
	});

	scanWatcher.on('error', (error) => {
		console.error('[ScanTools] Watcher error:', error);
	});

	// Process any existing files that were added while Aether wasn't running
	processExistingScans();
}

/**
 * Stop the scan watcher
 */
export async function stopScanWatcher(): Promise<void> {
	if (scanWatcher) {
		await scanWatcher.close();
		scanWatcher = null;
		console.log('[ScanTools] Watcher stopped');
	}
}

/**
 * Get unevaluated scanned documents
 */
export async function getUnevaluatedScans(): Promise<
	Array<{
		id: string;
		file_name: string;
		jpeg_base64: string;
		scanned_at: string;
	}>
> {
	const { data, error } = await supabaseAdmin
		.from('scanned_documents')
		.select('id, file_name, jpeg_base64, scanned_at')
		.eq('user_id', GMAIL_USER_ID)
		.is('evaluated_at', null)
		.order('scanned_at', { ascending: true });

	if (error) {
		console.error('[ScanTools] Error fetching unevaluated scans:', error);
		return [];
	}

	return data || [];
}

/**
 * Mark scan as evaluated
 */
export async function markScanEvaluated(
	scanId: string,
	needsAttention: boolean,
	reason: string
): Promise<void> {
	const { error } = await supabaseAdmin
		.from('scanned_documents')
		.update({
			evaluated_at: new Date().toISOString(),
			needs_attention: needsAttention,
			evaluation_reason: reason
		})
		.eq('id', scanId);

	if (error) {
		console.error('[ScanTools] Error marking scan evaluated:', error);
	}
}

/**
 * Get pending scans (needs attention, not addressed)
 */
export async function getPendingScans(): Promise<
	Array<{
		id: string;
		file_name: string;
		file_path: string;
		scanned_at: string;
		evaluation_reason: string;
	}>
> {
	const { data, error } = await supabaseAdmin
		.from('scanned_documents')
		.select('id, file_name, file_path, scanned_at, evaluation_reason')
		.eq('user_id', GMAIL_USER_ID)
		.eq('needs_attention', true)
		.is('addressed_at', null)
		.order('scanned_at', { ascending: false });

	if (error) {
		console.error('[ScanTools] Error fetching pending scans:', error);
		return [];
	}

	return data || [];
}

/**
 * Get count of pending scans
 */
export async function getPendingScanCount(): Promise<number> {
	const { count, error } = await supabaseAdmin
		.from('scanned_documents')
		.select('*', { count: 'exact', head: true })
		.eq('user_id', GMAIL_USER_ID)
		.eq('needs_attention', true)
		.is('addressed_at', null);

	if (error) {
		console.error('[ScanTools] Error counting pending scans:', error);
		return 0;
	}

	return count || 0;
}

/**
 * Mark scan as addressed
 */
export async function markScanAddressed(scanId: string): Promise<{ success: boolean; error?: string }> {
	const { error } = await supabaseAdmin
		.from('scanned_documents')
		.update({ addressed_at: new Date().toISOString() })
		.eq('id', scanId);

	if (error) {
		return { success: false, error: error.message };
	}

	return { success: true };
}

// ============================================================================
// Felix Tool Definitions
// ============================================================================

export const scanToolDefinitions = [
	{
		name: 'scan_paper_folder',
		description:
			'Scan the paper-scans folder for new documents. Use this to check if Boss has scanned any new paper mail. Returns a list of newly found documents.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'list_pending_scans',
		description:
			'List scanned paper documents that need attention. Returns documents that Felix flagged as important but Boss has not yet addressed.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'mark_scan_addressed',
		description:
			'Mark a scanned document as addressed/handled. Use after Boss has dealt with the document.',
		input_schema: {
			type: 'object' as const,
			properties: {
				scan_id: {
					type: 'string',
					description: 'The ID of the scanned document to mark as addressed'
				}
			},
			required: ['scan_id']
		}
	}
];

/**
 * Execute Felix scan tools
 */
export async function executeScanTool(
	toolName: string,
	input: Record<string, unknown>
): Promise<string> {
	switch (toolName) {
		case 'scan_paper_folder': {
			// Scan the folder for new/unprocessed files
			const files = await fs.readdir(SCAN_FOLDER).catch(() => []);
			const scanFiles = (files as string[]).filter(
				(f) =>
					f.toLowerCase().endsWith('.pdf') ||
					f.toLowerCase().endsWith('.jpg') ||
					f.toLowerCase().endsWith('.jpeg')
			);

			if (scanFiles.length === 0) {
				return 'Paper scans folder is empty. No documents found.';
			}

			// Check which files are already processed
			const newFiles: string[] = [];
			const existingFiles: string[] = [];

			for (const file of scanFiles) {
				const filePath = path.join(SCAN_FOLDER, file);
				const { data: existing } = await supabaseAdmin
					.from('scanned_documents')
					.select('id')
					.eq('file_path', filePath)
					.single();

				if (existing) {
					existingFiles.push(file);
				} else {
					newFiles.push(file);
					// Process the new file
					await processScannedFile(filePath);
				}
			}

			if (newFiles.length === 0) {
				return `Found ${existingFiles.length} document(s) in the folder, all already processed. Use \`list_pending_scans\` to see which ones need attention.`;
			}

			return `**Scanned ${newFiles.length} new document(s):**\n${newFiles.map((f) => `- ${f}`).join('\n')}\n\nThese will be evaluated shortly. Use \`list_pending_scans\` to see results.`;
		}

		case 'list_pending_scans': {
			const scans = await getPendingScans();
			if (scans.length === 0) {
				return 'No scanned documents pending attention.';
			}

			const lines = scans.map((scan, i) => {
				const date = new Date(scan.scanned_at).toLocaleDateString('en-GB', {
					day: 'numeric',
					month: 'short'
				});
				return `${i + 1}. **${scan.file_name}** (scanned ${date})\n   ID: \`${scan.id}\`\n   Reason: ${scan.evaluation_reason}`;
			});

			return `**${scans.length} scanned document(s) need attention:**\n\n${lines.join('\n\n')}`;
		}

		case 'mark_scan_addressed': {
			const scanId = input.scan_id as string;
			if (!scanId) {
				return 'Error: scan_id is required';
			}

			const result = await markScanAddressed(scanId);
			if (result.success) {
				return `Marked scan as addressed.`;
			} else {
				return `Error: ${result.error}`;
			}
		}

		default:
			return `Unknown tool: ${toolName}`;
	}
}
