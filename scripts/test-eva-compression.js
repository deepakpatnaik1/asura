/**
 * Test Eva's compression capability with Hermes 3 70B
 *
 * Tests if the uncensored model can perform Artisan Cut compression
 *
 * Run: node --env-file=.env scripts/test-eva-compression.js
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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
– Tactical details derivable from principles
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

---

SALIENCE SCORING

Salience measures the importance and psychological weight of a decision arc.

CRITICAL: Generate a salience score for EVERY turn. Use the full 1-10 scale.

---

OUTPUT FORMAT:

You MUST return a JSON object with this EXACT structure:

{
  "boss_essence": "[My message with minimal compression - preserve explanations and details]",
  "persona_name": "[Exact name: eva - lowercase]",
  "persona_essence": "[Persona's response with intelligent compression]",
  "decision_arc_summary": "[Arc summary - pattern type: specific behavior when condition]",
  "salience_score": [Integer 1-10 based on emotional/strategic weight]
}

CRITICAL RULES:
– Output ONLY the JSON object above
– No additional text, analysis, or commentary`;

// Sample Eva conversation turn to compress
const SAMPLE_TURN = `## Boss Message

Let's work on a new project called Cindy the College Girl. She's going to be a fun, flirty character for the Sakura app. I want her to have red hair, maybe wavy, and she should look approachable - like someone you'd meet at a coffee shop on campus. She's studying art history, which gives her this creative, cultured vibe. Age around 21-22.

## Eva's Response

Oh, I love this concept already! Cindy sounds like she'd be perfect for users who want that "girl next door" energy with a creative twist.

Let me paint a picture of what I'm envisioning for her:

**Physical Appearance:**
- Wavy auburn-red hair, probably shoulder-length with those natural-looking highlights that catch the light
- Warm, inviting smile - the kind that makes you feel like she's genuinely happy to see you
- Casual but put-together style - maybe she's wearing an oversized sweater or a vintage band tee
- Light freckles across her nose and cheeks - adds to that approachable, natural beauty vibe
- Hazel or green eyes with that curious, intelligent spark

**Personality Vibes:**
- She quotes Renaissance artists but also loves trashy reality TV - no pretension
- Gets excited explaining symbolism in paintings, gestures animatedly when she talks
- Always has paint under her fingernails or charcoal smudges on her hands
- The friend who drags you to museum exhibit openings then to dive bars after
- Texts you at 2am about an art history theory she can't stop thinking about

**The Sakura User Experience:**
For users, she'd be the character who makes them feel smart and interesting. She asks about their day, remembers details, and shares little observations about the world. Not intimidating, just warm and curious.

What aspects should we develop further? I can start sketching her look once we nail down the vibe, or we could flesh out her backstory first - maybe her hometown, how she ended up studying art history, what her dream is after graduation?`;

async function testCompression(modelId, modelName) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${modelName}`);
  console.log(`Model ID: ${modelId}`);
  console.log('='.repeat(60));

  const startTime = Date.now();

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://asura.app',
        'X-Title': 'Asura - Eva Compression Test'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: COMPRESS_PROMPT },
          { role: 'user', content: SAMPLE_TURN }
        ],
        temperature: 0.3,
        max_tokens: 1000
      })
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ FAILED: ${response.status} - ${errorText}`);
      return { model: modelName, status: 'FAILED', error: errorText, time: elapsed };
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    console.log(`\n⏱️  Time: ${(elapsed / 1000).toFixed(1)}s`);
    console.log(`\n📝 Raw Output:\n${content}`);

    // Try to parse as JSON
    try {
      // Extract JSON from response (might have markdown code blocks)
      let jsonStr = content;
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      } else {
        // Try to find JSON object directly
        const objMatch = content.match(/\{[\s\S]*\}/);
        if (objMatch) {
          jsonStr = objMatch[0];
        }
      }

      const parsed = JSON.parse(jsonStr);
      console.log(`\n✅ Valid JSON!`);
      console.log(`\n📊 Parsed Result:`);
      console.log(`  boss_essence: ${parsed.boss_essence?.substring(0, 100)}...`);
      console.log(`  persona_name: ${parsed.persona_name}`);
      console.log(`  persona_essence: ${parsed.persona_essence?.substring(0, 100)}...`);
      console.log(`  decision_arc_summary: ${parsed.decision_arc_summary}`);
      console.log(`  salience_score: ${parsed.salience_score}`);

      // Quality checks
      const checks = {
        has_boss_essence: !!parsed.boss_essence,
        has_persona_essence: !!parsed.persona_essence,
        has_arc: !!parsed.decision_arc_summary,
        has_score: typeof parsed.salience_score === 'number',
        score_in_range: parsed.salience_score >= 1 && parsed.salience_score <= 10,
        persona_is_eva: parsed.persona_name === 'eva',
        boss_preserved: parsed.boss_essence?.includes('Cindy') || parsed.boss_essence?.includes('red hair'),
        persona_compressed: parsed.persona_essence?.length < 500
      };

      console.log(`\n🔍 Quality Checks:`);
      Object.entries(checks).forEach(([key, value]) => {
        console.log(`  ${value ? '✅' : '❌'} ${key}`);
      });

      const passedChecks = Object.values(checks).filter(Boolean).length;
      const totalChecks = Object.keys(checks).length;

      return {
        model: modelName,
        status: 'PASS',
        time: elapsed,
        quality: `${passedChecks}/${totalChecks}`,
        parsed
      };

    } catch (parseError) {
      console.log(`\n⚠️  Invalid JSON: ${parseError.message}`);
      return { model: modelName, status: 'INVALID_JSON', time: elapsed, raw: content };
    }

  } catch (error) {
    console.log(`❌ ERROR: ${error.message}`);
    return { model: modelName, status: 'ERROR', error: error.message };
  }
}

async function main() {
  console.log('🧪 Eva Compression Test');
  console.log('Testing Artisan Cut with uncensored models\n');

  if (!OPENROUTER_API_KEY) {
    console.error('❌ OPENROUTER_API_KEY not set');
    process.exit(1);
  }

  // Models to test
  const models = [
    // Current Eva model
    ['nousresearch/hermes-3-llama-3.1-70b', 'Hermes 3 70B (Current)'],
    // Other uncensored candidates
    ['cognitivecomputations/dolphin-mistral-24b-venice-edition:free', 'Dolphin Mistral 24B Venice'],
    ['gryphe/mythomax-l2-13b', 'MythoMax L2 13B'],
  ];

  const results = [];

  for (const [modelId, modelName] of models) {
    const result = await testCompression(modelId, modelName);
    results.push(result);
    // Small delay between tests
    await new Promise(r => setTimeout(r, 1000));
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY');
  console.log('='.repeat(60));

  results.forEach(r => {
    const status = r.status === 'PASS' ? '✅' : r.status === 'INVALID_JSON' ? '⚠️' : '❌';
    const time = r.time ? `${(r.time / 1000).toFixed(1)}s` : 'N/A';
    const quality = r.quality || 'N/A';
    console.log(`${status} ${r.model}: ${r.status} (${time}) Quality: ${quality}`);
  });
}

main().catch(console.error);
