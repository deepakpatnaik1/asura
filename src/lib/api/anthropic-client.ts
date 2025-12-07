import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { TIMING } from '$lib/config/timing';

/**
 * Anthropic API Client Wrapper
 * Provides simplified interface for creating messages with Claude models
 * and uploading files to Anthropic Files API
 */

const anthropic = new Anthropic({
	apiKey: ANTHROPIC_API_KEY
});

/**
 * Parameters for creating a message
 */
export interface CreateMessageParams {
	model: string;
	max_tokens: number;
	temperature: number;
	system: string | Anthropic.Messages.TextBlockParam[];
	messages: Array<{
		role: 'user' | 'assistant';
		content: string | Anthropic.Messages.MessageParam['content'];
	}>;
}

/**
 * Create a message using Anthropic API
 *
 * @param params - Message creation parameters
 * @returns Promise<Anthropic.Message> - Anthropic message response
 *
 * @example
 * const response = await createMessage({
 *   model: 'claude-sonnet-4-5-20250929',
 *   max_tokens: 2048,
 *   temperature: 0.7,
 *   system: 'You are a helpful assistant',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
 */
export async function createMessage(params: CreateMessageParams): Promise<Anthropic.Message> {
	return await anthropic.messages.create({
		model: params.model,
		max_tokens: params.max_tokens,
		temperature: params.temperature,
		system: params.system,
		messages: params.messages
	}, {
		headers: {
			'anthropic-beta': 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11,files-api-2025-04-14'
		}
	});
}

/**
 * Create a streaming message using Anthropic API
 *
 * @param params - Message creation parameters
 * @returns Promise<Stream<MessageStreamEvent>> - Anthropic streaming response
 *
 * @example
 * const stream = await createMessageStream({
 *   model: 'claude-sonnet-4-5-20250929',
 *   max_tokens: 2048,
 *   temperature: 0.7,
 *   system: 'You are a helpful assistant',
 *   messages: [{ role: 'user', content: 'Hello!' }]
 * });
 * for await (const event of stream) {
 *   if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
 *     process.stdout.write(event.delta.text);
 *   }
 * }
 */
export async function createMessageStream(params: CreateMessageParams) {
	return await anthropic.messages.stream({
		model: params.model,
		max_tokens: params.max_tokens,
		temperature: params.temperature,
		system: params.system,
		messages: params.messages
	}, {
		headers: {
			'anthropic-beta': 'prompt-caching-2024-07-31,extended-cache-ttl-2025-04-11'
		},
		timeout: TIMING.streamingTimeout
	});
}

/**
 * Detect MIME type from file buffer
 */
function detectMimeType(buffer: Buffer, filename: string): string {
	// Check magic numbers (file signatures)
	if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
		return 'image/jpeg';
	}
	if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
		return 'image/png';
	}
	if (buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
		return 'image/gif';
	}
	if (buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46) {
		return 'image/webp';
	}
	if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
		return 'application/pdf';
	}

	// Fallback to extension-based detection
	const ext = filename.toLowerCase().split('.').pop();
	const mimeMap: Record<string, string> = {
		pdf: 'application/pdf',
		jpg: 'image/jpeg',
		jpeg: 'image/jpeg',
		png: 'image/png',
		gif: 'image/gif',
		webp: 'image/webp'
	};

	return mimeMap[ext || ''] || 'application/octet-stream';
}

/**
 * Upload a file to Anthropic Files API
 *
 * @param fileBuffer - File buffer (PDF or image)
 * @param filename - Filename for the upload (e.g., 'article.pdf', 'chart-1.jpg')
 * @returns Promise containing file_id and created_at timestamp
 *
 * @example
 * const result = await uploadFileToAnthropic(pdfBuffer, 'article.pdf');
 * console.log(result.file_id); // Use this ID in messages API
 */
export async function uploadFileToAnthropic(
	fileBuffer: Buffer,
	filename: string
): Promise<{ file_id: string; created_at: Date }> {
	// Detect MIME type from buffer or filename
	const mimeType = detectMimeType(fileBuffer, filename);

	// Anthropic SDK expects a File or Blob, convert Buffer to Blob
	// Convert Buffer to Uint8Array to satisfy TypeScript's BlobPart type
	const uint8Array = new Uint8Array(fileBuffer);
	const blob = new Blob([uint8Array], { type: mimeType });
	const file = new File([blob], filename, { type: mimeType });

	// Use beta Files API (requires anthropic-beta header)
	const response = await anthropic.beta.files.upload({
		file: file
	});

	return {
		file_id: response.id,
		created_at: new Date(response.created_at) // created_at is RFC 3339 string
	};
}

/**
 * Upload file with retry logic (3 attempts with exponential backoff)
 *
 * @param fileBuffer - PDF file buffer
 * @param filename - Filename for the upload
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @returns Promise containing file_id and created_at, or null if all retries fail
 */
export async function uploadFileWithRetry(
	fileBuffer: Buffer,
	filename: string,
	maxRetries = 3
): Promise<{ file_id: string; created_at: Date } | null> {
	for (let attempt = 1; attempt <= maxRetries; attempt++) {
		try {
			const result = await uploadFileToAnthropic(fileBuffer, filename);
			return result;
		} catch (error) {
			if (attempt < maxRetries) {
				// Exponential backoff: 1s, 2s, 4s
				const delayMs = Math.pow(2, attempt - 1) * 1000;
				await new Promise((resolve) => setTimeout(resolve, delayMs));
			} else {
				return null; // Graceful degradation
			}
		}
	}

	return null;
}

/**
 * Check if an Anthropic file ID has expired
 * Anthropic Files API files expire after 7 days
 *
 * @param createdAt - Date when the file was created (from anthropic_file_created_at)
 * @param expirationDays - Number of days until expiration (default: 7)
 * @returns true if file has expired, false otherwise
 *
 * @example
 * const isExpired = isAnthropicFileExpired(article.anthropic_file_created_at);
 * if (isExpired) {
 *   // Re-upload file
 * }
 */
export function isAnthropicFileExpired(createdAt: Date | string, expirationDays = 7): boolean {
	const createdDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
	const now = new Date();
	const daysSinceCreation = (now.getTime() - createdDate.getTime()) / (1000 * 60 * 60 * 24);

	return daysSinceCreation >= expirationDays;
}

/**
 * Get expiration date for an Anthropic file
 *
 * @param createdAt - Date when the file was created
 * @param expirationDays - Number of days until expiration (default: 7)
 * @returns Date when the file will expire
 *
 * @example
 * const expiresAt = getAnthropicFileExpirationDate(article.anthropic_file_created_at);
 * console.log(`File expires on: ${expiresAt.toISOString()}`);
 */
export function getAnthropicFileExpirationDate(
	createdAt: Date | string,
	expirationDays = 7
): Date {
	const createdDate = typeof createdAt === 'string' ? new Date(createdAt) : createdAt;
	const expirationDate = new Date(createdDate);
	expirationDate.setDate(expirationDate.getDate() + expirationDays);

	return expirationDate;
}
