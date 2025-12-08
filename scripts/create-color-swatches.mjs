#!/usr/bin/env node
/**
 * Create color palette swatches on a whiteboard
 * Usage: node scripts/create-color-swatches.mjs
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://hsxjcowijclwdxcmhbhs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// Dark mode palette - deep, muted tones for dark background
const PALETTE = {
  // Row 1: Deep neutrals
  charcoal: { hex: '#2d2d2d', outline: '#5a5a5a', name: 'Charcoal' },
  graphite: { hex: '#3a3a3a', outline: '#6a6a6a', name: 'Graphite' },
  smoke: { hex: '#4a4a4a', outline: '#7a7a7a', name: 'Smoke' },

  // Row 2: Dark earth
  espresso: { hex: '#3d2c29', outline: '#7a5850', name: 'Espresso' },
  rust: { hex: '#5c3d2e', outline: '#9a6a55', name: 'Rust' },
  umber: { hex: '#4a3728', outline: '#8a6a4a', name: 'Umber' },

  // Row 3: Deep cool
  forest: { hex: '#2d3d2f', outline: '#5a7a5f', name: 'Forest' },
  deep_sea: { hex: '#2a3d42', outline: '#5a7a82', name: 'Deep Sea' },
  slate: { hex: '#3d4550', outline: '#6a7a8a', name: 'Slate' },

  // Row 4: Rich accent
  plum: { hex: '#3d2d42', outline: '#7a5a82', name: 'Plum' },
  wine: { hex: '#4a2d3a', outline: '#8a5a72', name: 'Wine' },
  midnight: { hex: '#2d3045', outline: '#5a6085', name: 'Midnight' },
};

async function createSwatches() {
  // Get user ID from existing whiteboard or settings
  const { data: existingWb } = await supabase
    .from('whiteboards')
    .select('user_id')
    .limit(1)
    .single();

  let userId;
  if (existingWb) {
    userId = existingWb.user_id;
  } else {
    // Fallback: get from user_settings
    const { data: settings } = await supabase
      .from('user_settings')
      .select('user_id')
      .limit(1)
      .single();
    userId = settings?.user_id;
  }

  if (!userId) {
    console.error('No user found. Please create a whiteboard first via the UI.');
    process.exit(1);
  }

  console.log(`Using user_id: ${userId}`);

  // Create notes grid
  const notes = [];
  const colors = Object.entries(PALETTE);
  const SWATCH_WIDTH = 120;
  const SWATCH_HEIGHT = 80;
  const GAP = 20;
  const START_X = 50;
  const START_Y = 50;
  const COLS = 3;

  // Solid fill swatches (left side)
  colors.forEach(([key, { hex, name }], i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);

    notes.push({
      id: `swatch-${key}`,
      x: START_X + col * (SWATCH_WIDTH + GAP),
      y: START_Y + row * (SWATCH_HEIGHT + GAP),
      text: `${name}\n${hex}`,
      fill: hex,
      width: SWATCH_WIDTH,
      height: SWATCH_HEIGHT
    });
  });

  // Outline-only swatches (right side) - brighter stroke colors
  const OUTLINE_START_X = START_X + (COLS * (SWATCH_WIDTH + GAP)) + 60;
  colors.forEach(([key, { outline, name }], i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);

    notes.push({
      id: `outline-${key}`,
      x: OUTLINE_START_X + col * (SWATCH_WIDTH + GAP),
      y: START_Y + row * (SWATCH_HEIGHT + GAP),
      text: `${name}\n${outline}`,
      fill: 'rgba(20, 20, 20, 0.8)',
      stroke: outline,
      strokeWidth: 2,
      width: SWATCH_WIDTH,
      height: SWATCH_HEIGHT
    });
  });

  // Create or update the Color Palette whiteboard
  const { data: existing } = await supabase
    .from('whiteboards')
    .select('id')
    .eq('user_id', userId)
    .eq('title', 'Color Palette')
    .single();

  const state = {
    notes,
    viewport: { x: 0, y: 0, scale: 1 }
  };

  if (existing) {
    // Update existing
    const { error } = await supabase
      .from('whiteboards')
      .update({ state, updated_at: new Date().toISOString() })
      .eq('id', existing.id);

    if (error) {
      console.error('Update failed:', error);
      process.exit(1);
    }
    console.log(`Updated whiteboard: ${existing.id}`);
  } else {
    // Create new
    const { data, error } = await supabase
      .from('whiteboards')
      .insert({
        user_id: userId,
        title: 'Color Palette',
        state
      })
      .select('id')
      .single();

    if (error) {
      console.error('Create failed:', error);
      process.exit(1);
    }
    console.log(`Created whiteboard: ${data.id}`);
  }

  console.log('\n✅ Color swatches created!');
  console.log('Refresh the chat page and select "Color Palette" from the whiteboard picker.');
}

createSwatches().catch(console.error);
