/**
 * Reader Mode Configuration
 *
 * Defines the reader mode with its personas, capabilities, and styling.
 */

import type { ModeConfig } from './types';
import { READER_CONFIG } from '$lib/ui/scroll';

export const READER_MODE: ModeConfig = {
	id: 'reader',
	name: 'Reader',
	route: '/reader',
	personas: ['samara'],
	defaultPersona: 'samara',
	accentColor: '--reader-accent',
	bgColor: '--reader-bg',
	capabilities: {
		webSearch: true,
		contextInjection: 'basic',
		compression: false,
		fileReading: true
	},
	primaryCall: 'describe',
	secondaryCall: 'followup',
	scrollConfig: READER_CONFIG
};
