/**
 * Refresh Artisan Cut API
 *
 * POST: Regenerate artisan cut for a linked file
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { existsSync, readFileSync } from 'fs';
import { FIREWORKS_API_KEY } from '$env/static/private';
import { requireAuth } from '$lib/api/require-auth';
import { createMessage } from '$lib/api/anthropic-client';
import { getModelProvider, assertProviderSupported } from '$lib/calls/chat/provider';
import { DEFAULT_MODEL } from '$lib/config/models';
import { FILE_ARTISAN_CUT_PROMPT } from '$lib/prompts/file-artisan-cut';
import { databaseError, notFoundError, validationError } from '$lib/api/errors';
import { createLogger } from '$lib/api/logger';

/**
 * Call Fireworks API for file artisan cut (non-streaming).
 */
async function callFireworksArtisanCut(model: string, systemPrompt: string, content: string): Promise<string> {
	const response = await fetch('https://api.fireworks.ai/inference/v1/chat/completions', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${FIREWORKS_API_KEY}`
		},
		body: JSON.stringify({
			model,
			messages: [
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content }
			],
			max_tokens: 8192,
			temperature: 0.3
		})
	});

	if (!response.ok) {
		const error = await response.text();
		throw new Error(`Fireworks API error: ${response.status} - ${error}`);
	}

	const data = await response.json();
	return data.choices?.[0]?.message?.content || '';
}

/**
 * POST /api/chat/files/[id]/refresh
 * Regenerate artisan cut for a linked file by reading fresh content from disk
 */
export const POST: RequestHandler = async ({ params, locals: { safeGetSession, supabase } }) => {
	const auth = await requireAuth(safeGetSession);
	if (!auth.success) return auth.error;
	const { userId } = auth;

	const { id } = params;
	if (!id) {
		return validationError('File ID is required', 'id');
	}

	const log = createLogger('RefreshArtisanCut', userId);

	// Fetch the article
	const { data: article, error: fetchError } = await supabase
		.from('articles')
		.select('id, title, source_path, tier')
		.eq('id', id)
		.eq('user_id', userId)
		.single();

	if (fetchError || !article) {
		return notFoundError('Article not found');
	}

	// Validate: must be a linked file
	if (!article.source_path) {
		return validationError('Only linked files can be refreshed', 'source_path');
	}

	// Validate: must have artisan cut tier (strategic or canon)
	if (article.tier !== 'strategic' && article.tier !== 'canon') {
		return validationError('Only strategic or canon tier files have artisan cuts to refresh', 'tier');
	}

	// Validate: file must exist
	if (!existsSync(article.source_path)) {
		return validationError(`Linked file not found: ${article.source_path}`, 'source_path');
	}

	log.info('Refreshing artisan cut', { articleId: id, sourcePath: article.source_path });

	try {
		// Read fresh content from disk
		const fileContent = readFileSync(article.source_path, 'utf-8');

		// Fetch user settings for compression model
		const { data: settings } = await supabase
			.from('user_settings')
			.select('default_model, model_compression')
			.eq('user_id', userId)
			.single();

		const model = settings?.model_compression || settings?.default_model || DEFAULT_MODEL;
		const provider = await getModelProvider(supabase, model);
		assertProviderSupported(provider);

		let responseText: string;

		if (provider === 'fireworks') {
			responseText = await callFireworksArtisanCut(model, FILE_ARTISAN_CUT_PROMPT, fileContent);
		} else {
			// Anthropic
			const response = await createMessage({
				model,
				max_tokens: 8192,
				temperature: 0.3,
				system: FILE_ARTISAN_CUT_PROMPT,
				messages: [{ role: 'user', content: fileContent }]
			});

			const textBlock = response.content.find((block) => block.type === 'text');
			if (!textBlock || textBlock.type !== 'text') {
				throw new Error('No text response from AI');
			}
			responseText = textBlock.text;
		}

		// Parse JSON response
		let parsed: { title: string; description: string };
		try {
			let jsonText = responseText.trim();
			const jsonMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				jsonText = jsonMatch[1].trim();
			}
			const objectMatch = jsonText.match(/\{[\s\S]*\}/);
			if (objectMatch) {
				jsonText = objectMatch[0];
			}
			parsed = JSON.parse(jsonText);
		} catch (e) {
			log.error('Failed to parse AI response', { raw: responseText });
			throw new Error('Failed to parse AI response as JSON');
		}

		if (!parsed.title || !parsed.description) {
			throw new Error('AI response missing title or description');
		}

		// Update article with new artisan cut
		const { error: updateError } = await supabase
			.from('articles')
			.update({
				title: parsed.title.slice(0, 255),
				artisan_cut: parsed.description,
				artisan_cut_at: new Date().toISOString(),
				raw_content: fileContent, // Also update raw_content snapshot
				updated_at: new Date().toISOString()
			})
			.eq('id', id)
			.eq('user_id', userId);

		if (updateError) {
			log.error('Failed to update article', { error: updateError.message });
			return databaseError('Failed to update article');
		}

		log.info('Artisan cut refreshed successfully', { articleId: id, newTitle: parsed.title });

		return json({
			success: true,
			article_id: id,
			title: parsed.title,
			artisan_cut_length: parsed.description.length
		});
	} catch (error) {
		log.error('Failed to refresh artisan cut', { error: error instanceof Error ? error.message : 'Unknown' });
		return json({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }, { status: 500 });
	}
};
