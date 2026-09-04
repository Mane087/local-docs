---
title: Diagramas
order: 2
---

# Diagramas

El visor renderiza los bloques marcados como mermaid.

```mermaid
graph TD
  CLI[cli] --> Servidor[servidor http]
  Servidor --> Cache[cache de documentos]
  Servidor --> Indice[indice de busqueda]
  Observador[watcher] --> Cache
  Observador --> Indice
```
