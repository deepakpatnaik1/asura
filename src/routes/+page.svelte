<script lang="ts">
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
				<!-- Turn Indicator -->
				<div class="turn-indicator">Turn {msg.turn}</div>

				<!-- Boss Message -->
				<div class="message-group">
					<div class="boss-message">
						<div class="message-header">
							<span class="message-label boss-label">Boss</span>
							<div class="message-actions">
								<button class="action-btn" title="Star">⭐</button>
								<button class="action-btn" title="Copy">📋</button>
								<button class="action-btn" title="Delete">🗑️</button>
								<button class="action-btn" title="Archive">📦</button>
								<button class="action-btn" title="Refresh">🔄</button>
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
							<div class="message-actions">
								<button class="action-btn" title="Star">⭐</button>
								<button class="action-btn" title="Copy">📋</button>
								<button class="action-btn" title="Delete">🗑️</button>
								<button class="action-btn" title="Archive">📦</button>
								<button class="action-btn" title="Refresh">🔄</button>
								<span class="timestamp">{msg.timestamp}</span>
							</div>
						</div>
						<div class="message-text">{msg.ai}</div>
					</div>
				</div>
			{/each}
		</div>
	</div>

	<!-- Input Area -->
	<div class="input-area">
		<div class="input-controls">
			<button class="control-btn" title="Attach file">📎</button>
			<button class="control-btn" title="Download">⬇️</button>
			<button class="control-btn" title="Files">📁</button>

			<select class="model-select">
				<option>Sonnet 4.5</option>
				<option>GPT-4</option>
				<option>Claude Opus</option>
			</select>

			<select class="persona-select">
				<option>Ananya</option>
				<option>Gunnar</option>
				<option>Vlad</option>
				<option>Kirby</option>
				<option>Stefan</option>
				<option>Samara</option>
			</select>

			<div class="control-icons">
				<button class="control-btn">⬆️</button>
				<button class="control-btn">⬇️</button>
				<button class="control-btn">↩️</button>
			</div>

			<span class="token-percentage">0%</span>
			<button class="control-btn" title="Settings">⚙️</button>
		</div>

		<div class="input-container">
			<input type="text" placeholder="Type your message..." class="message-input" />
			<button class="send-button">Send</button>
		</div>
	</div>

	<!-- User Avatar/Logout (top right) -->
	<div class="user-controls">
		<div class="user-avatar">TEST</div>
		<button class="logout-btn">🚪 Logout</button>
	</div>
</div>

<style>
	/* Main Layout - Three-column grid */
	.chat-container {
		display: grid;
		grid-template-rows: 1fr auto;
		grid-template-columns: 1fr var(--middle-section-width) 1fr;
		grid-template-areas:
			'left-blank messages right-blank'
			'left-blank input right-blank';
		height: 100vh;
		overflow: hidden;
		background: hsl(var(--background));
		color: hsl(var(--foreground));
		position: relative;
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
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		opacity: 0.6;
		margin-bottom: 8px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
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
		font-size: 14px;
		font-weight: 500;
		color: hsl(var(--chat-label));
	}

	.boss-label {
		color: var(--boss-accent);
		border-bottom: 1px solid var(--boss-accent);
		padding-bottom: 2px;
	}

	.ai-label {
		color: hsl(var(--foreground));
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

	.action-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 14px;
		opacity: 0.6;
		transition: opacity 0.2s;
		padding: 4px;
	}

	.action-btn:hover {
		opacity: 1;
	}

	.timestamp {
		font-size: 11px;
		color: hsl(var(--muted-foreground));
		opacity: 0.7;
		margin-left: 8px;
	}

	/* Message Text */
	.message-text {
		font-size: 14px;
		line-height: 1.6;
		color: hsl(var(--foreground));
		white-space: pre-wrap;
	}

	/* Input Area - explicitly positioned at bottom */
	.input-area {
		grid-area: input;
		background: hsl(var(--background));
		border-top: 1px solid hsl(var(--chat-border));
		padding: 16px 24px;
		position: relative;
	}

	.input-controls {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}

	.control-btn {
		background: transparent;
		border: none;
		cursor: pointer;
		font-size: 16px;
		opacity: 0.7;
		transition: opacity 0.2s;
		padding: 4px 8px;
	}

	.control-btn:hover {
		opacity: 1;
	}

	.model-select,
	.persona-select {
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 4px;
		padding: 6px 12px;
		font-size: 13px;
		cursor: pointer;
	}

	.control-icons {
		display: flex;
		gap: 8px;
	}

	.token-percentage {
		font-size: 12px;
		color: hsl(var(--muted-foreground));
		margin-left: auto;
	}

	.input-container {
		display: flex;
		gap: 12px;
		align-items: center;
		width: calc(100% + (var(--boss-card-margin-x) * -2));
		margin-left: var(--boss-card-margin-x);
	}

	.message-input {
		flex: 1;
		background: hsl(var(--input));
		color: hsl(var(--foreground));
		border: 1px solid hsl(var(--border));
		border-radius: 6px;
		padding: 12px 16px;
		font-size: 14px;
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
		background: var(--boss-accent);
		color: hsl(var(--background));
		border: none;
		border-radius: 6px;
		padding: 12px 24px;
		font-size: 14px;
		font-weight: 500;
		cursor: pointer;
		transition: opacity 0.2s;
	}

	.send-button:hover {
		opacity: 0.9;
	}

	/* User Controls - absolutely positioned top right */
	.user-controls {
		position: fixed;
		top: 16px;
		right: 16px;
		z-index: var(--z-sticky);
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 8px;
	}

	.user-avatar {
		width: 40px;
		height: 40px;
		border-radius: 50%;
		background: hsl(var(--accent));
		color: hsl(var(--foreground));
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 9px;
		font-weight: 600;
		cursor: pointer;
	}

	.logout-btn {
		background: transparent;
		border: none;
		color: hsl(var(--chat-label));
		font-size: 12px;
		cursor: pointer;
		padding: 4px 8px;
		opacity: 0.7;
		transition: all 0.2s;
	}

	.logout-btn:hover {
		opacity: 1;
		color: rgb(239, 68, 68);
	}

	/* Scrollbar styling */
	.messages-area::-webkit-scrollbar {
		width: 8px;
	}

	.messages-area::-webkit-scrollbar-track {
		background: hsl(var(--background));
	}

	.messages-area::-webkit-scrollbar-thumb {
		background: hsl(var(--border));
		border-radius: 4px;
	}

	.messages-area::-webkit-scrollbar-thumb:hover {
		background: hsl(var(--ring));
	}
</style>
