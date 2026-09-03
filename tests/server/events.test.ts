import { describe, expect, it } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ServerResponse } from 'node:http'
import { EventHub } from '../../src/server/events.js'

class RespuestaFalsa extends EventEmitter {
  cabeceras: Record<string, string> = {}
  escrito: string[] = []
  cerrada = false

  writeHead(_estado: number, cabeceras: Record<string, string>): this {
    this.cabeceras = cabeceras
    return this
  }

  write(texto: string): boolean {
    this.escrito.push(texto)
    return true
  }

  end(): void {
    this.cerrada = true
  }
}

function crearRespuesta(): RespuestaFalsa {
  return new RespuestaFalsa()
}

describe('EventHub', () => {
  it('abre el flujo con las cabeceras de sse', () => {
    const hub = new EventHub()
    const res = crearRespuesta()

    hub.addClient(res as unknown as ServerResponse)

    expect(res.cabeceras['content-type']).toBe('text/event-stream')
    expect(res.cabeceras['cache-control']).toBe('no-cache')
    expect(hub.clientCount).toBe(1)
  })

  it('envia el evento a todos los clientes en formato sse', () => {
    const hub = new EventHub()
    const uno = crearRespuesta()
    const dos = crearRespuesta()
    hub.addClient(uno as unknown as ServerResponse)
    hub.addClient(dos as unknown as ServerResponse)

    hub.emit({ type: 'doc-changed', path: 'guia/uso.md' })

    const esperado = 'event: doc-changed\ndata: {"path":"guia/uso.md"}\n\n'
    expect(uno.escrito).toContain(esperado)
    expect(dos.escrito).toContain(esperado)
  })

  it('envia eventos sin datos adicionales', () => {
    const hub = new EventHub()
    const res = crearRespuesta()
    hub.addClient(res as unknown as ServerResponse)

    hub.emit({ type: 'tree-changed' })

    expect(res.escrito).toContain('event: tree-changed\ndata: {}\n\n')
  })

  it('descarta al cliente cuando se cierra la conexion', () => {
    const hub = new EventHub()
    const res = crearRespuesta()
    hub.addClient(res as unknown as ServerResponse)

    res.emit('close')

    expect(hub.clientCount).toBe(0)
  })

  it('cierra todos los clientes al apagarse', () => {
    const hub = new EventHub()
    const res = crearRespuesta()
    hub.addClient(res as unknown as ServerResponse)

    hub.closeAll()

    expect(res.cerrada).toBe(true)
    expect(hub.clientCount).toBe(0)
  })
})
