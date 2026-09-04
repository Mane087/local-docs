export function EstadoVacio({ root }: { root: string }) {
  return (
    <div class="estado">
      <h1>No hay documentos que mostrar</h1>
      <p>
        El directorio <code>{root}</code> no contiene documentos markdown (<code>.md</code> o{' '}
        <code>.markdown</code>).
      </p>
      <p>Anade un archivo y aparecera aqui automaticamente.</p>
    </div>
  )
}

export function ErrorDocumento({ codigo, onInicio }: { codigo: number; onInicio(): void }) {
  const mensaje =
    codigo === 404
      ? 'No se encontro el documento solicitado. Es posible que se haya movido o borrado.'
      : codigo === 403
        ? 'La ruta solicitada queda fuera de la documentacion servida.'
        : 'No se pudo leer el documento solicitado.'

  return (
    <div class="estado">
      <h1>Documento no disponible</h1>
      <p>{mensaje}</p>
      <button type="button" onClick={onInicio}>
        Volver al inicio
      </button>
    </div>
  )
}

export function SinConexion() {
  return (
    <p class="conexion" role="status">
      Sin conexion con el servidor. Reintentando...
    </p>
  )
}

export function DocumentacionNoDisponible() {
  return (
    <div class="estado">
      <h1>La documentacion no esta disponible</h1>
      <p>El directorio servido ha dejado de existir. El visor se recuperara solo si vuelve a aparecer.</p>
    </div>
  )
}
