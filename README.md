# local-docs

Visor local de documentacion markdown, sin configuracion.

## Uso

```bash
npx @mane087/local-docs
```

Busca un directorio `docs/` en el directorio actual y, si no lo encuentra, en sus
directorios padre. Levanta un servidor en `http://127.0.0.1:4180` y abre el navegador.

## Requisitos

Node.js 20.19 o superior.

## Opciones

```
--dir <ruta>    Fuerza la raiz de documentacion
--port <n>      Puerto preferido (por omision 4180)
--host <host>   Interfaz de escucha (por omision 127.0.0.1)
--no-open       No abre el navegador
--version       Muestra la version
--help          Muestra la ayuda
```

## Que hace

- Sidebar con la estructura de `docs/`, con titulos tomados del frontmatter, del
  primer encabezado o del nombre del archivo.
- Renderizado de markdown con resaltado de sintaxis, tablas, imagenes y diagramas Mermaid.
- Busqueda full-text sobre el contenido.
- Recarga automatica al modificar los archivos.
- Tema claro y oscuro.

La herramienta solo lee: nunca escribe dentro de `docs/`.

## Atajos de teclado

| Tecla | Efecto |
|---|---|
| `Cmd/Ctrl + K` | Abrir la busqueda |
| `I` | Mostrar u ocultar el indice lateral |
| `C` | Mostrar u ocultar el contenido de la pagina |

Las teclas sueltas se ignoran mientras escribes en un campo de texto y cuando
llevan una tecla modificadora, para no pisar los atajos del navegador ni los
del sistema. Funcionan igual en Windows, Linux y macOS.

## Licencia

Apache License 2.0. Ver [LICENSE](./LICENSE).
