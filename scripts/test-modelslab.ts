/**
 * Quick test to check if ModelsLab API is back online
 */

const apiKey = process.env.MODELSLAB_API_KEY;
if (!apiKey) {
  console.log('No MODELSLAB_API_KEY found');
  process.exit(1);
}

console.log('Testing ModelsLab API...');

fetch('https://modelslab.com/api/v6/images/text2img', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    key: apiKey,
    prompt: 'test image, simple',
    width: 64,
    height: 64,
    samples: 1
  })
})
  .then(r => r.json())
  .then(d => {
    console.log('Status:', d.status || 'unknown');
    if (d.status === 'success') {
      console.log('ModelsLab is BACK ONLINE');
    } else if (d.status === 'processing') {
      console.log('ModelsLab is BACK ONLINE (processing)');
    } else {
      console.log('Response:', JSON.stringify(d, null, 2).substring(0, 500));
    }
  })
  .catch(e => console.log('Error:', e.message));
