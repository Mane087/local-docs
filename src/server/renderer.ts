import fs from 'node:fs/promises'
import matter from 'gray-matter'
import MarkdownIt, { type Token } from 'markdown-it'
import anchor from 'markdown-it-anchor'
import { createHighlighter, type Highlighter } from 'shiki'

const TAMANO_CABECERA = 4096
const LENGUAJES = [
  'js', 'ts', 'tsx', 'jsx', 'json', 'bash', 'shell', 'python', 'go', 'rust',
  'java', 'sql', 'yaml', 'html', 'css', 'markdown', 'diff',
]

export interface Heading {
  level: number
  id: string
  text: string
}

export interface RenderedDocument {
  html: string
  headings: Heading[]
  frontmatter: Record<string, unknown>
  plainText: string
  firstH1: string | null
  warnings: string[]
}

export interface Renderer {
  render(source: string): RenderedDocument
}

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

function escapar(texto: string): string {
  return texto
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function separarFrontmatter(source: string): {
  content: string
  frontmatter: Record<string, unknown>
  warnings: string[]
} {
  try {
    // Se pasa un objeto de opciones (aunque vacio) para desactivar la cache
    // interna de gray-matter, indexada por el contenido de origen: si un mismo
    // texto con frontmatter invalido se parsea dos veces en el proceso (por
    // ejemplo, una vez desde tree.ts al leer solo la cabecera y otra vez aqui
    // al renderizar el documento completo), esa cache guarda una entrada
    // parcial de la primera llamada -la que lanzo la excepcion- y la segunda
    // llamada la reutiliza sin volver a lanzar, perdiendo el aviso.
    const resultado = matter(source, {})
    return {
      content: resultado.content,
      frontmatter: (resultado.data ?? {}) as Record<string, unknown>,
      warnings: [],
    }
  } catch {
    const sinBloque = source.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, '')
    return { content: sinBloque, frontmatter: {}, warnings: ['frontmatter-invalido'] }
  }
}

function extraerTextoPlano(tokens: Token[]): string {
  const partes: string[] = []
  for (const token of tokens) {
    if (token.type === 'inline') partes.push(token.content)
    else if (token.type === 'fence' || token.type === 'code_block') partes.push(token.content)
  }
  return partes.join('\n').trim()
}

export async function createRenderer(): Promise<Renderer> {
  const highlighter: Highlighter = await createHighlighter({
    themes: ['github-light'],
    langs: LENGUAJES,
  })

  const md = new MarkdownIt({
    html: false,
    linkify: true,
    highlight(code, lang) {
      if (lang === 'mermaid') {
        return `<pre class="mermaid">${escapar(code)}</pre>`
      }
      if (lang && highlighter.getLoadedLanguages().includes(lang)) {
        return highlighter.codeToHtml(code, { lang, theme: 'github-light' })
      }
      return `<pre class="code"><code>${escapar(code)}</code></pre>`
    },
  })

  // markdown-it-anchor es la unica fuente de verdad para los ids de encabezado:
  // el callback recoge, durante el propio parse, el id final que asigna el
  // plugin (con su desambiguacion por conjunto global), en vez de recalcularlo
  // por separado con un algoritmo que podria divergir del que termina en el HTML.
  let encabezadosDelParseActual: Heading[] = []

  md.use(anchor, {
    slugify,
    tabIndex: false,
    callback(token, info) {
      encabezadosDelParseActual.push({
        level: Number(token.tag.slice(1)),
        id: info.slug,
        text: info.title,
      })
    },
  })

  const enlacePorDefecto = md.renderer.rules.link_open
  md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx]
    const href = String(token?.attrGet('href') ?? '')
    if (/^https?:\/\//i.test(href)) {
      token?.attrSet('target', '_blank')
      token?.attrSet('rel', 'noopener noreferrer')
    }
    return enlacePorDefecto
      ? enlacePorDefecto(tokens, idx, options, env, self)
      : self.renderToken(tokens, idx, options)
  }

  return {
    render(source: string): RenderedDocument {
      const { content, frontmatter, warnings } = separarFrontmatter(source)
      encabezadosDelParseActual = []
      const env = {}
      const tokens = md.parse(content, env)
      const headings = encabezadosDelParseActual
      const primero = headings.find((h) => h.level === 1)
      return {
        html: md.renderer.render(tokens, md.options, env),
        headings,
        frontmatter,
        plainText: extraerTextoPlano(tokens),
        firstH1: primero ? primero.text : null,
        warnings,
      }
    },
  }
}

export async function readHeadMetadata(filePath: string): Promise<{
  frontmatter: Record<string, unknown>
  firstH1: string | null
}> {
  const manejador = await fs.open(filePath, 'r')
  try {
    const buffer = Buffer.alloc(TAMANO_CABECERA)
    const { bytesRead } = await manejador.read(buffer, 0, TAMANO_CABECERA, 0)
    const cabecera = buffer.subarray(0, bytesRead).toString('utf8')
    const { content, frontmatter } = separarFrontmatter(cabecera)
    const coincidencia = /^#\s+(.+)$/m.exec(content)
    return { frontmatter, firstH1: coincidencia ? coincidencia[1]!.trim() : null }
  } finally {
    await manejador.close()
  }
}
