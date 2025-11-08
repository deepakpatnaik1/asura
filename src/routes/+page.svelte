<script lang="ts">
	import { Icon } from 'svelte-icons-pack';
	import { LuStar, LuCopy, LuTrash2, LuArchive, LuRefreshCw, LuPaperclip, LuFolder, LuChevronDown, LuSettings, LuLogOut, LuCloudDownload, LuEllipsisVertical, LuArrowDown, LuArrowUp, LuMessageSquare, LuFlame } from 'svelte-icons-pack/lu';

	// Placeholder data for chat interface
	const messages = [
		{
			id: '1',
			turn: 1,
			boss: 'Hello, quick test',
			ai: 'Hello Boss! Test received loud and clear. How can I help you today?',
			persona: 'Ananya',
			timestamp: 'Nov 7 at 02:53 PM'
		},
		{
			id: '2',
			turn: 2,
			boss: 'What is an asteroid?',
			ai: "An asteroid is a small rocky or metallic object that orbits the Sun. They're remnants from the early solar system, mostly found in the asteroid belt between Mars and Jupiter, though some venture into Earth's neighborhood.\n\nThink of them as the leftover building blocks of planets – too small to have become planets themselves, but significant enough to be worth tracking. The largest asteroid, Ceres, is massive enough to be classified as a dwarf planet. Most are much smaller, ranging from a few meters to hundreds of kilometers across.\n\nWhat's sparked your curiosity about asteroids? Are you reading something, or just wondering about the cosmos today?",
			persona: 'Ananya',
			timestamp: 'Nov 7 at 06:21 PM'
		},
		{
			id: '3',
			turn: 3,
			boss: 'What is a red dwarf?',
			ai: "A red dwarf is a small, cool star that's the most common type of star in the universe. They're much smaller and dimmer than our Sun – typically only about 7-50% of the Sun's mass and a fraction of its luminosity.\n\nWhat makes red dwarfs fascinating is their staying power: they burn fuel incredibly slowly, which means they can live for hundreds of billions of years – far longer than the current age of the universe (13.8 billion years). So in a real sense, no red dwarf has ever actually died yet.\n\nMany exoplanets have been discovered around red dwarfs, making them interesting targets in the search for habitable worlds, though their frequent stellar flares pose challenges for any potential life.",
			persona: 'Ananya',
			timestamp: 'Nov 7 at 06:21 PM'
		}
	];
</script>

<div class="chat-container">
	<!-- Messages Area -->
	<div class="messages-area">
		<div class="messages-content">
			{#each messages as msg}
				<!-- Boss Message -->
				<div class="message-group">
					<div class="boss-message">
						<!-- Turn Indicator -->
						<div class="turn-indicator">turn {msg.turn}</div>

						<div class="message-header">
							<span class="message-label boss-label">Boss</span>
							<div class="message-actions">
								<div class="action-icons">
									<button class="action-btn" title="Star"><Icon src={LuStar} size="11" /></button>
									<button class="action-btn" title="Copy"><Icon src={LuCopy} size="11" /></button>
									<button class="action-btn" title="Delete"><Icon src={LuTrash2} size="11" /></button>
									<button class="action-btn" title="Archive"><Icon src={LuArchive} size="11" /></button>
									<button class="action-btn" title="Refresh"><Icon src={LuRefreshCw} size="11" /></button>
								</div>
								<span class="timestamp">{msg.timestamp}</span>
							</div>
						</div>
						<div class="message-text">{msg.boss}</div>
					</div>
				</div>

				<!-- AI Response -->
				<div class="message-group">
					<div class="ai-message">
						<div class="message-header">
							<span class="message-label ai-label">{msg.persona}</span>
						</div>
						<div class="message-text">{msg.ai}</div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Input Area -->
	<div class="input-area">
		<div class="input-container">
			<div class="input-field-wrapper">
				<div class="input-controls">
					<button class="control-btn" title="Attach file"><Icon src={LuPaperclip} size="11" /></button>
					<button class="control-btn" title="Download from cloud"><Icon src={LuCloudDownload} size="11" /></button>
					<button class="control-btn" title="Browse folder"><Icon src={LuFolder} size="11" /></button>

					<div class="model-dropdown">
						<span class="model-name">Qwen 2.5 32B</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="persona-dropdown">
						<span class="persona-name">Gunnar</span>
						<Icon src={LuChevronDown} size="11" />
					</div>

					<div class="icon-group">
						<button class="control-btn" title="Auto-scroll"><Icon src={LuEllipsisVertical} size="11" /></button>
						<button class="control-btn" title="Scroll down"><Icon src={LuArrowDown} size="11" /></button>
						<button class="control-btn" title="Scroll up"><Icon src={LuArrowUp} size="11" /></button>
						<button class="control-btn" title="Messages"><Icon src={LuMessageSquare} size="11" /></button>
					</div>

					<!-- User Controls (inline on narrow screens) -->
					<div class="user-controls-inline">
						<button class="logout-btn logout-btn-inline"><Icon src={LuLogOut} size="11" /></button>
					</div>

					<button class="control-btn settings-btn" title="Burn"><Icon src={LuFlame} size="11" /></button>
				</div>
				<input type="text" placeholder="Type your message..." class="message-input" />
			</div>
			<button class="send-button">Send</button>
		</div>
	</div>

	<!-- User Avatar/Logout (top right) -->
	<div class="user-controls">
		<button class="logout-btn"><Icon src={LuLogOut} size="16" /></button>
	</div>
</div>

<style>
	/* Main Layout - Three-column grid */
	.chat-container {
		display: grid;
		grid-template-rows: 1fr auto;
		grid-template-columns: 1fr min(var(--middle-section-width), 100%) 1fr;
		grid-template-areas:
			'left-blank messages right-blank'
			'input input input';
		height: 100vh;
		overflow: hidden;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		position: relative;
	}

	/* Responsive adjustments for narrow screens */
	@media (max-width: 900px) {
		.chat-container {
			grid-template-columns: 0 1fr 0;
			padding: 0 16px;
		}
	}

	/* Messages Area - middle column */
	.messages-area {
		grid-area: messages;
		overflow-y: auto;
		padding: 24px;
		position: relative;
	}

	.messages-content {
		width: 100%;
		display: flex;
		flex-direction: column;
		gap: var(--message-gap);
	}

	/* Turn Indicator */
	.turn-indicator {
		color: hsl(var(--muted-foreground));
		opacity: 0.3;
		margin-bottom: 12px;
		text-transform: capitalize;
		letter-spacing: 0.5px;
		font-size: 0.85em;
	}

	/* Message Groups */
	.message-group {
		position: relative;
		margin-bottom: 16px;
	}

	/* Boss Message - with background card */
	.boss-message {
		background: var(--boss-bg);
		padding: var(--boss-card-padding-y) var(--boss-card-padding-x);
		margin-left: var(--boss-card-margin-x);
		margin-right: var(--boss-card-margin-x);
		border-radius: var(--boss-card-border-radius);
		position: relative;
	}

	/* AI Message - no background */
	.ai-message {
		position: relative;
		padding: var(--message-padding-y) 0;
	}

	/* Message Header */
	.message-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 12px;
		position: relative;
	}

	/* Message Labels */
	.message-label {
		font-weight: 500;
		color: hsl(var(--chat-label));
		display: block;
		width: 100%;
		padding-bottom: 2px;
	}

	.boss-label {
		color: var(--boss-accent);
		border-bottom: 1px solid var(--boss-accent);
		position: relative;
		top: -1px;
	}

	.ai-label {
		color: hsl(var(--foreground));
		border-bottom: 1px solid hsl(var(--border));
	}

	/* Message Actions - explicitly positioned */
	.message-actions {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		position: absolute;
		right: 0;
		top: 0;
	}

	.action-icons {
		display: flex;
		align-items: baseline;
		gap: var(--action-icon-gap);
	}

	.action-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0.6;
		transition: opacity 0.2s;
		padding: 4px;
		display: inline-flex;
		align-items: center;
		margin-top: -4px;
	}

	.action-btn:hover {
		opacity: 1;
	}

	.timestamp {
		color: hsl(var(--muted-foreground));
		opacity: 0.7;
		margin-left: 8px;
		font-family: Menlo, Monaco, 'Courier New', monospace;
		font-size: 0.85em;
	}

	/* Message Text */
	.message-text {
		line-height: 1.6;
		color: hsl(var(--foreground));
		white-space: pre-wrap;
	}

	/* Input Area - explicitly positioned at bottom */
	.input-area {
		grid-area: input;
		background: hsl(var(--card));
		border-top: 1px solid hsl(var(--chat-border));
		padding: 16px 24px;
		position: relative;
	}

	.input-controls {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		margin-bottom: 0px;
		flex-wrap: nowrap;
		overflow-x: auto;
	}

	.control-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
	}

	.control-btn:hover {
		opacity: 1;
	}

	.model-dropdown {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 12px;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
		flex-shrink: 0;
	}

	.model-dropdown:hover {
		opacity: 1;
	}

	.model-name {
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 140px;
	}

	.persona-dropdown {
		display: flex;
		align-items: center;
		gap: 4px;
		margin-left: 4px;
		cursor: pointer;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px;
		flex-shrink: 0;
	}

	.persona-dropdown:hover {
		opacity: 1;
	}

	.persona-name {
		font-size: 1em;
		color: hsl(var(--foreground));
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
		max-width: 80px;
	}

	.icon-group {
		display: flex;
		align-items: center;
		gap: var(--action-icon-gap);
		margin-left: 12px;
	}

	.settings-btn {
		color: rgb(239, 68, 68);
	}

	.settings-btn:hover {
		color: rgb(220, 38, 38);
	}

	/* On wide screens, push fire icon to the right */
	@media (min-width: 901px) {
		.settings-btn {
			margin-left: auto;
		}
	}

	.model-select,
	.persona-select {
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		padding: 6px 12px;
		cursor: pointer;
	}

	.control-icons {
		display: flex;
		gap: 8px;
	}

	.token-percentage {
		color: hsl(var(--muted-foreground));
		margin-left: auto;
		padding-right: 8px;
	}

	.input-container {
		display: flex;
		gap: 12px;
		align-items: flex-end;
		max-width: var(--middle-section-width);
		margin: 0 auto;
		width: 100%;
		padding: 0 24px;
	}

	.input-field-wrapper {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.message-input {
		flex: 1;
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 12px 16px;
		outline: none;
		transition: border-color 0.2s;
	}

	.message-input:focus {
		border-color: hsl(var(--ring));
	}

	.message-input::placeholder {
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
	}

	.send-button {
		background: transparent;
		color: var(--boss-accent);
		border: 1px solid var(--boss-accent);
		border-radius: 6px;
		padding: 12px 24px;
		font-weight: 500;
		cursor: pointer;
		transition: all 0.2s;
	}

	.send-button:hover {
		background: var(--boss-accent);
		color: hsl(var(--background));
	}

	/* User Controls - absolutely positioned top right */
	.user-controls {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: var(--z-sticky);
		display: flex;
		align-items: center;
		justify-content: center;
	}

	/* Hide top-right logout on narrow screens */
	@media (max-width: 900px) {
		.user-controls {
			display: none;
		}
	}

	/* Inline logout button container */
	.user-controls-inline {
		display: none;
		margin-left: auto;
		padding-right: 2px;
	}

	/* Show inline logout on narrow screens */
	@media (max-width: 900px) {
		.user-controls-inline {
			display: flex;
			align-items: center;
		}
	}

	.logout-btn {
		background: transparent;
		border: none;
		color: hsl(var(--chat-label));
		cursor: pointer;
		padding: 8px;
		opacity: 0.7;
		transition: all 0.2s;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.logout-btn-inline {
		padding: 4px;
	}

	.logout-btn:hover {
		opacity: 1;
		color: rgb(239, 68, 68);
	}

	/* Hide scrollbar */
	.messages-area::-webkit-scrollbar {
		display: none;
	}

	.messages-area {
		-ms-overflow-style: none;  /* IE and Edge */
		scrollbar-width: none;  /* Firefox */
	}
</style>
