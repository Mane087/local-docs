// Un <a href> es alcanzable y operable con teclado de forma nativa (Enter
// activa el elemento sin manejadores adicionales) y permite abrir en pestaña
// nueva o copiar el enlace. Interceptamos solo el clic primario sin
// modificadores para navegar dentro de la aplicacion; las combinaciones del
// navegador (Cmd/Ctrl/Shift+clic, clic central) siguen su comportamiento
// nativo en todos los enlaces del cliente.
export function esClicPrimario(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}

/**
 * Indica si el evento de teclado se origina donde el usuario esta escribiendo.
 * Los atajos de una sola tecla no deben dispararse mientras se teclea en el
 * buscador ni en ningun campo editable.
 */
export function escribiendoTexto(objetivo: EventTarget | null): boolean {
  if (!(objetivo instanceof HTMLElement)) return false
  if (objetivo.isContentEditable) return true
  const etiqueta = objetivo.tagName
  return etiqueta === 'INPUT' || etiqueta === 'TEXTAREA' || etiqueta === 'SELECT'
}

/**
 * Indica si el evento lleva alguna tecla modificadora. Los atajos de una sola
 * tecla la exigen ausente para no pisar las combinaciones del navegador ni las
 * del sistema operativo, que varian entre Windows, Linux y macOS.
 */
export function sinModificadores(evento: KeyboardEvent): boolean {
  return !evento.metaKey && !evento.ctrlKey && !evento.altKey
}
