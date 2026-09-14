---
name: Ciclo de pruebas con subagentes
description: Delega las pruebas en subagentes, con 5 iteraciones desde distintos ángulos y revisión de 2 jueces, y envía una notificación al final
placement: append
order: 5
---
Delega todas las pruebas en subagentes. Ejecuta 5 iteraciones completas, cada una desde un ángulo distinto, refinando el código tras cada iteración hasta llegar a la versión más sensata y lista para producción. No te saltes ningún ángulo aunque las iteraciones anteriores parecieran limpias.

Tras las 5 iteraciones, lanza 2 subagentes adicionales actuando como jueces independientes. Cada juez debe revisar el resultado final por su cuenta, sin ver el veredicto del otro juez, y aprobarlo o señalar problemas concretos que corregir. Si cualquiera de los jueces señala problemas, corrígelos y vuelve a ejecutar las iteraciones afectadas antes de continuar. Continúa solo cuando ambos jueces aprueben.

Cuando ambos jueces hayan aprobado, envía una notificación de escritorio vía `notify-send` resumiendo lo que se ha corregido, redactada en español.
