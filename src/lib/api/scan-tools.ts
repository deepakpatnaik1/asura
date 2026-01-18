/**
 * Scan Tools - Paper mail scanning for Felix
 *
 * Watches /Users/d.patnaik/paper-scans for new PDFs/images
 * Felix can read PDFs directly using read_scan tool
 * Same pattern as Gmail: needs_attention + addressed_at
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import chokidar, { type FSWatcher } from 'chokidar';
import { supabaseAdmin } from '$lib/supabase-admin';

const SCAN_FOLDER = '/Users/d.patnaik/paper-scans';
const GMAIL_USER_ID = '8288224b-40c0-41e3-aa30-5bd704533524';

// Track active watcher
let scanWatcher: FSWatcher | null = null;

/**
 * Process a new scanned file (PDF or image)
 * Just stores metadata - Felix reads content on demand via read_scan
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

		// Only accept PDFs and images
		const validExtensions = ['.pdf', '.jpg', '.jpeg', '.png'];
		if (!validExtensions.includes(ext)) {
			console.log(`[ScanTools] Unsupported file type: ${ext}`);
			return;
		}

		// Store metadata only - Felix reads content on demand
		const { error } = await supabaseAdmin.from('scanned_documents').insert({
			user_id: GMAIL_USER_ID,
			file_path: filePath,
			file_name: fileName,
			scanned_at: new Date().toISOString(),
			needs_attention: true // All paper mail needs review
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
		const scanFiles = files.filter((f) => {
			const ext = f.toLowerCase();
			return ext.endsWith('.pdf') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png');
		});

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
 */
export function startScanWatcher(): void {
	if (scanWatcher) {
		console.log('[ScanTools] Watcher already running');
		return;
	}

	console.log(`[ScanTools] Starting watcher on ${SCAN_FOLDER}`);

	scanWatcher = chokidar.watch(
		[`${SCAN_FOLDER}/*.pdf`, `${SCAN_FOLDER}/*.jpg`, `${SCAN_FOLDER}/*.jpeg`, `${SCAN_FOLDER}/*.png`],
		{
			persistent: true,
			ignoreInitial: true,
			awaitWriteFinish: {
				stabilityThreshold: 2000,
				pollInterval: 100
			}
		}
	);

	scanWatcher.on('add', (filePath: string) => {
		console.log(`[ScanTools] New scan detected: ${filePath}`);
		processScannedFile(filePath);
	});

	scanWatcher.on('error', (error: unknown) => {
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
 * Get pending scans (needs attention, not addressed)
 */
export async function getPendingScans(): Promise<
	Array<{
		id: string;
		file_name: string;
		file_path: string;
		scanned_at: string;
	}>
> {
	const { data, error } = await supabaseAdmin
		.from('scanned_documents')
		.select('id, file_name, file_path, scanned_at')
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
 * Get a scan by ID
 */
export async function getScanById(scanId: string): Promise<{
	id: string;
	file_name: string;
	file_path: string;
	scanned_at: string;
} | null> {
	const { data, error } = await supabaseAdmin
		.from('scanned_documents')
		.select('id, file_name, file_path, scanned_at')
		.eq('id', scanId)
		.single();

	if (error || !data) {
		return null;
	}

	return data;
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

/**
 * Read PDF content using pdf-parse v2
 */
async function readPdfContent(filePath: string): Promise<string> {
	const { PDFParse } = await import('pdf-parse');
	const buffer = await fs.readFile(filePath);

	const parser = new PDFParse({ data: buffer });
	try {
		const result = await parser.getText();
		await parser.destroy();
		return result.text || '';
	} catch (error) {
		await parser.destroy();
		throw error;
	}
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
			'List scanned paper documents that need attention. Returns documents Boss has scanned but not yet reviewed with Felix.',
		input_schema: {
			type: 'object' as const,
			properties: {},
			required: []
		}
	},
	{
		name: 'read_scan',
		description:
			'Read the content of a scanned document. For PDFs, extracts and returns the text. Use this to see what a paper document contains so you can extract IBANs, amounts, deadlines, etc.',
		input_schema: {
			type: 'object' as const,
			properties: {
				scan_id: {
					type: 'string',
					description: 'The ID of the scanned document to read (from list_pending_scans)'
				}
			},
			required: ['scan_id']
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
export async function executeScanTool(toolName: string, input: Record<string, unknown>): Promise<string> {
	switch (toolName) {
		case 'scan_paper_folder': {
			const files = await fs.readdir(SCAN_FOLDER).catch(() => []);
			const scanFiles = (files as string[]).filter((f) => {
				const ext = f.toLowerCase();
				return ext.endsWith('.pdf') || ext.endsWith('.jpg') || ext.endsWith('.jpeg') || ext.endsWith('.png');
			});

			if (scanFiles.length === 0) {
				return 'Paper scans folder is empty. No documents found.';
			}

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
					await processScannedFile(filePath);
				}
			}

			if (newFiles.length === 0) {
				return `Found ${existingFiles.length} document(s) in the folder, all already processed. Use \`list_pending_scans\` to see which ones need attention.`;
			}

			return `**Scanned ${newFiles.length} new document(s):**\n${newFiles.map((f) => `- ${f}`).join('\n')}\n\nUse \`list_pending_scans\` to see all pending documents.`;
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
				return `${i + 1}. **${scan.file_name}** (scanned ${date})\n   ID: \`${scan.id}\``;
			});

			return `**${scans.length} scanned document(s) need attention:**\n\n${lines.join('\n\n')}\n\nUse \`read_scan\` with the ID to see the document content.`;
		}

		case 'read_scan': {
			const scanId = input.scan_id as string;
			if (!scanId) {
				return 'Error: scan_id is required';
			}

			const scan = await getScanById(scanId);
			if (!scan) {
				return 'Error: Scan not found. Use `list_pending_scans` to get valid IDs.';
			}

			const ext = path.extname(scan.file_path).toLowerCase();

			if (ext === '.pdf') {
				try {
					const text = await readPdfContent(scan.file_path);
					if (!text || text.trim().length === 0) {
						return `**${scan.file_name}**\n\nThis PDF appears to be a scanned image without extractable text. Ask Boss to share a screenshot so you can read it visually.`;
					}
					return `**${scan.file_name}**\n\n---\n\n${text.trim()}`;
				} catch (error) {
					console.error('[ScanTools] PDF read error:', error);
					return `Error reading PDF: ${error instanceof Error ? error.message : 'Unknown error'}. Ask Boss to share a screenshot instead.`;
				}
			} else {
				// Image file - can't extract text
				return `**${scan.file_name}**\n\nThis is an image file (${ext}). Ask Boss to share it so you can see the content visually.`;
			}
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
