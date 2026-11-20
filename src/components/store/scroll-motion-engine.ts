import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

gsap.registerPlugin(ScrollTrigger, SplitText);

// Lo que se limpia cuando un elemento termina de entrar: queda sin estilos en línea, así sus efectos
// propios (levantarse al pasar el mouse, por ejemplo) vuelven a mandar.
const AFTER = "transform,opacity,transition";

/**
 * El motor de E13 (ver scroll-motion.tsx). Va en un archivo aparte para que GSAP se descargue después
 * de que la página ya se ve. Arma las entradas dentro de `root` y devuelve la función que deshace todo.
 */
export function mountScrollMotion(root: HTMLElement) {
  // Si la página cambia de alto después de armarse (fotos, tipografías), se recalculan los puntos de
  // entrada: nada queda esperando un scroll que ya no existe.
  let refresh: ReturnType<typeof setTimeout> | undefined;
  const observer = new ResizeObserver(() => {
    clearTimeout(refresh);
    refresh = setTimeout(() => ScrollTrigger.refresh(), 160);
  });
  observer.observe(root);

  const pending = new Set<HTMLElement>();
  let reveal: ((target: Node) => void) | undefined;
  const onFocus = (event: FocusEvent) => {
    if (pending.size && event.target instanceof Node) reveal?.(event.target);
  };
  root.addEventListener("focusin", onFocus);

  // Con el alcance en `root`, los selectores de adentro solo encuentran lo de esta zona.
  const media = gsap.matchMedia(root);

  media.add("(prefers-reduced-motion: no-preference)", () => {
    // Solo se anima lo que todavía no se vio: lo que ya está en pantalla queda quieto.
    const below = (element: Element) =>
      element.getBoundingClientRect().top > window.innerHeight * 0.92;

    // Lo que espera su entrada se esconde con opacidad (no con visibility): así sus enlaces se pueden
    // alcanzar con el teclado y los lee un lector de pantalla aunque todavía no se hayan visto. Mientras
    // entra no corren sus transiciones propias, que si no retrasarían cada cuadro.
    const hide = (elements: HTMLElement[], offset: (position: number) => number) => {
      gsap.set(elements, { opacity: 0, y: offset, transition: "none" });
      elements.forEach((element) => pending.add(element));
    };
    const show = (
      elements: HTMLElement[],
      duration: number,
      stagger: gsap.StaggerVars | number = 0,
    ) => {
      elements.forEach((element) => pending.delete(element));
      gsap.to(elements, {
        opacity: 1,
        y: 0,
        duration,
        ease: "power3.out",
        stagger,
        overwrite: true,
        clearProps: AFTER,
      });
    };
    // Si el foco del teclado cae en algo que todavía no entró (pasa cuando queda justo en el borde de
    // abajo de la pantalla), se muestra en el acto: nunca hay un elemento enfocado que no se vea.
    reveal = (target) => {
      const hit = [...pending].filter((element) => element.contains(target));
      if (hit.length) show(hit, 0.2);
    };

    gsap.utils
      .toArray<HTMLElement>("[data-anim='titulo']")
      .filter(below)
      .forEach((title) => {
        SplitText.create(title, {
          type: "lines",
          mask: "lines",
          autoSplit: true,
          onSplit: (split) => {
            // La máscara de cada renglón cortaba los acentos de las mayúsculas: se le da aire arriba.
            gsap.set(split.masks, { paddingTop: "0.24em", marginTop: "-0.24em" });
            return gsap.from(split.lines, {
              yPercent: 108,
              duration: 0.75,
              ease: "power3.out",
              stagger: 0.09,
              scrollTrigger: { trigger: title, start: "top 88%", once: true },
            });
          },
        });
      });

    gsap.utils.toArray<HTMLElement>("[data-anim='grupo']").forEach((group) => {
      const items = (Array.from(group.children) as HTMLElement[]).filter(below);
      if (!items.length) return;
      // La primera tarjeta recorre más camino que las siguientes y los intervalos se acortan: el grupo
      // entra como una ola, no como un metrónomo.
      hide(items, (position) => 34 - Math.min(position, 4) * 4);
      ScrollTrigger.batch(items, {
        start: "top 92%",
        once: true,
        onEnter: (batch) => show(batch as HTMLElement[], 0.65, { each: 0.08, ease: "power1.in" }),
      });
    });

    gsap.utils
      .toArray<HTMLElement>("[data-anim='bloque']")
      .filter(below)
      .forEach((block) => {
        hide([block], () => 26);
        ScrollTrigger.create({
          trigger: block,
          start: "top 90%",
          once: true,
          onEnter: () => show([block], 0.7),
        });
      });

    gsap.utils
      .toArray<HTMLElement>("[data-count]")
      .filter(below)
      .forEach((node) => {
        const target = Number(node.dataset.count);
        if (!Number.isFinite(target) || target < 2) return;
        const counter = { value: 0 };
        gsap.to(counter, {
          value: target,
          duration: 0.9,
          ease: "power2.out",
          scrollTrigger: { trigger: node, start: "top 92%", once: true },
          onUpdate: () => {
            node.textContent = String(Math.round(counter.value));
          },
        });
      });

    // La marquesina corre sola (CSS); el scroll le cambia la velocidad y el sentido.
    const track = root.querySelector<HTMLElement>("[data-anim='marquesina']");
    const animation = track?.getAnimations()[0];
    if (animation) {
      const rate = { value: 1 };
      const apply = () => {
        animation.playbackRate = rate.value;
      };
      ScrollTrigger.create({
        start: 0,
        end: "max",
        onUpdate: (self) => {
          const velocity = gsap.utils.clamp(-3000, 3000, self.getVelocity());
          gsap.to(rate, {
            value: (self.direction < 0 ? -1 : 1) * (1 + Math.abs(velocity) / 400),
            duration: 0.2,
            overwrite: true,
            onUpdate: apply,
          });
          gsap.to(rate, {
            value: self.direction < 0 ? -1 : 1,
            duration: 0.9,
            delay: 0.2,
            onUpdate: apply,
          });
        },
      });
      return () => {
        animation.playbackRate = 1;
      };
    }
  });

  return () => {
    clearTimeout(refresh);
    observer.disconnect();
    root.removeEventListener("focusin", onFocus);
    pending.clear();
    media.revert();
  };
}
