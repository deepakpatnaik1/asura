import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import Anthropic from '@anthropic-ai/sdk';
import { ANTHROPIC_API_KEY } from '$env/static/private';
import { READER_SAMARA_PROMPT } from '$lib/prompts';
import { DEFAULT_READER_MODEL } from '$lib/config/models';
import { getModelParams } from '$lib/config/model-params';
import { BRAVE_SEARCH_TOOL, executeBraveSearch } from '$lib/api/brave-search';

const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

/**
 * Process Article Endpoint (Phase 2, Group D - Chunks 6-8)
 *
 * Takes article_id, sends article PDF to AI with Brave Search tool,
 * streams response back, extracts preview, saves to database.
 *
 * POST /api/reader/process-article
 * Body: { article_id: string }
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
	const { article_id } = await request.json();

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

	console.log('[Process Article] User ID:', userId);
	console.log('[Process Article] Article ID:', article_id);

	// 3. FETCH ARTICLE FROM DATABASE
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, anthropic_file_id, anthropic_file_created_at, status')
		.eq('id', article_id)
		.eq('user_id', userId) // RLS check
		.single();

	if (fetchError || !article) {
		console.error('[Process Article] Failed to fetch article:', fetchError);
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
		console.error('[Process Article] Article missing anthropic_file_id');
		return json(
			{
				error: {
					message: 'Article has not been converted to PDF yet',
					code: 'INVALID_STATE'
				}
			},
			{ status: 400 }
		);
	}

	// 5. GET USER'S SELECTED E-READER MODEL (OR DEFAULT)
	const { data: settings } = await supabase
		.from('user_settings')
		.select('selected_reader_model')
		.eq('user_id', userId)
		.single();

	const selectedModel = settings?.selected_reader_model || DEFAULT_READER_MODEL;
	console.log('[Process Article] Using model:', selectedModel);

	// 6. GET MODEL PARAMETERS
	const modelParams = await getModelParams(selectedModel, 'reader');
	console.log('[Process Article] Model params:', modelParams);

	// 7. CREATE STREAMING RESPONSE
	const stream = new ReadableStream({
		async start(controller) {
			const encoder = new TextEncoder();

			try {
				// Build messages array with article file
				const messages: Anthropic.MessageParam[] = [
					{
						role: 'user',
						content: [
							{
								type: 'document',
								source: {
									type: 'file',
									file_id: article.anthropic_file_id
								}
							},
							{
								type: 'text',
								text: `Please provide an educational summary of this article titled "${article.title}". Use the web search tool as needed to understand recent context.`
							}
						]
					}
				];

				let fullResponse = '';

				// Recursive function to handle tool use (supports multiple search iterations)
				async function processWithTools(
					conversationMessages: Anthropic.MessageParam[]
				): Promise<void> {
					console.log('[Process Article] Starting AI call...');

					const stream = await anthropic.messages.stream(
						{
							model: selectedModel,
							max_tokens: modelParams.max_tokens,
							temperature: modelParams.temperature,
							system: READER_SAMARA_PROMPT,
							messages: conversationMessages,
							tools: [BRAVE_SEARCH_TOOL]
						},
						{
							headers: {
								'anthropic-beta': 'prompt-caching-2024-07-31,files-api-2025-04-14'
							}
						}
					);

					// Stream text deltas to client while accumulating
					for await (const event of stream) {
						if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
							const text = event.delta.text;
							fullResponse += text;
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ text })}\n\n`));
						}
					}

					// Get finalized message to extract tool use
					const finalMessage = await stream.finalMessage();

					// Check if any tool was used
					const toolUseBlocks = finalMessage.content.filter(
						(block): block is Anthropic.ToolUseBlock => block.type === 'tool_use'
					);

					if (toolUseBlocks.length > 0) {
						console.log(`[Process Article] ${toolUseBlocks.length} tool use(s) detected`);

						// Process all tool uses
						const toolResults: Anthropic.MessageParam[] = [];

						for (const toolBlock of toolUseBlocks) {
							if (toolBlock.name === 'brave_search') {
								const searchQuery = (toolBlock.input as { query: string }).query;
								console.log('[Process Article] Executing Brave Search:', searchQuery);

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
									// Graceful degradation: tell model search failed
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

						// Add assistant's tool use to conversation
						conversationMessages.push({
							role: 'assistant',
							content: finalMessage.content
						});

						// Add all tool results
						conversationMessages.push(...toolResults);

						// Recurse to continue conversation with tool results
						await processWithTools(conversationMessages);
					}
				}

				// Start processing
				await processWithTools(messages);

				// 8. EXTRACT PREVIEW SNIPPET (first 100-150 chars)
				const previewLength = 150;
				const previewSnippet = fullResponse.substring(0, previewLength).trim();

				console.log('[Process Article] Full response length:', fullResponse.length);
				console.log('[Process Article] Preview snippet:', previewSnippet);
			console.log('[Process Article] Raw content (first 2000 chars):', JSON.stringify(fullResponse.slice(0, 2000)));

				// 9. SAVE TO DATABASE
				const { error: updateError } = await supabase
					.from('articles')
					.update({
						transformed_content: fullResponse,
						preview_snippet: previewSnippet,
						status: 'ready'
					})
					.eq('id', article_id)
					.eq('user_id', userId);

				if (updateError) {
					console.error('[Process Article] Failed to save results:', updateError);
					controller.enqueue(
						encoder.encode(
							`data: ${JSON.stringify({ error: 'Failed to save results to database' })}\n\n`
						)
					);
				} else {
					console.log('[Process Article] Successfully saved results to database');
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));
				}

				controller.close();
			} catch (error) {
				console.error('[Process Article] Error during processing:', error);

				// Article remains in 'processing' status on error
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
