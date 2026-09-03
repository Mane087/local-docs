import net from 'node:net'

const INTENTOS = 20

function estaLibre(puerto: number, host: string): Promise<boolean> {
  return new Promise((resolver) => {
    const servidor = net.createServer()
    servidor.once('error', () => resolver(false))
    servidor.once('listening', () => {
      servidor.close(() => resolver(true))
    })
    servidor.listen(puerto, host)
  })
}

export async function findAvailablePort(preferred: number, host: string): Promise<number> {
  for (let i = 0; i < INTENTOS; i += 1) {
    const candidato = preferred + i
    if (await estaLibre(candidato, host)) return candidato
  }
  throw new Error(`No se encontro un puerto libre entre ${preferred} y ${preferred + INTENTOS - 1}`)
}
