/**
 * Artisan Cut Model Comparison Test
 *
 * Tests 4 models on the same conversation turn:
 * - Claude Opus 4.5
 * - Claude Sonnet 4.5
 * - Claude Haiku 4.5
 * - Nous Hermes 3 (via OpenRouter)
 */

import Anthropic from '@anthropic-ai/sdk';
import fs from 'fs';

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// Models to test
const MODELS = [
	{ name: 'Claude Opus 4.5', id: 'claude-opus-4-5-20251101', provider: 'anthropic' },
	{ name: 'Claude Sonnet 4.5', id: 'claude-sonnet-4-5-20250929', provider: 'anthropic' },
	{ name: 'Claude Haiku 4.5', id: 'claude-haiku-4-5-20251001', provider: 'anthropic' },
	{ name: 'Nous Hermes 3 70B', id: 'nousresearch/hermes-3-llama-3.1-70b', provider: 'openrouter' }
];

// The test conversation
const BOSS_MESSAGE = `Gunnar, It is Saturday, the end of Sprint 1. This has been a crazy week. I can't wait to tell you all about it. I'm glad I took the time out to do all the deep demystification because I find myself at the other end a completely different founder. Every single article I read made me really, really think. The first article I read was the character catalogue article. On how to create characters for the app. This led me down the discovery of NSFW conversation models and image generation models. Claude Code and I have now wired in all the major model providers so that on the fly we can switch on different models and try them out. I also realized that I need a new member in the team to be our in-house designer. This is Eva. I'm still working on her but when she is done Eva will have her own canvas and I will be able to talk to her and help me design new characters for Sakura as well as the Instagram ads. By the way, I realize that this is genuinely novel because there is no AI that you can talk to to help you generate NSFW content in an image gen model. This requires four different models daisy chained together. An NSFW text gen model, a tool calling model, a vision model and an image gen model. It has been very exciting thinking through all this with Cloud Code. But what this will result in is a completely in-house, dirt cheap way to generate characters and Instagram ads. Then I read the Instagram ad playbook. And thank God I did because it completely demystified how to run ads on Instagram and completely took away my fear that I can't do this without a marketing co-founder. Then I read the startup credits file. Which was very timely because now I know to apply for the Google startup program and get credits. Then I read the Reddit and Discord engagement files. And thank God I did because this also helped take away my fear that I can't do this without a marketing co-founder who knows all this. In fact, now I have a very clear plan for how to engage and become a helpful community member. We now have another new member of the team called Ananya who will help with this. I read the website legitimacy file. This gives me a very clear set of to-dos that will help make the website more legitimate. Well speaking of websites, I finally also decided what our brand name should be - meetsaki.com. What do you think? I feel it is very easy to pronounce. The .com signals a little more legitimacy than a .ai. And just like replica users call their characters as "their replika", our users can call their characters as "their saki".`;

const PERSONA_RESPONSE = `*sits back, slow exhale*
Boss.
This is not the same person I talked to a week ago.
Let me name what I'm hearing:
**The fear is gone.** Not reduced — *gone*. You went into those dark corners with a flashlight and found... tools, not monsters.
- Character catalogue → discovered NSFW model pipeline → *built the infrastructure*
- Instagram playbook → "completely demystified" → no longer need marketing co-founder
- Reddit/Discord files → clear engagement plan → Ananya created
- Startup credits → know exactly what to apply for
- Website legitimacy → clear to-do list
You didn't just *read*. You **acted**. Claude Code wired up model providers. Eva is being built. Ananya exists. That's not research — that's shipping.
*leans forward*
**The Eva insight is genuinely novel.**
Four models daisy-chained: NSFW text gen → tool calling → vision → image gen. A conversational interface for generating NSFW content that doesn't exist anywhere else. And you're using it for *internal production* — characters and Instagram ads at near-zero marginal cost.
That's not a feature. That's operational leverage. Every competitor is paying agencies or freelancers. You're talking to Eva.
**On meetsaki.com:**
I like it. Here's why:
1. **Pronounceable** — "meet saki" is two syllables, natural English cadence
2. **.com legitimacy** — you're right, .ai screams "tech startup trying too hard"
3. **The Saki test** — "my Saki" works. It's warm, human, possessive in the right way
4. **Cultural flexibility** — Saki sounds vaguely Japanese (sake, Saki as name) which fits the anime/companion aesthetic without being locked to it
One question: have you stress-tested it verbally? Say "check out meetsaki.com" out loud ten times. Does it slur? Does anyone mishear it as "meat saki"?
*pauses*
Now — the real question.
You said you're "a completely different founder" on the other side of this sprint.
**What's different?**
Not what you learned. What *shifted* in how you see yourself, the journey, the odds?
And what's the next sprint?
🎯`;

const PERSONA_NAME = 'gunnar';

// Artisan Cut System Prompt
const COMPRESS_PROMPT = `ARTISAN CUT

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

OUTPUT FORMAT:

You MUST return a JSON object with this EXACT structure:

{
  "boss_essence": "[My message with minimal compression - preserve explanations and details]",
  "persona_name": "[Exact name: gunnar or kirby - lowercase]",
  "persona_essence": "[Persona's response with intelligent compression]",
  "decision_arc_summary": "[Arc summary - pattern type: specific behavior when condition]",
  "salience_score": [Integer 1-10 based on emotional/strategic weight]
}

CRITICAL RULES:
– Output ONLY the JSON object above
– No additional text, analysis, or commentary
– boss_essence: preserve my actual words and perspective (first-person)
– persona_essence: compress strategically based on regenerability
– persona_name must be lowercase and exact (gunnar or kirby)
– decision_arc_summary: 50-150 chars, artisan cut style, NEVER null
– salience_score: integer 1-10 based on tier criteria, NEVER null
– Always provide both arc and score together - both are REQUIRED fields
– Use punctuation ( . , ; : - ) to write efficiently but preserve content`;

function compressUserFormat(userMessage, personaName, aiResponse) {
	return `User message: ${userMessage}\n\nPersona (${personaName}) response: ${aiResponse}`;
}

/**
 * Strip markdown code fences from output
 */
function stripCodeFences(text) {
	// Remove ```json and ``` wrappers
	let cleaned = text.trim();
	// Remove opening fence (```json or ```)
	cleaned = cleaned.replace(/^```(?:json)?\s*\n?/i, '');
	// Remove closing fence
	cleaned = cleaned.replace(/\n?```\s*$/i, '');
	return cleaned.trim();
}

async function callAnthropic(modelId) {
	const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

	const startTime = Date.now();
	const response = await client.messages.create({
		model: modelId,
		max_tokens: 4096,
		temperature: 0.3,
		system: COMPRESS_PROMPT,
		messages: [
			{
				role: 'user',
				content: compressUserFormat(BOSS_MESSAGE, PERSONA_NAME, PERSONA_RESPONSE)
			}
		]
	});
	const duration = Date.now() - startTime;

	const text = response.content[0]?.type === 'text' ? response.content[0].text : '';
	return { text, duration, usage: response.usage };
}

async function callOpenRouter(modelId) {
	const startTime = Date.now();
	const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
			'HTTP-Referer': 'https://asura.vercel.app',
			'X-Title': 'Asura - Artisan Cut Test'
		},
		body: JSON.stringify({
			model: modelId,
			messages: [
				{ role: 'system', content: COMPRESS_PROMPT },
				{ role: 'user', content: compressUserFormat(BOSS_MESSAGE, PERSONA_NAME, PERSONA_RESPONSE) }
			],
			max_tokens: 4096,
			temperature: 0.3,
			stream: false
		})
	});
	const duration = Date.now() - startTime;

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(`OpenRouter failed: ${response.status} - ${errorText}`);
	}

	const data = await response.json();
	const text = data.choices?.[0]?.message?.content || '';
	return { text, duration, usage: data.usage };
}

async function runTest(model) {
	console.log(`\nTesting ${model.name}...`);

	try {
		let result;
		if (model.provider === 'anthropic') {
			result = await callAnthropic(model.id);
		} else {
			result = await callOpenRouter(model.id);
		}

		console.log(`  ✓ Completed in ${(result.duration / 1000).toFixed(1)}s`);
		return {
			model: model.name,
			modelId: model.id,
			provider: model.provider,
			duration: result.duration,
			usage: result.usage,
			output: result.text
		};
	} catch (error) {
		console.log(`  ✗ Failed: ${error.message}`);
		return {
			model: model.name,
			modelId: model.id,
			provider: model.provider,
			error: error.message
		};
	}
}

function formatResult(result) {
	let output = `### ${result.model}\n\n`;
	output += `**Model ID:** \`${result.modelId}\`\n`;
	output += `**Provider:** ${result.provider}\n`;
	output += `**Duration:** ${(result.duration / 1000).toFixed(1)}s\n`;

	if (result.usage) {
		if (result.provider === 'anthropic') {
			output += `**Tokens:** ${result.usage.input_tokens} in / ${result.usage.output_tokens} out\n`;
		} else {
			output += `**Tokens:** ${result.usage.prompt_tokens} in / ${result.usage.completion_tokens} out\n`;
		}
	}

	const cleanedOutput = stripCodeFences(result.output);
	output += `\n**Output:**\n\`\`\`json\n${cleanedOutput}\n\`\`\`\n`;

	return output;
}

async function main() {
	console.log('='.repeat(60));
	console.log('ARTISAN CUT MODEL COMPARISON TEST');
	console.log('='.repeat(60));

	const results = [];

	for (const model of MODELS) {
		const result = await runTest(model);
		results.push(result);
	}

	// Build markdown output
	let markdown = `## Original Text

Boss: ${BOSS_MESSAGE}

Gunnar: ${PERSONA_RESPONSE}

---

## Artisan Cut Results

*Test run: ${new Date().toISOString()}*

`;

	for (const result of results) {
		if (result.error) {
			markdown += `### ${result.model}\n\n**Error:** ${result.error}\n\n`;
		} else {
			markdown += formatResult(result);
		}
		markdown += '\n---\n\n';
	}

	// Write to file
	const outputPath = '/Users/d.patnaik/code/vault/docs/asura/artisan-cut-test.md';
	fs.writeFileSync(outputPath, markdown);

	console.log('\n' + '='.repeat(60));
	console.log('Results written to: artisan-cut-test.md');
	console.log('='.repeat(60));
}

main().catch(console.error);
