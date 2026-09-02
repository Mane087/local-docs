import fs from 'node:fs/promises'
import matter from 'gray-matter'
import MarkdownIt, { type MarkdownIt as MarkdownItInstance } from 'markdown-it'
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
    const resultado = matter(source)
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

function extraerEncabezados(md: MarkdownItInstance, content: string): Heading[] {
  const tokens = md.parse(content, {})
  const headings: Heading[] = []
  const usados = new Map<string, number>()

  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token || token.type !== 'heading_open') continue
    const texto = tokens[i + 1]?.content ?? ''
    const base = slugify(texto)
    const repeticiones = usados.get(base) ?? 0
    usados.set(base, repeticiones + 1)
    headings.push({
      level: Number(token.tag.slice(1)),
      id: repeticiones === 0 ? base : `${base}-${repeticiones}`,
      text: texto,
    })
  }
  return headings
}

function extraerTextoPlano(md: MarkdownItInstance, content: string): string {
  const tokens = md.parse(content, {})
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

  md.use(anchor, { slugify, tabIndex: false })

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
      const headings = extraerEncabezados(md, content)
      const primero = headings.find((h) => h.level === 1)
      return {
        html: md.render(content),
        headings,
        frontmatter,
        plainText: extraerTextoPlano(md, content),
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
