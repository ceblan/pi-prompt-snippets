# pi-prompt-snippets

> Composable, single-purpose prompt snippet injection with an interactive TUI menu for Pi coding agent.

## Overview

`pi-prompt-snippets` enables dynamic injection of modular prompt rules into messages before sending them to the Pi coding agent. Each snippet is a standalone Markdown file with YAML frontmatter specifying its name, description, placement (prepend or append), and evaluation order. Active snippets reset after each turn to ensure your prompt context remains lean and tailored for each specific request.

## Installation

Clone or symlink this repository into your Pi agent extensions directory:

```bash
# Clone directly into Pi extensions directory
git clone https://github.com/ArdaYILDIZ-DEV/pi-prompt-snippets.git ~/.pi/agent/extensions/prompt-snippets
```

Or clone elsewhere and create a symbolic link:

```bash
git clone https://github.com/ArdaYILDIZ-DEV/pi-prompt-snippets.git ~/repos/pi-prompt-snippets
ln -s ~/repos/pi-prompt-snippets ~/.pi/agent/extensions/prompt-snippets
```

Restart or launch Pi to load the extension automatically:

```bash
pi
```

## Key Features & Snippet Format

- **Prepend & Append Placements**: Dictate whether prompt guidelines are prepended before your message or appended after it.
- **Deterministic Ordering**: Within each group (prepend / append), snippets are sorted by numeric `order` (ascending), then alphabetically by name.
- **Multi-Tier Directory Discovery**: Loads built-in presets, user-wide custom snippets, and project-local workspace snippets with clean priority overriding.
- **Live Disk Reloading**: Snippet files are reloaded dynamically from disk whenever the menu opens — no agent restart required.
- **Per-Turn Reset**: Active snippet selections automatically clear after each message is sent and on session start.
- **Interactive TUI Overlay**: Full-featured keyboard navigation, bulk toggle, real-time scrollable preview, and editor status widgets.

### Snippet File Format

Every snippet is a `.md` file containing a YAML frontmatter block followed by the markdown body:

```markdown
---
name: Orchestrator Mode
description: Outsources mechanical exploration and coding to subagents
placement: prepend
order: 4
---
This is a pure orchestrator session. You coordinate; you do not execute.
Delegate all mechanical work (file exploration, code reading, implementation)
to subagents. Keep your own context window lean.
```

### Frontmatter Schema

| Field | Required | Default | Description |
|---|---|---|---|
| `name` | No | File stem (filename without `.md`) | Display name shown in the menu and editor widget |
| `description` | No | `""` (empty) | Short descriptive hint displayed next to the name |
| `placement` | No | `append` | Where the snippet is injected (`prepend` or `append`) |
| `order` | No | `9999` | Sort order within its placement group (supports integers and floats) |

*Note: Files with empty bodies or invalid frontmatter boundaries are skipped automatically without interrupting execution.*

### Configuration

The toggle shortcut can be changed in `~/.pi/agent/prompt-snippets.json`:

```json
{
  "shortcut": "alt+p"
}
```

The default is `alt+p`. Invalid or missing configuration falls back to the default silently.

## How It Works & Usage

### Keyboard Shortcuts & Commands

| Key / Command | Action |
|---|---|
| `Alt+P` (configurable) | Open or close the interactive snippet toggle menu |
| `/snippets` | Open the snippet menu via slash command |
| `↑` / `↓` | Navigate snippet list |
| `Space` | Toggle selection for the focused snippet |
| `A` | Toggle all snippets on / off |
| `Tab` | Open or close full-screen scrollable body preview |
| `Enter` | Confirm and apply selection (works from preview screen too) |
| `Esc` | Cancel selection without making changes |

### Editor Status Widget

When one or more snippets are enabled, a status indicator appears above the editor input area:

```
↑ prepend: Orchestrator · Bug Hunter
↓ append: Concise Answers
```

### Message Transformation Lifecycle

1. You compose your message in the Pi interactive prompt.
2. When you hit Enter to send, active **prepend** snippets are injected in `order` sequence at the beginning.
3. Your input message is inserted in the middle.
4. Active **append** snippets are injected in `order` sequence at the end.
5. All toggles reset to empty for the next turn.

## Configuration & Multi-Tier Directories

The extension searches for snippets across three hierarchical levels:

1. **Project-level workspace snippets**: `<cwd>/.pi/snippets/*.md` (Highest priority — overrides matching filenames)
2. **Global user snippets**: `~/.pi/agent/snippets/*.md`
3. **Extension built-in presets**: `<extension-dir>/snippets/*.md`

To create your own snippets, simply create a `.md` file in `~/.pi/agent/snippets/` or in your project's `.pi/snippets/` folder.

## Built-in Snippets Library

`pi-prompt-snippets` includes a curated collection of standard operational presets:

- `orquestador.md`: Delegate mechanical work to subagents while maintaining high-level reasoning.
- `modo-cuidadoso.md`: Require explicit confirmation before destructive or state-altering commands.
- `cazador-errores.md`: Enforce root-cause identification before writing bug fixes.
- `lente-seguridad.md`: Review proposed changes against common vulnerability vectors (SSRF, injection, CORS, auth).
- `revision-codigo.md`: Review code as a senior PR reviewer with structured severity ratings.
- `enfoque-rendimiento.md`: Analyze time/space complexity, hot paths, and memory allocations.
- `trabajo-planificado.md`: Require upfront step-by-step task breakdown and approval before execution.
- `refactor.md`: Enforce behavioral preservation and clean refactoring boundaries.
- `solo-diagnostico.md`: Produce a diagnostic analysis without modifying any codebase files.
- `enfoque-pruebas.md`: Ensure changes include matching automated tests and regression checks.
- `documentacion.md`: Write docstrings, API signatures, and architectural documentation.
- `breve-y-conciso.md`: Keep responses terse, concise, and focused on code.
- `primero-explora.md`: Inspect and verify codebase patterns before proposing changes.
- `primero-pregunta.md`: Ask clarifying questions on ambiguous requirements rather than guessing.
- `subagent-ciclo-pruebas.md`: Delegate automated testing across iterative multi-angle cycles.

## Testing

Run the automated test suite using Node.js test runner:

```bash
npm test
```

Or directly via `node`:

```bash
node --test tests/**/*.test.ts
```

## License

MIT (c) 2025-2026 Arda YILDIZ. See [LICENSE](./LICENSE) for details.
