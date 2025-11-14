/**
 * Batched parallel processing utility
 * Prevents rate limiting by processing N items at a time instead of all at once
 */

export interface BatchProcessorOptions {
  batchSize?: number;
  onProgress?: (completed: number, total: number) => void;
}

/**
 * Process array items in batches with controlled concurrency
 *
 * Example: 307 chunks → processed as 31 batches of 10 (10 concurrent at a time)
 *
 * @param items - Array of items to process
 * @param processFn - Async function to process each item
 * @param options - Batch size and progress callback
 * @returns Array of results in original order
 */
export async function processBatched<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  options: BatchProcessorOptions = {}
): Promise<R[]> {
  const { batchSize = 10, onProgress } = options;

  const results: R[] = [];
  let completed = 0;

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchStartIndex = i;

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
  }

  return results;
}
