#!/usr/bin/env node
/**
 * Test all models across all providers using fetch
 * Run with: node --env-file=.env scripts/test-all-models.js
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// API Keys
const KEYS = {
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  GOOGLE_AI_API_KEY: process.env.GOOGLE_AI_API_KEY,
  GROQ_API_KEY: process.env.GROQ_API_KEY,
  REPLICATE_API_KEY: process.env.REPLICATE_API_KEY,
  TOGETHER_API_KEY: process.env.TOGETHER_API_KEY,
  FIREWORKS_API_KEY: process.env.FIREWORKS_API_KEY,
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  FAL_API_KEY: process.env.FAL_API_KEY,
  VOYAGE_API_KEY: process.env.VOYAGE_API_KEY,
  MODELSLAB_API_KEY: process.env.MODELSLAB_API_KEY,
  VENICE_API_KEY: process.env.VENICE_API_KEY,
};

const results = [];

async function testTextModel(model) {
  const { model_identifier, provider } = model;
  const testPrompt = 'Say "hello" and nothing else.';

  try {
    let response, data;

    switch (provider) {
      case 'anthropic':
        response = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': KEYS.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }]
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return { success: true, preview: data.content?.[0]?.text?.slice(0, 50) };

      case 'openai':
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.OPENAI_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }]
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return { success: true, preview: data.choices?.[0]?.message?.content?.slice(0, 50) };

      case 'google':
        response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model_identifier}:generateContent?key=${KEYS.GOOGLE_AI_API_KEY}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: testPrompt }] }],
            generationConfig: { maxOutputTokens: 50 }
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return { success: true, preview: data.candidates?.[0]?.content?.parts?.[0]?.text?.slice(0, 50) };

      case 'groq':
        response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.GROQ_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }]
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message);
        return { success: true, preview: data.choices?.[0]?.message?.content?.slice(0, 50) };

      case 'replicate':
        // Replicate uses async prediction API - need to get version first, then create prediction
        // First, get the model to find the latest version
        const modelResponse = await fetch(`https://api.replicate.com/v1/models/${model_identifier}`, {
          headers: { 'Authorization': `Bearer ${KEYS.REPLICATE_API_KEY}` }
        });
        const modelData = await modelResponse.json();
        if (modelData.detail) throw new Error(modelData.detail);
        const version = modelData.latest_version?.id;
        if (!version) throw new Error('No version found');

        // Create prediction with version
        response = await fetch('https://api.replicate.com/v1/predictions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.REPLICATE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            version,
            input: { prompt: testPrompt, max_tokens: 50 }
          })
        });
        data = await response.json();
        if (data.error || data.detail) throw new Error(data.error?.detail || data.detail || data.error);
        if (!data.urls?.get) throw new Error('No prediction URL');

        // Poll for completion (max 90s for slow models)
        for (let i = 0; i < 45; i++) {
          await new Promise(r => setTimeout(r, 2000));
          const pollResponse = await fetch(data.urls.get, {
            headers: { 'Authorization': `Bearer ${KEYS.REPLICATE_API_KEY}` }
          });
          const pollData = await pollResponse.json();
          if (pollData.status === 'succeeded') {
            const output = Array.isArray(pollData.output) ? pollData.output.join('') : pollData.output;
            return { success: true, preview: (output || 'OK').slice(0, 50) };
          }
          if (pollData.status === 'failed') throw new Error(pollData.error || 'Prediction failed');
        }
        throw new Error('Timeout waiting for prediction');

      case 'together':
        response = await fetch('https://api.together.xyz/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.TOGETHER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }]
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return { success: true, preview: data.choices?.[0]?.message?.content?.slice(0, 50) };

      case 'fireworks':
        response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.FIREWORKS_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }]
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return { success: true, preview: data.choices?.[0]?.message?.content?.slice(0, 50) };

      case 'openrouter':
        response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            max_tokens: 50,
            messages: [{ role: 'user', content: testPrompt }]
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        return { success: true, preview: data.choices?.[0]?.message?.content?.slice(0, 50) };

      default:
        return { success: false, error: `Unknown provider: ${provider}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testImageModel(model) {
  const { model_identifier, provider } = model;
  const testPrompt = 'A simple red circle on white background';

  try {
    let response, data;

    switch (provider) {
      case 'fal':
        response = await fetch(`https://queue.fal.run/${model_identifier}`, {
          method: 'POST',
          headers: {
            'Authorization': `Key ${KEYS.FAL_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            prompt: testPrompt,
            image_size: 'square',
            num_images: 1,
            enable_safety_checker: false
          })
        });
        data = await response.json();
        if (data.detail) throw new Error(data.detail);
        if (data.request_id || data.images) return { success: true, preview: 'Image queued/generated' };
        throw new Error('No response');

      case 'fireworks':
        response = await fetch('https://api.fireworks.ai/inference/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.FIREWORKS_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            prompt: testPrompt,
            n: 1,
            size: '512x512'
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        if (data.data?.[0]) return { success: true, preview: 'Image generated' };
        throw new Error('No image');

      case 'modelslab':
        response = await fetch('https://modelslab.com/api/v6/realtime/text2img', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            key: KEYS.MODELSLAB_API_KEY,
            model_id: model_identifier,
            prompt: testPrompt,
            width: 512,
            height: 512,
            samples: 1,
            safety_checker: false
          })
        });
        data = await response.json();
        if (data.status === 'error') throw new Error(data.message || 'ModelsLab error');
        return { success: true, preview: `Status: ${data.status}` };

      case 'venice':
        response = await fetch('https://api.venice.ai/api/v1/images/generations', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${KEYS.VENICE_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model: model_identifier,
            prompt: testPrompt,
            n: 1,
            size: '512x512'
          })
        });
        data = await response.json();
        if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
        if (data.data?.[0]) return { success: true, preview: 'Image generated' };
        throw new Error('No image');

      default:
        return { success: false, error: `Unknown image provider: ${provider}` };
    }
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function testEmbeddingModel(model) {
  const { model_identifier, provider } = model;

  try {
    if (provider === 'voyage') {
      const response = await fetch('https://api.voyageai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${KEYS.VOYAGE_API_KEY}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model_identifier,
          input: 'Hello world'
        })
      });
      const data = await response.json();
      if (data.error) throw new Error(data.error.message || JSON.stringify(data.error));
      if (data.data?.[0]?.embedding) {
        return { success: true, preview: `Vector dim: ${data.data[0].embedding.length}` };
      }
      throw new Error('No embedding');
    }
    return { success: false, error: `Unknown embedding provider: ${provider}` };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('='.repeat(80));
  console.log('MODEL VERIFICATION TEST');
  console.log('='.repeat(80));
  console.log('');

  // Fetch all models
  const { data: models, error } = await supabase
    .from('models')
    .select('model_identifier, model_name, provider, model_type')
    .order('provider')
    .order('model_type')
    .order('model_name');

  if (error) {
    console.error('Failed to fetch models:', error);
    process.exit(1);
  }

  console.log(`Found ${models.length} models to test\n`);

  const textModels = models.filter(m => m.model_type === 'text_generation');
  const imageModels = models.filter(m => m.model_type === 'image_generation');
  const embeddingModels = models.filter(m => m.model_type === 'embedding');

  // Test text models
  console.log('-'.repeat(80));
  console.log(`TEXT GENERATION MODELS (${textModels.length})`);
  console.log('-'.repeat(80));

  for (const model of textModels) {
    process.stdout.write(`  ${model.provider.padEnd(12)} | ${model.model_name.slice(0,30).padEnd(30)} | `);
    const result = await testTextModel(model);
    results.push({ ...model, ...result });
    console.log(result.success ? `✅ ${result.preview || 'OK'}` : `❌ ${result.error}`);
  }

  // Test image models
  console.log('');
  console.log('-'.repeat(80));
  console.log(`IMAGE GENERATION MODELS (${imageModels.length})`);
  console.log('-'.repeat(80));

  for (const model of imageModels) {
    process.stdout.write(`  ${model.provider.padEnd(12)} | ${model.model_name.slice(0,30).padEnd(30)} | `);
    const result = await testImageModel(model);
    results.push({ ...model, ...result });
    console.log(result.success ? `✅ ${result.preview || 'OK'}` : `❌ ${result.error}`);
  }

  // Test embedding models
  console.log('');
  console.log('-'.repeat(80));
  console.log(`EMBEDDING MODELS (${embeddingModels.length})`);
  console.log('-'.repeat(80));

  for (const model of embeddingModels) {
    process.stdout.write(`  ${model.provider.padEnd(12)} | ${model.model_name.slice(0,30).padEnd(30)} | `);
    const result = await testEmbeddingModel(model);
    results.push({ ...model, ...result });
    console.log(result.success ? `✅ ${result.preview || 'OK'}` : `❌ ${result.error}`);
  }

  // Summary
  console.log('');
  console.log('='.repeat(80));
  console.log('SUMMARY');
  console.log('='.repeat(80));

  const passed = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Total: ${results.length} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.log('\nFailed models:');
    results.filter(r => !r.success).forEach(r => {
      console.log(`  - ${r.provider}/${r.model_name}: ${r.error}`);
    });
  }
}

main().catch(console.error);
