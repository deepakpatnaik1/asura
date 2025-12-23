/**
 * Test ModelsLab API with Deliberate v3 model
 */

const apiKey = process.env.MODELSLAB_API_KEY;
if (!apiKey) {
  console.log('No MODELSLAB_API_KEY found');
  process.exit(1);
}

console.log('Testing ModelsLab with Deliberate v3...');

fetch('https://modelslab.com/api/v6/images/text2img', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: apiKey,
    model_id: 'deliberate-v3',
    prompt: 'a woman standing in a kitchen',
    negative_prompt: 'bad hands, deformed',
    width: '512',
    height: '512',
    samples: '1',
    num_inference_steps: '20',
    guidance_scale: 7.5,
    safety_checker: 'no'
  })
})
  .then(r => r.json())
  .then(d => {
    console.log('Status:', d.status);
    if (d.status === 'error') {
      console.log('Error message:', d.message || d.messege);
    } else if (d.status === 'processing') {
      console.log('Processing - fetch_result:', d.fetch_result);
    } else if (d.status === 'success') {
      console.log('Success! Output:', d.output?.[0]?.substring(0, 80) + '...');
    } else {
      console.log('Full response:', JSON.stringify(d, null, 2).substring(0, 500));
    }
  })
  .catch(e => console.log('Fetch error:', e.message));
