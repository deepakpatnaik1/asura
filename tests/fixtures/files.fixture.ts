/**
 * File Test Fixtures
 *
 * Provides test data for file-related tests.
 */

/**
 * Create a mock File object for testing
 */
export function createMockFile(
	name: string,
	size: number,
	type: string,
	content: string = 'Mock file content'
): File {
	const blob = new Blob([content], { type });
	return new File([blob], name, { type });
}

/**
 * Create a mock text file
 */
export function createMockTextFile(name: string = 'test.txt', content: string = 'Test content'): File {
	return createMockFile(name, content.length, 'text/plain', content);
}

/**
 * Create a mock PDF file
 */
export function createMockPdfFile(name: string = 'test.pdf', size: number = 1024): File {
	return createMockFile(name, size, 'application/pdf', 'Mock PDF content');
}

/**
 * Create a mock Word document
 */
export function createMockDocxFile(name: string = 'test.docx', size: number = 2048): File {
	return createMockFile(
		name,
		size,
		'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
		'Mock DOCX content'
	);
}

/**
 * Create a mock image file
 */
export function createMockImageFile(name: string = 'test.png', size: number = 512): File {
	return createMockFile(name, size, 'image/png', 'Mock PNG data');
}

/**
 * Create a mock ZIP file
 */
export function createMockZipFile(name: string = 'test.zip', size: number = 4096): File {
	return createMockFile(name, size, 'application/zip', 'Mock ZIP content');
}

/**
 * Sample file metadata for testing
 */
export const sampleFileMetadata = {
	id: 'test-file-id-123',
	name: 'sample-document.pdf',
	size: 1024000,
	type: 'application/pdf',
	userId: 'test-user-id',
	uploadedAt: '2024-01-01T00:00:00.000Z',
	description: 'A sample test document',
	storagePath: 'user-files/test-user-id/sample-document.pdf',
	embedding: Array.from({ length: 1024 }, (_, i) => Math.sin(i / 100))
};

/**
 * Sample extracted text for testing
 */
export const sampleExtractedText = `
This is a sample document for testing.

It contains multiple paragraphs and sections.

Section 1: Introduction
This section introduces the main concepts.

Section 2: Details
This section provides detailed information about the topic.

Section 3: Conclusion
This section summarizes the key points.
`.trim();

/**
 * Sample processed chunks for testing
 */
export const sampleProcessedChunks = [
	{
		text: 'This is a sample document for testing. It contains multiple paragraphs and sections.',
		metadata: { chunk: 0, source: 'sample-document.pdf' }
	},
	{
		text: 'Section 1: Introduction. This section introduces the main concepts.',
		metadata: { chunk: 1, source: 'sample-document.pdf' }
	},
	{
		text: 'Section 2: Details. This section provides detailed information about the topic.',
		metadata: { chunk: 2, source: 'sample-document.pdf' }
	},
	{
		text: 'Section 3: Conclusion. This section summarizes the key points.',
		metadata: { chunk: 3, source: 'sample-document.pdf' }
	}
];

/**
 * Sample file upload form data
 */
export const sampleFileUploadData = {
	files: [createMockPdfFile(), createMockTextFile()],
	description: 'Test file upload',
	userId: 'test-user-id'
};

/**
 * Sample SSE event data
 */
export const sampleSSEEvents = [
	{ type: 'progress', data: { stage: 'upload', progress: 0 } },
	{ type: 'progress', data: { stage: 'upload', progress: 50 } },
	{ type: 'progress', data: { stage: 'upload', progress: 100 } },
	{ type: 'progress', data: { stage: 'extraction', progress: 0 } },
	{ type: 'progress', data: { stage: 'extraction', progress: 100 } },
	{ type: 'progress', data: { stage: 'vectorization', progress: 0 } },
	{ type: 'progress', data: { stage: 'vectorization', progress: 100 } },
	{ type: 'complete', data: { fileId: 'test-file-id-123', success: true } }
];
