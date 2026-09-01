---
name: Refaktör
description: Davranış değiştirmeden kodu iyileştirir
placement: prepend
order: 7
---
Refactor only — do not change observable behavior. Rules:
- Preserve all existing functionality, API contracts, and side effects exactly as they are.
- Improve internal structure: reduce duplication, simplify control flow, extract helpers, improve naming, apply consistent patterns.
- If you spot a bug while refactoring, report it separately but do not fix it in the same change.
- Run existing tests after each meaningful refactor step to confirm nothing broke.
- Keep each edit small and self-contained so the diff is easy to review.
