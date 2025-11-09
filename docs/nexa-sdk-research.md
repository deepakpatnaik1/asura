# Nexa SDK Research & Implementation Plan

## Overview

Nexa SDK is a comprehensive toolkit for running AI models locally across NPU, GPU, and CPU. This document outlines its capabilities and how it can be integrated into Asura to reduce costs, improve privacy, and enable new features like file upload with visual understanding.

---

## Table of Contents

1. [What is Nexa SDK?](#what-is-nexa-sdk)
2. [Key Advantages Over Current Setup](#key-advantages-over-current-setup)
3. [Embeddings Capabilities](#embeddings-capabilities)
4. [Vision Language Models (VLMs)](#vision-language-models-vlms)
5. [Audio Language Models (Speech-to-Text)](#audio-language-models-speech-to-text)
6. [Text Generation (LLMs)](#text-generation-llms)
7. [Implementation Roadmap](#implementation-roadmap)
8. [Hardware Requirements](#hardware-requirements)
9. [Cost Analysis](#cost-analysis)
10. [References](#references)

---

## What is Nexa SDK?

**NexaSDK** is an easy-to-use developer toolkit for running any AI model locally — across NPUs, GPUs, and CPUs — powered by the NexaML engine, built entirely from scratch for peak performance on every hardware stack.

### Core Features

- **Local-first inference**: All processing happens on your machine (no cloud dependency)
- **Multiple model formats**: GGUF, MLX, and proprietary `.nexa` format
- **OpenAI-compatible API**: Drop-in replacement for existing code
- **Cross-platform**: macOS, Linux, Windows with hardware acceleration (Metal, CUDA, ROCm, Vulkan)
- **Multimodal support**: Text, images, audio, video
- **NPU-first approach**: Optimized for Neural Processing Units (advantage over Ollama)
- **Mobile support**: Android & iOS with NPU/GPU/CPU support

### Installation

```bash
# Python package
pip install nexaai

# Model management
nexa pull <model-name>      # Download model
nexa server <model-name>    # Start local API server
nexa infer <model-name>     # Interactive CLI
nexa embed <model-name> "text"  # Generate embeddings
```

### Key Advantages Over Ollama

| Feature | Nexa SDK | Ollama |
|---------|----------|--------|
| NPU Support | ✅ NPU-first | ❌ No NPU |
| Mobile (Android/iOS) | ✅ Full support | ❌ Limited |
| Model Formats | GGUF, MLX, .nexa | GGUF only |
| Multimodality | Image, Audio, Text | Text-focused |
| Low-level Control | ✅ Yes | Limited |
| Cross-platform | Desktop, Mobile, Automotive, IoT | Desktop only |

---

## Key Advantages Over Current Setup

### 1. Zero API Costs
- **Embeddings**: Voyage AI → $0/month (nomic-embed-text local)
- **Vision**: No current solution → $0/month (Qwen3-VL local)
- **Audio**: No current solution → $0/month (OmniAudio local)

### 2. Privacy & Control
- All processing happens locally
- No data sent to third parties
- Full control over model versions
- No rate limits or quotas

### 3. No Latency from API Calls
- Local inference = sub-second response times
- No network dependency
- Better user experience

### 4. OpenAI-Compatible API
- Drop-in replacement for existing code
- Minimal changes to `src/routes/api/chat/+server.ts`
- Same REST endpoints (`/v1/embeddings`, `/v1/chat/completions`)

### 5. NPU/GPU/CPU Flexibility
- Automatic hardware acceleration
- Works on Mac (Metal), Linux (CUDA/ROCm), Windows (Vulkan)
- Optimized for Apple Silicon

---

## Embeddings Capabilities

### Current Setup (Voyage AI)
- Model: `voyage-3-large`
- Dimensions: **1,024**
- Cost: Paid API service ($0.06-$0.18 per million tokens)
- Cloud-based

### Recommended Replacement: nomic-embed-text ⭐

**Why nomic-embed-text is the perfect fit:**

- ✅ **1,024 dimensions** (same as Voyage AI - no schema changes!)
- ✅ 8,192 token context window
- ✅ Matryoshka support (can truncate to 768/512/256 if needed)
- ✅ Well-regarded, open source
- ✅ **Zero cost** (runs locally)
- ✅ No API latency
- ✅ Privacy (embeddings never leave your machine)

**Usage:**

```bash
# CLI
nexa embed nomic-embed-text "I love Nexa AI."
nexa embed nomic-embed-text "Your text" >> embeddings.txt

# API Server
nexa server nomic-embed-text

# REST API call
curl -X POST http://127.0.0.1:18181/v1/embeddings \
  -H "Content-Type: application/json" \
  -d '{"model":"nomic-embed-text","input":"Hello, world!"}'
```

**Integration Point:**
- Update embedding generation in `src/routes/api/chat/+server.ts` (Call 2B)
- Replace Voyage AI API call with local Nexa SDK endpoint
- Keep same 1,024 dimensions (no database migration needed)

### Alternative Option: EmbeddingGemma

**Google's EmbeddingGemma (300M params):**

- ⚠️ **768 dimensions** (requires database schema migration)
- ✅ Best-in-class under 500M parameters on MTEB benchmark
- ✅ NPU-optimized (fastest inference)
- ✅ Matryoshka support (512/256/128)
- ✅ Day-0 support in Nexa SDK
- ✅ Highest ranking open multilingual text embedding model under 500M

**Considerations:**
- Would require updating `supabase/migrations/*_update_embedding_dimensions.sql`
- Would need to re-embed all existing Journal entries
- Benefit: Slightly better performance on benchmarks

### Other Supported Embedding Models

- **Jina Embeddings v2/v3**: Multilingual, task-specific adapters, 8,192 token context
- **MxBai**: Available via Nexa CLI
- **sentence-transformers/all-MiniLM-L6-v2**: Compact and fast (GGUF format)

**CLI Examples:**
```bash
nexa embed mxbai "I love Nexa AI."
nexa embed jina-embeddings-v2-small-en "Your text"
nexa embed sentence-transformers/all-MiniLM-L6-v2:gguf-fp16 "Your text"
```

---

## Vision Language Models (VLMs)

### The File Upload Problem

**Current Status (from `docs/asura-vision.md`):**
> ⏳ **Planned**: File upload with LLM-based logical chunking (Modified Call 2)

**Challenge:**
- How to process PDFs, slide decks, and documents with illustrations?
- How to create logical chunks that preserve visual context?
- How to apply Artisan Cut compression to uploaded files?

### Nexa SDK Solution: Vision Language Models

Nexa SDK provides powerful VLMs that can **see** and **understand** documents visually, enabling intelligent chunking and compression.

---

### Supported VLM Models

#### 1. Qwen3-VL (Recommended for Asura) ⭐

**Available sizes:** 2B, 4B, 8B, 32B, 235B (both Dense and MoE architectures)

**Key capabilities:**
- ✅ **256K context window** (expandable to 1M tokens!) - Can process entire books
- ✅ **Multi-page document processing** - Handle entire slide decks in one pass
- ✅ **Layout-aware parsing** - Understands document structure, not just text
- ✅ **Position information** - Knows where text appears on pages
- ✅ **Batch multi-image processing** - Process multiple pages simultaneously
- ✅ **Long-document structure parsing** - Identifies logical sections
- ✅ **Document parsing cookbook** - Built-in support for complex documents
- ✅ **Qwen HTML format** - Structured output with layout preservation

**Benchmarks:**
- Superior text understanding & generation
- Deeper visual perception & reasoning
- Strong performance on document parsing (competitive with specialized tools)
- Handles slides, financial reports, handwritten notes

**Day-0 Support in Nexa SDK:**
- GGUF, MLX, and `.nexa` formats
- NPU/GPU/CPU inference
- Only framework supporting GGUF format for Qwen3-VL

**Model variants:**
- **Qwen3-VL-4B**: Good balance of speed and quality (runs on CPU)
- **Qwen3-VL-8B**: Recommended for quality (GPU/NPU preferred)
- **Qwen3-VL-32B**: Maximum quality (requires GPU)
- **Qwen3-VL-235B-A22B**: MoE variant (best quality, highest requirements)
- **Thinking editions**: Available for reasoning-heavy tasks

**Usage:**
```bash
# Download model
nexa pull Qwen3-VL-8B-Instruct

# Interactive CLI (drag-and-drop images/PDFs)
nexa infer Qwen3-VL-8B-Instruct
# Then drag image files directly into the terminal

# API Server
nexa server Qwen3-VL-8B-Instruct

# REST API call
curl -X POST http://127.0.0.1:18181/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{
    "model": "Qwen3-VL-8B-Instruct",
    "messages": [
      {
        "role": "user",
        "content": [
          {"type": "image_url", "image_url": {"url": "file:///path/to/slide.png"}},
          {"type": "text", "text": "Analyze this slide and identify key concepts"}
        ]
      }
    ]
  }'
```

#### 2. OmniVLM (0.9B parameters)

**Nexa AI's own compact vision model:**
- ✅ Fast edge inference
- ✅ Multi-image support
- ✅ Lightweight and efficient

**Usage:**
```bash
nexa run omniVLM
```

#### 3. OmniVision-968M

**Ultra-efficient vision model:**
- ✅ **9x token reduction** (729 → 81 tokens per image)
- ✅ Extremely fast inference
- ✅ Based on Qwen2.5-0.5B + SigLIP-400M vision encoder
- ✅ 384 resolution with 14×14 patch size
- ✅ Optimized for edge devices

**Perfect for:**
- Quick document previews
- Real-time processing
- Resource-constrained environments

#### 4. Gemma 3n (Multimodal)

**Google's multimodal Gemma:**
- ✅ First-ever Gemma-3n multimodal inference support in Nexa SDK
- ✅ GPU & CPU support in GGUF format

---

### How VLMs Solve the File Upload Feature

**Workflow Example:**

```
User uploads: "Investor pitch deck (15 slides)"
           ↓
Qwen3-VL-8B analyzes all 15 slides in one pass (256K context)
           ↓
Identifies logical chunks:
  - Slide 1-2: Problem statement
  - Slide 3-5: Solution overview
  - Slide 6-8: Market analysis
  - Slide 9-12: Business model
  - Slide 13-15: Team & ask
           ↓
For each chunk, generates:
  - boss_essence (compressed user content)
  - decision_arc_summary (behavioral patterns)
  - salience_score (importance rating)
           ↓
Saved to Journal with embeddings
           ↓
Searchable via semantic retrieval (Priority 5)
```

**What VLM can extract:**

1. **Visual Document Understanding:**
   - Describe charts, diagrams, illustrations
   - Extract text while preserving layout context
   - Understand relationships between visual elements
   - Recognize hierarchical structure (titles, headers, bullets)

2. **Logical Chunking:**
   - Identify natural section boundaries
   - Recognize slides/pages as semantic units
   - Understand topic transitions
   - Detect when new concepts are introduced

3. **Artisan Cut Assistance:**
   - Process entire documents in one pass (256K context)
   - Generate compressed summaries for each logical chunk
   - Preserve high-signal information (numbers, dates, key concepts)
   - Identify what's regenerable vs. what must be preserved
   - Maintain visual context ("chart showing 40% growth" vs. describing the chart)

4. **Multi-Format Support:**
   - PDFs with illustrations
   - Slide decks (PowerPoint exported as images)
   - Handwritten notes
   - Financial reports
   - Screenshots
   - Diagrams and flowcharts

**Implementation Approach (Modified Call 2):**

Current Call 2 (text-only):
```
Call 2A: Initial Artisan Cut Compression
Call 2B: Compression Verification & Refinement
```

Modified Call 2 (file upload):
```
Pre-Call: VLM analyzes uploaded file
  ↓ Outputs: Logical chunks with visual descriptions

For each chunk:
  Call 2A: Artisan Cut with visual context
  Call 2B: Verification with visual grounding
  ↓ Save to Journal with embeddings
```

**Integration Point:**
- Create new endpoint `/api/upload` in `src/routes/api/`
- Accept PDF/image uploads
- Convert PDF pages to images (use `pdf2image` library)
- Send to Qwen3-VL for analysis
- Extract logical chunks
- Process each chunk through modified Call 2A/2B
- Store in Journal with embeddings

---

### CLI Features for VLMs

**Interactive multimodal chat:**
```bash
nexa infer Qwen3-VL-8B-Instruct
```
- Drag-and-drop images directly into the CLI
- Drop multiple images at once for batch processing
- Mix text and image inputs naturally

**Command options:**
```bash
nexa run MODEL_PATH -mt MULTIMODAL \
  -t 0.7 \              # Temperature
  -m 2048 \             # Max new tokens
  -k 40 \               # Top-k sampling
  -p 0.95               # Top-p sampling
```

---

## Audio Language Models (Speech-to-Text)

### Supported Model: OmniAudio-2.6B ⭐

**Architecture:**
- Based on **Whisper Turbo** (ASR) + **Gemma-2-2b** (language model)
- Custom projector module for audio-text fusion
- Optimized for edge deployment

**Performance:**
- **35.23 tokens/second** (FP16 GGUF on Mac Mini M4 Pro)
- **66 tokens/second** (Q4_K_M quantized GGUF)
- Extremely fast local ASR
- No cloud dependency

**Features:**
- ✅ Local speech-to-text (ASR)
- ✅ OpenAI-compatible API
- ✅ Streaming support
- ✅ Edge-optimized (works on mobile devices)
- ✅ Secure and private (no audio leaves your machine)

**Usage:**
```bash
# Start ASR server
nexa server OmniAudio-2.6B

# Transcribe audio
curl -X POST http://127.0.0.1:18181/v1/audio/transcriptions \
  -F "file=@meeting.mp3" \
  -F "model=OmniAudio-2.6B"
```

**CLI:**
```bash
# Interactive mode (drag-and-drop audio files)
nexa infer OmniAudio-2.6B
```

---

### Use Cases for Asura

#### 1. Voice Notes Feature (High Priority)

**User Story:**
> Founder records thoughts while commuting, driving, or during downtime

**Workflow:**
```
User records voice note (mobile/desktop)
           ↓
OmniAudio transcribes locally (66 tokens/sec = real-time+)
           ↓
Transcription processed through existing 4-call flow:
  - Call 1A: Hidden reasoning
  - Call 1B: Polished response (saved to Superjournal)
  - Call 2A: Artisan Cut compression
  - Call 2B: Verification (saved to Journal with embedding)
           ↓
Voice note becomes searchable via semantic retrieval
```

**Benefits:**
- Faster input than typing (especially on mobile)
- Capture ideas immediately
- More natural for emotional processing (Samara persona)
- Accessible while multitasking

**Implementation:**
- Add audio upload to UI (alongside text input)
- Send to local OmniAudio endpoint
- Feed transcription into existing chat flow
- Mark Journal entries with `audio_source: true` flag

#### 2. Meeting Transcription

**User Story:**
> Founder records investor meetings, customer calls, team discussions

**Workflow:**
```
Upload meeting recording (audio/video)
           ↓
OmniAudio transcribes (if video, extract audio first)
           ↓
Optional: VLM analyzes video frames for visual context
           ↓
Artisan Cut compression per topic/speaker
           ↓
High salience scores for key decisions (fundraising, pivots, customer insights)
           ↓
Searchable via decision arcs
```

**Benefits:**
- Never forget important meeting details
- Automatic capture of commitments and action items
- High-salience archival of investor feedback
- Timestamped retrieval ("What did the investor say about pricing?")

#### 3. Audio Journal Mode (Samara Persona)

**User Story:**
> Founder processes emotions and reflects through voice journaling

**Workflow:**
```
User speaks to Samara (journal companion persona)
           ↓
Real-time transcription + streaming response
           ↓
Compressed emotional patterns stored as decision arcs
           ↓
Long-term emotional tracking and growth visibility
```

**Benefits:**
- More intimate than text (voice carries emotion)
- Lower friction for emotional processing
- Natural for reflection and therapy-like interactions
- Builds trust through voice interface

---

### Platform Support

- **macOS**: Metal acceleration
- **Linux**: CUDA/ROCm support
- **Windows**: Vulkan support
- **Mobile**: Android/iOS with NPU/GPU/CPU

---

## Text Generation (LLMs)

While Asura currently uses **Fireworks AI** for Qwen 2.5 235B (cost-effective cloud inference), Nexa SDK also supports local text generation.

### Supported LLM Models

- OpenAI GPT-OSS
- Granite 4
- DeepSeek R1
- Qwen 3/3.5 (various sizes: 0.5B, 2B, 4B, 8B, 32B, 235B)
- Gemma models
- Custom GGUF models from Hugging Face

### Potential Use Case: Hybrid Architecture

**Current setup (all cloud):**
```
Call 1A: Fireworks AI (Qwen 2.5 235B) - $$$
Call 1B: Fireworks AI (Qwen 2.5 235B) - $$$
Call 2A: Fireworks AI (Qwen 2.5 235B) - $$$
Call 2B: Fireworks AI (Qwen 2.5 235B) - $$$
```

**Optimized setup (hybrid):**
```
Call 1A: Fireworks AI (Qwen 2.5 235B) - $$$ (needs quality)
Call 1B: Fireworks AI (Qwen 2.5 235B) - $$$ (user-facing, needs quality)
Call 2A: Local (Qwen 3.5-8B) - FREE (background task, compression)
Call 2B: Local (Qwen 3.5-8B) - FREE (verification, compression)
```

**Benefits:**
- Keep Fireworks for user-facing responses (quality matters)
- Use local models for background compression (speed + cost savings)
- Reduce API costs by ~50%
- No degradation in user experience

**Considerations:**
- Requires GPU for reasonable speed (8B model)
- Need to test compression quality with smaller models
- May need to adjust Artisan Cut prompts for local model

---

## Implementation Roadmap

### Phase 1: Replace Voyage AI Embeddings ✅ Priority 1

**Goal:** Eliminate embedding API costs with zero quality loss

**Steps:**
1. Install Nexa SDK
   ```bash
   pip install nexaai
   ```

2. Download nomic-embed-text
   ```bash
   nexa pull nomic-embed-text
   ```

3. Start local embedding server
   ```bash
   nexa server nomic-embed-text --port 18181
   ```

4. Update `src/routes/api/chat/+server.ts`
   - Replace Voyage AI API call in Call 2B
   - Point to local endpoint: `http://localhost:18181/v1/embeddings`
   - Keep same 1,024 dimensions (no schema changes)

5. Test with sample journal entries
   - Generate embeddings for existing content
   - Compare semantic search results with Voyage AI
   - Verify quality parity

6. Update environment variables
   - Remove `VOYAGE_API_KEY`
   - Add `NEXA_EMBEDDING_ENDPOINT=http://localhost:18181/v1/embeddings`

**Success Criteria:**
- ✅ Embedding generation works locally
- ✅ Semantic search quality matches Voyage AI
- ✅ No database schema changes needed
- ✅ Zero API costs for embeddings
- ✅ Faster embedding generation (no network latency)

**Estimated Time:** 2-4 hours

**Files to modify:**
- `src/routes/api/chat/+server.ts` (Call 2B embedding generation)
- `.env` (remove VOYAGE_API_KEY, add NEXA_EMBEDDING_ENDPOINT)
- `package.json` (add any Node.js Nexa SDK clients if available)

---

### Phase 2: Implement File Upload with VLM 🚀 Priority 2

**Goal:** Enable file upload feature with intelligent visual understanding and logical chunking

**Steps:**

1. Install additional dependencies
   ```bash
   npm install pdf2image  # For PDF → image conversion
   npm install multer     # For file upload handling
   ```

2. Download Qwen3-VL model
   ```bash
   nexa pull Qwen3-VL-8B-Instruct
   ```

3. Start VLM server
   ```bash
   nexa server Qwen3-VL-8B-Instruct --port 18182
   ```

4. Create file upload endpoint
   - New file: `src/routes/api/upload/+server.ts`
   - Accept PDF/image uploads (max size, validation)
   - Convert PDF pages to images
   - Send to Qwen3-VL for analysis

5. Implement logical chunking
   - Prompt Qwen3-VL to identify document sections
   - Extract visual descriptions (charts, diagrams)
   - Detect topic boundaries
   - Generate structured output (JSON with chunks)

6. Process chunks through Modified Call 2
   - For each chunk:
     - Call 2A: Artisan Cut with visual context
     - Call 2B: Verification with visual grounding
   - Save to Journal with embeddings
   - Link chunks to original file

7. Update UI for file upload
   - Add file upload button to chat interface (`src/routes/+page.svelte`)
   - Show upload progress
   - Display processed chunks with visual previews
   - Allow editing before saving

8. Store file metadata
   - Add to Journal: `file_name`, `file_type` (already in schema)
   - Store original file in object storage (Supabase Storage)
   - Link Journal entries to file

**Success Criteria:**
- ✅ Users can upload PDFs and images
- ✅ VLM correctly identifies logical sections
- ✅ Visual context preserved in compressions
- ✅ Chunks saved to Journal with embeddings
- ✅ Searchable via semantic retrieval

**Estimated Time:** 1-2 weeks

**Files to create:**
- `src/routes/api/upload/+server.ts` (upload endpoint)
- `src/lib/vlm-processor.ts` (VLM logic)
- `src/lib/components/FileUpload.svelte` (UI component)

**Files to modify:**
- `src/routes/+page.svelte` (add file upload UI)
- `src/lib/context-builder.ts` (handle file-based context)
- `docs/system-prompts.md` (add Modified Call 2 prompts)

---

### Phase 3: Add Voice Notes 🎤 Priority 3

**Goal:** Enable voice input for faster, more natural interaction

**Steps:**

1. Download OmniAudio model
   ```bash
   nexa pull OmniAudio-2.6B
   ```

2. Start ASR server
   ```bash
   nexa server OmniAudio-2.6B --port 18183
   ```

3. Create audio transcription endpoint
   - New file: `src/routes/api/transcribe/+server.ts`
   - Accept audio uploads (WAV, MP3, M4A)
   - Send to OmniAudio for transcription
   - Return text to client

4. Update UI for audio recording
   - Add microphone button to chat interface
   - Record audio in browser (MediaRecorder API)
   - Show recording indicator
   - Allow playback before sending

5. Process transcription through existing flow
   - Feed transcription text into Call 1A/1B (like text input)
   - Process through Call 2A/2B for compression
   - Mark Journal entries with `audio_source: true`

6. Optional: Store original audio
   - Upload to Supabase Storage
   - Link to Journal entry for playback

**Success Criteria:**
- ✅ Users can record voice notes
- ✅ Real-time transcription (66 tokens/sec)
- ✅ Transcription processed like text input
- ✅ Audio notes searchable via embeddings

**Estimated Time:** 1 week

**Files to create:**
- `src/routes/api/transcribe/+server.ts` (transcription endpoint)
- `src/lib/components/AudioRecorder.svelte` (recording UI)

**Files to modify:**
- `src/routes/+page.svelte` (add audio recording UI)
- `supabase/migrations/*_add_audio_metadata.sql` (add audio_source flag)

---

### Phase 4: (Optional) Local LLM for Compression 💰 Priority 4

**Goal:** Further reduce API costs by running compression calls locally

**Steps:**

1. Download local Qwen model
   ```bash
   nexa pull Qwen3.5-8B-Instruct
   ```

2. Start local LLM server
   ```bash
   nexa server Qwen3.5-8B-Instruct --port 18184
   ```

3. Update Call 2A/2B routing
   - Modify `src/routes/api/chat/+server.ts`
   - Route Call 2A → local endpoint
   - Route Call 2B → local endpoint
   - Keep Call 1A/1B → Fireworks AI

4. Test compression quality
   - Compare local vs. Fireworks compression
   - Verify no quality degradation
   - Adjust Artisan Cut prompts if needed

5. Monitor performance
   - Track local inference speed
   - Ensure no user-facing delays
   - Consider queuing for batch processing

**Success Criteria:**
- ✅ Call 2A/2B run locally without quality loss
- ✅ ~50% reduction in Fireworks API costs
- ✅ No increase in user-facing latency

**Estimated Time:** 3-5 days

**Considerations:**
- Requires GPU for reasonable speed
- May need to fine-tune compression prompts
- Fallback to Fireworks if local server down

---

## Hardware Requirements

### Minimum Requirements (CPU-only)

**For Embeddings (nomic-embed-text):**
- CPU: Any modern x86_64 or ARM64
- RAM: 2GB
- Storage: 1GB for model
- Performance: ~100-500 tokens/sec

**For VLM (Qwen3-VL-4B):**
- CPU: 4+ cores
- RAM: 8GB
- Storage: 8GB for model
- Performance: ~1-5 tokens/sec (slow but functional)

**For Audio (OmniAudio-2.6B):**
- CPU: 2+ cores
- RAM: 4GB
- Storage: 3GB for model
- Performance: ~10-20 tokens/sec

### Recommended Setup (GPU)

**For Best Performance:**
- GPU: NVIDIA RTX 3060+ (12GB VRAM) or AMD equivalent
- CPU: 8+ cores
- RAM: 16GB
- Storage: 50GB for multiple models
- Performance:
  - Embeddings: ~1000+ tokens/sec
  - VLM (Qwen3-VL-8B): ~20-50 tokens/sec
  - Audio: ~66 tokens/sec
  - LLM (Qwen3.5-8B): ~30-60 tokens/sec

### Optimal Setup (Mac M-series)

**For Mac Users (M1/M2/M3/M4):**
- Mac: M1 Pro or better (16GB+ unified memory)
- Storage: 50GB for multiple models
- Acceleration: Metal (automatic)
- Performance:
  - Embeddings: ~500-1000 tokens/sec
  - VLM (Qwen3-VL-8B): ~20-40 tokens/sec
  - Audio: ~35-66 tokens/sec (FP16/Q4)
  - LLM (Qwen3.5-8B): ~30-50 tokens/sec

### Model Size Reference

| Model | Size (GGUF) | Min RAM | Recommended GPU VRAM |
|-------|-------------|---------|----------------------|
| nomic-embed-text | ~500MB | 2GB | N/A (CPU fine) |
| EmbeddingGemma | ~600MB | 2GB | N/A (CPU fine) |
| OmniAudio-2.6B | ~2.5GB | 4GB | 4GB (optional) |
| OmniVision-968M | ~1GB | 2GB | 2GB (optional) |
| Qwen3-VL-4B | ~8GB | 8GB | 8GB |
| Qwen3-VL-8B | ~16GB | 16GB | 12GB |
| Qwen3.5-8B-Instruct | ~16GB | 16GB | 12GB |
| Qwen3-VL-32B | ~64GB | 64GB | 24GB+ |

### Quantization Options

All models support quantization for reduced memory usage:

- **FP16**: Full precision (best quality, highest memory)
- **Q8_0**: 8-bit quantization (minimal quality loss, ~50% size)
- **Q4_K_M**: 4-bit quantization (good quality, ~75% size reduction)
- **Q4_0**: 4-bit quantization (acceptable quality, smallest size)

**Example:**
```bash
# Download 4-bit quantized version
nexa pull Qwen3-VL-8B-Instruct:Q4_K_M

# Or FP16 for best quality
nexa pull Qwen3-VL-8B-Instruct:fp16
```

---

## Cost Analysis

### Current Monthly Costs (Estimated)

**Voyage AI Embeddings:**
- Assumption: 10,000 journal entries/month
- Avg text length: 500 tokens/entry
- Total: 5M tokens/month
- Cost: 5M × $0.06/M = **$300/month** (voyage-3-large)

**Fireworks AI (Qwen 2.5 235B):**
- Assumption: 1,000 conversations/month
- 4 calls per conversation
- Avg input: 15,000 tokens/call (with context)
- Avg output: 1,000 tokens/call
- Total input: 1,000 × 4 × 15,000 = 60M tokens
- Total output: 1,000 × 4 × 1,000 = 4M tokens
- Cost: ~$600/month (with caching discount)

**Total current: ~$900/month**

---

### Cost with Nexa SDK (Phase 1 only)

**Local Embeddings (nomic-embed-text):**
- Cost: **$0/month**
- Savings: **$300/month**

**Fireworks AI (unchanged):**
- Cost: **$600/month**

**Total with Phase 1: ~$600/month**
**Savings: 33%**

---

### Cost with Nexa SDK (Phases 1-3)

**Local Embeddings:**
- Cost: **$0/month**

**Local VLM (file uploads):**
- Cost: **$0/month**
- Enables new feature previously unavailable

**Local Audio (voice notes):**
- Cost: **$0/month**
- Enables new feature previously unavailable

**Fireworks AI (unchanged):**
- Cost: **$600/month**

**Total with Phases 1-3: ~$600/month**
**Savings: 33% + 2 new features**

---

### Cost with Nexa SDK (All Phases)

**Local Embeddings:**
- Cost: **$0/month**

**Local VLM:**
- Cost: **$0/month**

**Local Audio:**
- Cost: **$0/month**

**Local LLM (Call 2A/2B):**
- Cost: **$0/month**
- Replaces 50% of Fireworks API calls

**Fireworks AI (Call 1A/1B only):**
- Cost: **$300/month** (50% reduction)

**Total with all phases: ~$300/month**
**Savings: 67%**

---

### One-Time Hardware Costs (Optional)

If you need to upgrade hardware:

**GPU Option (NVIDIA RTX 4060 Ti 16GB):**
- Cost: ~$500
- ROI: Pays for itself in 1.7 months (vs. current setup)

**Mac M4 Pro (if upgrading anyway):**
- Cost: ~$2,000+ (but multi-purpose)
- ROI: Pays for itself in 6+ months (API savings only)

**Note:** Most developers already have sufficient hardware (Mac M-series, gaming PC with GPU). Hardware upgrade is optional.

---

### Long-Term Savings

**Year 1:**
- Current costs: $900 × 12 = **$10,800**
- With Nexa SDK (all phases): $300 × 12 = **$3,600**
- **Savings: $7,200/year**

**Year 2-5:**
- Annual savings: **$7,200/year**
- 5-year savings: **$36,000**

**Plus:**
- No rate limit concerns
- No API quota issues
- Full privacy and control
- 2 new features enabled (file upload, voice notes)

---

## References

### Official Documentation

- [Nexa SDK GitHub](https://github.com/NexaAI/nexa-sdk)
- [Nexa SDK Documentation](https://docs.nexa.ai/)
- [Nexa AI Website](https://nexa.ai/nexa-sdk)
- [Nexa REST API Docs](https://docs.nexa.ai/nexa-sdk-go/NexaAPI)

### Model Documentation

- [Qwen3-VL GitHub](https://github.com/QwenLM/Qwen3-VL)
- [Qwen3 Technical Report (arXiv)](https://arxiv.org/abs/2505.09388)
- [EmbeddingGemma (Google AI)](https://ai.google.dev/gemma/docs/embeddinggemma)
- [EmbeddingGemma on Hugging Face](https://huggingface.co/google/embeddinggemma-300m)
- [Nomic Embeddings](https://www.nomic.ai/blog/posts/nomic-embed-text-v1)
- [OmniAudio on Hugging Face](https://huggingface.co/NexaAI/OmniAudio-2.6B)

### Articles & Tutorials

- [Nexa AI Unveils Omnivision (InfoQ)](https://www.infoq.com/news/2024/12/nexa-ai-unveils-omnivision/)
- [Qwen3-VL Unpacked (Medium)](https://medium.com/data-science-in-your-pocket/qwen3-vl-unpacked-from-256k-context-multimodality-to-agentic-ui-control-326eb62343d8)
- [How to Use Frontier Vision LLMs: Qwen3-VL (Towards Data Science)](https://towardsdatascience.com/how-to-use-frontier-vision-llms-qwen-3-vl-2/)
- [13 Best Embedding Models in 2025 (Elephas)](https://elephas.app/blog/best-embedding-models)
- [Offline AI with Nexa SDK (Medium)](https://medium.com/free-or-open-source-software/offline-ai-nexa-ai-install-run-ai-text-audio-transcription-image-to-text-ai-images-a5bdc826d02e)

### Community

- [Nexa AI on Twitter/X](https://x.com/nexa_ai)
- [Nexa SDK on PyPI](https://pypi.org/project/nexaai/)

---

## Status Tracking

| Phase | Status | Priority | Est. Time | Assigned To | Notes |
|-------|--------|----------|-----------|-------------|-------|
| Phase 1: Embeddings | ⏳ Planned | P1 | 2-4 hours | - | Zero-cost replacement for Voyage AI |
| Phase 2: File Upload | ⏳ Planned | P2 | 1-2 weeks | - | Enables key missing feature |
| Phase 3: Voice Notes | ⏳ Planned | P3 | 1 week | - | New feature, high user value |
| Phase 4: Local LLM | ⏳ Planned | P4 | 3-5 days | - | Optional cost optimization |

---

## Implementation Notes

### Environment Variables

Add to `.env`:

```bash
# Nexa SDK Endpoints (local)
NEXA_EMBEDDING_ENDPOINT=http://localhost:18181/v1/embeddings
NEXA_VLM_ENDPOINT=http://localhost:18182/v1/chat/completions
NEXA_ASR_ENDPOINT=http://localhost:18183/v1/audio/transcriptions
NEXA_LLM_ENDPOINT=http://localhost:18184/v1/chat/completions

# Optional: Model paths (if running from local files instead of server)
NEXA_EMBEDDING_MODEL=nomic-embed-text
NEXA_VLM_MODEL=Qwen3-VL-8B-Instruct
NEXA_ASR_MODEL=OmniAudio-2.6B
NEXA_LLM_MODEL=Qwen3.5-8B-Instruct
```

### Service Management

Consider using a process manager to keep Nexa servers running:

**Option 1: PM2 (Node.js)**
```bash
npm install -g pm2

# Start all Nexa services
pm2 start nexa --name "embedding-server" -- server nomic-embed-text --port 18181
pm2 start nexa --name "vlm-server" -- server Qwen3-VL-8B-Instruct --port 18182
pm2 start nexa --name "asr-server" -- server OmniAudio-2.6B --port 18183

# Auto-restart on boot
pm2 startup
pm2 save
```

**Option 2: systemd (Linux)**
```bash
# Create service files in /etc/systemd/system/
sudo nano /etc/systemd/system/nexa-embedding.service

# Enable and start
sudo systemctl enable nexa-embedding
sudo systemctl start nexa-embedding
```

**Option 3: Docker Compose**
```yaml
# docker-compose.yml
version: '3.8'
services:
  nexa-embedding:
    image: nexaai/nexa-sdk:latest
    command: nexa server nomic-embed-text --port 18181
    ports:
      - "18181:18181"
    restart: always

  nexa-vlm:
    image: nexaai/nexa-sdk:latest
    command: nexa server Qwen3-VL-8B-Instruct --port 18182
    ports:
      - "18182:18182"
    restart: always
```

### Testing Checklist

Before deploying each phase:

**Phase 1 (Embeddings):**
- [ ] Local server starts successfully
- [ ] Embeddings match 1,024 dimensions
- [ ] Semantic search quality verified
- [ ] Performance meets expectations (latency < 1s)
- [ ] Error handling for server downtime

**Phase 2 (VLM):**
- [ ] PDF upload works (max 50MB)
- [ ] Image upload works (PNG, JPG, WebP)
- [ ] Logical chunking is accurate
- [ ] Visual descriptions are useful
- [ ] Chunks saved to Journal correctly
- [ ] Embeddings generated for all chunks
- [ ] File metadata stored properly

**Phase 3 (Audio):**
- [ ] Audio recording works in browser
- [ ] Transcription is accurate (>95% WER)
- [ ] Real-time performance (66 tokens/sec)
- [ ] Audio files stored correctly
- [ ] Transcriptions processed through 4-call flow

**Phase 4 (Local LLM):**
- [ ] Local LLM starts successfully
- [ ] Compression quality matches Fireworks
- [ ] No user-facing latency increase
- [ ] Fallback to Fireworks works
- [ ] Cost savings verified

---

## Next Steps

1. **Immediate:** Install Nexa SDK and test nomic-embed-text
2. **Week 1:** Implement Phase 1 (embeddings replacement)
3. **Week 2-3:** Implement Phase 2 (file upload with VLM)
4. **Week 4:** Implement Phase 3 (voice notes)
5. **Week 5:** (Optional) Implement Phase 4 (local LLM)

---

## Conclusion

Nexa SDK provides a comprehensive solution for running AI models locally, enabling Asura to:

1. **Eliminate embedding costs** (33% cost reduction)
2. **Enable file upload** with intelligent visual understanding
3. **Add voice notes** for faster, more natural interaction
4. **Further reduce costs** with local LLM for compression (67% total reduction)

All while maintaining full privacy, control, and eliminating API dependencies.

**Total potential savings: $7,200/year + 2 new features**

---

**Document Version:** 1.0
**Last Updated:** 2025-11-09
**Author:** Research compiled from Nexa SDK documentation
**Status:** Ready for implementation
