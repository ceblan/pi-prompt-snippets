# Prompt Snippets

Architecture and design of the pi-prompt-snippets extension: composable, single-purpose prompt rules injected into messages before they reach the model.

Built-in snippets in `snippets/` are authored in Spanish (frontmatter `name`/`description` and body) because the user composes prompts in Spanish — mixed-language injections confuse the model. Technical terms, tool names (`todo`), and commands (`notify-send`) stay in English.

## Files

Other documents in this knowledge graph.

- [[last-commit]] — last tracked commit for documentation sync

## Snippet Loading

Snippets are markdown files with YAML frontmatter loaded from three directories in priority order, where higher-priority files override lower-priority ones by filename. See [[core.ts#parseSnippet]] for the frontmatter contract and [[core.ts#getSnippetDirectories]] for directory resolution.

### Snippet Directories

Resolution order (highest first): `<cwd>/.pi/snippets/` → `~/.pi/agent/snippets/` → extension built-ins (`snippets/`). Implemented in [[core.ts#getSnippetDirectories]].

### Prompt Transformation

On send, active snippet bodies wrap the typed text: `prepend` group (sorted by `order`) → typed text → `append` group (sorted by `order`). Implemented in [[core.ts#transformPrompt]].

## Toggle Menu

The interactive TUI menu lists snippets with placement groups, supports space/a toggling, tab preview, and enter apply. Opened via the `/snippets` command or the configured global shortcut.

## Shortcut Configuration

The toggle shortcut is user-configurable so other extensions can keep their own keys. Read from `~/.pi/agent/prompt-snippets.json` by [[core.ts#loadShortcutKey]]; missing/invalid config falls back to `DEFAULT_SHORTCUT`.

Directory resolution honors pi env overrides via [[core.ts#getPiConfigDir]] (`PI_CODING_AGENT_DIR` / `XDG_CONFIG_HOME`). Not hardcoded to `alt+s` because pi-powerline-footer reserves that key for its editor-text stash with no configuration for it (only `stashHistory` — the history picker — is configurable, not the stash toggle).

## Tests

The test suite covers parsing, loading, transformation, and shortcut config using `node:test` and temporary directories to avoid touching real snippet paths.

### Newline Normalization

Windows CRLF sequences are converted to LF before parsing so frontmatter delimiters match consistently across platforms.

### Frontmatter Parsing

Validates that `parseSnippet` extracts fields, applies defaults, strips quotes, handles case-insensitive keys, and rejects invalid or empty files.

### Directory Loading

Verifies `loadSnippets` sorts prepend-first then append-last, ignores non-markdown entries, overrides by filename priority, and tracks unparsable files.

### Prompt Transformation

Checks that `transformPrompt` wraps the user's typed text with active prepend and append snippet bodies in the correct order, including the edge case of an empty prompt.

### Shortcut Configuration

Ensures `loadShortcutKey` reads the shortcut from `prompt-snippets.json` and falls back to `DEFAULT_SHORTCUT` when the file is missing, contains invalid JSON, or holds a non-string shortcut value.
