import type { ServerResponse } from 'node:http'

export type DocsEvent =
  | { type: 'doc-changed' | 'doc-removed'; path: string }
  | { type: 'tree-changed' | 'root-unavailable' | 'root-restored' }

export class EventHub {
  private readonly clientes = new Set<ServerResponse>()

  get clientCount(): number {
    return this.clientes.size
  }

  addClient(res: ServerResponse): void {
    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    })
    res.write(': conectado\n\n')
    this.clientes.add(res)
    res.on('close', () => {
      this.clientes.delete(res)
    })
  }

  emit(event: DocsEvent): void {
    const datos = 'path' in event ? JSON.stringify({ path: event.path }) : '{}'
    const mensaje = `event: ${event.type}\ndata: ${datos}\n\n`
    for (const cliente of this.clientes) {
      cliente.write(mensaje)
    }
  }

  closeAll(): void {
    for (const cliente of this.clientes) {
      cliente.end()
    }
    this.clientes.clear()
  }
}
