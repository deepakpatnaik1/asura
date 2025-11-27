/**
 * Chat Mode Configuration
 *
 * Defines the chat mode with its personas, capabilities, and styling.
 */

import type { ModeConfig } from './types';
import { CHAT_CONFIG } from '$lib/ui/scroll';

export const CHAT_MODE: ModeConfig = {
	id: 'chat',
	name: 'Chat',
	route: '/chat',
	personas: ['gunnar', 'kirby'],
	defaultPersona: 'gunnar',
	accentColor: '--boss-accent',
	bgColor: '--boss-bg',
	capabilities: {
		webSearch: false,
		contextInjection: 'rich',
		compression: true,
		fileReading: false
	},
	primaryCall: 'converse',
	secondaryCall: 'compress',
	scrollConfig: CHAT_CONFIG
};
