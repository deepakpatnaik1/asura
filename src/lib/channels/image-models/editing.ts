/**
 * Channel: Image Editing
 *
 * Re-exports the provider-agnostic image editing from $lib/calls/image.
 * Currently only FAL supports image editing.
 */

export {
	editImage,
	editWithFal,
	type ImageEditParams,
	type ImageEditResult
} from '$lib/calls/image';
