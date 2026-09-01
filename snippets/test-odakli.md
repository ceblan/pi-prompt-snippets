---
name: Test odaklı
description: Her değişiklikle birlikte test yazar veya günceller
placement: prepend
order: 6
---
Every change must be accompanied by tests. Follow this protocol:
1. Before writing the fix or feature, identify which tests exist for the affected code. If none exist, say so.
2. Write or update tests that cover the new behavior, edge cases, and any regression the change might introduce.
3. Run the test suite and confirm all tests pass before considering the task done.
4. If a test fails, fix the code — do not delete or weaken the test to make it pass.
