// Marca cuándo el sitio ya está andando en el navegador. Sirve para animar "desde cero" solo en las
// navegaciones internas: en la primera carga el contenido llega escrito desde el servidor y animarlo
// desde cero lo haría parpadear.
let hydrated = false;

export const isHydrated = () => hydrated;

export function markHydrated() {
  hydrated = true;
}
