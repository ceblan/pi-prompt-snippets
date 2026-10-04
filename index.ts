/**
 * Prompt Snippets — mix-and-match single-purpose prompt rules for Pi.
 *
 * Each snippet is a markdown file with YAML frontmatter (name,
 * description, placement, order) stored in snippet directories:
 * - Extension built-ins (`snippets/`)
 * - Global user snippets (`~/.pi/agent/snippets/`)
 * - Project-level snippets (`.pi/snippets/`)
 *
 * - Press the configured shortcut (default alt+p) or run /snippets to open the toggle menu:
 *     tab / h / l / ← / →   switch between the PREPEND and APPEND tabs
 *     ↑/↓    navigate the visible snippets of the active tab
 *     /      fuzzy search by name or description (per tab; enter confirms, esc clears;
 *            checked snippets stay visible even when they do not match)
 *     space  toggle selection
 *     a      toggle all visible snippets of the tab
 *     p      preview snippet body
 *     enter  apply selection (also applies from preview)
 *     esc    cancel
 * - Active snippets appear as a widget above the editor, with prepend and
 *   append groups visually distinguished.
 * - When a message is sent, active snippet bodies are prepended/appended to
 *   the message text in order (prepend group sorted by `order` first, then
 *   the typed text, then the append group sorted by `order`).
 * - Toggles reset to all-off after each send and at session start.
 */

import { existsSync, mkdirSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Input, Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import {
	BUILTIN_SNIPPETS_DIR,
	DEFAULT_ORDER,
	fuzzyMatchIndices,
	getSnippetDirectories,
	loadShortcutKey,
	loadSnippets,
	normalizeNewlines,
	parseSnippet,
	transformPrompt,
	visibleSnippets,
	type LoadResult,
	type Placement,
	type Snippet,
} from "./core.ts";

export {
	BUILTIN_SNIPPETS_DIR,
	DEFAULT_ORDER,
	fuzzyMatchIndices,
	getSnippetDirectories,
	loadSnippets,
	normalizeNewlines,
	parseSnippet,
	loadShortcutKey,
	transformPrompt,
	visibleSnippets,
	type LoadResult,
	type Placement,
	type Snippet,
};

export { DEFAULT_SHORTCUT } from "./core.ts";

export const WIDGET_ID = "prompt-snippets";

/** Which placement group a menu tab shows. */
type TabId = Placement;

/** Per-tab menu state: search query plus remembered cursor and scroll. */
interface TabState {
	query: string;
	searching: boolean;
	cursor: number;
	scroll: number;
}

/** Rows reserved by the menu chrome (borders, title, tab bar, search line, hints) outside the scrollable content area. */
export const MENU_CHROME_ROWS = 11;
/** Minimum content rows shown in the menu, even on very short terminals. */
export const MENU_MIN_VIEW_ROWS = 5;

// @lat: [[lat#Prompt Snippets]]
export default function (pi: ExtensionAPI) {
	// Snippets last seen on disk (sorted). Refreshed whenever the menu opens or a message is sent.
	let snippets: Snippet[] = [];
	// Ids of currently toggled snippets. Resets to empty after each send and at session start.
	let enabled = new Set<string>();
	// Guards against opening a second overlay while the menu is already active.
	let menuOpen = false;

	// @lat: [[lat#Prompt Snippets#Toggle Menu]]
	function updateWidget(ctx: ExtensionContext) {
		if (!ctx.hasUI || ctx.mode !== "tui") return;
		const active = snippets.filter((s) => enabled.has(s.id));
		const prepends = active.filter((s) => s.placement === "prepend");
		const appends = active.filter((s) => s.placement === "append");

		if (prepends.length === 0 && appends.length === 0) {
			ctx.ui.setWidget(WIDGET_ID, undefined);
			return;
		}

		const theme = ctx.ui.theme;
		const lines: string[] = [];
		if (prepends.length > 0) {
			lines.push(theme.fg("accent", `↑ prepend: ${prepends.map((s) => s.name).join(" · ")}`));
		}
		if (appends.length > 0) {
			lines.push(theme.fg("warning", `↓ append: ${appends.map((s) => s.name).join(" · ")}`));
		}
		ctx.ui.setWidget(WIDGET_ID, lines);
	}

	/**
	 * Reloads snippets from disk and drops enabled ids for snippets that no
	 * longer exist. Optionally warns the user about files that failed to parse.
	 */
	// @lat: [[lat#Prompt Snippets#Snippet Loading]]
	function refresh(ctx: ExtensionContext, notifyFailures: boolean): LoadResult {
		const result = loadSnippets();
		snippets = result.snippets;
		enabled = new Set([...enabled].filter((id) => snippets.some((s) => s.id === id)));
		if (notifyFailures && result.failed.length > 0 && ctx.hasUI) {
			ctx.ui.notify(
				`${result.failed.length} snippet file(s) skipped (invalid frontmatter or empty body): ${result.failed.join(", ")}`,
				"warning",
			);
		}
		return result;
	}

	// @lat: [[lat#Prompt Snippets#Toggle Menu]]
	async function openMenu(ctx: ExtensionContext) {
		if (ctx.mode !== "tui") {
			ctx.ui.notify("Snippet menu requires interactive mode", "warning");
			return;
		}
		if (menuOpen) return;
		menuOpen = true;

		try {
			refresh(ctx, true);

			if (snippets.length === 0) {
				ctx.ui.notify(`No snippets found in configured snippet directories`, "warning");
				updateWidget(ctx);
				return;
			}

			// Working copy; only committed to `enabled` on confirm.
			const working = new Set(enabled);

			const confirmed = await ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
				// Placement groups are fixed for the lifetime of the menu.
				const groups: Record<TabId, Snippet[]> = {
					prepend: snippets.filter((s) => s.placement === "prepend"),
					append: snippets.filter((s) => s.placement === "append"),
				};

				let activeTab: TabId = "prepend";
				const tabs: Record<TabId, TabState> = {
					prepend: { query: "", searching: false, cursor: 0, scroll: 0 },
					append: { query: "", searching: false, cursor: 0, scroll: 0 },
				};
				let previewing: Snippet | null = null;
				let previewScroll = 0;

				const input = new Input({ prompt: "/", placeholder: "fuzzy: nombre o descripción" });

				/** Visible snippets of a tab: fuzzy matches plus checked items, stable order. */
				const visibleOf = (tab: TabId): Snippet[] => visibleSnippets(groups[tab], tabs[tab].query, working);

				const clampCursor = (tab: TabId) => {
					tabs[tab].cursor = Math.min(tabs[tab].cursor, Math.max(0, visibleOf(tab).length - 1));
				};

				const moveCursor = (delta: number) => {
					const count = visibleOf(activeTab).length;
					if (count === 0) return;
					tabs[activeTab].cursor = (tabs[activeTab].cursor + delta + count) % count;
				};

				const switchTab = () => {
					activeTab = activeTab === "prepend" ? "append" : "prepend";
					// Keep the shared Input in sync with the tab we are entering.
					input.setValue(tabs[activeTab].query);
					input.focused = tabs[activeTab].searching;
					clampCursor(activeTab);
				};

				const toggleAll = () => {
					const visible = visibleOf(activeTab);
					if (visible.length === 0) return;
					const allEnabled = visible.every((s) => working.has(s.id));
					for (const item of visible) {
						if (allEnabled) working.delete(item.id);
						else working.add(item.id);
					}
				};

				/** Renders `name` bold with the fuzzy-matched character runs accented. */
				const highlightName = (name: string, indices: number[]): string => {
					const matched = new Set(indices);
					let out = "";
					let run = "";
					let runMatched = false;
					const flush = () => {
						if (!run) return;
						out += runMatched ? theme.fg("accent", theme.bold(run)) : theme.bold(run);
						run = "";
					};
					for (let i = 0; i < name.length; i++) {
						const isMatch = matched.has(i);
						if (run.length > 0 && isMatch !== runMatched) flush();
						runMatched = isMatch;
						run += name[i];
					}
					flush();
					return out;
				};

				const itemRow = (snippet: Snippet, idx: number, width: number): string => {
					const st = tabs[activeTab];
					const q = st.query.trim();
					const pointer = idx === st.cursor ? theme.fg("accent", "> ") : "  ";
					const checkbox = working.has(snippet.id) ? theme.fg("success", "[x]") : theme.fg("dim", "[ ]");
					const indices = q ? fuzzyMatchIndices(q, snippet.name) : null;
					const name =
						indices !== null && indices.length > 0
							? highlightName(snippet.name, indices)
							: q && working.has(snippet.id)
								? theme.fg("dim", snippet.name)
								: theme.bold(snippet.name);
					const desc = snippet.description ? theme.fg("dim", ` — ${snippet.description}`) : "";
					// Highlight is applied before truncation; truncateToWidth preserves ANSI escapes.
					return truncateToWidth(`${pointer}${checkbox} ${name}${desc}`, width, "…");
				};

				const buildPreviewRows = (snippet: Snippet, width: number): string[] => {
					const rows: string[] = [];
					rows.push(truncateToWidth(theme.bold(snippet.name), width, "…"));
					rows.push(
						truncateToWidth(theme.fg("dim", `${snippet.placement} · order ${snippet.order} · ${snippet.id}`), width, "…"),
					);
					rows.push(theme.fg("dim", "─".repeat(Math.min(width, 40))));
					for (const line of snippet.body.split("\n")) {
						if (line.length === 0) {
							rows.push("");
							continue;
						}
						for (const wrapped of wrapTextWithAnsi(line, width)) {
							rows.push(truncateToWidth(wrapped, width, "…"));
						}
					}
					return rows;
				};

				/**
				 * Slices `lines` to a scrollable viewport of at most `maxView` lines,
				 * reserving indicator slots when clipped. Returns the visible lines
				 * plus the clamped scroll position. When `focusRow` is given, scrolls
				 * so it stays visible.
				 */
				const viewport = (
					lines: string[],
					scroll: number,
					maxView: number,
					focusRow?: number,
				): { out: string[]; scroll: number } => {
					const clipped = lines.length > maxView;
					const view = clipped ? Math.max(1, maxView - 2) : maxView;

					let s = Math.min(Math.max(0, scroll), Math.max(0, lines.length - view));
					if (focusRow !== undefined) {
						if (focusRow < s) s = focusRow;
						else if (focusRow >= s + view) s = focusRow - view + 1;
					}

					const visible = lines.slice(s, s + view);
					if (!clipped) return { out: visible, scroll: s };

					const above = s;
					const below = lines.length - (s + view);
					return {
						out: [
							above > 0 ? theme.fg("dim", `  ↑ ${above} more`) : "",
							...visible,
							below > 0 ? theme.fg("dim", `  ↓ ${below} more`) : "",
						],
						scroll: s,
					};
				};

				return {
					render(width: number): string[] {
						const maxView = Math.max(MENU_MIN_VIEW_ROWS, tui.terminal.rows - MENU_CHROME_ROWS);

						if (previewing) {
							const rows = buildPreviewRows(previewing, width);
							const v = viewport(rows, previewScroll, maxView);
							previewScroll = v.scroll;
							return [
								theme.fg("accent", "─".repeat(width)),
								truncateToWidth(` ${theme.fg("accent", theme.bold(`Preview: ${previewing.name}`))}`, width, "…"),
								"",
								...v.out,
								"",
								truncateToWidth(theme.fg("dim", " ↑/↓: scroll · enter: aplicar · p/tab/esc: volver"), width, "…"),
								theme.fg("accent", "─".repeat(width)),
							];
						}

						const st = tabs[activeTab];
						const group = groups[activeTab];
						const visible = visibleOf(activeTab);
						clampCursor(activeTab);

						const tabCell = (tab: TabId): string => {
							const count = groups[tab].filter((s) => working.has(s.id)).length;
							const label = `${tab === "prepend" ? "↑" : "↓"} ${tab.toUpperCase()} (${count})`;
							return tab === activeTab
								? theme.bg("selectedBg", theme.fg("text", ` ${label} `))
								: theme.fg("dim", ` ${label} `);
						};

						let contentRows: string[];
						if (group.length === 0) contentRows = [theme.fg("dim", "  (none)")];
						else if (visible.length === 0) contentRows = [theme.fg("dim", "  (no matches)")];
						else contentRows = visible.map((s, i) => itemRow(s, i, width));

						const v = viewport(contentRows, st.scroll, maxView, visible.length > 0 ? st.cursor : undefined);
						st.scroll = v.scroll;

						// The search line row is always present (empty when idle) so the
						// layout never jumps when a search opens or closes.
						const searchActive = st.searching || st.query !== "";
						const searchLine = searchActive ? truncateToWidth(input.render(width)[0] ?? "", width, "…") : "";

						const hints = st.searching
							? " ↑/↓: navegar · enter: confirmar · esc: limpiar"
							: " tab/h/l: pestañas · /: buscar · space: seleccionar · a: todos · p: preview · enter: aplicar · esc: salir";

						return [
							theme.fg("accent", "─".repeat(width)),
							truncateToWidth(` ${theme.fg("accent", theme.bold("Prompt snippets"))}`, width, "…"),
							truncateToWidth(`${tabCell("prepend")}${tabCell("append")}`, width, "…"),
							searchLine,
							...v.out,
							"",
							truncateToWidth(theme.fg("dim", hints), width, "…"),
							theme.fg("accent", "─".repeat(width)),
						];
					},
					invalidate() {
						input.invalidate();
					},
					handleInput(data: string) {
						const redraw = () => tui.requestRender();

						if (previewing) {
							if (matchesKey(data, Key.up)) {
								previewScroll--;
								redraw();
							} else if (matchesKey(data, Key.down)) {
								previewScroll++;
								redraw();
							} else if (matchesKey(data, Key.enter)) {
								done(true);
							} else if (data === "p" || matchesKey(data, Key.tab) || matchesKey(data, Key.escape)) {
								// tab returns to the list without switching tabs, keeping the reading point.
								previewing = null;
								redraw();
							}
							return;
						}

						const st = tabs[activeTab];

						if (st.searching) {
							if (matchesKey(data, Key.enter)) {
								// enter confirms the search; it never applies snippets from here.
								st.query = input.getValue();
								st.searching = false;
								input.focused = false;
								clampCursor(activeTab);
								redraw();
							} else if (matchesKey(data, Key.escape)) {
								input.setValue("");
								st.query = "";
								st.searching = false;
								input.focused = false;
								clampCursor(activeTab);
								redraw();
							} else if (matchesKey(data, Key.up) || matchesKey(data, Key.down)) {
								input.focused = false;
								moveCursor(matchesKey(data, Key.up) ? -1 : 1);
								redraw();
							} else {
								const before = input.getValue();
								input.focused = true;
								input.handleInput(data);
								if (input.getValue() !== before) {
									st.query = input.getValue();
									clampCursor(activeTab);
								}
								// Redraw even for cursor-only edits (left/right, home/end) that
								// leave the value unchanged, so the Input cursor repaints.
								redraw();
							}
							return;
						}

						if (
							matchesKey(data, Key.tab) ||
							matchesKey(data, "shift+tab") ||
							data === "h" ||
							data === "l" ||
							matchesKey(data, Key.left) ||
							matchesKey(data, Key.right)
						) {
							switchTab();
							redraw();
						} else if (data === "/") {
							st.searching = true;
							input.setValue(st.query);
							input.focused = true;
							redraw();
						} else if (matchesKey(data, Key.up)) {
							moveCursor(-1);
							redraw();
						} else if (matchesKey(data, Key.down)) {
							moveCursor(1);
							redraw();
						} else if (matchesKey(data, Key.space)) {
							const item = visibleOf(activeTab)[st.cursor];
							if (item) {
								if (working.has(item.id)) working.delete(item.id);
								else working.add(item.id);
								redraw();
							}
						} else if (data === "a" || data === "A") {
							toggleAll();
							redraw();
						} else if (data === "p" || data === "P") {
							const item = visibleOf(activeTab)[st.cursor];
							if (item) {
								previewing = item;
								previewScroll = 0;
								redraw();
							}
						} else if (matchesKey(data, Key.enter)) {
							done(true);
						} else if (matchesKey(data, Key.escape)) {
							done(false);
						}
					},
				};
			});

			if (confirmed) enabled = working;
			updateWidget(ctx);
		} finally {
			menuOpen = false;
		}
	}

	pi.on("session_start", (_event, ctx) => {
		enabled = new Set();
		try {
			if (!existsSync(BUILTIN_SNIPPETS_DIR)) mkdirSync(BUILTIN_SNIPPETS_DIR, { recursive: true });
		} catch {
			// Non-fatal: the menu will simply report "no snippets found" if the directory is unusable.
		}
		refresh(ctx, false);
		updateWidget(ctx);
	});

	pi.on("input", async (event, ctx) => {
		if (enabled.size === 0) return; // continue unchanged

		refresh(ctx, false);
		const active = snippets.filter((s) => enabled.has(s.id));
		enabled = new Set();
		updateWidget(ctx);

		if (active.length === 0) return; // all toggled snippets vanished from disk

		return {
			action: "transform",
			text: transformPrompt(event.text, active),
		};
	});

	const shortcutKey = loadShortcutKey();

	pi.registerShortcut(shortcutKey, {
		description: "Toggle prompt snippets",
		handler: async (ctx) => {
			await openMenu(ctx);
		},
	});

	pi.registerCommand("snippets", {
		description: "Open the prompt snippet toggle menu",
		handler: async (_args, ctx) => {
			await openMenu(ctx);
		},
	});
}
