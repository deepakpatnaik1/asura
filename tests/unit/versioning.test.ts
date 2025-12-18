import { describe, it, expect } from 'vitest';
import {
	getApiVersion,
	isVersionSupported,
	getVersionHeader,
	createVersionedHeaders,
	getDeprecationHeader,
	CURRENT_API_VERSION,
	MIN_SUPPORTED_VERSION,
	MAX_SUPPORTED_VERSION
} from '$lib/api/versioning';

describe('versioning module', () => {
	describe('constants', () => {
		it('has correct version constants', () => {
			expect(CURRENT_API_VERSION).toBe(1);
			expect(MIN_SUPPORTED_VERSION).toBe(1);
			expect(MAX_SUPPORTED_VERSION).toBe(1);
		});
	});

	describe('getApiVersion', () => {
		it('returns current version when no Accept header', () => {
			const request = new Request('http://test.com/api/chat');
			expect(getApiVersion(request)).toBe(CURRENT_API_VERSION);
		});

		it('returns current version when Accept header has no version', () => {
			const request = new Request('http://test.com/api/chat', {
				headers: { Accept: 'application/json' }
			});
			expect(getApiVersion(request)).toBe(CURRENT_API_VERSION);
		});

		it('extracts version 1 from Accept header', () => {
			const request = new Request('http://test.com/api/chat', {
				headers: { Accept: 'application/vnd.aether.v1+json' }
			});
			expect(getApiVersion(request)).toBe(1);
		});

		it('extracts version 2 from Accept header (clamped to max)', () => {
			const request = new Request('http://test.com/api/chat', {
				headers: { Accept: 'application/vnd.aether.v2+json' }
			});
			// Should be clamped to MAX_SUPPORTED_VERSION
			expect(getApiVersion(request)).toBe(MAX_SUPPORTED_VERSION);
		});

		it('clamps version 0 to minimum', () => {
			const request = new Request('http://test.com/api/chat', {
				headers: { Accept: 'application/vnd.aether.v0+json' }
			});
			expect(getApiVersion(request)).toBe(MIN_SUPPORTED_VERSION);
		});
	});

	describe('isVersionSupported', () => {
		it('returns true for version 1', () => {
			expect(isVersionSupported(1)).toBe(true);
		});

		it('returns false for version 0', () => {
			expect(isVersionSupported(0)).toBe(false);
		});

		it('returns false for version 2 (not yet supported)', () => {
			expect(isVersionSupported(2)).toBe(false);
		});
	});

	describe('getVersionHeader', () => {
		it('formats version header correctly', () => {
			expect(getVersionHeader(1)).toBe('v1');
			expect(getVersionHeader(2)).toBe('v2');
		});
	});

	describe('createVersionedHeaders', () => {
		it('includes X-API-Version header', () => {
			const headers = createVersionedHeaders(1);
			expect(headers['X-API-Version']).toBe('v1');
		});

		it('includes additional headers', () => {
			const headers = createVersionedHeaders(1, {
				'Content-Type': 'application/json',
				'Cache-Control': 'no-cache'
			});
			expect(headers['X-API-Version']).toBe('v1');
			expect(headers['Content-Type']).toBe('application/json');
			expect(headers['Cache-Control']).toBe('no-cache');
		});
	});

	describe('getDeprecationHeader', () => {
		it('returns message without date', () => {
			const header = getDeprecationHeader('This endpoint is deprecated');
			expect(header).toBe('This endpoint is deprecated');
		});

		it('includes sunset date when provided', () => {
			const sunsetDate = new Date('2025-06-01T00:00:00.000Z');
			const header = getDeprecationHeader('This endpoint is deprecated', sunsetDate);
			expect(header).toBe('This endpoint is deprecated; sunset=2025-06-01T00:00:00.000Z');
		});
	});
});
