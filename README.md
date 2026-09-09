<p align="center">
  <img src="assets/local-docs.svg" alt="local-docs">
</p>
<p align="center">
  Visor local de documentación Markdown, sin configuración.
</p>

<!-- BADGES -->
<p align="center">
    <a title="Apache-2.0" href="LICENSE">
       <img src="https://img.shields.io/badge/license-Apache--2.0-blue" alt="Apache-2.0" />
    </a>
    <a title="npm version" href="https://www.npmjs.com/package/%40mane087%2Flocal-docs">
       <img src="https://img.shields.io/npm/v/%40mane087%2Flocal-docs?logo=npm&label=npm" alt="npm version" />
    </a>
    <a title="node.js" href="https://nodejs.org">
       <img src="https://img.shields.io/badge/Node.js-%3E%3D20.19.0-339933?logo=node.js&logoColor=white" alt="node.js" />
    </a>
</p>

## Descripción

Local Docs es un visor local de documentación Markdown que detecta automáticamente
el directorio de documentos y permite consultarlo desde el navegador.

## ¿Qué problema resuelve?

Permite consultar documentación Markdown de un proyecto local sin configurar un
servidor externo ni mover los archivos a otra plataforma.

## Features

- Detecta el directorio `docs/` en la carpeta actual o en sus directorios padre.
- Renderiza archivos Markdown en un servidor local.
- Incluye búsqueda y un índice lateral para navegar la documentación.
- Abre automáticamente el navegador al iniciar.
- Permite configurar la ruta de documentación, el puerto y la interfaz de escucha.
- Incluye atajos de teclado para controlar la búsqueda, el índice y el contenido.

## Cómo usar

```bash
npx @mane087/local-docs
```

Busca un directorio `docs/` en el directorio actual y, si no lo encuentra, en sus
directorios padre. Levanta un servidor en `http://127.0.0.1:4180` y abre el navegador.

### Requisitos

Node.js 20.19 o superior.

### Opciones

```
--dir <ruta>    Fuerza la raíz de documentación
--port <n>      Puerto preferido (por omisión 4180)
--host <host>   Interfaz de escucha (por omisión 127.0.0.1)
--no-open       No abre el navegador
--version       Muestra la versión
--help          Muestra la ayuda
```

### Atajos de teclado

| Tecla          | Efecto                                      |
| -------------- | ------------------------------------------- |
| `Cmd/Ctrl + K` | Abrir la busqueda                           |
| `I`            | Mostrar u ocultar el indice lateral         |
| `C`            | Mostrar u ocultar el contenido de la pagina |

Las teclas sueltas se ignoran mientras escribes en un campo de texto y cuando
llevan una tecla modificadora, para no pisar los atajos del navegador ni los
del sistema. Funcionan igual en Windows, Linux y macOS.

## Instalación local

Para instalar y ejecutar el proyecto desde el código fuente:

```bash
npm install
npm run build
npm start
```

El comando `start` inicia el servidor usando la documentación del directorio
actual o la que se encuentre en sus directorios padre.
