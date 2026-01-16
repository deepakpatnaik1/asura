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
	converseStreamOpenAI,
	converseStreamGoogle,
	converseStreamTogether,
	converseStreamGroq,
	converseStreamReplicate,
	converseStreamVenice,
	saveToSuperjournal,
	triggerBackgroundJobs,
	getModelProvider,
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
	BLOCK_TOOLS,
	executeBlockTool,
	isBlockTool,
	createEmptyBlockMutations,
	type BlockToolContext,
	type BlockMutations
} from '$lib/api/block-tools';
import {
	WHITEBOARD_TOOLS,
	executeWhiteboardTool,
	isWhiteboardTool,
	createEmptyWhiteboardMutations,
	type WhiteboardToolContext,
	type WhiteboardMutations
} from '$lib/api/whiteboard-tools';
import {
	DESIGN_TOOLS,
	isDesignTool,
	executeDesignTool,
	createEmptyCanvasMutations,
	type CanvasMutations,
	type CanvasState,
	type DesignToolContext
} from '$lib/roles/design-lead';
import { refreshAccessToken } from '$lib/api/google-calendar';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';
import { REDDIT_TOOLS, executeRedditTool, isRedditTool } from '$lib/channels/reddit';
import { TEMPORAL_TOOLS, executeTemporalTool, isTemporalTool } from '$lib/api/temporal-tools';
import { ENGAGEMENT_TOOLS, executeEngagementTool, isEngagementTool } from '$lib/roles/community-manager/engagement';
import {
	GMAIL_TOOLS,
	executeGmailTool,
	isGmailTool,
	checkAndRenewGmailWatches,
	type GmailToolContext
} from '$lib/api/gmail-tools';
import {
	BROWSER_TOOLS,
	executeBrowserTool,
	isBrowserTool
} from '$lib/api/browser-tools';
import { parseToolIntents, hasToolIntents } from '$lib/api/tool-intent-parser';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY, VENICE_API_KEY } from '$env/static/private';

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

		// 1.5. GMAIL WATCH AUTO-RENEWAL (fire and forget)
		checkAndRenewGmailWatches().catch(() => {}); // Silent background check

		// 2. RATE LIMIT (waits silently if needed)
		await waitForRateLimit(userId, RATE_LIMITS.ai);

		// 3. Parse and validate request first (need mode for settings)
		const parseResult = await parseRequestJson<unknown>(request);
		if (!parseResult.success) return parseResult.error;

		const validation = validateSchema(chatMessageSchema, parseResult.data);
		if (!validation.success) return validation.error;

		const { message, persona: requestPersona, chart_id, chart_source, article_ids, whiteboard_ids, canvas_ids } = validation.data;

		// 4. Load user settings (persona and all model overrides in one query)
		const { data: settings } = await supabase
			.from('user_settings')
			.select(`selected_persona, default_model,
				model_gunnar, model_kirby, model_samara, model_alicja, model_eva, model_ananya,
				model_tool_calling, model_character_planning, model_image_gen, model_image_edit`)
			.eq('user_id', userId)
			.single();

		const persona = requestPersona || settings?.selected_persona || DEFAULT_PERSONA;

		// Get per-persona model override from settings
		const personaModelColumn = `model_${persona}`;
		const personaModel = settings ? (settings as Record<string, unknown>)[personaModelColumn] : null;
		const conversationModel = (personaModel as string) || settings?.default_model || DEFAULT_MODEL;

		// 5. Fetch chart image if referenced
		let chartImage: ChartImageData | null = null;
		if (chart_id && chart_source) {
			try {
				// All charts stored in 'content' bucket
				const bucket = 'content';

				const { data: chartData, error: chartError } = await supabase
					.from('article_charts')
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

		// 6. Look up provider and tool calling support from database
		const conversationProvider = await getModelProvider(supabase, conversationModel);
		assertProviderSupported(conversationProvider);

		// Check if model supports native tool calling
		const { data: modelData } = await supabase
			.from('models')
			.select('supports_tool_calling')
			.eq('model_identifier', conversationModel)
			.single();
		const supportsToolCalling = modelData?.supports_tool_calling ?? false;

		log.info('Model capabilities', { model: conversationModel, provider: conversationProvider, supportsToolCalling });

		// 7. Build context and get model params
		const conversationParams = await getModelParams(conversationModel, 'conversation');

		// Note: article_ids no longer passed - context builder uses owner-based injection
		const { context, stats } = await buildContext(
			supabase,
			userId,
			persona,
			conversationModel,
			message,
			whiteboard_ids,
			canvas_ids
		);

		log.info('Context built', { ...stats, model: conversationModel, persona });

		// 8. Select persona prompt
		const personaPrompt = getPersonaPrompt(persona);

		// 9. Set up tools based on persona configuration
		// Note: We set up contexts even if model doesn't support native tool calling,
		// so we can execute parsed tool_intent blocks from the response
		let tools: Anthropic.Tool[] | undefined;
		let toolExecutor: ToolExecutor | undefined;
		let todoMutations: TodoMutations | undefined;
		let blockMutations: BlockMutations | undefined;
		let whiteboardMutations: WhiteboardMutations | undefined;
		let canvasMutations: CanvasMutations | undefined;

		const personaTools = getPersonaTools(persona);

		// Tool contexts - needed for both native tool calling and parsed intents
		let todoContext: TodoToolContext | null = null;
		let blockContext: BlockToolContext | null = null;
		let calendarContext: CalendarToolContext | null = null;
		let whiteboardContext: WhiteboardToolContext | null = null;
		let designContext: DesignToolContext | null = null;
		let gmailContext: GmailToolContext | null = null;

		if (personaTools.length > 0) {
			// Persona has tools configured
			const allTools: Anthropic.Tool[] = [BRAVE_SEARCH_TOOL]; // Everyone gets web search

			// Check which tool categories this persona has
			const hasTodoTools = personaTools.some(t => isTodoTool(t));
			const hasWhiteboardTools = personaTools.some(t => isWhiteboardTool(t));
			const hasDesignTools = personaTools.some(t => isDesignTool(t));
			const hasRedditTools = personaTools.some(t => isRedditTool(t));
			const hasEngagementTools = personaTools.some(t => isEngagementTool(t));
			const hasTemporalTools = personaTools.some(t => isTemporalTool(t));
			const hasGmailTools = personaTools.some(t => isGmailTool(t));
			const hasBrowserTools = personaTools.some(t => isBrowserTool(t));

			log.info('Tool setup', {
				persona,
				personaTools,
				modelUsed: conversationModel,
				supportsToolCalling
			});

			// Set up todo tools context (Alicja, Felix)
			if (hasTodoTools) {
				todoMutations = createEmptyMutations();
				blockMutations = createEmptyBlockMutations();
				todoContext = { supabase: supabaseStorage, userId };
				blockContext = { supabase: supabaseStorage, userId };
				allTools.push(...TODO_TOOLS);
				allTools.push(...BLOCK_TOOLS);

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

				// Add Gmail tools if persona has them (Felix)
				if (hasGmailTools) {
					gmailContext = { userId };
					allTools.push(...GMAIL_TOOLS);
				}

				// Add browser tools if persona has them (Felix)
				if (hasBrowserTools) {
					allTools.push(...BROWSER_TOOLS);
				}
			}

			// Set up whiteboard tools context (Gunnar)
			if (hasWhiteboardTools) {
				whiteboardMutations = createEmptyWhiteboardMutations();
				whiteboardContext = { supabase, userId };
				allTools.push(...WHITEBOARD_TOOLS);
			}

			// Set up design tools context (Eva - canvas, character, image gen/edit)
			if (hasDesignTools) {
				canvasMutations = createEmptyCanvasMutations();

				const characterPlanningModel = settings?.model_character_planning as string | undefined;
				const imageGenModel = settings?.model_image_gen as string | undefined;
				const imageEditModel = settings?.model_image_edit as string | undefined;

				// Look up provider for the character planning model
				let characterPlanningProvider = 'openrouter';
				if (characterPlanningModel) {
					const { data: modelData } = await supabase
						.from('models')
						.select('provider')
						.eq('model_identifier', characterPlanningModel)
						.single();
					characterPlanningProvider = modelData?.provider || 'openrouter';
				}

				designContext = {
					userId,
					characterPlanningModel,
					characterPlanningProvider,
					imageGenModel,
					imageEditModel,
					apiKeys: {
						openrouter: OPENROUTER_API_KEY,
						venice: VENICE_API_KEY
					}
				};

				// Add only the design tools this persona has
				const personaDesignTools = DESIGN_TOOLS.filter(t => personaTools.includes(t.name as typeof personaTools[number]));
				allTools.push(...personaDesignTools);
			}

			// Set up Reddit tools (Ananya)
			if (hasRedditTools) {
				allTools.push(...REDDIT_TOOLS);
			}

			// Set up engagement tools (Ananya)
			if (hasEngagementTools) {
				allTools.push(...ENGAGEMENT_TOOLS);
			}

			// Set up temporal tools (all personas)
			if (hasTemporalTools) {
				allTools.push(...TEMPORAL_TOOLS);
			}

			// Only pass tools to model if it supports native tool calling
			if (supportsToolCalling) {
				tools = allTools;
				log.info('Final tools (native)', { toolCount: allTools.length, toolNames: allTools.map(t => t.name) });

				// Tool executor handles all tool types (for native tool calling)
				toolExecutor = async (toolName, input) => {
					return executeToolByName(toolName, input);
				};
			} else {
				// Model doesn't support native tool calling
				// Tools will be parsed from response as tool_intent blocks
				tools = undefined;
				toolExecutor = undefined;
				log.info('Tool calling disabled (model does not support)', { willParseIntents: true });
			}
		}

		// Shared tool executor function (used by both native and parsed intents)
		async function executeToolByName(
			toolName: string,
			input: Record<string, unknown>
		): Promise<{ success: boolean; message: string; data?: unknown }> {
			if (toolName === 'brave_search') {
				const searchQuery = (input as { query: string }).query;
				const searchResults = await executeBraveSearch(searchQuery);
				return {
					success: !!searchResults,
					message: searchResults || 'Search failed'
				};
			} else if (isWhiteboardTool(toolName) && whiteboardContext) {
				return executeWhiteboardTool(toolName, input, whiteboardContext, whiteboardMutations!);
			} else if (isDesignTool(toolName) && designContext) {
				const result = await executeDesignTool(toolName, input, designContext);
				// Merge mutations if present
				if (result.success && result.mutations && canvasMutations) {
					if (result.mutations.created_canvases.length > 0) {
						canvasMutations.created_canvases.push(...result.mutations.created_canvases);
					}
					if (result.mutations.renamed_canvases.length > 0) {
						canvasMutations.renamed_canvases.push(...result.mutations.renamed_canvases);
					}
					if (result.mutations.deleted_canvases.length > 0) {
						canvasMutations.deleted_canvases.push(...result.mutations.deleted_canvases);
					}
					if (result.mutations.opened_canvas) {
						canvasMutations.opened_canvas = result.mutations.opened_canvas;
					}
					if (result.mutations.closed_canvas) {
						canvasMutations.closed_canvas = result.mutations.closed_canvas;
					}
					if (result.mutations.updated_canvases.length > 0) {
						canvasMutations.updated_canvases.push(...result.mutations.updated_canvases);
					}
					log.info('Design tool mutations merged', { tool: toolName, mutationCount: result.mutations.updated_canvases.length });
				}
				return result;
			} else if (isRedditTool(toolName)) {
				const result = await executeRedditTool(toolName, input);
				// Log raw Reddit data to raw_intel for product intelligence
				if (result.success && result.data) {
					const subreddit = 'subreddit' in result.data ? result.data.subreddit : null;
					const url = (input.url as string) || (input.subreddit ? `https://www.reddit.com/r/${input.subreddit}` : null);
					supabaseStorage.from('raw_intel').insert({
						user_id: userId,
						tool_name: toolName,
						subreddit,
						url,
						raw_data: result.data,
						persona
					}).then(({ error }) => {
						if (error) log.warn('Failed to log raw intel', { error: error.message });
					});
				}
				return result;
			} else if (isEngagementTool(toolName)) {
				return executeEngagementTool(toolName, input);
			} else if (isTodoTool(toolName) && todoContext) {
				return executeTodoTool(toolName, input, todoContext, todoMutations!);
			} else if (isBlockTool(toolName) && blockContext) {
				return executeBlockTool(toolName, input, blockContext, blockMutations!);
			} else if (isTemporalTool(toolName)) {
				return executeTemporalTool(toolName, input);
			} else if (isGmailTool(toolName) && gmailContext) {
				return executeGmailTool(toolName, input, gmailContext);
			} else if (isBrowserTool(toolName)) {
				return executeBrowserTool(toolName, input);
			} else if (calendarContext) {
				return executeCalendarTool(toolName, input, calendarContext, todoMutations);
			} else {
				return {
					success: false,
					message: `Tool ${toolName} not available for this persona.`
				};
			}
		}

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
								: conversationProvider === 'openai'
									? converseStreamOpenAI(streamParams)
									: conversationProvider === 'google'
										? converseStreamGoogle(streamParams)
										: conversationProvider === 'together'
											? converseStreamTogether(streamParams)
											: conversationProvider === 'groq'
												? converseStreamGroq(streamParams)
												: conversationProvider === 'replicate'
													? converseStreamReplicate(streamParams)
													: conversationProvider === 'venice'
														? converseStreamVenice(streamParams)
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

					let aiResponse = extractMessage(result.fullResponse);

					// If model doesn't support native tool calling, parse and execute tool_intent blocks
					if (!supportsToolCalling && hasToolIntents(result.fullResponse)) {
						const intents = parseToolIntents(result.fullResponse);
						log.info('Parsed tool intents', { count: intents.length, tools: intents.map(i => i.tool) });

						// Collect tool results to append to aiResponse for working memory
						const toolResults: string[] = [];

						for (const intent of intents) {
							// Emit tool execution indicator
							const toolIndicator = `\n⟨${intent.tool}⟩\n`;
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: toolIndicator })}\n\n`));

							// Start keep-alive pings to prevent stream timeout during long operations
							const keepAliveInterval = setInterval(() => {
								try {
									controller.enqueue(encoder.encode(`: keep-alive\n\n`));
								} catch {
									// Controller may already be closed
								}
							}, 5000);

							// Execute the tool
							let toolResult;
							try {
								toolResult = await executeToolByName(intent.tool, intent.params);
							} finally {
								clearInterval(keepAliveInterval);
							}
							log.info('Tool intent executed', { tool: intent.tool, success: toolResult.success });

							// Emit result indicator
							const resultIndicator = toolResult.success
								? `✓ ${toolResult.message}\n`
								: `✗ ${toolResult.message}\n`;
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'chunk', content: resultIndicator })}\n\n`));

							// Collect for working memory
							toolResults.push(`[${intent.tool}] ${toolResult.success ? '✓' : '✗'} ${toolResult.message}`);
						}

						// Append tool results to aiResponse so Eva sees them in working memory
						if (toolResults.length > 0) {
							aiResponse += '\n\n---\nTool execution results:\n' + toolResults.join('\n');
						}
					}

					// Save to superjournal first to get the real ID
					// Store first content_id as primary (DB only supports single content_id)
					const superjournalId = await saveToSuperjournal({
						userId,
						message,
						aiResponse,
						conversationModel,
						persona,
						contentId: article_ids?.[0]
					});

					// Send completion event with real superjournal ID and mutations
					if (canvasMutations?.updated_canvases?.length) {
						log.info('Sending canvas_mutations in done event', { count: canvasMutations.updated_canvases.length });
					}
					const doneData = JSON.stringify({
						type: 'done',
						timestamp: new Date().toISOString(),
						model_identifier: conversationModel,
						superjournal_id: superjournalId,
						...(todoMutations && {
							mutations: todoMutations
						}),
						...(blockMutations && {
							block_mutations: blockMutations
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
							persona,
							conversationModel
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
