import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { VoyageAIClient } from 'voyageai';
import { FIREWORKS_API_KEY, VOYAGE_API_KEY, SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { buildContextForCalls1A1B } from '$lib/context-builder';
import { CHAT_MODEL } from '$lib/config/models';
import {
	BASE_INSTRUCTIONS,
	PERSONA_GUNNAR,
	PERSONA_KIRBY,
	CALL1A_PROMPT,
	CALL1B_PROMPT,
	CALL2A_PROMPT,
	CALL2B_PROMPT
} from '$lib/prompts';

const fireworks = new OpenAI({
	baseURL: 'https://api.fireworks.ai/inference/v1',
	apiKey: FIREWORKS_API_KEY
});

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

// Helper function to extract JSON from LLM output (handles <think> tags)
function extractJSON(text: string): string {
	// Remove <think> tags and content between them
	const withoutThink = text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();

	// Find the first { and last } to extract JSON object
	const firstBrace = withoutThink.indexOf('{');
	const lastBrace = withoutThink.lastIndexOf('}');

	if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
		return withoutThink.substring(firstBrace, lastBrace + 1);
	}

	return withoutThink;
}

// Helper function to extract thinking content from <think> tags
function extractThinking(text: string): string {
	const thinkMatch = text.match(/<think>([\s\S]*?)<\/think>/);
	return thinkMatch ? thinkMatch[1].trim() : '';
}

// Helper function to extract message content (everything outside <think> tags)
function extractMessage(text: string): string {
	return text.replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}

// Background compression function
async function compressToJournal(
	superjournalId: string,
	userMessage: string,
	aiResponse: string,
	personaName: string
) {
	try {
		// Read selected model from user_settings table
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_model')
			.single();

		const selectedModel = settings?.selected_model || 'accounts/fireworks/models/qwen3-235b-a22b';

		console.log(`[Compression] Starting Call 2A/2B for superjournal_id: ${superjournalId}`);

		// Call 2A: Initial Artisan Cut compression
		const call2A = await fireworks.chat.completions.create({
			model: selectedModel,
			messages: [
				{
					role: 'system',
					content: CALL2A_PROMPT
				},
				{
					role: 'user',
					content: `User message: ${userMessage}\n\nPersona (${personaName}) response: ${aiResponse}`
				}
			],
			max_tokens: 2048,
			temperature: 0.3
		});

		const call2AOutput = call2A.choices[0]?.message?.content || '{}';
		console.log('[Compression] Call 2A output:', call2AOutput);

		let call2AJson;
		try {
			const cleanedOutput = extractJSON(call2AOutput);
			call2AJson = JSON.parse(cleanedOutput);
		} catch (parseError) {
			console.error('[Compression] Call 2A JSON parse error:', parseError);
			console.error('[Compression] Raw output:', call2AOutput);
			return; // Abort if Call 2A output is invalid
		}

		// Call 2B: Verification and refinement
		const call2B = await fireworks.chat.completions.create({
			model: selectedModel,
			messages: [
				{
					role: 'system',
					content: CALL2A_PROMPT
				},
				{
					role: 'assistant',
					content: JSON.stringify(call2AJson)
				},
				{
					role: 'user',
					content: CALL2B_PROMPT
				}
			],
			max_tokens: 2048,
			temperature: 0.3
		});

		const call2BOutput = call2B.choices[0]?.message?.content || '{}';
		console.log('[Compression] Call 2B output:', call2BOutput);

		let call2BJson;
		try {
			const cleanedOutput = extractJSON(call2BOutput);
			call2BJson = JSON.parse(cleanedOutput);
		} catch (parseError) {
			console.error('[Compression] Call 2B JSON parse error:', parseError);
			console.error('[Compression] Raw output:', call2BOutput);
			return; // Abort if Call 2B output is invalid
		}

		// Save to Journal table (without embedding initially)
		const { data: journalData, error: journalError } = await supabase
			.from('journal')
			.insert({
				superjournal_id: superjournalId,
				user_id: null, // Nullable for development
				persona_name: call2BJson.persona_name || personaName,
				boss_essence: call2BJson.boss_essence || userMessage,
				persona_essence: call2BJson.persona_essence || aiResponse,
				decision_arc_summary: call2BJson.decision_arc_summary || 'No arc generated',
				salience_score: call2BJson.salience_score || 5,
				is_starred: false,
				is_instruction: call2BJson.is_instruction || false,
				instruction_scope: call2BJson.instruction_scope || null,
				file_name: null,
				file_type: null,
				embedding: null
			})
			.select('id')
			.single();

		if (journalError) {
			console.error('[Compression] Journal insert error:', journalError);
			return;
		}

		console.log('[Compression] Successfully saved to Journal');

		// Generate embedding for decision_arc_summary
		try {
			const decisionArc = call2BJson.decision_arc_summary || 'No arc generated';
			console.log('[Embedding] Generating embedding for arc:', decisionArc);

			const embeddingResponse = await voyage.embed({
				input: decisionArc,
				model: 'voyage-3-large' // 1024 dimensions (default)
			});

			const embedding = embeddingResponse.data[0].embedding;

			// Update Journal row with embedding
			const { error: updateError } = await supabase
				.from('journal')
				.update({ embedding: JSON.stringify(embedding) })
				.eq('id', journalData.id);

			if (updateError) {
				console.error('[Embedding] Failed to update embedding:', updateError);
			} else {
				console.log('[Embedding] Successfully generated and saved embedding');
			}
		} catch (embeddingError) {
			console.error('[Embedding] Failed to generate embedding:', embeddingError);
		}
	} catch (error) {
		console.error('[Compression] Background compression error:', error);
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		// Read selected model and persona from user_settings table
		const { data: settings } = await supabase
			.from('user_settings')
			.select('selected_model, selected_persona')
			.single();

		const selectedModel = settings?.selected_model || 'accounts/fireworks/models/qwen3-235b-a22b';
		const selectedPersona = settings?.selected_persona || 'gunnar';

		const { message, persona = selectedPersona } = await request.json();

		if (!message) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		// Build context for Call 1A/1B (memory injection with vector search)
		const { context, stats } = await buildContextForCalls1A1B(
			null, // user_id (null for development, no auth yet)
			persona, // current persona for instruction filtering
			selectedModel,
			message // user query for vector search (Priority 5)
		);

		console.log('[Chat API] Context stats:', stats);

		// Select persona prompt based on selected persona
		const personaPrompt = persona === 'kirby' ? PERSONA_KIRBY : PERSONA_GUNNAR;

		// Construct system prompt (BASE_INSTRUCTIONS + PERSONA + CALL1A_PROMPT)
		const systemPrompt = `${BASE_INSTRUCTIONS}\n\n---\n\n${personaPrompt}\n\n---\n\n${CALL1A_PROMPT}`;

		// Construct full user prompt with memory context
		const fullUserPrompt = context.length > 0
			? `${context}--- CURRENT QUERY ---\n${message}`
			: message;

		// Call 1A: Initial response with BASE_INSTRUCTIONS + PERSONA + memory context
		const call1A = await fireworks.chat.completions.create({
			model: selectedModel,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: fullUserPrompt }
			],
			max_tokens: 4096,
			temperature: 0.7
		});

		const call1AResponse = call1A.choices[0]?.message?.content || 'No response generated';

		// Extract thinking and message from Call 1A
		const call1AThinking = extractThinking(call1AResponse);
		const call1AMessage = extractMessage(call1AResponse);

		// Call 1B: Refine response with CALL1B_PROMPT - STREAMING
		// Note: Call 1B receives the SAME context as Call 1A (for informed critique)
		const call1B = await fireworks.chat.completions.create({
			model: selectedModel,
			messages: [
				{ role: 'user', content: fullUserPrompt }, // Same context as Call 1A
				{ role: 'assistant', content: call1AMessage }, // Only the message, not the thinking
				{ role: 'user', content: CALL1B_PROMPT }
			],
			max_tokens: 4096,
			temperature: 0.7,
			stream: true
		});

		// Create a ReadableStream for SSE
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				let call1BFullResponse = '';
				let buffer = '';
				let insideThinkTag = false;
				let justExitedThinkTag = false; // Track when we just exited a think tag

				try {
					for await (const chunk of call1B) {
						const content = chunk.choices[0]?.delta?.content || '';
						if (content) {
							call1BFullResponse += content;
							buffer += content;

							// Process buffer to detect and skip <think> tags
							while (buffer.length > 0) {
								if (!insideThinkTag) {
									// Look for opening <think> tag
									const thinkStart = buffer.indexOf('<think>');
									if (thinkStart === -1) {
										// No think tag found, stream everything except last 7 chars (to catch partial tags)
										if (buffer.length > 7) {
											const toStream = buffer.slice(0, -7);
											controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: toStream })}\n\n`));
											buffer = buffer.slice(-7);
										}
										break;
									} else {
										// Found opening tag, stream content before it
										if (thinkStart > 0) {
											controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: buffer.slice(0, thinkStart) })}\n\n`));
										}
										buffer = buffer.slice(thinkStart + 7); // Skip '<think>'
										insideThinkTag = true;
									}
								} else {
									// Inside think tag, look for closing </think> tag
									const thinkEnd = buffer.indexOf('</think>');
									if (thinkEnd === -1) {
										// No closing tag yet, keep buffering (but skip content)
										if (buffer.length > 8) {
											buffer = buffer.slice(-8); // Keep last 8 chars to catch partial closing tag
										}
										break;
									} else {
										// Found closing tag, skip everything up to and including it
										buffer = buffer.slice(thinkEnd + 8).trimStart(); // Skip '</think>' and trim leading whitespace
										insideThinkTag = false;
										justExitedThinkTag = true; // Mark that we just exited
									}
								}
							}
						}
					}

					// Stream any remaining buffer content (outside think tags)
					if (!insideThinkTag && buffer.length > 0) {
						// Trim leading whitespace only if we just exited a think tag
						const finalContent = justExitedThinkTag ? buffer.trimStart() : buffer;
						if (finalContent.length > 0) {
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content: finalContent })}\n\n`));
						}
					}

					// Send completion event
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));

					// Extract only the message part from Call 1B (remove its thinking tags)
					const call1BMessage = extractMessage(call1BFullResponse);

					// Save to Superjournal after streaming completes (no thinking, just message)
					const { data: superjournalData, error: dbError } = await supabase
						.from('superjournal')
						.insert({
							user_id: null,
							persona_name: persona,
							user_message: message,
							ai_response: call1BMessage
						})
						.select('id')
						.single();

					if (dbError) {
						console.error('Database error:', dbError);
					}

					// Trigger background compression
					if (superjournalData?.id) {
						setTimeout(() => {
							compressToJournal(superjournalData.id, message, call1BMessage, persona);
						}, 0);
					}

					controller.close();
				} catch (error) {
					console.error('Stream error:', error);
					controller.error(error);
				}
			}
		});

		return new Response(stream, {
			headers: {
				'Content-Type': 'text/event-stream',
				'Cache-Control': 'no-cache',
				'Connection': 'keep-alive'
			}
		});
	} catch (error) {
		console.error('Chat API error:', error);
		return json({ error: 'Failed to generate response' }, { status: 500 });
	}
};
