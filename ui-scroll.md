# E-Reader Scroll Behavior Requirements

## 1. Separation of Concerns

Keep all scrolling behavior in a separate file. Do not clutter `+page.svelte` with scroll logic.

## 2. Initial Load Behavior

On browser refresh or app start, snap to the end of the latest message turn. This is natural AI chat interface behavior - the user wants to pick up where they left off.

## 3. Question Submission Behavior

When the user submits a question:

1. **Boss card positioning**: The boss card (user's question) should immediately appear at the top of the viewport with 24px vertical space above it (matches `.messages-area` padding for visual consistency).

2. **Thinking indicator**: Show "Samara" display text and "thinking..." indicator immediately, exactly like chat mode.

3. **Answer generation**: As the answer streams in, the viewport does NOT scroll or snap to the end. The boss card stays anchored at the top.

4. **Reading flow**: User reads the answer from top to bottom, scrolling down manually if needed.

**Implementation note**: Use a temporary spacer/buffer below the boss card to ensure the container is tall enough to scroll the boss card to the top (spacer height = viewport height - boss card height - 24px). The streaming response naturally fills this space. Remove the spacer when streaming completes.

## 4. Auto-Scroll Activation on Response

When Samara starts generating her answer, auto-scroll should automatically switch on (starting in pause phase).

**Rationale**: The answer streams in, giving the user time to read. After ~60 seconds (the pause duration), the average user reaches the bottom of the viewport. At that moment, auto-scroll begins its 30-second scroll phase - perfectly timed to continue the reading flow.

## 5. Turn Navigation Buttons

The next turn and previous turn buttons in the input bar should work exactly like chat mode:

- **Next turn button**: Navigate to the next message turn
- **Previous turn button**: Navigate to the previous message turn

**Display criteria (universal)**: At every click, the target turn's boss card appears at the top of the viewport with 24px spacing from the top (matches `.messages-area` padding).

**Last turn edge case**: For the very last message turn, use a spacer to ensure the boss card can scroll to the top (spacer height = viewport height - boss card height - 24px). Same logic as question submission.

## 6. Shared Logic Between Chat Mode and E-Reader Mode

The only major UI difference between chat mode and e-reader mode is the accent color. The scrolling behavior, button functionality, and UI logic are largely common.

**Requirement**: Consolidate all shared logic into a single place that both modes can use. This includes:
- Scroll utilities (scroll to turn, spacer management)
- Turn navigation (next/prev)
- Auto-scroll behavior
- Initial load positioning

Mode-specific code should only handle visual theming (accent colors).

---

## Design Decisions

1. **Initial load**: Scroll to absolute bottom (end of last AI response) - traditional chat behavior
2. **Spacer management**: Keep spacer, shrink dynamically (height = max(0, viewport - content below boss card))
3. **Auto-scroll activation**: Trigger when first streaming token arrives
4. **Turn navigation boundaries**: Disable buttons when at first/last turn
