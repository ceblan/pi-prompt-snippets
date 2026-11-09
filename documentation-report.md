# Documentation Sync Report

**Tracked range**: No tracker found; reviewed `git log -3` fallback. Last tracked commit now: `e49199a75b48b68e7fc6ff6df43718eac8fb25ab`.

## Commits Reviewed
| Commit | Message | Documented | Action |
|--------|---------|-----------|--------|
| ffafbc1 | feat(snippets): add prompt snippets management extension for pi | Partially | Added `Tests` section to lat.md to cover the test suite |
| e49199a | traduzco al español && lat++ | Yes | Existing lat.md already covers shortcut config, Spanish rationale, and architecture |

## @lat Tags Added
| File | Line | Tag |
|------|------|-----|
| core.ts | 31 | `// @lat: [[lat#Prompt Snippets#Shortcut Configuration]]` |
| core.ts | 38 | `// @lat: [[lat#Prompt Snippets#Shortcut Configuration]]` |
| core.ts | 49 | `// @lat: [[lat#Prompt Snippets#Shortcut Configuration]]` |
| core.ts | 60 | `// @lat: [[lat#Prompt Snippets#Tests#Newline Normalization]]` |
| core.ts | 73 | `// @lat: [[lat#Prompt Snippets#Snippet Loading#Snippet Directories]]` |
| core.ts | 95 | `// @lat: [[lat#Prompt Snippets#Tests#Frontmatter Parsing]]` |
| core.ts | 149 | `// @lat: [[lat#Prompt Snippets#Tests#Directory Loading]]` |
| core.ts | 176 | `// @lat: [[lat#Prompt Snippets#Tests#Prompt Transformation]]` |
| index.ts | 48 | `// @lat: [[lat#Prompt Snippets]]` |
| index.ts | 60 | `// @lat: [[lat#Prompt Snippets#Toggle Menu]]` |
| index.ts | 68 | `// @lat: [[lat#Prompt Snippets#Snippet Loading]]` |
| index.ts | 87 | `// @lat: [[lat#Prompt Snippets#Toggle Menu]]` |
| tests/snippets.test.ts | 16 | `// @lat: [[lat#Prompt Snippets#Tests]]` |

## Link Integrity
- lat check: PASSED (0 errors)
- Errors fixed: Added missing `Tests` and `Files` sections in lat.md; added leading paragraph to `last-commit.md`; created `last-commit.md` with proper heading.

## Additional Actions
Read `~/.pi/agent/AGENTS.md` and `~/.pi/agent/skills/lat-md/SKILL.md`. Applied section structure rules (leading paragraphs ≤250 chars), added wiki links for cross-references, and included `// @lat` tags on new or significantly changed symbols across all touched source files.

## Graph, Bridge & Ontology Refresh
| Action | Status | Details |
|--------|--------|---------|
| graphify update | ⏭️ skipped | No `graphify-out/graph.json` found in project root |
| bridge-build | ⏭️ skipped | No `graphify-out/graph.json` found |
| ontology-build | ⏭️ skipped | No `ontology/` directory found in project root |

## Summary
lat.md is fully in sync; added Tests section, @lat tags across core/index/tests, and created last-commit tracker.

## Round 2 — T-015/C-004 (2026-11-08)

**BASE**: `bcc641ac24e044818337c4fa124074e4f6d3a9ea`; isolated working-tree changes only, with no commit or promotion.

- `index.ts`: the existing `openMenu` inline `ctx.ui.custom` now reports `blocked: { kind: "question", message: "Prompt snippet selection is waiting for user input" }`. A structural intersection keeps the option compatible with Pi 1.4 types; no overlay, version branch, working-copy, or `menuOpen` logic changed. The existing `Toggle Menu` tag on `openMenu` was retained.
- `tests/extension-ui.test.ts`: added two discovered tests using the real extension loader, command runner, component, and interactive dialog methods of the selected host. Added one `// @lat: [[lat#Prompt Snippets#Tests#Inline Menu Blocked State]]` tag on their suite.
- `lat.md/lat.md`: documented the dual-host rationale under `Toggle Menu` and added the `Inline Menu Blocked State` test spec. Removed the stale `Files` link to a `last-commit` tracker absent from BASE; this pre-existing broken link had blocked `lat check`.
- `README.md`: unchanged because snippet selection and its visible controls did not change; the addition is host/terminal waiting-state metadata.

### Validation

- Baseline suite: 37 pass / 0 fail. Final suite using `node --test tests/**/*.test.ts`: **39 pass / 0 fail / 0 skip** with the local 0.84.4 dependencies, Pi 1.4.0, and Pi 1.5.0. Each run discovered both new UI tests (39 = 37 + 2).
- Real host UI smoke: 2 pass / 0 fail on 1.4.0 and 1.5.0. Pi 1.5 exposes `blocked: question` while waiting and clears it on Enter/Escape; Pi 1.4 ignores the option. Fuzzy filtering, per-tab state, working-copy apply/cancel, and reopening after `finally` passed on both.
- Dual TypeScript comparison: the new option adds no diagnostics. Both hosts retain only the pre-existing `registerShortcut(string)` versus `KeyId` error, also reproduced from unmodified BASE sources; it was not fixed outside C-004 scope.
- `lat check`: **All checks passed** after removing the stale BASE tracker link.
- Graph, bridge, and ontology refreshes remain skipped because their marker directories do not exist.
