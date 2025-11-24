import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import * as cheerio from 'cheerio';

const supabase = createClient(PUBLIC_SUPABASE_URL, PUBLIC_SUPABASE_ANON_KEY);

export const POST: RequestHandler = async ({ request, locals: { safeGetSession } }) => {
	// 1. AUTHENTICATION CHECK
	const { user } = await safeGetSession();
	if (!user) {
		return json(
			{
				error: {
					message: 'Unauthorized - must be logged in',
					code: 'UNAUTHORIZED'
				}
			},
			{ status: 401 }
		);
	}
	const userId = user.id;

	// 2. PARSE REQUEST BODY
	const { html } = await request.json();

	if (!html || typeof html !== 'string') {
		return json(
			{
				error: {
					message: 'Missing or invalid HTML content',
					code: 'INVALID_INPUT'
				}
			},
			{ status: 400 }
		);
	}

	// 3. VALIDATE HTML SIZE (max 5MB)
	const MAX_HTML_SIZE = 5 * 1024 * 1024; // 5MB
	if (html.length > MAX_HTML_SIZE) {
		return json(
			{
				error: {
					message: `HTML content too large (max ${MAX_HTML_SIZE / 1024 / 1024}MB)`,
					code: 'INPUT_TOO_LARGE'
				}
			},
			{ status: 413 }
		);
	}

	console.log('[Reader Upload] User ID:', userId);
	console.log('[Reader Upload] HTML length:', html.length);

	// 4. EXTRACT ARTICLE TITLE USING CHEERIO
	let title = 'Untitled Article';
	const MAX_TITLE_LENGTH = 200;

	try {
		const $ = cheerio.load(html);

		// Try <h1> first
		const h1Text = $('h1').first().text().trim();
		if (h1Text) {
			title = h1Text;
		} else {
			// Try <title> tag
			const titleText = $('title').first().text().trim();
			if (titleText) {
				title = titleText;
			} else {
				// Fallback to timestamp-based title
				title = `Article ${new Date().toISOString().split('T')[0]}`;
			}
		}

		// Truncate title if too long
		if (title.length > MAX_TITLE_LENGTH) {
			title = title.substring(0, MAX_TITLE_LENGTH) + '...';
		}
	} catch (error) {
		console.error('[Reader Upload] Failed to parse HTML for title:', error);
		title = `Article ${new Date().toISOString().split('T')[0]}`;
	}

	console.log('[Reader Upload] Extracted title:', title);

	// 5. CREATE ARTICLE RECORD WITH STATUS = 'processing'
	const { data: article, error: insertError } = await supabase
		.from('articles')
		.insert({
			user_id: userId,
			title: title,
			status: 'processing'
		})
		.select()
		.single();

	if (insertError || !article) {
		console.error('[Reader Upload] Failed to create article:', insertError);
		return json(
			{
				error: {
					message: 'Failed to create article record',
					code: 'DATABASE_ERROR',
					details: insertError?.message
				}
			},
			{ status: 500 }
		);
	}

	console.log('[Reader Upload] Created article:', article.id);

	// 6. RETURN ARTICLE ID AND TITLE
	// Note: Client will send HTML + article_id to next endpoint for PDF conversion
	return json({
		success: true,
		article_id: article.id,
		title: title
	});
};
