/**
 * Color Palettes
 *
 * Each palette defines accent colors for all four personas.
 * To switch palettes, change ACTIVE_PALETTE below.
 */

export interface Palette {
	name: string;
	gunnar: string;
	kirby: string;
	samara: string;
	alicja: string;
}

export const PALETTES: Record<string, Palette> = {
	vibrant: {
		name: 'Vibrant',
		gunnar: 'rgb(200, 100, 60)', // burnt sienna
		kirby: 'rgb(236, 72, 153)', // hot pink
		samara: 'rgb(16, 185, 129)', // emerald
		alicja: 'rgb(56, 140, 220)' // vibrant blue
	},
	jewel: {
		name: 'Deep Jewel',
		gunnar: 'rgb(128, 48, 68)', // burgundy
		kirby: 'rgb(128, 48, 108)', // plum
		samara: 'rgb(38, 108, 88)', // forest
		alicja: 'rgb(48, 78, 128)' // navy
	},
	muted: {
		name: 'Muted Sophistication',
		gunnar: 'rgb(120, 130, 150)', // slate
		kirby: 'rgb(155, 120, 145)', // mauve
		samara: 'rgb(115, 145, 130)', // sage
		alicja: 'rgb(110, 135, 155)' // steel
	},
	warm: {
		name: 'Warm Earth',
		gunnar: 'rgb(205, 127, 80)', // tawny
		kirby: 'rgb(200, 100, 120)', // rose
		samara: 'rgb(140, 160, 90)', // olive
		alicja: 'rgb(160, 140, 100)' // sand
	},
	neon: {
		name: 'Neon',
		gunnar: 'rgb(255, 60, 60)', // neon red
		kirby: 'rgb(255, 50, 180)', // neon pink
		samara: 'rgb(0, 255, 150)', // neon green
		alicja: 'rgb(50, 150, 255)' // neon blue
	},
	mono: {
		name: 'Monochrome',
		gunnar: 'rgb(180, 180, 180)', // light gray
		kirby: 'rgb(140, 140, 140)', // medium gray
		samara: 'rgb(160, 160, 160)', // gray
		alicja: 'rgb(120, 120, 120)' // dark gray
	}
};

// ============================================================================
// ACTIVE PALETTE - Change this to switch all persona colors
// ============================================================================
export const ACTIVE_PALETTE: keyof typeof PALETTES = 'vibrant';

// Helper to get current palette
export function getActivePalette(): Palette {
	return PALETTES[ACTIVE_PALETTE];
}

// Helper to get persona color from active palette
export function getPaletteColor(persona: 'gunnar' | 'kirby' | 'samara' | 'alicja'): string {
	return PALETTES[ACTIVE_PALETTE][persona];
}
