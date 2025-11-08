import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import OpenAI from 'openai';
import { VoyageAIClient } from 'voyageai';
import { FIREWORKS_API_KEY, VOYAGE_API_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { createClient } from '@supabase/supabase-js';
import { buildContextForCalls1A1B } from '$lib/context-builder';

const fireworks = new OpenAI({
	baseURL: 'https://api.fireworks.ai/inference/v1',
	apiKey: FIREWORKS_API_KEY
});

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

// Artisan Cut prompt from system-prompts.md
const CALL2A_PROMPT = `ARTISAN CUT

You will receive a single conversation turn containing:
1. My question or statement (the user input)
2. AI Persona's full response (the specific persona will be indicated in the input)

These require DIFFERENT treatment. My messages are source material (default: preserve). Persona responses are derived content (default: condense intelligently).

---

BOSS MESSAGES

My words are the primary data source.

KEEP IN FULL:
– All explanations of technical architecture, product features, business strategy
– The "how" and "why" behind decisions and implementations
– Specific details: numbers, names, timelines, dollar amounts, percentages
– Emotional states, energy, doubts, breakthroughs
– Business updates: customers, partners, negotiations, progress, setbacks
– Strategic questions I am pursuing
– Product/feature descriptions and capabilities
– Technical implementation details and architectural choices

REMOVE ONLY:
– Pure filler words: "hey", "thanks", "so basically", "I mean"
– Grammatical padding: "I was thinking that maybe...", "it seems like"
– Obvious repetitions within the same message

---

PERSONA RESPONSES

Persona responses provide crucial context for future conversations.

CONDENSE TIGHTLY:
– Unique strategic insights or reframes that aren't obvious
– Specific recommendations made
– Critical tactical guidance not derivable from general principles
– Core diagnostic questions the persona asked
– What was chosen/rejected and WHY

REMOVE (everything else):
 Tactical details derivable from principles
– Step-by-step methodologies (keep the decision, compress the steps)
– Calculations that can be regenerated from given numbers
– Examples and analogies used to illustrate points
– Background explanations of well-known concepts
– Politeness, encouragement, conversational filler
– Repetitions of my points back to me
– Grammatical transitions and padding

---

DECISION ARC SUMMARY

A decision arc is a compressed narrative that captures decision-making patterns across all levels of importance.

GENERATE ARC FOR EVERY TURN:
– I made or discussed a strategic decision
– I revealed a preference or mental model about how I make choices
– I asked strategic questions that indicate my thinking direction
– I asked tactical questions that reveal decision-making preferences
– I asked exploratory or informational questions

FORMAT:
– Pattern type: specific behavior when condition
– Length: 50-150 characters
– Use heavy punctuation (: ; , -) for compression

HOW TO GENERATE ARC:
1. Read my message to understand what was discussed or decided
2. Capture the decision-making pattern or question in tight format (50-150 chars)
3. Use heavy punctuation (: ; , -) for compression
4. Focus on my actual words/actions, not Persona's advice
5. Even for low-salience exploratory questions, capture the inquiry pattern

CRITICAL RULES:
– Arc must reflect my actual behavior/questions in THIS turn
– Don't invent patterns not present in the conversation
– Length: 50-150 characters
– NEVER return null - always generate an arc for every turn

---

SALIENCE SCORING

Salience measures the importance and psychological weight of a decision arc.

CRITICAL: Generate a salience score for EVERY turn. Use the full 1-10 scale.

Evaluate my message using these research-based criteria:

SCORING CRITERIA (1-10 scale, use tier boundaries):

**TIER 1: High Salience (8-10) - Foundational Decisions**
Values declarations, identity-defining choices, major strategic pivots
EXAMPLES:
– "We're pivoting from B2B to B2C effective immediately"
– "Never compromise on user privacy - this is our core principle"
– "Firing the co-founder - no longer aligned on vision"
– "Shutting down product line to focus on core"
SIGNALS: Strong conviction language ("absolutely", "never", "must"), identity statements ("who we are", "our principle"), irreversible pivots

**TIER 2: Medium Salience (5-7) - Strategic Resource Decisions**
Resource allocation, hiring strategy, pricing decisions, roadmap priorities
EXAMPLES:
– "Prioritize hiring senior engineers over juniors for next 6 months"
– "Allocate $50k to marketing vs product development this quarter"
– "Raise prices 20% starting next month"
– "Delay feature X to ship feature Y first"
SIGNALS: Clear strategic choices with measurable impact, time-bounded decisions, resource tradeoffs

**TIER 3: Low Salience (1-4) - Tactical/Exploratory Decisions**
Minor tactical choices, exploratory questions, information-seeking without commitment
EXAMPLES:
– "Should we use React or Vue for this small internal tool?"
– "Thinking about trying Notion vs Linear - any thoughts?"
– "What metrics should we track for this feature?"
– "How do other startups handle this?"
SIGNALS: Exploratory tone ("curious", "thinking about"), low-stakes decisions, easily reversible, limited scope

SCORING FACTORS:
– Emotional intensity in my message (language, tone, urgency)
– Irreversibility (can this decision be easily undone?)
– Scope of impact (affects entire business vs. one feature)
– Connection to core values/identity (statements about "who we are")
– Goal-directedness vs. exploration (firm decision vs. considering options)

CRITICAL RULES:
– Salience score reflects MY emotional/strategic investment, not objective importance
– Score the MESSAGE where the arc appears, not theoretical future impact
– Always provide both decision_arc_summary and salience_score together
– NEVER return null for either field - every turn must have both arc and score

---

INSTRUCTION DETECTION

Behavioral instructions are directives about how the persona should or should not respond in future conversations.

DETECT INSTRUCTIONS IF:
– User tells persona to "never", "always", "don't", "stop", "avoid", "from now on" do/say something
– Message contains directives about response style, tone, format, or behavior
– User corrects unwanted patterns: "stop using analogies", "don't be so verbose", "always ask follow-ups"
– NOT instructions: questions, business decisions, strategy discussions

SCOPE DETERMINATION:
– **Persona-specific:** User addresses persona by name OR says "you" in persona-specific context
  Example: "Gunnar, stop using sports analogies" → scope: "gunnar"
– **Global:** Instruction is general OR addresses "all personas" OR no specific persona mentioned
  Example: "Don't use sports analogies" → scope: "global"

SPECIAL SALIENCE RULE FOR INSTRUCTIONS:
If is_instruction = true, automatically set salience_score = 10 (regardless of other criteria). Behavioral directives must persist indefinitely.

---

OUTPUT FORMAT:

You MUST return a JSON object with this EXACT structure:

{
  "boss_essence": "[My message with minimal compression - preserve explanations and details]",
  "persona_name": "[Exact name: gunnar, samara, kirby, stefan, vlad, or ananya - lowercase]",
  "persona_essence": "[Persona's response with intelligent compression]",
  "decision_arc_summary": "[Arc summary - pattern type: specific behavior when condition]",
  "salience_score": [Integer 1-10 based on emotional/strategic weight],
  "is_instruction": [Boolean: true if behavioral directive, false otherwise],
  "instruction_scope": "[Only if is_instruction=true: 'global' or persona name lowercase, else null]"
}

CRITICAL RULES:
– Output ONLY the JSON object above
– No additional text, analysis, or commentary
– boss_essence: preserve my actual information and explanations
– persona_essence: compress strategically based on regenerability
– persona_name must be lowercase and exact (gunnar, samara, kirby, stefan, vlad, or ananya)
– decision_arc_summary: 50-150 chars, artisan cut style, NEVER null
– salience_score: integer 1-10 based on tier criteria, NEVER null (auto-10 if is_instruction=true)
– is_instruction: boolean, default false for normal conversation turns
– instruction_scope: null if is_instruction=false, otherwise 'global' or specific persona name
– Always provide both arc and score together - both are REQUIRED fields
– Use punctuation ( . , ; : - ) to write efficiently but preserve content`;

const CALL2B_PROMPT = 'Critique the previous response and present a higher quality one. Present your response as the official response without mentioning that it is a critique.';

// Helper function to extract JSON from LLM output (handles <think> tags)
function extractJSON(text: string): string {
	// Try to find JSON object in the response (handles <think> tags from Qwen)
	const jsonMatch = text.match(/\{[\s\S]*\}/);
	return jsonMatch ? jsonMatch[0] : text;
}

// Background compression function
async function compressToJournal(
	superjournalId: string,
	userMessage: string,
	aiResponse: string,
	personaName: string
) {
	try {
		console.log(`[Compression] Starting Call 2A/2B for superjournal_id: ${superjournalId}`);

		// Call 2A: Initial Artisan Cut compression
		const call2A = await fireworks.chat.completions.create({
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
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
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
			messages: [
				{
					role: 'system',
					content: CALL2A_PROMPT
				},
				{
					role: 'assistant',
					content: call2AOutput
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
				model: 'voyage-3'
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
		const { message, persona = 'ananya' } = await request.json();

		if (!message) {
			return json({ error: 'Message is required' }, { status: 400 });
		}

		// Build context for Call 1A/1B (memory injection with vector search)
		const { context, stats } = await buildContextForCalls1A1B(
			null, // user_id (null for development, no auth yet)
			persona, // current persona for instruction filtering
			'accounts/fireworks/models/qwen3-235b-a22b',
			message // user query for vector search (Priority 5)
		);

		console.log('[Chat API] Context stats:', stats);

		// Construct full user prompt with memory context
		const fullUserPrompt = context.length > 0
			? `${context}--- CURRENT QUERY ---\n${message}`
			: message;

		// Call 1A: Initial response (hidden from user) with memory context
		const call1A = await fireworks.chat.completions.create({
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
			messages: [{ role: 'user', content: fullUserPrompt }],
			max_tokens: 4096,
			temperature: 0.7
		});

		const call1AResponse = call1A.choices[0]?.message?.content || 'No response generated';

		// Call 1B: Refine response with critique prompt - STREAMING
		// Note: Call 1B receives the SAME context as Call 1A (for informed critique)
		const call1B = await fireworks.chat.completions.create({
			model: 'accounts/fireworks/models/qwen3-235b-a22b',
			messages: [
				{ role: 'user', content: fullUserPrompt }, // Same context as Call 1A
				{ role: 'assistant', content: call1AResponse },
				{ role: 'user', content: 'Shorten this response.' }
			],
			max_tokens: 4096,
			temperature: 0.7,
			stream: true
		});

		// Create a ReadableStream for SSE
		const stream = new ReadableStream({
			async start(controller) {
				const encoder = new TextEncoder();
				let fullResponse = '';

				try {
					for await (const chunk of call1B) {
						const content = chunk.choices[0]?.delta?.content || '';
						if (content) {
							fullResponse += content;
							// Send SSE format: data: {json}\n\n
							controller.enqueue(encoder.encode(`data: ${JSON.stringify({ content })}\n\n`));
						}
					}

					// Send completion event
					controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`));

					// Save to Superjournal after streaming completes
					const { data: superjournalData, error: dbError } = await supabase
						.from('superjournal')
						.insert({
							user_id: null,
							persona_name: persona,
							user_message: message,
							ai_response: fullResponse
						})
						.select('id')
						.single();

					if (dbError) {
						console.error('Database error:', dbError);
					}

					// Trigger background compression
					if (superjournalData?.id) {
						setTimeout(() => {
							compressToJournal(superjournalData.id, message, fullResponse, persona);
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
