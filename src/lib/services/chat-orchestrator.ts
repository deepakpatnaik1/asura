import type {
	SuperjournalEntry,
	JournalEntry,
	ArtisanCutOutput,
	PersonaName
} from '$lib/types/database.types';
import { supabase } from '$lib/supabase';
import { callFireworks, callFireworksStreaming } from './fireworks';
import { generateEmbedding } from './voyage';
import {
	BASE_INSTRUCTIONS,
	getPersonaProfile,
	CALL2_PROMPT
} from '$lib/system-prompts';

const CONTEXT_BUDGET_PERCENT = 0.4; // 40% of context window for input
const QWEN3_CONTEXT_WINDOW = 32000; // Native 32K context
const MAX_INPUT_TOKENS = Math.floor(QWEN3_CONTEXT_WINDOW * CONTEXT_BUDGET_PERCENT);

interface ContextData {
	baseInstructions: string;
	personaProfile: string;
	recentSuperjournal: SuperjournalEntry[];
	recentJournal: JournalEntry[];
	pinnedMessages: JournalEntry[];
	decisionArcs: JournalEntry[];
}

/**
 * Assemble context for Call 1A and Call 1B
 */
async function assembleContext(
	userId: string,
	personaName: PersonaName
): Promise<ContextData> {
	// Get persona profile
	const personaProfile = getPersonaProfile(personaName);
	if (!personaProfile) {
		throw new Error(`Unknown persona: ${personaName}`);
	}

	// Get last 5 Superjournal entries
	const { data: recentSuperjournal, error: sjError } = await supabase
		.from('superjournal')
		.select('*')
		.eq('user_id', userId)
		.eq('persona_name', personaName)
		.order('created_at', { ascending: false })
		.limit(5);

	if (sjError) throw sjError;

	// Get last 100 Journal entries
	const { data: recentJournal, error: jError } = await supabase
		.from('journal')
		.select('*')
		.eq('user_id', userId)
		.eq('persona_name', personaName)
		.order('created_at', { ascending: false })
		.limit(100);

	if (jError) throw jError;

	// Get pinned/starred messages (salience 10)
	const { data: pinnedMessages, error: pError } = await supabase
		.from('journal')
		.select('*')
		.eq('user_id', userId)
		.eq('is_starred', true)
		.order('salience_score', { ascending: false });

	if (pError) throw pError;

	// TODO: Get relevant Decision Arcs via vector search
	// For now, get high-salience arcs
	const { data: decisionArcs, error: dError } = await supabase
		.from('journal')
		.select('*')
		.eq('user_id', userId)
		.gte('salience_score', 7)
		.order('salience_score', { ascending: false })
		.limit(20);

	if (dError) throw dError;

	return {
		baseInstructions: BASE_INSTRUCTIONS,
		personaProfile,
		recentSuperjournal: recentSuperjournal || [],
		recentJournal: recentJournal || [],
		pinnedMessages: pinnedMessages || [],
		decisionArcs: decisionArcs || []
	};
}

/**
 * Format context data into messages for LLM
 */
function formatContextMessages(context: ContextData, userQuery: string) {
	let systemPrompt = `${context.baseInstructions}\n\n---\n\n${context.personaProfile}`;

	// Add pinned messages
	if (context.pinnedMessages.length > 0) {
		systemPrompt += '\n\n## PINNED MESSAGES\n\n';
		for (const msg of context.pinnedMessages) {
			systemPrompt += `[BOSS]: ${msg.boss_essence}\n`;
			systemPrompt += `[${msg.persona_name.toUpperCase()}]: ${msg.persona_essence}\n\n`;
		}
	}

	// Add decision arcs
	if (context.decisionArcs.length > 0) {
		systemPrompt += '\n\n## DECISION ARCS (High Salience)\n\n';
		for (const arc of context.decisionArcs) {
			systemPrompt += `[Salience ${arc.salience_score}] ${arc.decision_arc_summary}\n`;
		}
		systemPrompt += '\n';
	}

	// Add recent journal (compressed)
	if (context.recentJournal.length > 0) {
		systemPrompt += '\n\n## RECENT COMPRESSED HISTORY (Last 100 turns)\n\n';
		for (const entry of context.recentJournal.reverse()) {
			systemPrompt += `[BOSS]: ${entry.boss_essence}\n`;
			systemPrompt += `[${entry.persona_name.toUpperCase()}]: ${entry.persona_essence}\n\n`;
		}
	}

	// Add recent superjournal (full turns) as conversation history
	const conversationHistory = [];
	if (context.recentSuperjournal.length > 0) {
		for (const entry of context.recentSuperjournal.reverse()) {
			conversationHistory.push({
				role: 'user' as const,
				content: entry.user_message
			});
			conversationHistory.push({
				role: 'assistant' as const,
				content: entry.ai_response
			});
		}
	}

	return {
		systemPrompt,
		conversationHistory,
		userQuery
	};
}

/**
 * Call 1A: Hidden reasoning call
 */
async function call1A(
	context: ContextData,
	userQuery: string
): Promise<string> {
	const { systemPrompt, conversationHistory } = formatContextMessages(context, userQuery);

	const messages = [
		{ role: 'system' as const, content: systemPrompt },
		...conversationHistory,
		{ role: 'user' as const, content: userQuery }
	];

	return await callFireworks(messages, 0.7, 4096);
}

/**
 * Call 1B: User-visible streaming response
 */
async function call1B(
	context: ContextData,
	userQuery: string,
	call1AResponse: string
): Promise<ReadableStream<Uint8Array>> {
	const { systemPrompt, conversationHistory } = formatContextMessages(context, userQuery);

	const messages = [
		{ role: 'system' as const, content: systemPrompt },
		...conversationHistory,
		{ role: 'user' as const, content: userQuery },
		{ role: 'assistant' as const, content: call1AResponse },
		{
			role: 'user' as const,
			content: 'Now provide your refined, user-facing response based on your analysis above.'
		}
	];

	return await callFireworksStreaming(messages, 0.7, 4096);
}

/**
 * Call 2: Artisan Cut compression
 */
async function call2(
	userQuery: string,
	aiResponse: string,
	personaName: PersonaName
): Promise<ArtisanCutOutput> {
	const messages = [
		{ role: 'system' as const, content: CALL2_PROMPT },
		{
			role: 'user' as const,
			content: `User query:\n${userQuery}\n\nAI Response (${personaName}):\n${aiResponse}`
		}
	];

	const response = await callFireworks(messages, 0.3, 1024);

	// Parse JSON response
	try {
		const parsed = JSON.parse(response);
		return {
			boss_essence: parsed.boss_essence,
			persona_name: parsed.persona_name,
			persona_essence: parsed.persona_essence,
			decision_arc_summary: parsed.decision_arc_summary,
			salience_score: parsed.salience_score
		};
	} catch (error) {
		console.error('Failed to parse Call 2 response:', error);
		throw new Error('Invalid Artisan Cut output from LLM');
	}
}

/**
 * Main chat orchestration function
 * Returns a ReadableStream for streaming response to user
 */
export async function processChatMessage(
	userId: string,
	personaName: PersonaName,
	userQuery: string
): Promise<{
	stream: ReadableStream<Uint8Array>;
	onComplete: (fullResponse: string) => Promise<void>;
}> {
	// Assemble context
	const context = await assembleContext(userId, personaName);

	// Call 1A: Hidden reasoning
	const call1AResponse = await call1A(context, userQuery);

	// Call 1B: User-visible streaming response
	const stream = await call1B(context, userQuery, call1AResponse);

	// Function to be called when streaming completes
	const onComplete = async (fullResponse: string) => {
		// Save to Superjournal
		const { data: sjEntry, error: sjError } = await supabase
			.from('superjournal')
			.insert({
				user_id: userId,
				persona_name: personaName,
				user_message: userQuery,
				ai_response: fullResponse,
				is_private: personaName === 'samara' // Samara conversations are private by default
			})
			.select()
			.single();

		if (sjError) throw sjError;

		// Call 2: Artisan Cut
		const artisanCut = await call2(userQuery, fullResponse, personaName);

		// Generate embedding for decision arc
		const embedding = await generateEmbedding(artisanCut.decision_arc_summary);

		// Save to Journal
		const { error: jError } = await supabase.from('journal').insert({
			superjournal_id: sjEntry.id,
			user_id: userId,
			persona_name: artisanCut.persona_name,
			boss_essence: artisanCut.boss_essence,
			persona_essence: artisanCut.persona_essence,
			decision_arc_summary: artisanCut.decision_arc_summary,
			salience_score: artisanCut.salience_score,
			is_private: personaName === 'samara',
			embedding
		});

		if (jError) throw jError;
	};

	return { stream, onComplete };
}
