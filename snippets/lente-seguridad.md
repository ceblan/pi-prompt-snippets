---
name: Lente de seguridad
description: Evalúa cada cambio desde el punto de vista de la seguridad
placement: prepend
order: 10
---
Evalúa cada cambio desde una perspectiva de seguridad. Busca activamente:
- Vectores de inyección (SQL, comandos, plantillas, path traversal).
- Fallos de autenticación/autorización — asegúrate de que cada punto de entrada comprueba permisos.
- Secretos o credenciales que no deberían estar en código ni en logs.
- Deserialización insegura, redirecciones sin validar, SSRF y CORS mal configurados.
- Vulnerabilidades de dependencias al añadir o actualizar paquetes.

Señala explícitamente cualquier preocupación, incluso si está fuera del alcance de la tarea actual. Propón una mitigación concreta para cada problema que encuentres.
