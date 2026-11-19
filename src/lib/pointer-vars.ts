// Escribe la posición del cursor sobre un elemento como variables CSS, una vez por cuadro.
// --mx / --my van en porcentaje (para ubicar algo donde está el cursor) y --px / --py de -1 a 1
// (para correr o inclinar algo según hacia dónde se mueve). Solo con mouse: al tacto no hace nada.
export function writePointerVars(
  event: { pointerType: string; clientX: number; clientY: number },
  node: HTMLElement | null,
  frame: { current: number },
) {
  if (event.pointerType !== "mouse" || !node) return;
  const { clientX, clientY } = event;
  cancelAnimationFrame(frame.current);
  frame.current = requestAnimationFrame(() => {
    const box = node.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const x = Math.max(0, Math.min(1, (clientX - box.left) / box.width));
    const y = Math.max(0, Math.min(1, (clientY - box.top) / box.height));
    node.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
    node.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
    node.style.setProperty("--px", (x * 2 - 1).toFixed(3));
    node.style.setProperty("--py", (y * 2 - 1).toFixed(3));
  });
}

export function clearPointerVars(node: HTMLElement | null, frame: { current: number }) {
  cancelAnimationFrame(frame.current);
  if (!node) return;
  node.style.setProperty("--px", "0");
  node.style.setProperty("--py", "0");
}
