/**
 * System Prompts Index
 *
 * Central export file for all system prompts used in Asura.
 * Organizes prompts by category: base instructions, personas, and call sequences.
 */

// Base Instructions
export { BASE_INSTRUCTIONS } from './base-instructions';

// Personas
export { PERSONA_GUNNAR } from './persona-gunnar';
export { PERSONA_KIRBY } from './persona-kirby';

// Call 1A/1B: Chat Response Generation & Refinement
export { CALL1A_PROMPT } from './call1a';
export { CALL1B_PROMPT } from './call1b';

// Call 2A/2B: Chat Compression & Verification
export { CALL2A_PROMPT } from './call2a';
export { CALL2B_PROMPT } from './call2b';

// Call 3A/3B: File Overview & Chunking
export { CALL3A_PROMPT } from './call3a';
export { CALL3B_PROMPT } from './call3b';

// Modified Call 2A/2B: File Detail Chunk Compression
export { MODIFIED_CALL2A_PROMPT } from './modified-call2a';
export { MODIFIED_CALL2B_PROMPT } from './modified-call2b';

// E-Reader Mode Prompts
export { READER_GUNNAR_PROMPT } from './reader-gunnar';
