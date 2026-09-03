import { Storage } from 'happy-dom'

// Node >= 22.4 expone un `localStorage` global propio (por defecto desde la
// v25) cuyo getter devuelve `undefined` sin `--localstorage-file`. Al copiar
// las propiedades de la ventana de happy-dom sobre el global de la prueba,
// esa asignacion pasa por el setter nativo de Node en lugar de reemplazar la
// propiedad, asi que `window.localStorage`/`localStorage` quedan
// indefinidos. Aqui se reemplaza la propiedad directamente por una instancia
// de `Storage` de happy-dom (independiente de la version de Node), sin
// depender de una opcion experimental del motor.
Object.defineProperty(globalThis, 'localStorage', {
  value: new Storage(),
  configurable: true,
  writable: true,
  enumerable: true,
})
