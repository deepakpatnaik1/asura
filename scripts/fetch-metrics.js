#!/usr/bin/env node
// Fetch Reddit Metrics
//
// Fetches metrics for valaquer's recent comments.
// Stores in metrics table. Matches to engagement_log by post_url when possible.
//
// Usage: node scripts/fetch-metrics.js
// Cron:  0 */12 * * * cd /path/to/aether && node scripts/fetch-metrics.js

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'http://localhost:54321';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const REDDIT_USERNAME = 'valaquer';
const USER_AGENT = 'Aether/1.0 (metrics tracker)';

/**
 * Fetch user's recent comments from Reddit
 */
async function fetchUserComments(username, limit = 100) {
    const url = `https://www.reddit.com/user/${username}/comments.json?limit=${limit}`;

    const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT }
    });

    if (!response.ok) {
        throw new Error(`Reddit API error: ${response.status}`);
    }

    const data = await response.json();
    return data.data.children.map(child => child.data);
}

/**
 * Extract post URL from comment's link_permalink or construct from link_id
 */
function getPostUrl(comment) {
    // link_permalink is the thread URL
    if (comment.link_permalink) {
        return comment.link_permalink;
    }
    // Fallback: construct from subreddit and link_id
    const linkId = comment.link_id?.replace('t3_', '');
    if (linkId && comment.subreddit) {
        return `https://www.reddit.com/r/${comment.subreddit}/comments/${linkId}/`;
    }
    return null;
}

/**
 * Main: fetch and store metrics
 */
async function main() {
    console.log(`Fetching recent comments for u/${REDDIT_USERNAME}...\n`);

    // Fetch comments from Reddit
    const comments = await fetchUserComments(REDDIT_USERNAME);
    console.log(`Found ${comments.length} comments\n`);

    if (!comments.length) {
        console.log('No comments found.');
        return;
    }

    // Filter to comments that are 48+ hours old (upvotes stabilized)
    const now = Date.now() / 1000; // Reddit uses Unix timestamps
    const cutoff = now - (48 * 60 * 60);
    const eligibleComments = comments.filter(c => c.created_utc <= cutoff);

    console.log(`${eligibleComments.length} comments are 48+ hours old\n`);

    if (!eligibleComments.length) {
        console.log('No eligible comments (all too recent).');
        return;
    }

    // Get existing metrics to avoid duplicates (by comment_url)
    const commentUrls = eligibleComments.map(c => `https://www.reddit.com${c.permalink}`);
    const { data: existingMetrics } = await supabase
        .from('metrics')
        .select('comment_url')
        .in('comment_url', commentUrls);

    const existingUrls = new Set(existingMetrics?.map(m => m.comment_url) || []);

    // Get engagement_log entries for matching
    const { data: engagements } = await supabase
        .from('engagement_log')
        .select('id, post_url');

    // Build map of post_url -> engagement_id for matching
    const engagementMap = new Map();
    for (const e of engagements || []) {
        if (e.post_url) {
            // Normalize URL for matching
            const normalized = e.post_url.replace(/\/$/, '').toLowerCase();
            engagementMap.set(normalized, e.id);
        }
    }

    let inserted = 0;
    let skipped = 0;

    for (const comment of eligibleComments) {
        const commentUrl = `https://www.reddit.com${comment.permalink}`;

        // Skip if already have metrics for this comment
        if (existingUrls.has(commentUrl)) {
            skipped++;
            continue;
        }

        const postUrl = getPostUrl(comment);
        const normalizedPostUrl = postUrl?.replace(/\/$/, '').toLowerCase();

        // Try to match to engagement_log
        const engagementId = normalizedPostUrl ? engagementMap.get(normalizedPostUrl) : null;

        console.log(`- r/${comment.subreddit}: "${comment.link_title?.slice(0, 50)}..."`);
        console.log(`  Upvotes: ${comment.score}, Replies: ${comment.num_comments || 0}`);
        if (engagementId) {
            console.log(`  ✓ Matched to engagement_log`);
        }

        // Insert into metrics
        const { error } = await supabase.from('metrics').insert({
            engagement_id: engagementId,
            comment_url: commentUrl,
            subreddit: comment.subreddit,
            thread_title: comment.link_title,
            upvotes: comment.score,
            replies: comment.num_comments || 0,
            position: null
        });

        if (error) {
            console.log(`  ERROR: ${error.message}`);
        } else {
            inserted++;
        }

        console.log('');
    }

    console.log(`Done. Inserted: ${inserted}, Skipped (already exists): ${skipped}`);
}

main().catch(console.error);
