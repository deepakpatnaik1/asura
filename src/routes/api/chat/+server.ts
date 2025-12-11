/**
 * Chat API Endpoint
 *
 * Streams AI responses for conversation turns.
 * Saves to superjournal and triggers background compression.
 */

import type { RequestHandler } from './$types';
import type Anthropic from '@anthropic-ai/sdk';
import { buildContext } from '$lib/context-builder';
import { DEFAULT_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { DEFAULT_PERSONA, getPersonaTools } from '$lib/config/personas';
import { getPersonaPrompt } from '$lib/prompts';
import {
	converseStream,
	converseStreamFireworks,
	converseStreamOpenRouter,
	saveToSuperjournal,
	triggerBackgroundJobs,
	getProviderType,
	assertProviderSupported,
	type ChartImageData,
	type ToolExecutor
} from '$lib/calls';
import { CALENDAR_TOOLS, executeCalendarTool, type CalendarToolContext } from '$lib/api/calendar-tools';
import {
	TODO_TOOLS,
	executeTodoTool,
	isTodoTool,
	createEmptyMutations,
	type TodoToolContext,
	type TodoMutations
} from '$lib/api/todo-tools';
import {
	WHITEBOARD_TOOLS,
	executeWhiteboardTool,
	isWhiteboardTool,
	createEmptyWhiteboardMutations,
	type WhiteboardToolContext,
	type WhiteboardMutations
} from '$lib/api/whiteboard-tools';
import {
	CANVAS_TOOLS,
	executeCanvasTool,
	isCanvasTool,
	createEmptyCanvasMutations,
	type CanvasToolContext,
	type CanvasMutations
} from '$lib/api/canvas-tools';
import {
	SAKURA_TOOLS,
	executeSakuraTool,
	isSakuraTool,
	type SakuraToolContext
} from '$lib/api/sakura-tools';
import { refreshAccessToken } from '$lib/api/google-calendar';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

// Service role client for storage operations
const supabaseStorage = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
import { parseRequestJson } from '$lib/api/parse-json';
import { requireAuth } from '$lib/api/require-auth';
import { waitForRateLimit, RATE_LIMITS } from '$lib/api/rate-limit';
import { createLogger, createSimpleLogger } from '$lib/api/logger';
import { chatMessageSchema, validateSchema } from '$lib/schemas';
import { internalError } from '$lib/api/errors';

// Background logger (no request context)
const bgLog = createSimpleLogger('ChatAPI');

/**
 * Extract message content (everything outside <think> tags)
 */
function extractMessage(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	try {
		// 1. AUTHENTICATION CHECK
		const auth = await requireAuth(safeGetSession);
		if (!auth.success) return auth.error;
		const { userId } = auth;

		const log = createLogger('ChatAPI', userId);

		// 2. RATE LIMIT (waits silently if needed)
		await waitForRateLimit(userId, RATE_LIMITS.ai);

		// 3. Parse and validate request first (need mode for settings)
		const parseResult = await parseRequestJson<unknown>(request);
		if (!parseResult.success) return parseResult.error;

		const validation = validateSchema(chatMessageSchema, parseResult.data);
		if (!validation.success) return validation.error;

		const { message, persona: requestPersona, chart_id, chart_source, content_ids, whiteboard_ids, canvas_ids } = validation.data;

		// 4. Load user settings (persona and model)
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_persona, default_model')
			.eq('user_id', userId)
			.single();

		const persona = requestPersona || settings?.selected_persona || DEFAULT_PERSONA;

		// Check for per-persona model override
		const { data: modelOverride } = await supabase
			.from('model_overrides')
			.select('model')
			.eq('user_id', userId)
			.eq('persona', persona)
			.single();

		const conversationModel = modelOverride?.model || settings?.default_model || DEFAULT_MODEL;

		// Fetch image_gen model override for Eva's generate_image tool
		const { data: imageModelOverride } = await supabase
			.from('model_overrides')
			.select('model')
			.eq('user_id', userId)
			.eq('persona', 'image_gen')
			.single();
		const defaultImageModel = imageModelOverride?.model;

		// 5. Fetch chart image if referenced
		let chartImage: ChartImageData | null = null;
		if (chart_id && chart_source) {
			try {
				// All charts stored in 'content' bucket
				const bucket = 'content';

				const { data: chartData, error: chartError } = await supabase
					.from('charts')
					.select('storage_path')
					.eq('id', chart_id)
					.eq('user_id', userId)
					.single();

				if (!chartError && chartData?.storage_path) {
					log.debug('Fetching chart image', { storagePath: chartData.storage_path, source: chart_source });

					// Download image from Supabase storage
					const { data: imageBlob, error: downloadError } = await supabaseStorage.storage
						.from(bucket)
						.download(chartData.storage_path);

					if (!downloadError && imageBlob) {
						const arrayBuffer = await imageBlob.arrayBuffer();
						const base64 = Buffer.from(arrayBuffer).toString('base64');

						// Detect media type from storage path
						const ext = chartData.storage_path.split('.').pop()?.toLowerCase();
						let mediaType: ChartImageData['mediaType'] = 'image/jpeg';
						if (ext === 'png') mediaType = 'image/png';
						else if (ext === 'gif') mediaType = 'image/gif';
						else if (ext === 'webp') mediaType = 'image/webp';
						else if (ext === 'svg') mediaType = 'image/png'; // SVG will be handled specially

						chartImage = { base64, mediaType };
						log.debug('Chart image loaded', { sizeBytes: base64.length });
					} else {
						log.warn('Failed to download chart image', { error: downloadError?.message });
					}
				} else {
					log.debug('Chart not found', { chartId: chart_id, source: chart_source });
				}
			} catch (err) {
				log.warn('Error fetching chart', { error: err instanceof Error ? err.message : 'Unknown' });
			}
		}

		// 6. Validate provider support
		const conversationProvider = getProviderType(conversationModel);
		assertProviderSupported(conversationProvider);

		// 6. Build context and get model params
		const conversationParams = await getModelParams(conversationModel, 'conversation');

		const { context, stats } = await buildContext(
			supabase,
			userId,
			persona,
			conversationModel,
			message,
			content_ids,
			whiteboard_ids,
			canvas_ids
		);

		log.info('Context built', { ...stats, model: conversationModel, persona });

		// 7. Select persona prompt
		const personaPrompt = getPersonaPrompt(persona);

		// 8. Set up tools based on persona configuration
		let tools: Anthropic.Tool[] | undefined;
		let toolExecutor: ToolExecutor | undefined;
		let todoMutations: TodoMutations | undefined;
		let whiteboardMutations: WhiteboardMutations | undefined;
		let canvasMutations: CanvasMutations | undefined;

		const personaTools = getPersonaTools(persona);

		if (personaTools.length > 0) {
			// Persona has tools configured
			const allTools: Anthropic.Tool[] = [BRAVE_SEARCH_TOOL]; // Everyone gets web search

			// Check which tool categories this persona has
			const hasTodoTools = personaTools.some(t => isTodoTool(t));
			const hasWhiteboardTools = personaTools.some(t => isWhiteboardTool(t));
			const hasCanvasTools = personaTools.some(t => isCanvasTool(t));
			const hasSakuraTools = personaTools.some(t => isSakuraTool(t));

			// Set up todo tools context (Alicja)
			let todoContext: TodoToolContext | null = null;
			let calendarContext: CalendarToolContext | null = null;

			if (hasTodoTools) {
				todoMutations = createEmptyMutations();
				todoContext = { supabase, userId };
				allTools.push(...TODO_TOOLS);

				// Add calendar tools if user has Google Calendar tokens
				const { data: tokens } = await supabase
					.from('google_tokens')
					.select('access_token, refresh_token, expires_at')
					.eq('user_id', userId)
					.single();

				if (tokens) {
					let accessToken = tokens.access_token;
					const expiresAt = new Date(tokens.expires_at);
					const now = new Date();

					// Refresh if expires in less than 5 minutes
					if (expiresAt.getTime() - now.getTime() < 5 * 60 * 1000) {
						try {
							const refreshed = await refreshAccessToken(tokens.refresh_token);
							accessToken = refreshed.access_token;

							await supabase
								.from('google_tokens')
								.update({
									access_token: refreshed.access_token,
									expires_at: refreshed.expires_at.toISOString(),
									updated_at: new Date().toISOString()
								})
								.eq('user_id', userId);
						} catch (err) {
							log.warn('Calendar token refresh failed', { error: err instanceof Error ? err.message : 'Unknown' });
						}
					}

					calendarContext = { accessToken };
					allTools.push(...CALENDAR_TOOLS);
				}
			}

			// Set up whiteboard tools context (Gunnar)
			let whiteboardContext: WhiteboardToolContext | null = null;

			if (hasWhiteboardTools) {
				whiteboardMutations = createEmptyWhiteboardMutations();
				whiteboardContext = { supabase, userId };
				allTools.push(...WHITEBOARD_TOOLS);
			}

			// Set up canvas tools context (Eva - character design canvases)
			let canvasContext: CanvasToolContext | null = null;

			if (hasCanvasTools) {
				canvasMutations = createEmptyCanvasMutations();
				canvasContext = { supabase, userId };
				allTools.push(...CANVAS_TOOLS);
			}

			// Set up sakura tools context (Eva - image generation + export)
			let sakuraContext: SakuraToolContext | null = null;

			if (hasSakuraTools) {
				sakuraContext = { userId, supabase, defaultImageModel };
				allTools.push(...SAKURA_TOOLS);
			}

			tools = allTools;

			// Tool executor handles all tool types
			toolExecutor = async (toolName, input) => {
				if (toolName === 'brave_search') {
					// Web search (available to all personas)
					const searchQuery = (input as { query: string }).query;
					const searchResults = await executeBraveSearch(searchQuery);
					return {
						success: !!searchResults,
						message: searchResults || 'Search failed'
					};
				} else if (isSakuraTool(toolName) && sakuraContext) {
					return executeSakuraTool(toolName, input, sakuraContext);
				} else if (isCanvasTool(toolName) && canvasContext) {
					return executeCanvasTool(toolName, input, canvasContext, canvasMutations!);
				} else if (isWhiteboardTool(toolName) && whiteboardContext) {
					return executeWhiteboardTool(toolName, input, whiteboardContext, whiteboardMutations!);
				} else if (isTodoTool(toolName) && todoContext) {
					return executeTodoTool(toolName, input, todoContext, todoMutations!);
				} else if (calendarContext) {
					return executeCalendarTool(toolName, input, calendarContext, todoMutations);
				} else {
					return {
						success: false,
						message: `Tool ${toolName} not available for this persona.`
					};
				}
			};
		}
		// Else: tools = undefined, converse.ts defaults to BRAVE_SEARCH_TOOL only

		// 9. Stream response
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();

				try {
					// Route to appropriate provider implementation
					const streamParams = {
						personaPrompt,
						context,
						message,
						model: conversationModel,
						maxTokens: conversationParams.max_tokens,
						temperature: conversationParams.temperature,
						chartImage,
						tools,
						toolExecutor
					};

					// Route to appropriate provider implementation
					const generator =
						conversationProvider === 'fireworks'
							? converseStreamFireworks(streamParams)
							: conversationProvider === 'openrouter'
								? converseStreamOpenRouter(streamParams)
								: converseStream(streamParams);

					let result;
					while (true) {
						const { value, done } = await generator.next();
						if (done) {
							result = value;
							break;
						}
						const data = JSON.stringify({ type: 'chunk', content: value });
						controller.enqueue(encoder.encode(`data: ${data}\n\n`));
					}

					const aiResponse = extractMessage(result.fullResponse);

					// Save to superjournal first to get the real ID
					// Store first content_id as primary (DB only supports single content_id)
					const superjournalId = await saveToSuperjournal({
						userId,
						message,
						aiResponse,
						conversationModel,
						persona,
						contentId: content_ids?.[0]
					});

					// Send completion event with real superjournal ID and mutations
					const doneData = JSON.stringify({
						type: 'done',
						timestamp: new Date().toISOString(),
						model_identifier: conversationModel,
						superjournal_id: superjournalId,
						...(todoMutations && {
							mutations: todoMutations
						}),
						...(whiteboardMutations && {
							whiteboard_mutations: whiteboardMutations
						}),
						...(canvasMutations && {
							canvas_mutations: canvasMutations
						})
					});
					controller.enqueue(encoder.encode(`data: ${doneData}\n\n`));
					controller.close();

					// Trigger background jobs after stream closes
					if (superjournalId) {
						triggerBackgroundJobs({
							superjournalId,
							userId,
							message,
							aiResponse,
							persona
						});
					}
				} catch (error) {
					log.error('Streaming error', {
						error: error instanceof Error ? error.message : 'Unknown'
					});
					const errorData = JSON.stringify({
						type: 'error',
						message: 'Failed to generate response'
					});
					controller.enqueue(encoder.encode(`data: ${errorData}\n\n`));
					controller.close();
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				Connection: 'keep-alive'
			}
		});
	} catch (error) {
		bgLog.error('Chat API error', {
			error: error instanceof Error ? error.message : 'Unknown'
		});
		return internalError('Failed to generate response');
	}
};
