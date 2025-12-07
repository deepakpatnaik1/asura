import { getPersonaAccentColor, getPersonaAccentBg, CODE_BLOCK_BG, TABLE_BORDER } from '$lib/config/colors';
import { DEFAULT_PERSONA } from '$lib/config/personas';

/**
 * Render a markdown pipe table as HTML
 */
function renderTable(tableMatch: string, accent: string): string {
	const lines = tableMatch.trim().split('\n');
	if (lines.length < 2) return tableMatch;

	// Parse header row
	const headerLine = lines[0];
	const headers = headerLine.split('|').slice(1, -1).map(h => h.trim());

	// Skip separator row (line 1), parse data rows
	const dataRows = lines.slice(2).map(line =>
		line.split('|').slice(1, -1).map(cell => cell.trim())
	);

	// Build HTML table with horizontal scroll wrapper
	const headerCells = headers.map(h =>
		`<th style="padding: 6px 10px; text-align: left; white-space: nowrap; color: ${accent}; border-bottom: 1px solid ${accent};">${h}</th>`
	).join('');

	const bodyRows = dataRows.map(row =>
		`<tr>${row.map(cell =>
			`<td style="padding: 6px 10px; white-space: nowrap; border-bottom: 1px solid ${TABLE_BORDER};">${cell}</td>`
		).join('')}</tr>`
	).join('');

	return `<div style="overflow-x: auto;">
		<table style="border-collapse: collapse; font-size: 0.9em; min-width: 100%;">
			<thead><tr>${headerCells}</tr></thead>
			<tbody>${bodyRows}</tbody>
		</table>
	</div>`;
}

/**
 * EXPERIMENT: Raw output with selective formatting
 */
export async function renderMarkdown(markdown: string, persona: string = DEFAULT_PERSONA): Promise<string> {
	const ACCENT = getPersonaAccentColor(persona);
	const ACCENT_BG = getPersonaAccentBg(persona);

	// Strip content markers (<!--content:uuid-->) used for lazy loading
	let processed = markdown.replace(/<!--content:[a-f0-9-]+-->\n?/gi, '');

	// Render fenced code blocks with placeholders (protect from escaping)
	const codeBlocks: string[] = [];
	const codeBlockRegex = /^```(\w*)\n([\s\S]*?)^```$/gm;
	processed = processed.replace(codeBlockRegex, (match, lang, code) => {
		const placeholder = `__CODE_${codeBlocks.length}__`;
		const escapedCode = code
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		const langLabel = lang ? `<span style="position: absolute; top: 4px; right: 8px; font-size: 0.7em; opacity: 0.4; text-transform: uppercase;">${lang}</span>` : '';
		codeBlocks.push(`<div style="position: relative; background: ${CODE_BLOCK_BG}; border-radius: 6px; padding: 12px; margin: 0.5em 0; overflow-x: auto;">${langLabel}<pre style="margin: 0; font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace; font-size: 0.85em; line-height: 1.5; white-space: pre-wrap; word-break: break-word;"><code>${escapedCode}</code></pre></div>`);
		return placeholder + '\n';
	});

	// Render markdown tables with placeholders (protect from escaping)
	const tables: string[] = [];
	const tableRegex = /^(\|[^\n]+\|)\s*\n(\|[-:\s|]+\|)\s*\n((?:\|[^\n]+\|[ \t]*\n?)+)/gm;
	processed = processed.replace(tableRegex, (match) => {
		const placeholder = `__TABLE_${tables.length}__`;
		tables.push(renderTable(match, ACCENT));
		// Ensure newline after placeholder so next line starts fresh
		return placeholder + '\n';
	});

	// Render block quotes with placeholders (consecutive > lines grouped together)
	const blockQuotes: string[] = [];
	const blockQuoteRegex = /^((?:>[ >]*[^\n]*\n?)+)/gm;
	processed = processed.replace(blockQuoteRegex, (match) => {
		// Parse the block quote, handling nesting
		const lines = match.trim().split('\n');
		const processedLines: string[] = [];

		for (const line of lines) {
			// Count nesting level (number of > at start, with optional spaces between)
			// e.g., "> > text" has nest level 2, "> text" has nest level 1
			const prefixMatch = line.match(/^((?:>\s*)+)/);
			const nestLevel = prefixMatch ? (prefixMatch[1].match(/>/g) || []).length : 0;
			const content = line.replace(/^(?:>\s*)+/, '').trim();

			if (content) {
				// Escape HTML
				const escaped = content
					.replace(/&/g, '&amp;')
					.replace(/</g, '&lt;')
					.replace(/>/g, '&gt;');
				// Apply inline formatting
				let formatted = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
				formatted = formatted.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
				formatted = formatted.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
				formatted = formatted.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
				formatted = formatted.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
				formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);

				// Indent nested quotes
				const indent = nestLevel > 1 ? `margin-left: ${(nestLevel - 1) * 1.5}em;` : '';
				processedLines.push(`<div style="${indent}">${formatted}</div>`);
			}
		}

		const placeholder = `__QUOTE_${blockQuotes.length}__`;
		blockQuotes.push(`<div style="border-left: 3px solid ${ACCENT}; padding-left: 1em; margin: 0.5em 0; opacity: 0.9; font-style: italic;">${processedLines.join('')}</div>`);
		return placeholder + '\n';
	});

	// Em dash (—) → en dash (–) with single space each side
	processed = processed.replace(/\s*—\s*/g, ' – ');

	// Track indentation for continuation lines
	let listIndent = 0;

	// Process line by line with state tracking
	const lines = processed.split('\n');
	const results: string[] = [];

	for (const line of lines) {
		// Bold heading followed by action beat → split onto separate lines
		// Pattern: **heading***action beat*
		const boldPlusActionMatch = line.match(/^\*\*([^*]+)\*\*\*([^*]+)\*$/);
		if (boldPlusActionMatch) {
			const heading = boldPlusActionMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			const action = boldPlusActionMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			listIndent = 0;
			results.push(`<strong style="color: ${ACCENT};">${heading}</strong>`);
			results.push(''); // Blank line before action beat
			results.push(`<em style="color: ${ACCENT};">${action}</em>`);
			continue;
		}

		// Standalone bold line → bold + accent
		// Use .+ to allow asterisks inside (for inline italics like *this*)
		const boldLineMatch = line.match(/^\*\*(.+)\*\*$/);
		if (boldLineMatch) {
			let content = boldLineMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			// Handle inline italics within bold heading
			content = content.replace(/\*([^*]+)\*/g, '<em>$1</em>');
			listIndent = 0; // Reset - not a list item
			results.push(`<strong style="color: ${ACCENT};">${content}</strong>`);
			continue;
		}

		// Numbered list with bold first → number + bold in accent
		const numBoldMatch = line.match(/^(\d+)\.\s\*\*([^*]+)\*\*(.*)$/);
		if (numBoldMatch) {
			const num = numBoldMatch[1];
			const boldText = numBoldMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			let rest = numBoldMatch[3]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
			rest = rest.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
			rest = rest.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
			rest = rest.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
			rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);
			listIndent = num.length + 2; // "1. " = number + ". "
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; font-weight: bold; flex-shrink: 0; margin-right: 0.5em;">${num}.</span><span><strong style="color: ${ACCENT};">${boldText}</strong>${rest}</span></span>`);
			continue;
		}

		// Bullet list with bold first → bullet + bold in accent
		const bulletBoldMatch = line.match(/^-\s\*\*([^*]+)\*\*(.*)$/);
		if (bulletBoldMatch) {
			const boldText = bulletBoldMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			let rest = bulletBoldMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
			rest = rest.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
			rest = rest.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
			rest = rest.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
			rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);
			listIndent = 2; // "- " = 2 chars
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; flex-shrink: 0; margin-right: 0.5em;">◦</span><span><strong style="color: ${ACCENT};">${boldText}</strong>${rest}</span></span>`);
			continue;
		}

		// Standalone italic line (action beats) → accent colored italic
		// Supports both *text* and _text_ syntax
		const italicMatch = line.match(/^(\*|_)([^*_]+)\1$/);
		if (italicMatch) {
			const content = italicMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			listIndent = 0; // Reset - not a list item
			results.push(`<em style="color: ${ACCENT};">${content}</em>`);
			continue;
		}

		// Markdown headers (# ## ###) → accent colored, sized by level
		// H4-H6 are ignored (not rendered as headers)
		// With margin annotation (h1, h2, h3) that's visible but not selectable
		// Allow leading whitespace (common after tables in markdown)
		const headerMatch = line.match(/^\s*(#{1,3})\s+(.+)$/);
		if (headerMatch) {
			const level = headerMatch[1].length;
			const content = headerMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			// Size decreases with level: h1=1.45em, h2=1.3em, h3=1.15em
			const sizes = ['1.45em', '1.3em', '1.15em'];
			const fontSize = sizes[level - 1];
			const label = `h${level}`;
			listIndent = 0;
			// Position relative container with absolute-positioned label outside text flow
			// Add top margin for visual separation from preceding content
			results.push(`<span style="position: relative; display: flex; align-items: center; margin-top: 0.5em;"><span style="position: absolute; left: -2.5em; font-size: 0.7em; opacity: 0.3; user-select: none; pointer-events: none;">${label}</span><strong style="color: ${ACCENT}; font-size: ${fontSize};">${content}</strong></span>`);
			continue;
		}

		// Horizontal rule (--- or * * * or ***) → decorative flourish divider
		if (line.match(/^-{3,}$/) || line.match(/^\*\s*\*\s*\*$/) || line.match(/^\*{3,}$/)) {
			listIndent = 0;
			const flourishSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 320" style="width: 200px; height: auto;"><path fill="${ACCENT}" opacity="0.8" d="M658.848755,198.411346 C642.746643,195.662704 628.524353,189.257812 615.120300,181.013702 C611.616455,178.858749 608.605286,178.741699 604.840149,179.723679 C592.753296,182.876022 580.526611,185.521362 567.936951,185.068954 C559.935242,184.781387 551.660828,184.583755 547.562073,175.596252 C546.906555,174.158859 545.372559,174.315109 544.041931,174.230118 C540.722351,174.018127 537.390625,173.896332 534.091431,173.505432 C532.378967,173.302551 531.315186,174.074631 530.067444,174.977509 C522.652100,180.343185 517.345215,180.390717 509.941772,175.286469 C505.229614,172.037704 494.593536,173.977448 491.092285,178.344757 C486.612244,183.932983 479.937012,184.851730 473.458069,185.034103 C458.716553,185.449066 444.305969,182.634125 430.051605,179.230423 C426.821869,178.459244 424.333069,178.690323 421.625000,180.411346 C408.148926,188.975677 393.753754,195.510345 377.919861,198.032654 C364.726990,200.134277 351.410614,201.174866 338.555115,195.805450 C338.401398,195.741241 338.234985,195.694183 338.098938,195.602768 C332.975464,192.160843 328.274445,190.016495 321.409668,192.749863 C315.472504,195.113876 309.192780,189.689148 308.324677,183.657578 C307.994415,181.362640 308.259247,179.410812 310.989746,178.265656 C313.139221,181.264145 311.154816,186.621384 316.244934,187.579239 C318.989136,188.095657 321.847412,188.636215 324.640106,186.119110 C322.642395,181.862137 320.498779,177.523117 320.325134,172.626892 C320.272430,171.140900 320.044922,169.633133 320.214447,168.172104 C320.921875,162.076141 319.951050,160.461365 313.842560,159.558441 C310.239685,159.025879 306.527100,159.028549 302.871735,159.116852 C299.257172,159.204147 298.325562,161.263870 300.199707,164.429993 C306.922363,175.787064 301.346893,185.953918 288.105499,186.372116 C276.358063,186.743149 265.514099,182.558609 254.587799,179.173782 C249.378769,177.560089 244.737610,177.015366 239.722794,179.456818 C234.607422,181.947220 229.056702,183.301270 223.444595,184.099396 C217.393463,184.959976 211.398453,184.756424 206.382172,180.534866 C204.241653,178.733459 202.039993,179.501709 199.747452,179.856903 C191.677368,181.107254 184.100204,180.535889 178.159363,173.917648 C176.230286,171.768585 175.216476,169.486298 176.354828,166.639297 C177.041260,164.922516 178.340286,163.905960 180.196686,164.007874 C181.870667,164.099777 182.842606,165.303040 183.415359,166.777435 C183.841202,167.873703 184.213150,169.062912 183.097473,169.986664 C181.783844,171.074295 181.226089,169.171310 179.752121,169.083878 C181.592133,172.843262 184.341293,175.009262 188.152267,175.594116 C192.117584,176.202682 196.137177,176.145370 200.085449,175.336884 C202.042053,174.936234 203.942902,174.340256 204.781769,172.111557 C207.880554,163.878754 214.895798,160.749176 222.402008,162.374802 C231.403778,164.324280 238.676849,161.253067 246.328781,158.134430 C257.825104,153.448975 269.722076,150.516830 282.147552,149.836288 C286.677887,149.588150 291.077148,149.691589 295.291718,151.868500 C298.366608,153.456696 301.859375,152.655106 305.156067,152.610001 C310.569489,152.535950 315.841888,153.005722 320.651459,155.680817 C323.121643,157.054718 324.898712,156.537689 326.811554,154.598160 C334.134216,147.173370 343.286957,144.381897 353.503113,144.077255 C377.154083,143.371918 399.742126,148.920013 422.104126,155.662384 C430.421783,158.170258 438.929932,159.683014 447.379395,161.524307 C450.102539,162.117737 452.662201,160.928833 455.173584,160.205460 C462.315033,158.148438 469.572174,157.522919 476.935944,157.946152 C483.050720,158.297592 488.322449,160.219833 491.446320,166.081909 C494.033508,170.936905 498.588440,168.511612 502.232849,168.420090 C505.719818,168.332535 504.484009,164.970963 504.615631,162.857330 C505.184143,153.727386 510.173828,150.624496 518.210022,154.612915 C519.560425,155.283112 520.456970,155.293365 521.841187,154.617981 C529.372803,150.943283 534.583740,153.995300 535.272583,162.119202 C535.469055,164.437119 533.622009,168.345886 537.753113,168.533142 C541.673340,168.710846 546.540527,170.881256 549.223694,165.445663 C552.131592,159.554718 557.692139,158.318237 563.512878,157.968842 C568.841248,157.649017 574.243347,157.587112 579.395447,159.156693 C590.039124,162.399307 599.961670,159.718216 610.147095,156.605377 C631.644897,150.035263 653.301392,144.026276 676.105408,144.021591 C688.776306,144.018997 700.307434,146.517181 708.929565,157.427231 C716.714294,152.408310 725.366333,152.328781 734.057922,152.599213 C738.346436,152.732681 741.697815,149.545944 746.073242,149.659088 C758.344971,149.976440 770.242432,152.082031 781.755981,156.295166 C785.975464,157.839203 790.062500,159.746887 794.288269,161.271637 C798.176575,162.674637 801.993408,163.712250 806.415161,162.949829 C815.722290,161.345016 824.190002,162.545288 828.265625,172.897293 C828.812927,174.287506 830.059875,174.847031 831.391602,175.121536 C837.367798,176.353317 843.228149,176.414154 848.386963,173.727203 C849.639465,171.703934 848.025391,170.773132 847.904236,169.498306 C847.622009,166.527466 848.907471,164.357178 851.765564,164.063736 C854.904602,163.741440 856.197205,166.124451 856.097473,168.929794 C855.932800,173.563889 852.397644,175.883438 848.945129,177.835800 C843.958923,180.655518 838.454773,180.798996 832.906738,179.789734 C831.102905,179.461594 829.054932,178.684631 827.549438,179.835190 C818.159668,187.011200 807.960632,185.028107 798.519226,181.215408 C789.576599,177.604172 781.640381,177.458008 772.655884,180.794403 C763.675781,184.129166 754.301331,186.921097 744.404907,186.337616 C735.244934,185.797546 729.728149,180.381226 729.795288,171.948441 C729.817505,169.162491 730.838745,166.855286 732.443542,164.591843 C734.826782,161.230606 733.908875,159.294342 729.899109,159.132141 C725.092590,158.937714 720.289001,158.670593 715.617676,160.602005 C713.013550,161.678711 711.818726,163.172562 712.358459,165.885452 C713.621155,172.231216 712.260254,178.111511 709.284058,183.704453 C708.095398,185.938217 708.867065,187.092102 711.137512,187.713089 C716.319153,189.130325 719.943665,186.598236 720.430054,181.174149 C720.488403,180.523575 720.542297,179.861069 720.718689,179.238190 C720.791687,178.980560 721.182190,178.812805 721.679871,178.391037 C725.192322,180.090530 724.611328,183.114532 723.683411,185.870636 C721.683533,191.810699 714.531921,194.878052 708.464050,191.981628 C704.917114,190.288513 702.507385,190.827362 699.405945,192.854141 C686.974365,200.978180 673.152710,200.085968 658.848755,198.411346 M349.469604,191.238525 C372.481171,194.551041 392.970856,187.326035 414.005554,176.132950 C410.620972,175.185852 408.523041,174.803802 406.587860,174.019867 C400.110168,171.395798 394.230988,171.654678 387.622925,174.825836 C376.936432,179.954193 365.462433,182.975006 353.335419,182.348068 C347.209320,182.031372 342.908417,179.015121 341.769165,173.987457 C340.697021,169.256042 343.682220,164.203217 349.160400,161.760239 C352.224609,160.393784 355.492920,159.851456 358.863708,159.720154 C369.607056,159.301636 380.229675,160.725601 390.455963,163.557281 C397.558228,165.523926 403.046967,164.366699 408.290710,159.743576 C395.638245,153.932785 368.699738,150.038406 350.602905,151.183929 C344.136322,151.593277 338.834595,154.420273 333.807220,158.117645 C331.270386,159.983368 330.569000,162.117172 332.395050,164.960678 C334.821411,168.738983 335.653259,172.927063 335.091156,177.393326 C334.138306,184.964737 334.407349,185.468094 341.619537,188.499207 C343.913879,189.463470 346.304810,190.198013 349.469604,191.238525 M628.765320,158.588470 C628.040161,158.881165 627.315002,159.173859 626.366089,159.556870 C631.578735,164.162613 636.995667,166.094727 643.509888,163.526352 C645.197876,162.860825 647.040771,162.523148 648.843933,162.225174 C659.667786,160.436478 670.498352,158.237015 681.488831,160.851227 C687.881104,162.371704 691.681946,167.421509 690.983154,173.089035 C690.279480,178.795395 686.054443,182.023514 679.198486,182.253098 C666.539124,182.677017 654.713074,179.224930 643.714294,173.498840 C635.689148,169.320877 629.726990,174.028427 622.571960,175.680084 C623.997192,177.878738 625.588928,178.511032 627.036255,179.285782 C637.998901,185.153793 649.800964,189.030533 661.856262,191.342728 C673.756836,193.625275 685.784424,192.868134 696.484375,185.658264 C698.532410,184.278229 699.553467,183.230652 698.655701,180.497360 C696.854370,175.012909 697.455322,169.568344 700.788269,164.737473 C702.634155,162.061844 702.032593,160.156189 699.720032,158.343750 C694.792358,154.481766 689.466858,151.649506 683.045410,151.150772 C664.638123,149.721146 647.005005,153.881042 628.765320,158.588470 M355.797485,165.288803 C354.379211,165.742355 352.877747,166.028717 351.560120,166.684494 C348.869263,168.023758 347.709137,170.366821 348.230286,173.300003 C348.730865,176.117249 350.807465,177.739716 353.475525,177.843964 C365.307709,178.306320 376.423431,175.704681 386.704712,169.269867 C376.817383,166.489990 366.990112,163.846588 355.797485,165.288803 M680.669739,177.733292 C683.774841,176.860016 685.502625,174.997253 685.172852,171.587128 C684.858093,168.332199 682.998169,166.788071 679.919922,165.838638 C675.003601,164.322235 670.221619,164.320007 665.215637,165.314041 C658.892944,166.569534 652.323242,166.724854 645.646729,169.826660 C657.044189,174.931519 667.895569,178.698013 680.669739,177.733292 M771.149658,169.938644 C761.690979,166.026382 752.472351,161.247528 741.715759,161.507675 C744.802734,164.862045 751.149902,165.769882 748.629639,172.425354 C746.809265,177.232666 742.558289,176.329056 738.418091,176.302673 C739.051208,177.086899 739.276001,177.608368 739.666504,177.812256 C744.619568,180.397751 768.455261,176.627518 772.420410,172.639542 C773.579041,171.474350 772.302124,170.973206 771.149658,169.938644 M262.388489,169.618286 C261.573883,170.372345 260.275055,170.666153 259.966217,172.721481 C270.030151,176.445526 280.156311,179.807739 291.419128,177.921921 C287.516815,176.854996 284.681458,174.936523 283.987976,170.821609 C283.066589,165.354294 287.790100,164.211075 290.988159,161.596252 C280.753876,161.104446 271.968689,165.533371 262.388489,169.618286 M440.563049,174.831512 C452.096039,177.469666 463.766296,178.639099 475.587372,177.923691 C478.273102,177.761169 481.086456,177.527496 483.366791,174.329163 C475.136017,172.760117 467.351654,171.913910 459.977295,169.701248 C451.650818,167.202927 444.961761,170.177856 437.393372,173.949722 C438.730652,174.333618 439.343231,174.509476 440.563049,174.831512 M585.538513,176.959869 C590.243164,176.065536 594.947815,175.171204 600.980347,174.024429 C595.888123,171.071854 592.225769,168.234268 588.060181,168.779556 C577.502075,170.161621 567.039734,172.274384 556.539001,174.094528 C556.573181,174.631622 556.607300,175.168716 556.641479,175.705811 C565.711243,179.620300 575.213501,178.020020 585.538513,176.959869 M409.997528,163.419250 C408.891449,164.478622 406.863312,164.507248 406.460571,166.459564 C415.696594,169.870117 424.804993,172.923553 433.956299,164.977646 C428.711945,163.707367 423.741302,162.662598 418.871063,161.267365 C415.660645,160.347641 413.005432,160.875183 409.997528,163.419250 M613.540710,162.317535 C609.963501,163.611023 605.922729,163.222809 602.708801,164.894974 C610.912659,171.811783 619.387634,170.168167 628.220032,166.054077 C624.136780,161.720016 619.900818,159.391556 613.540710,162.317535 M518.533630,166.278015 C516.469666,168.118103 514.405701,169.958191 512.355896,171.785629 C517.040527,177.088593 523.142883,176.904892 527.242554,171.452438 C524.216431,170.015610 523.289734,165.696594 518.533630,166.278015 M779.362488,166.113388 C782.990906,167.637177 786.620056,169.001923 790.941589,166.110687 C781.217896,162.004745 771.585083,160.121475 761.726990,159.017319 C767.358765,161.293900 772.990601,163.570465 779.362488,166.113388 M249.841446,163.329132 C247.605850,164.117493 245.370255,164.905853 242.454529,165.934052 C247.921143,168.534821 259.137634,165.275803 268.259277,159.044098 C261.976746,159.874130 256.218536,161.195465 249.841446,163.329132 M524.255127,162.449860 C525.996643,164.599228 527.599426,166.967758 530.821045,166.972000 C532.216370,161.320816 531.294067,157.930893 528.170837,157.503647 C525.071411,157.079651 523.420532,158.525787 524.255127,162.449860 M812.872253,174.414597 C802.693481,170.910309 802.693481,170.910309 798.305542,173.701736 C804.096130,176.379318 809.894470,177.672302 816.197693,175.831375 C815.306030,175.432663 814.414429,175.033951 812.872253,174.414597 M217.539307,175.332687 C216.966660,175.613571 216.394012,175.894470 215.011459,176.572647 C222.145081,177.859619 227.909592,176.564026 233.948944,173.819916 C230.815216,171.228226 228.048141,171.048859 225.044907,172.350769 C222.767715,173.337952 220.438980,174.206207 217.539307,175.332687 M511.962708,157.560410 C508.105408,159.668076 507.861206,162.651581 509.793823,166.641998 C512.780701,165.244110 515.564087,164.081818 515.787170,160.474594 C515.910583,158.478302 514.745911,157.401733 511.962708,157.560410 M330.658905,172.916397 C330.376373,171.211075 330.011810,169.553467 328.209412,168.237030 C326.931793,172.073578 328.041382,174.863068 330.006134,177.776978 C331.134338,176.229263 330.588287,174.885208 330.658905,172.916397 M705.507996,171.506958 C705.393250,170.659119 706.057983,169.486649 704.442261,169.158905 C702.426819,171.406967 702.974365,174.103592 702.688843,177.163467 C704.788452,175.643097 704.679138,173.700089 705.507996,171.506958z"/></svg>`;
			results.push(`<div style="display: flex; justify-content: center; margin: 0.8em 0;">${flourishSvg}</div>`);
			continue;
		}

		// Sub-bullet (indented) → accent only, no bold
		const subBulletMatch = line.match(/^(\s+)-\s(.*)$/);
		if (subBulletMatch) {
			const indent = subBulletMatch[1];
			let rest = subBulletMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
			rest = rest.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
			rest = rest.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
			rest = rest.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
			rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);
			listIndent = indent.length + 2; // existing indent + "- "
			results.push(`<span style="display: flex; margin-left: 3em;"><span style="color: ${ACCENT}; flex-shrink: 0; margin-right: 0.5em;">◦</span><span>${rest}</span></span>`);
			continue;
		}

		// Sub-numbered (indented) → accent only, no bold
		const subNumberMatch = line.match(/^(\s+)(\d+)\.\s(.*)$/);
		if (subNumberMatch) {
			const indent = subNumberMatch[1];
			const num = subNumberMatch[2];
			let rest = subNumberMatch[3]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
			rest = rest.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
			rest = rest.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
			rest = rest.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
			rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);
			listIndent = indent.length + num.length + 2; // existing indent + number + ". "
			results.push(`<span style="display: flex; margin-left: 3em;"><span style="color: ${ACCENT}; flex-shrink: 0; margin-right: 0.5em;">${num}.</span><span>${rest}</span></span>`);
			continue;
		}

		// Top-level bullet → bold + accent
		const bulletMatch = line.match(/^-\s(.*)$/);
		if (bulletMatch) {
			let rest = bulletMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
			rest = rest.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
			rest = rest.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
			rest = rest.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
			rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);
			listIndent = 2; // "- " = 2 chars
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; font-weight: bold; flex-shrink: 0; margin-right: 0.5em;">◦</span><span>${rest}</span></span>`);
			continue;
		}

		// Top-level numbered list → bold + accent
		const numberMatch = line.match(/^(\d+)\.\s(.*)$/);
		if (numberMatch) {
			const num = numberMatch[1];
			let rest = numberMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			rest = rest.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
			rest = rest.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
			rest = rest.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
			rest = rest.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
			rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);
			listIndent = num.length + 2; // number + ". "
			results.push(`<span style="display: flex; margin-left: 1.5em;"><span style="color: ${ACCENT}; font-weight: bold; flex-shrink: 0; margin-right: 0.5em;">${num}.</span><span>${rest}</span></span>`);
			continue;
		}

		// Bold at start of line (but not standalone) → accent bold + rest
		const boldStartMatch = line.match(/^\*\*([^*]+)\*\*(.+)$/);
		if (boldStartMatch) {
			const boldText = boldStartMatch[1]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			let rest = boldStartMatch[2]
				.replace(/&/g, '&amp;')
				.replace(/</g, '&lt;')
				.replace(/>/g, '&gt;');
			// Handle inline formatting in the rest (bold first, then italic with lookbehind)
			rest = rest.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
			rest = rest.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
			rest = rest.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
			rest = rest.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
			rest = rest.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
			rest = rest.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);
			listIndent = 0;
			results.push(`<strong style="color: ${ACCENT};">${boldText}</strong>${rest}`);
			continue;
		}

		// Tool call indicator → styled pill badge (same bg as boss card)
		const toolMatch = line.match(/^⟨([^⟩]+)⟩$/);
		if (toolMatch) {
			const toolName = toolMatch[1];
			listIndent = 0;
			results.push(`<span style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; font-family: monospace; margin: 4px 0;">⟨${toolName}⟩</span>`);
			continue;
		}

		// Regular line - escape HTML, then handle inline formatting
		let escaped = line
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;');
		// Bold first (non-greedy to handle nested italic), then italic
		// Bold uses (.+?) to allow asterisks inside (for nested *italic*)
		escaped = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
		// Italic: both *text* and _text_ syntax
		// Asterisk italic uses (?<!\*) negative lookbehind to avoid matching ** as *
		escaped = escaped.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
		// Underscore italic uses (?<!_) negative lookbehind (though __ bold is rare)
		escaped = escaped.replace(/(?<!_)_([^_]+)_(?!_)/g, '<em>$1</em>');
		// Inline code with backticks
		escaped = escaped.replace(/`([^`]+)`/g, `<code style="background: ${CODE_BLOCK_BG}; padding: 2px 6px; border-radius: 3px; font-family: 'SF Mono', Monaco, monospace; font-size: 0.9em;">$1</code>`);
		// Images ![alt](url) → inline image
		escaped = escaped.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, `<span style="display: inline-block; padding: 4px 10px; border-radius: 6px; background: ${CODE_BLOCK_BG}; color: ${ACCENT}; font-size: 0.85em; margin: 0.5em 0;">[image: $1]</span>`);
		// Links [text](url) → pill badge style like tool calls
		escaped = escaped.replace(/\[([^\]]+)\]\(([^)]+)\)/g, `<a href="$2" target="_blank" rel="noopener" style="display: inline-block; padding: 2px 8px; border-radius: 10px; background: ${ACCENT_BG}; color: ${ACCENT}; font-size: 0.85em; text-decoration: none;">$1</a>`);

		// If this is a continuation line (non-empty, after a list item), indent it
		if (listIndent > 0 && escaped.trim() !== '') {
			escaped = ' '.repeat(listIndent) + escaped;
		} else if (escaped.trim() === '') {
			// Empty line resets list context
			listIndent = 0;
		}

		results.push(escaped);
	}

	// Collapse consecutive empty lines and remove empty lines before tables
	const collapsed: string[] = [];
	let lastWasEmpty = false;
	for (let i = 0; i < results.length; i++) {
		const r = results[i];
		const isTable = r.startsWith('__TABLE_');
		const isEmpty = r.trim() === '';

		if (isTable) {
			// Remove preceding empty line before table (tighten spacing)
			if (collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '') {
				collapsed.pop();
			}
			collapsed.push(r);
			lastWasEmpty = true; // Treat table as "empty" so following empty line is skipped
		} else if (isEmpty) {
			if (!lastWasEmpty) {
				collapsed.push(r);
			}
			lastWasEmpty = true;
		} else {
			collapsed.push(r);
			lastWasEmpty = false;
		}
	}

	// Wrap each line in a div for consistent line spacing (skip block elements - they handle their own spacing)
	processed = collapsed.map(r => {
		if (r.startsWith('__TABLE_') || r.startsWith('__CODE_') || r.startsWith('__QUOTE_')) {
			return r; // Block elements handle their own spacing
		}
		return `<div style="min-height: 1.6em;">${r}</div>`;
	}).join('');

	// Restore code block HTML from placeholders
	for (let i = 0; i < codeBlocks.length; i++) {
		processed = processed.replace(`__CODE_${i}__`, codeBlocks[i]);
	}

	// Restore table HTML from placeholders
	for (let i = 0; i < tables.length; i++) {
		processed = processed.replace(`__TABLE_${i}__`, tables[i]);
	}

	// Restore block quote HTML from placeholders
	for (let i = 0; i < blockQuotes.length; i++) {
		processed = processed.replace(`__QUOTE_${i}__`, blockQuotes[i]);
	}

	return `<div style="white-space: pre-wrap; font-family: inherit; margin: 0;">${processed}</div>`;
}
