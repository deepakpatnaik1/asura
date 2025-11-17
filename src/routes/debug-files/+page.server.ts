import { createClient } from '@supabase/supabase-js';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';

const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

export async function load() {
	// Fetch all file chunks with their filename from the files table via JOIN
	const { data: fileChunks, error } = await supabase
		.from('file_chunks')
		.select('*, files!inner(filename, file_type)')
		.order('files(filename)', { ascending: true })
		.order('chunk_index', { ascending: true });

	if (error) {
		console.error('Error fetching file chunks:', error);
		return { files: [] };
	}

	// Group chunks by filename
	const fileMap = new Map<string, any[]>();

	for (const chunk of fileChunks || []) {
		const filename = chunk.files?.filename;
		if (!filename) continue;

		if (!fileMap.has(filename)) {
			fileMap.set(filename, []);
		}
		fileMap.get(filename)!.push({
			...chunk,
			filename,
			file_type: chunk.files?.file_type
		});
	}

	// Calculate compression stats for each file
	const files = Array.from(fileMap.entries()).map(([filename, chunks]) => {
		const totalOriginalChars = chunks.reduce((sum, c) => sum + (c.original_content_length || 0), 0);
		const totalCompressedChars = chunks.reduce((sum, c) => sum + (c.description?.length || 0), 0);
		const compressionRatio = totalOriginalChars > 0
			? ((1 - totalCompressedChars / totalOriginalChars) * 100).toFixed(1)
			: '0.0';

		return {
			filename,
			fileType: chunks[0]?.file_type || 'unknown',
			totalChunks: chunks.length,
			totalOriginalChars,
			totalCompressedChars,
			compressionRatio,
			chunks: chunks.map(c => ({
				chunkIndex: c.chunk_index,
				description: c.description,
				originalLength: c.original_content_length || 0,
				compressedLength: c.description?.length || 0,
				compressionRatio: c.original_content_length > 0
					? ((1 - (c.description?.length || 0) / c.original_content_length) * 100).toFixed(1)
					: '0.0',
				hasEmbedding: c.embedding !== null,
				createdAt: c.created_at
			}))
		};
	});

	return { files };
}
