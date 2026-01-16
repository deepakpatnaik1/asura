/**
 * Shared Scroll Utilities
 *
 * Common scroll behavior for chat mode and e-reader mode.
 * Both modes use the same logic with different container/turn selectors.
 */

/** Standard offset from top of viewport for boss card positioning (matches .messages-area padding) */
const BOSS_CARD_TOP_OFFSET = 24;

/** Buffer zone for determining if a turn is "at" the current position */
const TURN_DETECTION_BUFFER = 100;

/** ID for the dynamic spacer element */
const SPACER_ID = 'scroll-spacer';

export interface ScrollConfig {
	/** CSS selector for the scrollable container */
	containerSelector: string;
	/** CSS selector for the content container (where spacer is appended) */
	contentSelector: string;
	/** CSS selector for turn markers (boss messages) */
	turnSelector: string;
}

export const CHAT_CONFIG: ScrollConfig = {
	containerSelector: '.messages-area',
	contentSelector: '.messages-content',
	turnSelector: '.boss-message'
};

export const READER_CONFIG: ScrollConfig = {
	containerSelector: '.messages-area',
	contentSelector: '.messages-content',
	turnSelector: '.boss-message'
};

/**
 * Check if running in browser (not SSR)
 */
function isBrowser(): boolean {
	return typeof document !== 'undefined';
}

/**
 * Get the scrollable container element
 */
export function getContainer(config: ScrollConfig): HTMLElement | null {
	if (!isBrowser()) return null;
	return document.querySelector(config.containerSelector) as HTMLElement | null;
}

/** Empty NodeList for SSR */
const EMPTY_NODE_LIST = {
	length: 0,
	item: () => null,
	forEach: () => {},
	entries: () => [][Symbol.iterator](),
	keys: () => [][Symbol.iterator](),
	values: () => [][Symbol.iterator](),
	[Symbol.iterator]: () => [][Symbol.iterator]()
} as unknown as NodeListOf<Element>;

/**
 * Get all turn elements in the container (including bookmarks)
 * Returns both turn markers (.boss-message) and bookmark markers (.scroll-bookmark)
 * sorted by their position in the document.
 */
export function getTurns(config: ScrollConfig): Element[] {
	if (!isBrowser()) return [];

	// Get both turns and bookmarks
	const turns = Array.from(document.querySelectorAll(config.turnSelector));
	const bookmarks = Array.from(document.querySelectorAll('.scroll-bookmark'));

	// Combine and sort by document position
	const allStops = [...turns, ...bookmarks].sort((a, b) => {
		const position = a.compareDocumentPosition(b);
		if (position & Node.DOCUMENT_POSITION_FOLLOWING) return -1;
		if (position & Node.DOCUMENT_POSITION_PRECEDING) return 1;
		return 0;
	});

	return allStops;
}

/**
 * Get turn navigation state (current index, total count, at boundaries)
 */
export function getTurnNavigationState(config: ScrollConfig): {
	currentIndex: number;
	totalTurns: number;
	isAtFirst: boolean;
	isAtLast: boolean;
} {
	const container = getContainer(config);
	const turns = getTurns(config);

	if (!container || turns.length === 0) {
		return { currentIndex: -1, totalTurns: 0, isAtFirst: true, isAtLast: true };
	}

	const currentScrollTop = container.scrollTop;
	const containerRect = container.getBoundingClientRect();

	// Find which turn is currently at the top of the viewport
	let currentIndex = 0;
	for (let i = 0; i < turns.length; i++) {
		const rect = turns[i].getBoundingClientRect();
		const turnTop = rect.top - containerRect.top + currentScrollTop;

		// If this turn is above or at the viewport top (with buffer), it's the current one
		if (turnTop <= currentScrollTop + BOSS_CARD_TOP_OFFSET + TURN_DETECTION_BUFFER) {
			currentIndex = i;
		} else {
			break;
		}
	}

	return {
		currentIndex,
		totalTurns: turns.length,
		isAtFirst: currentIndex === 0,
		isAtLast: currentIndex === turns.length - 1
	};
}

/**
 * Scroll to position a specific turn's boss card at top + 40px offset.
 * Manages spacer for last turn edge case.
 *
 * Note: Uses 'instant' by default because 'smooth' gets interrupted by
 * focus management (handleGlobalClick/refocusInput) on button clicks.
 */
export function scrollToTurn(
	config: ScrollConfig,
	turnElement: Element,
	options: { behavior?: ScrollBehavior } = {}
): void {
	const container = getContainer(config);
	if (!container) return;

	const containerRect = container.getBoundingClientRect();
	const turnRect = turnElement.getBoundingClientRect();
	const turnTop = turnRect.top - containerRect.top + container.scrollTop;

	// Ensure spacer exists for scrollability
	updateSpacer(config, turnElement);

	const targetScrollTop = turnTop - BOSS_CARD_TOP_OFFSET;

	container.scrollTo({
		top: Math.max(0, targetScrollTop),
		behavior: options.behavior ?? 'instant'
	});
}

/**
 * Scroll to the next turn (down)
 */
export function scrollToNextTurn(config: ScrollConfig): void {
	const container = getContainer(config);
	const turns = getTurns(config);

	if (!container || turns.length === 0) return;

	const currentScrollTop = container.scrollTop;
	const viewportThreshold = currentScrollTop + TURN_DETECTION_BUFFER;
	const containerRect = container.getBoundingClientRect();

	// Find first turn below current viewport position
	for (const turn of turns) {
		const rect = turn.getBoundingClientRect();
		const turnTop = rect.top - containerRect.top + currentScrollTop;

		if (turnTop > viewportThreshold) {
			scrollToTurn(config, turn);
			return;
		}
	}
}

/**
 * Scroll to the previous turn (up)
 */
export function scrollToPreviousTurn(config: ScrollConfig): void {
	const container = getContainer(config);
	const turns = getTurns(config);

	if (!container || turns.length === 0) return;

	const currentScrollTop = container.scrollTop;
	const viewportThreshold = currentScrollTop - TURN_DETECTION_BUFFER;
	const containerRect = container.getBoundingClientRect();

	// Find last turn above current viewport position (iterate backwards)
	for (let i = turns.length - 1; i >= 0; i--) {
		const rect = turns[i].getBoundingClientRect();
		const turnTop = rect.top - containerRect.top + container.scrollTop;

		if (turnTop < viewportThreshold) {
			scrollToTurn(config, turns[i]);
			return;
		}
	}
}

/**
 * Scroll to the last turn
 */
export function scrollToLastTurn(config: ScrollConfig): void {
	const turns = getTurns(config);
	if (turns.length === 0) return;

	scrollToTurn(config, turns[turns.length - 1]);
}

/**
 * Scroll to absolute bottom of container
 */
export function scrollToBottom(config: ScrollConfig, behavior: ScrollBehavior = 'instant'): void {
	const container = getContainer(config);
	if (!container) return;

	container.scrollTo({
		top: container.scrollHeight,
		behavior
	});
}

/**
 * Update the dynamic spacer to ensure the target turn can scroll to top + 40px.
 * Simple calculation: spacer height = viewport height - boss card height - 40px
 * This creates exactly enough room to scroll the boss card to top with offset.
 * Streaming content naturally fills this space.
 */
export function updateSpacer(config: ScrollConfig, targetTurn?: Element): void {
	const container = getContainer(config);
	if (!container) return;

	// Get the content container (where spacer should be appended)
	const contentContainer = container.querySelector(config.contentSelector) as HTMLElement | null;
	if (!contentContainer) return;

	// Get or create spacer (inside content container, not scroll container)
	let spacer = contentContainer.querySelector(`#${SPACER_ID}`) as HTMLElement | null;
	if (!spacer) {
		spacer = document.createElement('div');
		spacer.id = SPACER_ID;
		spacer.style.width = '100%';
		spacer.style.flexShrink = '0';
		contentContainer.appendChild(spacer);
	}

	// If no target turn, try to use the last turn
	if (!targetTurn) {
		const turns = getTurns(config);
		if (turns.length > 0) {
			targetTurn = turns[turns.length - 1];
		}
	}

	if (!targetTurn) {
		spacer.style.height = '0px';
		return;
	}

	// Simple fixed calculation: viewport - boss card height - offset
	// This ensures the boss card can scroll to top with 40px offset
	const containerRect = container.getBoundingClientRect();
	const containerHeight = containerRect.height;
	const turnRect = targetTurn.getBoundingClientRect();
	const turnHeight = turnRect.height;

	const requiredSpacerHeight = containerHeight - turnHeight - BOSS_CARD_TOP_OFFSET;

	spacer.style.height = `${Math.max(0, requiredSpacerHeight)}px`;
}

/**
 * Remove the spacer element entirely
 */
export function removeSpacer(config: ScrollConfig): void {
	const container = getContainer(config);
	if (!container) return;

	const contentContainer = container.querySelector(config.contentSelector) as HTMLElement | null;
	if (!contentContainer) return;

	const spacer = contentContainer.querySelector(`#${SPACER_ID}`);
	if (spacer) {
		spacer.remove();
	}
}
