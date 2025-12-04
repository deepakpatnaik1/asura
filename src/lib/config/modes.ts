/**
 * Mode Type Definition - Single Source of Truth
 *
 * All mode type definitions import from here.
 * Adding new mode = one file change.
 */

export const MODES = ['chat', 'reader', 'todo'] as const;
export type Mode = (typeof MODES)[number];
