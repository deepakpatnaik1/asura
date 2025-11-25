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

// Call 1: Chat Response Generation
export { CALL1_PROMPT } from './call1';

// Call 2A/2B: Chat Compression & Verification
export { CALL2A_PROMPT } from './call2a';
export { CALL2B_PROMPT } from './call2b';

// E-Reader Mode Prompts
export { READER_GUNNAR_PROMPT } from './reader-gunnar';
