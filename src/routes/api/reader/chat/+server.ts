import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { READER_GUNNAR_PROMPT } from '$lib/prompts';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

/**
 * Reader Chat Endpoint (Phase 5 - Q&A System)
 *
 * Handles follow-up questions about articles with:
 * - Full conversation history (original summary + all Q&A turns)
 * - Chart reference support (include chart file ID if user has chart open)
 * - Brave Search tool availability
 * - Streaming responses
 *
 * POST /api/reader/chat
 * Body: { article_id: string, message: string, chart_index?: number | null }
 * Response: Server-Sent Events stream
 */
export const POST: RequestHandler = async ({ request, locals: { safeGetSession, supabase } }) => {
	// 1. AUTHENTICATION CHECK
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	// 2. PARSE REQUEST BODY
	const { article_id, message, chart_index } = await request.json();

	if (!article_id || typeof article_id !== 'string') {
		return json(
			{
				error: {
					message: 'Missing or invalid article_id',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	if (!message || typeof message !== 'string' || message.trim().length === 0) {
		return json(
			{
				error: {
					message: 'Missing or invalid message',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	console.log('[Reader Chat] User ID:', userId);
	console.log('[Reader Chat] Article ID:', article_id);
	console.log('[Reader Chat] Message:', message);
	console.log('[Reader Chat] Chart Index:', chart_index);

	// 3. FETCH ARTICLE FROM DATABASE
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, anthropic_file_id, anthropic_file_created_at, transformed_content')
		.eq('id', article_id)
		.eq('user_id', userId)
		.single();

	if (fetchError || !article) {
		console.error('[Reader Chat] Failed to fetch article:', fetchError);
		return json(
			{
				error: {
					message: 'Article not found or access denied',
					code: 'NOT_FOUND',
					details: fetchError?.message
				}
			},
			{ status: 404 }
		);
	}

	// 4. VALIDATE ARTICLE HAS ANTHROPIC FILE ID
	if (!article.anthropic_file_id) {
		console.error('[Reader Chat] Article missing anthropic_file_id');
		return json(
			{
				error: {
					message: 'Article has not been processed yet',
					code: 'INVALID_STATE'
				}
			},
			{ status: 400 }
		);
	}

	// 4a. CHECK FILE ID EXPIRATION (7 days from creation)
	const fileExpirationDays = 7;
	const fileAgeMs = Date.now() - new Date(article.anthropic_file_created_at).getTime();
	const fileAgeDays = fileAgeMs / (1000 * 60 * 60 * 24);

	if (fileAgeDays >= fileExpirationDays) {
		console.warn('[Reader Chat] Article file ID expired, needs re-upload');
		return json(
			{
				error: {
					message:
						'Article file has expired. Please re-process the article by pasting it again.',
					code: 'FILE_EXPIRED'
				}
			},
			{ status: 400 }
		);
	}

	// 5. FETCH CHART IF REFERENCED
	let chartFileId: string | null = null;
	if (chart_index !== null && chart_index !== undefined && typeof chart_index === 'number') {
		const { data: chartData, error: chartError } = await supabase
			.from('article_charts')
			.select('anthropic_file_id, anthropic_file_created_at, chart_index')
			.eq('article_id', article_id)
			.eq('user_id', userId)
			.eq('chart_index', chart_index + 1) // chart_index is 0-based in frontend, 1-based in DB
			.single();

		if (!chartError && chartData?.anthropic_file_id) {
			// Check chart file expiration
			const chartAgeMs = Date.now() - new Date(chartData.anthropic_file_created_at).getTime();
			const chartAgeDays = chartAgeMs / (1000 * 60 * 60 * 24);

			if (chartAgeDays >= fileExpirationDays) {
				console.warn('[Reader Chat] Chart file ID expired, proceeding without chart');
				// Don't fail the request, just exclude the chart
			} else {
				chartFileId = chartData.anthropic_file_id;
				console.log('[Reader Chat] Including chart file ID:', chartFileId);
			}
		} else {
			console.log('[Reader Chat] Chart not found or no file ID, proceeding without chart');
		}
	}

	// 6. FETCH CONVERSATION HISTORY
	const { data: chatHistory, error: historyError } = await supabase
		.from('article_chat')
		.select('role, content, created_at')
		.eq('article_id', article_id)
		.eq('user_id', userId)
		.order('created_at', { ascending: true });

	if (historyError) {
		console.error('[Reader Chat] Failed to fetch chat history:', historyError);
		// Don't fail - continue without history
	}

	// 7. GET USER'S SELECTED E-READER MODEL (OR DEFAULT)
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_reader_model')
		.eq('user_id', userId)
		.single();

	const selectedModel = settings?.selected_reader_model || DEFAULT_READER_MODEL;
	console.log('[Reader Chat] Using model:', selectedModel);

	// 8. GET MODEL PARAMETERS
	const modelParams = await getModelParams(selectedModel, 'reader');

	// 9. SAVE USER MESSAGE TO DATABASE FIRST
	const { data: userMessageData, error: saveUserError } = await supabase
		.from('article_chat')
		.insert({
			article_id,
			user_id: userId,
			role: 'user',
			content: message
		})
		.select('id')
		.single();

	if (saveUserError) {
		console.error('[Reader Chat] Failed to save user message:', saveUserError);
		return json(
			{
				error: {
					message: 'Failed to save message',
					code: 'DATABASE_ERROR',
					details: saveUserError.message
				}
			},
			{ status: 500 }
		);
	}

	// 10. CREATE STREAMING RESPONSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				// Build conversation messages
				const messages: Anthropic.MessageParam[] = [];

				// First message: Article + original summary (if exists)
				const firstMessageContent: Anthropic.MessageContent = [
					{
						type: 'document',
						source: {
							type: 'file',
							file_id: article.anthropic_file_id
						}
					}
				];

				// Add original summary as context if it exists
				if (article.transformed_content) {
					firstMessageContent.push({
						type: 'text',
						text: `Here is the article titled "${article.title}" and my previous summary:\n\n${article.transformed_content}`
					});
				} else {
					firstMessageContent.push({
						type: 'text',
						text: `Here is the article titled "${article.title}".`
					});
				}

				messages.push({
					role: 'user',
					content: firstMessageContent
				});

				// Add conversation history (all previous Q&A turns)
				if (chatHistory && chatHistory.length > 0) {
					for (const turn of chatHistory) {
						messages.push({
							role: turn.role as 'user' | 'assistant',
							content: turn.content
						});
					}
				}

				// Add current user question
				const currentQuestionContent: Anthropic.MessageContent = [];

				// Include chart if referenced
				if (chartFileId) {
					currentQuestionContent.push({
						type: 'document',
						source: {
							type: 'file',
							file_id: chartFileId
						}
					});
					currentQuestionContent.push({
						type: 'text',
						text: `[Referring to chart ${(chart_index ?? 0) + 1}] ${message}`
					});
				} else {
					currentQuestionContent.push({
						type: 'text',
						text: message
					});
				}

				messages.push({
					role: 'user',
					content: currentQuestionContent
				});

				let fullResponse = '';

				// Recursive function to handle tool use
				async function processWithTools(
					conversationMessages: Anthropic.MessageParam[]
				): Promise<void> {
					console.log('[Reader Chat] Starting AI call...');

					const stream = await anthropic.messages.stream(
						{
							model: selectedModel,
							max_tokens: modelParams.max_tokens,
							temperature: modelParams.temperature,
							system: READER_GUNNAR_PROMPT,
							messages: conversationMessages,
							tools: [BRAVE_SEARCH_TOOL]
						},
						{
							headers: {
								'anthropic-beta': 'prompt-caching-2024-07-31,files-api-2025-04-14'
							}
						}
					);

					// Stream text deltas to client
					for await (const event of stream) {
						if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
							const text = event.delta.text;
							fullResponse += text;
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
						}
					}

					// Get finalized message
					const finalMessage = await stream.finalMessage();

					// Check for tool use
					const toolUseBlocks = finalMessage.content.filter(
						(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
					);

					if (toolUseBlocks.length > 0) {
						console.log(`[Reader Chat] ${toolUseBlocks.length} tool use(s) detected`);

						const toolResults: Anthropic.MessageParam[] = [];

						for (const toolBlock of toolUseBlocks) {
							if (toolBlock.name === 'brave_search') {
								const searchQuery = (toolBlock.input as { query: string }).query;
								console.log('[Reader Chat] Executing Brave Search:', searchQuery);

								const searchResults = await executeBraveSearch(searchQuery);

								if (searchResults) {
									toolResults.push({
										role: 'user',
										content: [
											{
												type: 'tool_result',
												tool_use_id: toolBlock.id,
												content: searchResults
											}
										]
									});
								} else {
									toolResults.push({
										role: 'user',
										content: [
											{
												type: 'tool_result',
												tool_use_id: toolBlock.id,
												content: 'Search failed. Please continue without search results.'
											}
										]
									});
								}
							}
						}

						// Add tool use + results to conversation
						conversationMessages.push({
							role: 'assistant',
							content: finalMessage.content
						});
						conversationMessages.push(...toolResults);

						// Recurse
						await processWithTools(conversationMessages);
					}
				}

				// Start processing
				await processWithTools(messages);

				// 11. SAVE AI RESPONSE TO DATABASE
				const { error: saveAssistantError } = await supabase.from('article_chat').insert({
					article_id,
					user_id: userId,
					role: 'assistant',
					content: fullResponse
				});

				if (saveAssistantError) {
					console.error('[Reader Chat] Failed to save assistant response:', saveAssistantError);
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ error: 'Failed to save response to database' })}\n\n`
						)
					);
				} else {
					console.log('[Reader Chat] Successfully saved response to database');
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
				}

				controller.close();
			} catch (error) {
				console.error('[Reader Chat] Error during processing:', error);

				controller.enqueue(
					encoder.encode(
						`data: ${JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' })}\n\n`
					)
				);
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
};
