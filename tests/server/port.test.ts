import { describe, expect, it } from 'vitest'
import net from 'node:net'
import { findAvailablePort } from '../../src/server/port.js'

describe('findAvailablePort', () => {
  it('devuelve el puerto preferido cuando esta libre', async () => {
    const provisional = net.createServer()
    await new Promise<void>((resolver) => provisional.listen(0, '127.0.0.1', resolver))
    const libre = (provisional.address() as net.AddressInfo).port
    await new Promise<void>((resolver) => provisional.close(() => resolver()))

    expect(await findAvailablePort(libre, '127.0.0.1')).toBe(libre)
  })

  it('pasa al siguiente puerto cuando el preferido esta ocupado', async () => {
    const ocupado = net.createServer()
    await new Promise<void>((resolver) => ocupado.listen(0, '127.0.0.1', resolver))
    const puerto = (ocupado.address() as net.AddressInfo).port

    const elegido = await findAvailablePort(puerto, '127.0.0.1')

    expect(elegido).toBeGreaterThan(puerto)
    await new Promise<void>((resolver) => ocupado.close(() => resolver()))
  })
})
