#!/usr/bin/env node
/**
 * Restore backup data to Supabase
 * Usage: node scripts/restore-backup.mjs ~/Downloads/asura-export-2025-12-01.json
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';

const SUPABASE_URL = 'https://hsxjcowijclwdxcmhbhs.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhzeGpjb3dpamNsd2R4Y21oYmhzIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjUyMDc0OSwiZXhwIjoyMDc4MDk2NzQ5fQ.0emQ-XbFsGsMi7Ve1YWQZKowDlRrrYapBpSQp49jPlQ';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function restore(backupPath) {
  console.log(`Reading backup from: ${backupPath}`);
  const backup = JSON.parse(readFileSync(backupPath, 'utf-8'));

  const { meta, data } = backup;
  console.log(`Backup from: ${meta.exported_at}`);
  console.log(`User ID: ${meta.user_id}`);

  // Restore order matters due to foreign keys:
  // 1. content (no deps)
  // 2. superjournal (refs content)
  // 3. journal (refs superjournal)
  // 4. charts (refs superjournal or content)

  // 1. Restore content
  if (data.content && data.content.length > 0) {
    console.log(`\nRestoring ${data.content.length} content items...`);
    const { error } = await supabase
      .from('content')
      .upsert(data.content, { onConflict: 'id' });
    if (error) {
      console.error('Content restore failed:', error);
    } else {
      console.log('Content restored.');
    }
  }

  // 2. Restore superjournal
  if (data.superjournal && data.superjournal.length > 0) {
    console.log(`\nRestoring ${data.superjournal.length} superjournal entries...`);
    const { error } = await supabase
      .from('superjournal')
      .upsert(data.superjournal, { onConflict: 'id' });
    if (error) {
      console.error('Superjournal restore failed:', error);
    } else {
      console.log('Superjournal restored.');
    }
  }

  // 3. Restore journal (strip removed columns)
  if (data.journal && data.journal.length > 0) {
    console.log(`\nRestoring ${data.journal.length} journal entries...`);
    const cleanedJournal = data.journal.map(j => {
      const { instruction_scope, is_instruction, ...rest } = j;
      return rest;
    });
    const { error } = await supabase
      .from('journal')
      .upsert(cleanedJournal, { onConflict: 'id' });
    if (error) {
      console.error('Journal restore failed:', error);
    } else {
      console.log('Journal restored.');
    }
  }

  // 4. Restore charts (strip removed columns)
  if (data.charts && data.charts.length > 0) {
    console.log(`\nRestoring ${data.charts.length} charts...`);
    const cleanedCharts = data.charts.map(c => {
      const { anthropic_file_id, anthropic_file_created_at, is_relevant, ...rest } = c;
      return rest;
    });
    const { error } = await supabase
      .from('charts')
      .upsert(cleanedCharts, { onConflict: 'id' });
    if (error) {
      console.error('Charts restore failed:', error);
    } else {
      console.log('Charts restored.');
    }
  }

  // 5. Restore settings
  if (data.settings && data.settings.length > 0) {
    console.log(`\nRestoring ${data.settings.length} settings...`);
    const { error } = await supabase
      .from('user_settings')
      .upsert(data.settings, { onConflict: 'user_id' });
    if (error) {
      console.error('Settings restore failed:', error);
    } else {
      console.log('Settings restored.');
    }
  }

  console.log('\n✅ Restore complete!');
}

const backupPath = process.argv[2];
if (!backupPath) {
  console.error('Usage: node scripts/restore-backup.mjs <backup-file.json>');
  process.exit(1);
}

restore(backupPath).catch(console.error);
