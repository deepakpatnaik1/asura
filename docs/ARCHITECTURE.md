# Asura Architecture Documentation

## Overview

Asura is a sophisticated AI chat interface for startup founders, featuring perpetual conversation continuity through a novel multi-call architecture with intelligent compression and semantic memory.

## Core Innovation: Perpetual Conversation Continuity

Unlike traditional AI chat apps where the AI eventually "forgets" past conversations due to context window limitations, Asura implements a three-tier memory system that mimics human cognitive memory patterns.

## The Problem with Traditional Chat Apps

Traditional AI chat applications face a fundamental asymmetry problem:
- User queries are typically short (1-2 sentences)
- AI responses are much longer (multiple paragraphs)
- Loading full conversation history into context fills the window rapidly
- After N turns, the AI loses memory of earlier conversations
- Users lose the "continuous advisor" experience

## Asura's Solution: Artisan Cut + Decision Arcs

### Three-Tier Memory Architecture

**1. Working Memory (Last 5 Superjournal turns)**
- Full, uncompressed conversation turns
- Perfect recall of very recent interactions
- Loaded into every API call

**2. Recent Memory (Last 100 Journal turns)**
- Artisan Cut compressed turns
- Crystal clear memory of recent past (equivalent to 6-12 months of human memory)
- Lossless high-signal low-noise compression
- Loaded into every API call

**3. Long-Term Memory (Decision Arcs + Vector Database)**
- Compressed behavioral patterns (50-150 characters each)
- Salience-weighted (1-10 scale)
- Retrieved via semantic search (RAG)
- Loaded as many as fit within context budget

### Context Window Budget

All context (base instructions, persona prompt, memory tiers, decision arcs) fits within **40% of the selected LLM's context window**, leaving 60% for output generation.

## Multi-Call Architecture

Every user message triggers a sophisticated three-call sequence:

### Call 1A: Hidden Reasoning Call

**Input:**
- User query
- Base instructions
- Persona-specific prompt
- Last 5 Superjournal turns (full)
- Last 100 Journal turns (compressed)
- Starred/pinned messages (salience 10)
- Decision Arcs from vector search (as many as fit)

**Output:**
- Full LLM response (NOT shown to user)
- Saved in backend variable for Call 1B

**Purpose:** First-pass reasoning to generate informed response

### Call 1B: User-Visible Response Call

**Input:**
- Everything from Call 1A
- Call 1A user query
- Call 1A LLM response

**Output:**
- Refined LLM response (streamed to user)
- Saved to **Superjournal** table

**Purpose:** Second-pass reasoning produces polished, user-visible response

### Call 2: Artisan Cut Compression

**Input:**
- System prompt: `CALL2_PROMPT` (Artisan Cut instructions)
- Call 1B user query
- Call 1B LLM response

**Output:** JSON object
```json
{
  "boss_essence": "[User message with minimal compression]",
  "persona_name": "[lowercase persona name]",
  "persona_essence": "[AI response with intelligent compression]",
  "decision_arc_summary": "[50-150 char pattern]",
  "salience_score": [1-10 integer]
}
```

**Purpose:** Create compressed memory entry for long-term storage

**Saved to:** Journal table

## Artisan Cut: Lossless High-Signal Compression

### Philosophy

The Artisan Cut is NOT naive summarization. It's a sophisticated compression technique based on **regenerability** - keeping information that cannot be easily inferred, compressing information that can be regenerated from principles.

### User Messages (boss_essence)

**PRESERVE:**
- Technical architecture explanations
- Product features and capabilities
- Business strategy details
- The "how" and "why" behind decisions
- Specific details: numbers, names, timelines, dollar amounts, percentages
- Emotional states and breakthroughs
- Business updates: customers, partners, progress, setbacks
- Strategic questions being pursued

**REMOVE ONLY:**
- Pure filler: "hey", "thanks", "so basically"
- Grammatical padding: "I was thinking that maybe..."
- Obvious repetitions

### AI Responses (persona_essence)

**CONDENSE TIGHTLY:**
- Unique strategic insights not obvious from principles
- Specific recommendations made
- Critical tactical guidance not derivable from general principles
- Core diagnostic questions asked
- What was chosen/rejected and WHY

**REMOVE:**
- Tactical details derivable from principles
- Step-by-step methodologies (keep decision, compress steps)
- Calculations regenerable from given numbers
- Examples and analogies
- Background explanations of well-known concepts
- Politeness, encouragement, filler
- Repetitions of user's points

## Decision Arcs: Semantic Memory Indices

Decision Arcs are compressed behavioral patterns that serve as semantic pointers into the vector database.

### Format

- **Length:** 50-150 characters
- **Style:** Heavy punctuation (: ; , -) for compression
- **Content:** Pattern type: specific behavior when condition

### Salience Scoring (1-10)

**Tier 1: High Salience (8-10) - Foundational Decisions**
- Values declarations
- Identity-defining choices
- Major strategic pivots
- Irreversible decisions
- Examples: "Pivoting B2B→B2C", "Never compromise user privacy"

**Tier 2: Medium Salience (5-7) - Strategic Resource Decisions**
- Resource allocation
- Hiring strategy
- Pricing decisions
- Roadmap priorities
- Examples: "Hire senior eng over junior 6mo", "Raise prices 20%"

**Tier 3: Low Salience (1-4) - Tactical/Exploratory**
- Minor tactical choices
- Exploratory questions
- Information-seeking
- Easily reversible decisions
- Examples: "React vs Vue for internal tool?", "What metrics to track?"

### Starred Messages

Users can manually star message turns, which overrides salience to 10 (highest tier). Acts like pinned messages - forces perpetual inclusion in context.

## File Upload Architecture

### Challenge

Large files (10,000+ word documents, PDFs) would overload context windows, but contain strategically important information requiring high-quality compression.

### Solution: LLM-Based Logical Chunking

**Step 1: Intelligent Chunking**
- File sent to LLM with chunking prompt
- LLM breaks file into logical semantic chunks (not arbitrary size-based splits)
- Only LLM can understand content structure for proper boundaries

**Step 2: Modified Call 2 Per Chunk**
- Each logical chunk sent as separate Modified Call 2
- Uses `MODIFIED_CALL2_PROMPT` (specialized for file content)
- Focuses on behavioral directives, strategic content, exact data

**Output JSON per chunk:**
```json
{
  "filename": "[exact filename.ext]",
  "file_type": "[image|pdf|text|code|spreadsheet|other]",
  "description": "[artisan cut compressed description]"
}
```

**Step 3: Concatenation**
- All chunk responses concatenated
- Saved as single row in Journal table
- Becomes part of perpetual memory

**Step 4: Deduplication**
- Re-uploading same file updates existing Journal row (doesn't create new one)

### File + Query Edge Case

When user uploads file AND asks question simultaneously:
- File processing blocks query execution
- Sequential processing: Chunk → Modified Call 2s → Save to Journal
- Only then execute Call 1A/1B with file artisan cut available in context
- User waits, but gets complete response with full file context

## Database Schema

### Superjournal Table

Stores full, uncompressed conversation turns.

**Fields:**
- `id` (UUID, primary key)
- `user_id` (UUID, foreign key)
- `persona_name` (text)
- `user_message` (text)
- `ai_response` (text)
- `created_at` (timestamp)
- `is_starred` (boolean, default false)

**Characteristics:**
- Lazy-loaded to UI on app startup/refresh
- Last 5 turns loaded into Call 1A/1B context
- Linked to UI: deleting in UI cascades to Superjournal and Journal

### Journal Table

Stores Artisan Cut compressed turns and file descriptions.

**Fields:**
- `id` (UUID, primary key)
- `superjournal_id` (UUID, foreign key, nullable for files)
- `user_id` (UUID, foreign key)
- `persona_name` (text)
- `boss_essence` (text)
- `persona_essence` (text)
- `decision_arc_summary` (text)
- `salience_score` (integer 1-10)
- `is_starred` (boolean, default false)
- `file_name` (text, nullable)
- `file_type` (text, nullable)
- `created_at` (timestamp)
- `embedding` (vector, for semantic search)

**Characteristics:**
- Last 100 turns loaded into Call 1A/1B context
- Embeddings generated via Voyage AI (Gemini)
- Vector search retrieves relevant decision arcs
- Starred messages always included in context

## Cost Optimization Strategy

### Model Selection

**LLM Inference: Qwen 2.5 235B via Fireworks AI**
- Dirt cheap compared to OpenAI/Anthropic
- Multi-call architecture (1A→1B) compensates for any quality gaps
- Automatic prompt caching (no developer action needed)

**Embeddings: Gemini via Voyage AI**
- High quality embeddings
- Dirt cheap compared to OpenAI embeddings
- Used for Decision Arc vector search

### Why This Works

**Traditional approach:**
- 1 call × expensive model (GPT-4/Claude) = High cost per message

**Asura approach:**
- 3 calls × cheap model (Qwen) = Still lower cost per message
- Architecture quality boost > model quality difference
- Automatic prompt caching reduces input token costs significantly

**Caching Benefits:**
- Base instructions (constant) → cached
- Persona prompts (constant per persona) → cached
- Last 5 Superjournal (changes slowly) → mostly cached
- Last 100 Journal (incremental changes) → mostly cached
- Multi-call pattern benefits MORE from caching than single-call systems

## Personas

Six specialized AI advisors, each with distinct expertise and tone:

1. **Gunnar** - YC Startup Mentor (execution, WHAT and HOW)
2. **Vlad** - First Principles Thinker (reasoning, WHY and WHETHER)
3. **Kirby** - Guerrilla Marketer (marketing, sales, growth)
4. **Stefan** - Finance Expert (unit economics, metrics, fundraising)
5. **Ananya** - Intellectual Companion (books, ideas, culture)
6. **Samara** - Journal Companion (emotional processing, reflection)

Each persona has:
- Shared base instructions
- Persona-specific profile and tone
- Access to full memory architecture
- Perpetual memory of all past conversations

## Multi-User Knowledge Sharing

### Privacy Model

Asura implements selective knowledge sharing across founder team members:

**Shared:**
- Business-related conversations
- Strategic decisions
- Product discussions
- All Decision Arcs

**Private:**
- Personal journal entries (conversations with Samara)
- Starred messages marked as private
- Emotional processing sessions

This enables founder teams to benefit from collective knowledge while maintaining personal privacy.

## Implementation Stack

### Frontend
- **Framework:** SvelteKit + TypeScript
- **Styling:** Tailwind CSS v4 (with Typography & Forms plugins)
- **UI State:** Svelte stores

### Backend
- **Database:** Supabase (PostgreSQL)
- **Auth:** Supabase Auth
- **Vector DB:** Supabase pgvector extension
- **Edge Functions:** Supabase Edge Functions (Deno runtime)

### AI Services
- **LLM:** Qwen 2.5 235B via Fireworks AI
- **Embeddings:** Gemini via Voyage AI
- **Vector Search:** Supabase pgvector

### Development Tools
- **MCP:** Supabase MCP, Playwright MCP
- **Testing:** Playwright for E2E

## API Flow Example

### User sends message: "Should we raise prices 20%?"

**1. Call 1A (Hidden)**
```
Input tokens: ~15,000
- Base instructions: 500
- Gunnar persona: 300
- Last 5 Superjournal: 3,000
- Last 100 Journal: 8,000
- Pinned messages: 1,000
- Decision Arcs: 2,200

Output: Full reasoning response (not shown to user)
```

**2. Call 1B (Streamed)**
```
Input tokens: ~16,500 (Call 1A input + Call 1A output)
Output: Polished response streamed to user

Saved to Superjournal:
{
  user_message: "Should we raise prices 20%?",
  ai_response: "[Full streamed response]",
  persona_name: "gunnar"
}
```

**3. Call 2 (Artisan Cut)**
```
Input:
- CALL2_PROMPT
- Call 1B query + response

Output:
{
  "boss_essence": "Should we raise prices 20%?",
  "persona_name": "gunnar",
  "persona_essence": "Suggested testing 15-20% increase with cohort; watch churn...",
  "decision_arc_summary": "Pricing strategy: considering 20% increase, testing approach",
  "salience_score": 6
}

Saved to Journal with embedding generated
```

**Total API calls per user message: 3**
**Cost:** ~1/3 of single Claude Opus call despite 3x calls

## Future Enhancements

### Phase 2 Features (Not in MVP)
- Side chats (branching conversations)
- Rethink feature (regenerate responses)
- Auto-scroll optimization
- Turn mode (readability enhancement)
- Calendar integration
- Todo management
- Web search integration

### Scalability Considerations
- Prompt caching effectiveness improves with user activity
- Vector search performance scales with pgvector indices
- Edge Functions enable global low-latency deployment
- Supabase handles multi-tenancy naturally

## Key Design Principles

1. **Memory Over Model:** Architecture compensates for cheaper models
2. **Lossless Compression:** Artisan Cut preserves regenerability, not just summarization
3. **Human-Like Memory:** Three tiers mirror working/recent/long-term human memory
4. **Cost Efficiency:** Premium experience at budget pricing through design
5. **Perpetual Continuity:** AI never forgets foundational decisions
6. **Salience Matters:** Important memories naturally rise to top
7. **User Control:** Manual starring overrides automatic salience

## Success Metrics

- **Memory Retention:** AI recalls decisions from months ago accurately
- **Cost Per Message:** <$0.01 per user message (3 calls combined)
- **Response Quality:** Comparable to premium models despite budget pricing
- **Conversation Continuity:** Zero "I don't recall" moments for high-salience items
- **User Satisfaction:** Founders feel "understood" across long time horizons
