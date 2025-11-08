import { VoyageAIClient } from 'voyageai';

const VOYAGE_API_KEY = 'pa-nAXhmOEC6abKE8Sag6L5COlRamU-6E9TJQGEGTdLYym';

const voyage = new VoyageAIClient({ apiKey: VOYAGE_API_KEY });

console.log('Testing Voyage AI embedding generation...');

try {
  const embeddingResponse = await voyage.embed({
    input: 'Test decision arc: user queries asteroid definition',
    model: 'voyage-3'
  });

  const embedding = embeddingResponse.data[0].embedding;
  console.log('✓ Embedding generated successfully');
  console.log('  Dimensions:', embedding.length);
  console.log('  First 5 values:', embedding.slice(0, 5));
} catch (error) {
  console.error('✗ Voyage AI error:', error.message);
  console.error('  Full error:', error);
}
