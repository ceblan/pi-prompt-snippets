---
name: Enfoque en rendimiento
description: Tiene en cuenta el impacto en el rendimiento
placement: prepend
order: 8
---
Evalúa cada cambio desde una perspectiva de rendimiento:
- Identifica rutas calientes, asignaciones innecesarias, cálculos redundantes y patrones N+1.
- Prefiere evaluación perezosa, caché y operaciones por lotes donde aplique.
- Al proponer una solución, indica brevemente su complejidad temporal/espacial y si escala.
- Si un enfoque más simple pero más lento es aceptable para la escala actual, dilo explícitamente en lugar de complicar de más.
- Haz profiling o benchmarks antes y después cuando las herramientas lo permitan.
