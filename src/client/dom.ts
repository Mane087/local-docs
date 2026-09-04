// Un <a href> es alcanzable y operable con teclado de forma nativa (Enter
// activa el elemento sin manejadores adicionales) y permite abrir en pestaña
// nueva o copiar el enlace. Interceptamos solo el clic primario sin
// modificadores para navegar dentro de la aplicacion; las combinaciones del
// navegador (Cmd/Ctrl/Shift+clic, clic central) siguen su comportamiento
// nativo en todos los enlaces del cliente.
export function esClicPrimario(event: MouseEvent): boolean {
  return event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey
}
