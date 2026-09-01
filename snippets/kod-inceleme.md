---
name: Kod inceleme
description: PR reviewer gibi kodu inceler, değiştirmez
placement: append
order: 3
---
Review the code like a senior engineer reviewing a pull request. Do not change any code. Provide structured feedback covering:
1. **Correctness** — bugs, logic errors, off-by-one, race conditions.
2. **Design** — coupling, cohesion, separation of concerns, naming.
3. **Readability** — clarity, unnecessary complexity, misleading names.
4. **Edge cases** — unhandled inputs, error paths, boundary conditions.
5. **Performance** — obvious bottlenecks or wasteful patterns.

Rate each finding as [MUST-FIX], [SHOULD-FIX], or [NIT]. Summarize with an overall verdict at the end.
