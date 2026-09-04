# local-docs — Documento de diseño

Fecha: 2026-09-02
Estado: aprobado para planificación

## 1. Propósito

Herramienta de línea de comandos que abre un visor local de la documentación
markdown de un proyecto sin requerir configuración previa. Se ejecuta dentro de
un proyecto que tiene un directorio `docs/` en su raíz, levanta un servidor HTTP
local y abre un navegador con un sidebar que refleja la estructura de la
documentación y un panel que renderiza el documento seleccionado.

## 2. Principios

1. **Cero configuración.** Ejecutar el comando es suficiente. No se requiere
   archivo de configuración, ni instalación en el proyecto, ni cambios en él.
2. **Solo lectura.** La herramienta nunca escribe dentro de `docs/`. Los
   documentos se editan con el editor habitual del usuario.
3. **Independiente del proyecto.** Funciona sobre cualquier proyecto sin
   importar su lenguaje o framework, porque solo depende del sistema de archivos.
4. **Aislamiento de fallos.** Un documento con problemas no rompe el árbol ni la
   aplicación.

## 3. Alcance

### Incluido

- Descubrimiento automático del directorio `docs/`.
- Árbol de navegación con subdirectorios y documentos markdown.
- Renderizado de markdown con resaltado de sintaxis, tablas, imágenes y enlaces
  relativos entre documentos.
- Diagramas Mermaid.
- Lectura de frontmatter YAML para título, orden y etiquetas.
- Tabla de contenidos por documento.
- Búsqueda full-text sobre el contenido, con fragmentos de contexto.
- Recarga automática en vivo cuando cambian los archivos en disco.
- Tema claro y oscuro.

### Excluido

- Edición de contenido y gestión de archivos (crear, renombrar, mover, borrar).
- Autenticación, multiusuario y acceso remoto: el servidor escucha en `localhost`.
- Exportación a PDF o generación de sitio estático.
- Notación matemática LaTeX.
- Integración con control de versiones (historial, diferencias, ramas).

## 4. Reglas de negocio

### 4.1 Localización de la documentación

- El comando busca un directorio `docs/` en el directorio de trabajo actual.
- Si no existe, sube por los directorios padre hasta encontrar uno o llegar a la
  raíz del sistema de archivos.
- La opción `--dir <ruta>` fuerza una raíz concreta y desactiva la búsqueda
  ascendente.
- Si no se encuentra ninguna raíz válida, el proceso termina con un error.
- El directorio resuelto es la **raíz de documentación**. Toda ruta se resuelve
  dentro de ella; cualquier petición que apunte fuera se rechaza.

### 4.2 Contenido incluido en el árbol

- Documentos: archivos con extensión `.md` y `.markdown`, de forma recursiva.
- Recursos: cualquier otro archivo dentro de la raíz se sirve tal cual para que
  funcionen las referencias relativas (imágenes, PDF, ficheros descargables).
- Exclusiones: archivos y directorios cuyo nombre empieza por punto, y los
  directorios `node_modules`.
- Los enlaces simbólicos se siguen solo si su destino está dentro de la raíz.

### 4.3 Título de los elementos

Para un documento, en este orden de prioridad:

1. Campo `title` del frontmatter.
2. Primer encabezado de nivel 1 del contenido.
3. Nombre del archivo normalizado: se quita la extensión y el prefijo numérico de
   ordenación, se sustituyen guiones y guiones bajos por espacios y se pone en
   mayúscula la primera letra. `01-guia-de-inicio.md` produce `Guia de inicio`.

Para un directorio:

1. Título de su documento índice (`index.md` o `README.md`), calculado con las
   reglas anteriores.
2. Nombre del directorio normalizado con las mismas reglas.

### 4.4 Orden del sidebar

Dentro de cada nivel, en este orden de prioridad:

1. Campo `order` del frontmatter, numérico, de menor a mayor.
2. Prefijo numérico en el nombre del archivo o directorio (`01-`, `02-`). El
   prefijo no se muestra en la interfaz.
3. Orden alfabético natural, insensible a mayúsculas, con los números
   comparados por valor y no por carácter.

Los directorios se listan antes que los documentos del mismo nivel. Los
elementos sin `order` ni prefijo numérico se ordenan alfabéticamente después de
los que sí lo tienen.

`order` y el prefijo numérico expresan la misma magnitud, la posición dentro del
nivel, y se comparan en la misma escala: un documento con `order: 3` y otro
llamado `01-intro.md` se ordenan como 3 y 1, no en grupos separados. El `order`
del frontmatter tiene prioridad únicamente dentro de un mismo elemento: si un
archivo tiene ambos, se usa el del frontmatter y se ignora su prefijo.

### 4.5 Documento índice de un directorio

- Si un directorio contiene `index.md` o `README.md` (en ese orden de
  preferencia), ese archivo es su documento índice.
- El documento índice no aparece como hijo en el árbol: seleccionar el
  directorio abre ese documento.
- Un directorio sin documento índice se comporta solo como agrupador: al
  seleccionarlo se expande o contrae, y muestra un estado que enumera su
  contenido.

### 4.6 Navegación

- Documento inicial al abrir la aplicación: el documento índice de la raíz. Si no
  existe, el primer documento del árbol según el orden definido. Si la raíz no
  contiene documentos, se muestra el estado vacío correspondiente.
- La URL del navegador refleja el documento abierto (`/guia/inicio`). Recargar la
  página o compartir el enlace lleva al mismo documento y a la misma posición si
  la URL incluye un ancla.
- Los enlaces relativos a otros documentos (`./otro.md`, `../guia/x.md#seccion`)
  se resuelven contra la ruta del documento actual y navegan dentro de la
  aplicación, sin recargar la página, con el ancla aplicada si la hay.
- Los enlaces externos (con esquema `http` o `https` a otro origen) abren en una
  pestaña nueva.
- Los enlaces relativos que apuntan a un documento inexistente se marcan
  visualmente como rotos y no navegan.

### 4.7 Recarga en vivo

- Un observador del sistema de archivos vigila la raíz de documentación.
- Modificar un documento invalida su versión en caché. Si es el documento
  visible, el cliente lo vuelve a pedir y actualiza el contenido conservando la
  posición de desplazamiento cuando es posible.
- Crear, borrar, renombrar o mover archivos y directorios reconstruye el árbol y
  el cliente lo actualiza.
- Si el documento visible se borra o renombra, la interfaz muestra el estado de
  documento no encontrado sin cerrar la aplicación.
- Los eventos se agrupan con un retardo corto para evitar ráfagas cuando un
  editor guarda varios archivos.

## 5. Arquitectura

### 5.1 Stack

- Node.js 20.19 o superior, TypeScript, módulos ESM.
- Servidor sobre `node:http` nativo. El número de rutas es reducido y no
  justifica un framework.
- Cliente Preact compilado con Vite. El paquete npm se publica con el cliente ya
  compilado: el usuario final no ejecuta ninguna compilación.
- Dependencias del servidor: `markdown-it` y complementos de anclas, `shiki`
  para el resaltado, `gray-matter` para el frontmatter, `chokidar` para el
  observador y `minisearch` para el índice de búsqueda.
- Dependencia del cliente cargada bajo demanda: `mermaid`.

### 5.2 Módulos del servidor

| Módulo | Responsabilidad |
|---|---|
| `cli` | Interpreta las opciones, resuelve la raíz, arranca el servidor y abre el navegador |
| `root-resolver` | Localiza la raíz de documentación y valida existencia, tipo y permisos |
| `tree` | Recorre la raíz y construye el árbol aplicando las reglas de la sección 4 |
| `renderer` | Convierte markdown en HTML, extrae encabezados, frontmatter y texto plano |
| `cache` | Almacena por archivo el resultado del render junto con su fecha de modificación |
| `search-index` | Mantiene el índice full-text y genera los fragmentos de contexto |
| `watcher` | Vigila la raíz, invalida caché, reconstruye árbol e índice y emite eventos |
| `server` | Expone las rutas HTTP, valida las rutas solicitadas y aplica las cabeceras |

Cada módulo se prueba de forma aislada. `root-resolver`, `tree`, `renderer` y
`search-index` son funciones puras sobre entradas del sistema de archivos y no
dependen del servidor HTTP.

### 5.3 Flujo de datos

1. Al arrancar, `cli` resuelve la raíz y `tree` construye el árbol completo. Para
   obtener los títulos lee solo la cabecera de cada archivo (los primeros 4 KB),
   lo justo para el frontmatter y el primer encabezado de nivel 1, sin renderizar
   ni cargar el contenido completo.
2. El servidor empieza a aceptar peticiones y se abre el navegador.
3. La construcción del índice de búsqueda arranca en segundo plano y lee el
   contenido de todos los documentos. Hasta que termina, la búsqueda responde
   indicando que está indexando.
4. El cliente pide el árbol y después cada documento bajo demanda. El servidor
   renderiza el documento en la primera petición y guarda el resultado en caché.
5. El observador detecta un cambio, invalida lo afectado y emite un evento por
   SSE. El cliente reacciona según el tipo de evento.

### 5.4 Caché

- Clave: ruta del archivo relativa a la raíz.
- Valor: HTML renderizado, lista de encabezados, frontmatter, texto plano y fecha
  de modificación.
- Invalidación: por evento del observador o cuando la fecha de modificación del
  archivo no coincide con la almacenada.

## 6. API HTTP

Todas las respuestas de datos son JSON con codificación UTF-8. Las rutas de
documento y recurso son relativas a la raíz de documentación y se validan para
impedir el acceso fuera de ella.

```
GET  /api/tree
GET  /api/doc/<ruta>
GET  /api/search?q=<consulta>
GET  /api/events
GET  /assets/<ruta>
GET  /*
```

### 6.1 `GET /api/tree`

Devuelve el árbol completo.

```json
{
  "root": "/ruta/absoluta/al/proyecto/docs",
  "rootIndex": "README.md",
  "rootTitle": "Portada",
  "defaultDoc": "README.md",
  "tree": [
    {
      "type": "directory",
      "path": "guia",
      "title": "Guia",
      "hasIndex": true,
      "children": [
        {
          "type": "document",
          "path": "guia/instalacion.md",
          "title": "Instalacion",
          "readable": true
        }
      ]
    }
  ]
}
```

El campo `readable` en `false` indica que el archivo existe pero no se puede
leer; la interfaz lo muestra atenuado. `rootIndex` y `rootTitle` describen el
documento índice de la raíz, que no aparece dentro de `tree`. `defaultDoc` es el
documento que la interfaz abre cuando la URL no indica ninguno: el índice de la
raíz o, si no existe, el primer documento del árbol.

### 6.2 `GET /api/doc/<ruta>`

```json
{
  "path": "guia/instalacion.md",
  "title": "Instalacion",
  "html": "<h1 id=\"instalacion\">...</h1>",
  "headings": [{ "level": 2, "id": "requisitos", "text": "Requisitos" }],
  "frontmatter": { "title": "Instalacion", "order": 1, "tags": ["setup"] },
  "breadcrumb": [{ "path": "guia", "title": "Guia" }],
  "warnings": ["frontmatter-invalido"]
}
```

`warnings` enumera problemas no bloqueantes detectados durante el render.

Códigos de estado: `200` correcto, `403` ruta fuera de la raíz, `404` documento
inexistente, `500` error de lectura.

### 6.3 `GET /api/search?q=<consulta>`

```json
{
  "status": "ready",
  "results": [
    {
      "path": "guia/instalacion.md",
      "title": "Instalacion",
      "score": 8.4,
      "fragments": ["...requiere <mark>Node</mark> 20 o superior..."]
    }
  ]
}
```

`status` admite `ready` e `indexing`. Con `indexing`, `results` es una lista
vacía y la interfaz informa del estado.

### 6.4 `GET /api/events`

Flujo SSE. Tipos de evento:

- `doc-changed` con la ruta del documento modificado.
- `doc-removed` con la ruta del documento eliminado.
- `tree-changed` sin datos adicionales; el cliente vuelve a pedir el árbol.
- `root-unavailable` cuando la raíz deja de existir.
- `root-restored` cuando la raíz vuelve a estar disponible.

### 6.5 `GET /assets/<ruta>`

Sirve archivos no markdown dentro de la raíz, con el tipo MIME correspondiente y
sin caché del navegador, para que las imágenes actualizadas se vean al recargar.

### 6.6 `GET /*`

Devuelve el `index.html` del cliente para cualquier ruta que no coincida con las
anteriores, de modo que la navegación de la aplicación funcione al recargar.

## 7. Cliente

### 7.1 Módulos

| Módulo | Responsabilidad |
|---|---|
| `router` | Sincroniza la URL con el documento visible mediante la History API |
| `sidebar` | Pinta el árbol, gestiona expansión y elemento activo |
| `viewer` | Inserta el HTML recibido y activa el comportamiento de los enlaces |
| `toc` | Construye la tabla de contenidos y marca el encabezado activo al desplazarse |
| `search` | Panel superpuesto de búsqueda con navegación por teclado |
| `events` | Cliente SSE con reconexión y control del estado de conexión |
| `theme` | Selección de tema y persistencia |

Mermaid se carga de forma diferida y únicamente cuando el documento contiene
diagramas.

### 7.2 Estado persistido en el navegador

- Tema seleccionado.
- Directorios expandidos del sidebar.

Este estado se guarda en `localStorage` y su ausencia o corrupción no impide el
funcionamiento: se recurre a los valores por omisión.

## 8. Interfaz

### 8.1 Estructura

Tres zonas: sidebar de 280px de ancho fijo, columna de contenido limitada a unos
70 caracteres por línea y centrada en el espacio disponible, y tabla de
contenidos de 240px a la derecha. El sidebar no lleva fondo propio ni bordes
marcados; la separación se consigue con espacio, de modo que el documento
concentre el peso visual.

### 8.2 Jerarquía visual

El texto del documento es el contenido principal: color oscuro, tamaño de 16 a
18px e interlineado 1.6. El árbol y la tabla de contenidos son contenido de
apoyo: tamaño 14px y color gris medio, con el elemento activo en color oscuro y
peso 600. El elemento activo del árbol se marca con un borde de acento a la
izquierda, no con un fondo de color.

### 8.3 Sistema visual

- Escala de espaciado: 4, 8, 12, 16, 24, 32, 48, 64 px.
- Escala tipográfica: 12, 14, 16, 18, 20, 24, 30, 36 px.
- Pesos tipográficos: 400 y 600.
- Paleta de grises con tinte frío y un color primario aplicado solo a enlaces,
  elemento activo y coincidencias de búsqueda. No se usa negro puro.
- Todos los valores se definen como variables CSS.

### 8.4 Tema

El tema sigue por omisión la preferencia del sistema operativo y se puede
cambiar manualmente; la elección se recuerda. El tema oscuro usa una paleta
propia, no una inversión de la clara.

### 8.5 Interacción y accesibilidad

- `Cmd/Ctrl + K` abre la búsqueda; las flechas y `Enter` recorren y abren
  resultados; `Escape` cierra el panel.
- El árbol se recorre con el teclado y el foco es siempre visible.
- Contraste mínimo 4.5:1 en el texto y 3:1 en elementos de interfaz.
- Se respeta `prefers-reduced-motion`.

### 8.6 Comportamiento responsive

- Por debajo de 1280px se oculta la tabla de contenidos.
- Por debajo de 900px el sidebar pasa a un panel deslizable con botón en la
  cabecera.
- El diseño se mantiene utilizable a partir de 320px de ancho.

## 9. Manejo de errores

Principio: un documento con problemas no rompe el árbol ni la aplicación. El
fallo se aísla en el documento afectado.

### 9.1 Errores de arranque

Se muestran en la terminal antes de abrir el navegador y terminan el proceso con
código de salida distinto de cero, salvo donde se indique lo contrario.

| Situación | Comportamiento |
|---|---|
| No se encontró `docs/` | Indica desde qué directorio se buscó y sugiere `--dir` |
| La ruta de `--dir` no existe | Mensaje con la ruta resuelta |
| La ruta de `--dir` no es un directorio | Mensaje específico |
| Sin permiso de lectura sobre la raíz | Mensaje específico |
| Puerto ocupado | Usa el siguiente puerto libre e informa del puerto real. Si `--port` fue explícito, avisa antes de cambiarlo. No termina el proceso |
| No se pudo abrir el navegador | Imprime la URL para abrirla manualmente. No termina el proceso |

### 9.2 Errores en ejecución

| Situación | Comportamiento |
|---|---|
| Documento inexistente | Respuesta 404. La interfaz muestra "documento no encontrado" con enlace al inicio y mantiene el sidebar |
| Ruta fuera de la raíz | Respuesta 403 sin detalles del sistema de archivos |
| Archivo ilegible por permisos | El árbol lo muestra atenuado; al abrirlo se explica el motivo |
| Frontmatter YAML inválido | El documento se renderiza igualmente, se ignora el frontmatter y se muestra un aviso discreto |
| Diagrama Mermaid inválido | El bloque muestra el error de sintaxis y el resto del documento se lee con normalidad |
| Raíz borrada o renombrada en ejecución | Estado de "documentación no disponible"; la aplicación se recupera sola si la raíz reaparece |
| Conexión SSE caída | Reconexión con espera creciente e indicador de "sin conexión"; al recuperarla se recargan árbol y documento |
| Índice de búsqueda en construcción | La búsqueda informa del estado en lugar de devolver resultados vacíos |

### 9.3 Estados vacíos

Hay dos, cada uno con su propia pantalla y una explicación de qué se esperaba
encontrar:

- **Raíz sin documentos markdown**: la raíz existe pero no contiene ningún `.md`
  ni `.markdown`. Se nombra el directorio servido y se explica que el documento
  aparecerá en cuanto se añada.
- **Búsqueda sin resultados**: la consulta no coincide con ningún documento
  indexado. Se distingue del estado de índice en construcción, que tiene su
  propio mensaje.

Un directorio sin documento índice ni contenido no llega a producir un estado
vacío: el árbol poda esos directorios al construirse (§4.2), así que no aparece
en el sidebar y no hay ninguna forma de navegar hasta él.

## 10. Interfaz de línea de comandos

```
local-docs [opciones]

  --dir <ruta>    Fuerza la raíz de documentación y desactiva la búsqueda ascendente
  --port <n>      Puerto preferido. Por omisión 4180
  --host <host>   Interfaz de escucha. Por omisión 127.0.0.1
  --no-open       No abre el navegador automáticamente
  --version       Muestra la versión
  --help          Muestra la ayuda
```

## 11. Criterios de aceptación

1. Ejecutar `npx local-docs` en un proyecto con `docs/` abre el navegador y
   muestra el documento índice sin ningún paso de configuración.
2. Ejecutarlo en un subdirectorio del proyecto localiza la misma raíz `docs/`.
3. El sidebar refleja la jerarquía de directorios y aplica las reglas de título y
   orden de la sección 4.
4. Modificar un documento abierto actualiza el contenido en el navegador sin
   intervención del usuario.
5. Crear o borrar un archivo actualiza el árbol sin intervención del usuario.
6. La búsqueda encuentra un término presente solo en el cuerpo de un documento y
   muestra un fragmento con el contexto.
7. Un enlace relativo a otro documento navega sin recargar la página y conserva
   el ancla.
8. Un bloque Mermaid se renderiza como diagrama; uno con sintaxis inválida
   muestra el error sin afectar al resto del documento.
9. Un documento con frontmatter inválido se sigue mostrando.
10. Una petición con una ruta que intenta salir de la raíz recibe 403.
11. Ejecutarlo en un directorio sin `docs/` termina con un mensaje que explica el
    problema y propone `--dir`.

## 12. Decisiones tomadas

| Decisión | Alternativas descartadas | Motivo |
|---|---|---|
| CLI Node con servidor local | Binario Go/Rust, extensión de VS Code, aplicación de escritorio | Distribución inmediata con `npx`, sin instalación ni atadura a un editor |
| Solo lectura | Edición de contenido, gestión de archivos | Alcance mínimo, sin riesgo de escritura en la documentación del usuario |
| Recarga automática en vivo | Lectura por petición, snapshot al arrancar | La herramienta se usa mientras se escribe documentación |
| Render de markdown en el servidor | Render en el cliente, SSR por página | Un solo parseo sirve para mostrar e indexar; el cliente queda pequeño y la navegación no recarga la página |
| Búsqueda full-text en memoria | Sin búsqueda, filtro por nombre | Necesaria para documentación extensa; el índice en memoria evita escribir en disco |
| `node:http` nativo | Express, Fastify | Pocas rutas y menos dependencias |
| Preact | React, vanilla | El árbol y los estados de la interfaz se benefician de un modelo de componentes, con un peso mínimo |
