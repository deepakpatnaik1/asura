/**
 * Batched parallel processing utility
 * Prevents rate limiting by processing N items at a time instead of all at once
 */

import { BATCH_PROCESSING } from '$lib/config/processing';

export interface BatchProcessorOptions {
  batchSize?: number;
  onProgress?: (completed: number, total: number) => void;
  delayBetweenBatchesMs?: number;
}

/**
 * Process array items in batches with controlled concurrency
 *
 * Example: 30 chunks with batchSize=5 → processed as 6 batches of 5 (5 concurrent at a time)
 * With delayBetweenBatchesMs=5000, adds 5s delays between batches for rate limiting
 *
 * @param items - Array of items to process
 * @param processFn - Async function to process each item
 * @param options - Batch size, delay, and progress callback
 * @returns Array of results in original order
 */
export async function processBatched<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  options: BatchProcessorOptions = {}
): Promise<R[]> {
  const { batchSize = BATCH_PROCESSING.defaultBatchSize, onProgress, delayBetweenBatchesMs } = options;

  const results: R[] = [];
  let completed = 0;
  const totalBatches = Math.ceil(items.length / batchSize);

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchStartIndex = i;
    const batchNumber = Math.floor(i / batchSize) + 1;

    const batchPromises = batch.map((item, batchIndex) => {
      const itemIndex = batchStartIndex + batchIndex;

      return processFn(item, itemIndex).then(result => {
        completed++;
        if (onProgress) {
          onProgress(completed, items.length);
        }
        return result;
      });
    });

    const batchResults = await Promise.all(batchPromises);
    results.push(...batchResults);

    // Add delay between batches (but not after the last batch)
    if (delayBetweenBatchesMs && batchNumber < totalBatches) {
      await delay(delayBetweenBatchesMs, onProgress, completed, items.length);
    }
  }

  return results;
}

/**
 * Delay with granular progress updates every 500ms
 *
 * @param delayMs - Total delay duration in milliseconds
 * @param onProgress - Progress callback to update during delay
 * @param completed - Number of items completed so far
 * @param total - Total number of items
 */
async function delay(
  delayMs: number,
  onProgress: ((completed: number, total: number) => void) | undefined,
  completed: number,
  total: number
): Promise<void> {
  const intervalMs = 500; // Update every 500ms
  const intervals = Math.ceil(delayMs / intervalMs);

  for (let i = 0; i < intervals; i++) {
    const remainingMs = delayMs - (i * intervalMs);
    const actualWaitMs = Math.min(intervalMs, remainingMs);

    await new Promise(resolve => setTimeout(resolve, actualWaitMs));

    // Report progress during delay (completed count stays the same)
    if (onProgress) {
      onProgress(completed, total);
    }
  }
}
