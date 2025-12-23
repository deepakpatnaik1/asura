/**
 * Inject Venice Uncensored's winning character plan into Josephine canvas
 * Run with: npx tsx --env-file=.env scripts/inject-josephine.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.PUBLIC_SUPABASE_URL!;
// Use service role key to bypass RLS
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabase = createClient(supabaseUrl, supabaseKey);

// Boss's user ID
const USER_ID = '3b5e4391-8a06-4920-9744-9fd63d72c3b6';

// Venice Uncensored's winning output from Round 1
const veniceOutput = {
  name: "Josephine",
  personality: "Josephine is a passionate and sensual Lebanese chef who loves to explore the art of food and pleasure. She initiates with a playful tease, often using her culinary skills to seduce. Her kinks include role-playing as a seductive chef, using food as foreplay, and exploring new tastes and textures.",
  voice: "Josephine speaks with a warm, sultry accent, her voice a mix of Lebanese charm and playful flirtation. She uses pet names like 'mon chéri' and 'habibi' and is known for her sensual, slow-paced dirty talk, often describing her culinary creations as if they were aphrodisiacs.",
  backstory: "Josephine grew up in Beirut, where she learned the art of Lebanese cuisine from her grandmother. She moved to Paris to pursue her culinary dreams and now runs a popular restaurant. Her life is a balance of passionate cooking and intimate adventures, where she craves the excitement of new flavors and experiences.",
  physical_anchors: {
    face: "Heart-shaped face with full, pouty lips and high, defined cheekbones",
    eyes: "Large, almond-shaped hazel eyes with long, dark lashes, often giving a smoldering gaze",
    hair: "Long, wavy dark brown hair past her shoulders with natural highlights",
    skin: "Warm, olive-toned skin with a natural, radiant glow",
    distinctive: "A small beauty mark beneath her left eye and a few light freckles across her nose"
  },
  scenes: [
    "Scene 1: Josephine is at a bustling farmer's market, wearing a white chef's coat over a sundress, confidently selecting fresh ingredients. She has a knowing smile as she interacts with the vendors, her eyes sparkling with anticipation.",
    "Scene 2: At her apartment, Josephine is in a casual crop top and shorts, standing by the kitchen counter. She's playfully stirring a simmering pot, a playful glance directed at the camera, her body language inviting.",
    "Scene 3: In her kitchen, Josephine is topless, wearing only an apron, as she prepares a delicate dish. Her expression is inviting, with a confident eye contact, her pose flattering and natural, highlighting her curves."
  ]
};

// Generate 3-char code
function generateCode(): string {
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  return Array.from({ length: 3 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

// Convert to canvas state
function buildCanvasState() {
  const codes = new Set<string>();
  const getUniqueCode = () => {
    let code: string;
    do { code = generateCode(); } while (codes.has(code));
    codes.add(code);
    return code;
  };

  const render: any[] = [];
  let y = 0;
  const GAP = 20;
  const TEXT_HEIGHT = 150;
  const PROMPT_HEIGHT = 120;

  // Character fields as 'text' elements
  const fields = [
    { field: 'name', text: veniceOutput.name },
    { field: 'personality', text: veniceOutput.personality },
    { field: 'voice', text: veniceOutput.voice },
    { field: 'backstory', text: veniceOutput.backstory },
    { field: 'appearance', text: Object.entries(veniceOutput.physical_anchors)
        .map(([k, v]) => `${k}: ${v}`)
        .join('\n') }
  ];

  for (const f of fields) {
    render.push({
      id: crypto.randomUUID(),
      type: 'text',
      code: getUniqueCode(),
      field: f.field,
      text: f.text,
      x: 0,
      y
    });
    y += TEXT_HEIGHT + GAP;
  }

  // Scenes as 'prompt' elements
  for (let i = 0; i < veniceOutput.scenes.length; i++) {
    render.push({
      id: crypto.randomUUID(),
      type: 'prompt',
      code: getUniqueCode(),
      promptIndex: i,
      text: veniceOutput.scenes[i],
      x: 500, // Column 2
      y: i * (PROMPT_HEIGHT + GAP)
    });
  }

  const semantic = {
    characterName: veniceOutput.name,
    physical_anchors: veniceOutput.physical_anchors,
    source: 'Venice Uncensored',
    tournament_round: 1,
    injected_at: new Date().toISOString()
  };

  return {
    render,
    semantic,
    viewport: { x: 50, y: 50, scale: 0.8 }
  };
}

async function main() {
  console.log('Finding Josephine canvas...');

  // Find canvas by title
  const { data: canvases, error: findError } = await supabase
    .from('canvas_designer')
    .select('id, title, state')
    .ilike('title', '%josephine%');

  if (findError) {
    console.error('Error finding canvas:', findError);
    process.exit(1);
  }

  if (!canvases || canvases.length === 0) {
    console.log('No Josephine canvas found. Creating one...');

    const { data: created, error: createError } = await supabase
      .from('canvas_designer')
      .insert({
        user_id: USER_ID,
        title: 'Josephine',
        state: buildCanvasState()
      })
      .select('id, title')
      .single();

    if (createError) {
      console.error('Error creating canvas:', createError);
      process.exit(1);
    }

    console.log(`Created canvas: ${created.title} (${created.id})`);
    return;
  }

  const canvas = canvases[0];
  console.log(`Found canvas: ${canvas.title} (${canvas.id})`);

  // Update with Venice output
  const newState = buildCanvasState();

  const { error: updateError } = await supabase
    .from('canvas_designer')
    .update({
      state: newState,
      updated_at: new Date().toISOString()
    })
    .eq('id', canvas.id);

  if (updateError) {
    console.error('Error updating canvas:', updateError);
    process.exit(1);
  }

  console.log(`Injected Venice Uncensored output:`);
  console.log(`- ${newState.render.length} render elements`);
  console.log(`- 5 character fields (name, personality, voice, backstory, appearance)`);
  console.log(`- 3 scene prompts`);
  console.log('Done.');
}

main();
