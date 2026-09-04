export interface DocumentNode {
  type: 'document'
  path: string
  title: string
  readable: boolean
}

export interface DirectoryNode {
  type: 'directory'
  path: string
  title: string
  hasIndex: boolean
  indexPath: string | null
  children: TreeNode[]
}

export type TreeNode = DocumentNode | DirectoryNode

export interface Heading {
  level: number
  id: string
  text: string
}

export interface TreeResponse {
  root: string
  tree: TreeNode[]
  rootIndex: string | null
  rootTitle: string | null
  defaultDoc: string | null
}

export interface DocResponse {
  path: string
  title: string
  html: string
  headings: Heading[]
  frontmatter: Record<string, unknown>
  breadcrumb: Array<{ path: string; title: string }>
  warnings: string[]
}

export interface SearchResult {
  path: string
  title: string
  score: number
  fragments: string[]
}

export interface SearchResponse {
  status: 'indexing' | 'ready'
  results: SearchResult[]
}
