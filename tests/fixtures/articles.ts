/**
 * Article Test Fixtures
 *
 * Sample articles and reader mode data for testing.
 */

export interface Article {
	id: string;
	user_id: string;
	title: string;
	status: 'processing' | 'ready' | 'error';
	preview_snippet: string | null;
	raw_html: string | null;
	pdf_storage_path: string | null;
	anthropic_file_id: string | null;
	anthropic_file_created_at: string | null;
	created_at: string;
}

export interface ArticleChart {
	id: string;
	article_id: string;
	user_id: string;
	storage_path: string;
	thumbnail_path: string | null;
	alt: string | null;
	anthropic_file_id: string | null;
	anthropic_file_created_at: string | null;
	created_at: string;
}

export interface ArticleChat {
	id: string;
	article_id: string;
	user_id: string;
	user_message: string;
	ai_response: string;
	model_identifier: string;
	created_at: string;
}

// Sample articles
export const testArticle1: Article = {
	id: 'article-1-test',
	user_id: 'user-1-test-uuid-12345',
	title: 'Introduction to Machine Learning',
	status: 'ready',
	preview_snippet:
		'Machine learning is a subset of artificial intelligence that enables systems to learn and improve from experience...',
	raw_html:
		'<html><head><title>Introduction to Machine Learning</title></head><body><h1>Introduction to Machine Learning</h1><p>Machine learning is a subset of artificial intelligence...</p></body></html>',
	pdf_storage_path: 'article-pdfs/user-1-test/article-1-test.pdf',
	anthropic_file_id: 'file_test_123',
	anthropic_file_created_at: '2024-11-20T00:00:00.000Z',
	created_at: '2024-11-20T00:00:00.000Z'
};

export const testArticle2: Article = {
	id: 'article-2-test',
	user_id: 'user-1-test-uuid-12345',
	title: 'Deep Dive into Neural Networks',
	status: 'ready',
	preview_snippet: 'Neural networks are computing systems inspired by biological neural networks...',
	raw_html:
		'<html><head><title>Deep Dive into Neural Networks</title></head><body><h1>Neural Networks</h1><p>Neural networks are computing systems...</p></body></html>',
	pdf_storage_path: 'article-pdfs/user-1-test/article-2-test.pdf',
	anthropic_file_id: 'file_test_456',
	anthropic_file_created_at: '2024-11-21T00:00:00.000Z',
	created_at: '2024-11-21T00:00:00.000Z'
};

export const testArticleProcessing: Article = {
	id: 'article-processing-test',
	user_id: 'user-1-test-uuid-12345',
	title: 'Article Being Processed',
	status: 'processing',
	preview_snippet: null,
	raw_html: '<html><body><h1>Processing...</h1></body></html>',
	pdf_storage_path: null,
	anthropic_file_id: null,
	anthropic_file_created_at: null,
	created_at: '2024-11-22T00:00:00.000Z'
};

// Sample article charts
export const testChart1: ArticleChart = {
	id: 'chart-1-test',
	article_id: 'article-1-test',
	user_id: 'user-1-test-uuid-12345',
	storage_path: 'article-images/user-1-test/chart-1.png',
	thumbnail_path: 'article-thumbnails/user-1-test/chart-1-thumb.png',
	alt: 'Diagram showing machine learning workflow',
	anthropic_file_id: 'file_chart_123',
	anthropic_file_created_at: '2024-11-20T00:00:00.000Z',
	created_at: '2024-11-20T00:00:00.000Z'
};

// Sample article chat
export const testArticleChat1: ArticleChat = {
	id: 'chat-1-test',
	article_id: 'article-1-test',
	user_id: 'user-1-test-uuid-12345',
	user_message: 'What is the main topic of this article?',
	ai_response:
		'This article provides an introduction to machine learning, covering the fundamental concepts and how systems can learn from experience.',
	model_identifier: 'claude-sonnet-4-5-20250929',
	created_at: '2024-11-20T10:00:00.000Z'
};

// Sample HTML inputs for testing upload
export const sampleHtmlSmall = `
<!DOCTYPE html>
<html>
<head><title>Test Article</title></head>
<body>
<h1>Test Article Title</h1>
<p>This is a test article with some content.</p>
</body>
</html>
`;

export const sampleHtmlWithImages = `
<!DOCTYPE html>
<html>
<head><title>Article with Images</title></head>
<body>
<h1>Article with Images</h1>
<p>This article contains images.</p>
<img src="https://example.com/image1.png" alt="Test image 1" />
<img src="https://example.com/image2.jpg" alt="Test image 2" />
</body>
</html>
`;

// Generate large HTML for size limit testing
export function generateLargeHtml(sizeInKb: number): string {
	const baseContent = '<p>Lorem ipsum dolor sit amet, consectetur adipiscing elit. </p>';
	const targetSize = sizeInKb * 1024;
	let html = '<!DOCTYPE html><html><head><title>Large Article</title></head><body>';

	while (html.length < targetSize) {
		html += baseContent;
	}

	html += '</body></html>';
	return html;
}
