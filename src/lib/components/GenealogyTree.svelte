<script lang="ts">
	/**
	 * GenealogyTree - Git-style image lineage visualization
	 * Renders image genealogy as a horizontal tree: roots → children → grandchildren
	 * Click an image to "checkout" (set as branching point for new variations)
	 */

	import type { RenderElement } from '$lib/api/canvas-tools';

	interface TreeNode {
		element: RenderElement;
		children: TreeNode[];
		depth: number;
	}

	interface Props {
		images: RenderElement[];
		checkedOutId?: string | null;
		onCheckout?: (imageId: string) => void;
	}

	let { images = [], checkedOutId = null, onCheckout }: Props = $props();

	// Build tree structure from flat array using parent_id
	function buildTree(elements: RenderElement[]): TreeNode[] {
		// Create a map for quick lookup
		const nodeMap = new Map<string, TreeNode>();

		// Initialize all nodes
		for (const el of elements) {
			nodeMap.set(el.id, { element: el, children: [], depth: 0 });
		}

		const roots: TreeNode[] = [];

		// Build parent-child relationships
		for (const el of elements) {
			const node = nodeMap.get(el.id)!;
			if (el.parent_id && nodeMap.has(el.parent_id)) {
				const parent = nodeMap.get(el.parent_id)!;
				parent.children.push(node);
			} else {
				// No parent or parent not found = root
				roots.push(node);
			}
		}

		// Sort children by created_at (oldest first)
		function sortChildren(node: TreeNode) {
			node.children.sort((a, b) => {
				const aTime = a.element.created_at || '';
				const bTime = b.element.created_at || '';
				return aTime.localeCompare(bTime);
			});
			for (const child of node.children) {
				sortChildren(child);
			}
		}

		// Calculate depths
		function setDepth(node: TreeNode, depth: number) {
			node.depth = depth;
			for (const child of node.children) {
				setDepth(child, depth + 1);
			}
		}

		// Sort roots by created_at and process
		roots.sort((a, b) => {
			const aTime = a.element.created_at || '';
			const bTime = b.element.created_at || '';
			return aTime.localeCompare(bTime);
		});

		for (const root of roots) {
			sortChildren(root);
			setDepth(root, 0);
		}

		return roots;
	}

	// Flatten tree for rendering with position info
	interface FlatNode {
		node: TreeNode;
		row: number;
		col: number;
		parentRow?: number;
	}

	function flattenTree(roots: TreeNode[]): FlatNode[] {
		const flat: FlatNode[] = [];
		let currentRow = 0;

		function traverse(node: TreeNode, col: number, parentRow?: number): number {
			const myRow = currentRow;
			flat.push({ node, row: myRow, col, parentRow });

			if (node.children.length === 0) {
				currentRow++;
				return myRow;
			}

			// First child continues at same row, subsequent children get new rows
			for (let i = 0; i < node.children.length; i++) {
				if (i > 0) currentRow++;
				traverse(node.children[i], col + 1, myRow);
			}

			return myRow;
		}

		for (let i = 0; i < roots.length; i++) {
			if (i > 0) currentRow++;
			traverse(roots[i], 0);
		}

		return flat;
	}

	// Computed tree structure
	let tree = $derived(buildTree(images.filter((el) => el.type === 'image' && el.src)));
	let flatNodes = $derived(flattenTree(tree));
	let maxCol = $derived(Math.max(0, ...flatNodes.map((n) => n.col)));
	let maxRow = $derived(Math.max(0, ...flatNodes.map((n) => n.row)));

	// Grid dimensions
	const CELL_WIDTH = 100;
	const CELL_HEIGHT = 100;
	const IMAGE_SIZE = 72;
	const PADDING = 16;

	// Handle image click
	function handleClick(imageId: string) {
		if (onCheckout) {
			onCheckout(imageId);
		}
	}

	// Get grid position
	function getX(col: number): number {
		return PADDING + col * CELL_WIDTH + CELL_WIDTH / 2;
	}

	function getY(row: number): number {
		return PADDING + row * CELL_HEIGHT + CELL_HEIGHT / 2;
	}
</script>

{#if flatNodes.length > 0}
	<div class="genealogy-tree">
		<svg
			width={PADDING * 2 + (maxCol + 1) * CELL_WIDTH}
			height={PADDING * 2 + (maxRow + 1) * CELL_HEIGHT}
		>
			<!-- Connection lines -->
			{#each flatNodes as { node, row, col, parentRow }}
				{#if parentRow !== undefined}
					{@const parentCol = col - 1}
					{@const x1 = getX(parentCol) + IMAGE_SIZE / 2 - 4}
					{@const y1 = getY(parentRow)}
					{@const x2 = getX(col) - IMAGE_SIZE / 2 + 4}
					{@const y2 = getY(row)}
					<!-- Horizontal line from parent -->
					<line
						{x1}
						y1={y1}
						x2={x1 + (x2 - x1) / 2}
						y2={y1}
						class="connector"
					/>
					<!-- Vertical line down -->
					<line
						x1={x1 + (x2 - x1) / 2}
						y1={y1}
						x2={x1 + (x2 - x1) / 2}
						{y2}
						class="connector"
					/>
					<!-- Horizontal line to child -->
					<line
						x1={x1 + (x2 - x1) / 2}
						y1={y2}
						{x2}
						y2={y2}
						class="connector"
					/>
				{/if}
			{/each}

			<!-- Image nodes -->
			{#each flatNodes as { node, row, col }}
				{@const x = getX(col)}
				{@const y = getY(row)}
				{@const isCheckedOut = node.element.id === checkedOutId}
				<g
					class="image-node"
					class:checked-out={isCheckedOut}
					transform="translate({x}, {y})"
				>
					<!-- Background circle for checked out state -->
					{#if isCheckedOut}
						<circle
							r={IMAGE_SIZE / 2 + 6}
							class="checkout-ring"
						/>
					{/if}

					<!-- Clickable image container -->
					<foreignObject
						x={-IMAGE_SIZE / 2}
						y={-IMAGE_SIZE / 2}
						width={IMAGE_SIZE}
						height={IMAGE_SIZE}
					>
						<button
							class="image-button"
							class:checked-out={isCheckedOut}
							onclick={() => handleClick(node.element.id)}
							title={node.element.prompt || 'Click to checkout'}
						>
							<img
								src={node.element.thumbnail_url || node.element.src}
								alt={node.element.prompt || 'Generated image'}
								loading="lazy"
							/>
						</button>
					</foreignObject>

					<!-- Branch indicator for nodes with children -->
					{#if node.children.length > 0}
						<circle
							cx={IMAGE_SIZE / 2 - 2}
							cy={0}
							r={4}
							class="branch-dot"
						/>
					{/if}

					<!-- Root indicator -->
					{#if !node.element.parent_id}
						<circle
							cx={-IMAGE_SIZE / 2 + 2}
							cy={0}
							r={4}
							class="root-dot"
						/>
					{/if}
				</g>
			{/each}
		</svg>

		<!-- Legend -->
		<div class="legend">
			<span class="legend-item">
				<span class="dot root"></span> Root
			</span>
			<span class="legend-item">
				<span class="dot branch"></span> Branch
			</span>
			<span class="legend-item">
				<span class="ring"></span> Checked out
			</span>
		</div>
	</div>
{:else}
	<div class="empty-tree">
		No images yet. Generate some images to see the genealogy tree.
	</div>
{/if}

<style>
	.genealogy-tree {
		display: flex;
		flex-direction: column;
		gap: 8px;
		padding: 8px;
		overflow: auto;
		background: hsl(270, 10%, 6%);
		border-radius: 8px;
	}

	svg {
		flex-shrink: 0;
	}

	.connector {
		stroke: hsl(270, 20%, 30%);
		stroke-width: 2;
		fill: none;
	}

	.image-node {
		cursor: pointer;
	}

	.checkout-ring {
		fill: none;
		stroke: hsl(var(--accent));
		stroke-width: 3;
		opacity: 0.8;
	}

	.image-button {
		width: 100%;
		height: 100%;
		padding: 0;
		border: 2px solid transparent;
		border-radius: 8px;
		background: hsl(270, 10%, 12%);
		cursor: pointer;
		overflow: hidden;
		transition: all 0.15s ease;
	}

	.image-button:hover {
		border-color: hsl(var(--foreground) / 0.5);
		transform: scale(1.05);
	}

	.image-button.checked-out {
		border-color: hsl(var(--accent));
	}

	.image-button img {
		width: 100%;
		height: 100%;
		object-fit: cover;
		display: block;
	}

	.branch-dot {
		fill: hsl(270, 40%, 50%);
	}

	.root-dot {
		fill: hsl(140, 40%, 45%);
	}

	.legend {
		display: flex;
		gap: 16px;
		padding: 4px 8px;
		font-size: 11px;
		color: hsl(var(--muted-foreground));
	}

	.legend-item {
		display: flex;
		align-items: center;
		gap: 4px;
	}

	.dot {
		width: 8px;
		height: 8px;
		border-radius: 50%;
	}

	.dot.root {
		background: hsl(140, 40%, 45%);
	}

	.dot.branch {
		background: hsl(270, 40%, 50%);
	}

	.ring {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		border: 2px solid hsl(var(--accent));
	}

	.empty-tree {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px;
		color: hsl(var(--muted-foreground));
		font-size: 13px;
		text-align: center;
	}
</style>
