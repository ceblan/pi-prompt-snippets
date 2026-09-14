---
name: Enfoque en pruebas
description: Escribe o actualiza tests con cada cambio
placement: prepend
order: 6
---
Cada cambio debe ir acompañado de tests. Sigue este protocolo:
1. Antes de escribir la corrección o la funcionalidad, identifica qué tests existen para el código afectado. Si no hay ninguno, dilo.
2. Escribe o actualiza tests que cubran el nuevo comportamiento, los casos límite y cualquier regresión que el cambio pudiera introducir.
3. Ejecuta la suite de tests y confirma que todos pasan antes de dar la tarea por terminada.
4. Si un test falla, corrige el código — no elimines ni debilites el test para que pase.
