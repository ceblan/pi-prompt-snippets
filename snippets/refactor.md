---
name: Refactorización
description: Mejora el código sin cambiar su comportamiento
placement: prepend
order: 7
---
Solo refactoriza — no cambies el comportamiento observable. Reglas:
- Conserva toda la funcionalidad existente, los contratos de API y los efectos secundarios exactamente como están.
- Mejora la estructura interna: reduce duplicación, simplifica el flujo de control, extrae funciones auxiliares, mejora los nombres, aplica patrones consistentes.
- Si detectas un bug durante la refactorización, repórtalo por separado pero no lo corrijas en el mismo cambio.
- Ejecuta los tests existentes tras cada paso de refactorización significativo para confirmar que no se ha roto nada.
- Mantén cada edición pequeña y autocontenida para que el diff sea fácil de revisar.
