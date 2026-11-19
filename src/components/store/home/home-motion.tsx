"use client";

import { useRef } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { SplitText } from "gsap/SplitText";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, ScrollTrigger, SplitText);

// E13 · La portada se arma al scrollear. Los títulos suben renglón por renglón desde atrás de una
// máscara, las tarjetas de cada tramo entran en cascada, los números cuentan y la marquesina acelera
// con el scroll. Solo se anima lo que todavía no se vio: lo que ya está en pantalla queda quieto.
// Con "reducir movimiento" no corre nada de esto y la página se lee igual.
export function HomeMotion({ children }: { children: React.ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        const below = (element: Element) => element.getBoundingClientRect().top > window.innerHeight * 0.92;

        gsap.utils
          .toArray<HTMLElement>("[data-anim='titulo']")
          .filter(below)
          .forEach((title) => {
            SplitText.create(title, {
              type: "lines",
              mask: "lines",
              autoSplit: true,
              onSplit: (split) =>
                gsap.from(split.lines, {
                  yPercent: 108,
                  duration: 0.75,
                  ease: "power3.out",
                  stagger: 0.09,
                  scrollTrigger: { trigger: title, start: "top 88%", once: true },
                }),
            });
          });

        gsap.utils.toArray<HTMLElement>("[data-anim='grupo']").forEach((group) => {
          const items = (Array.from(group.children) as HTMLElement[]).filter(below);
          if (!items.length) return;
          // La primera tarjeta recorre más camino que las siguientes y los intervalos se acortan:
          // el grupo entra como una ola, no como un metrónomo.
          gsap.set(items, { autoAlpha: 0, y: (position: number) => 34 - Math.min(position, 4) * 4 });
          ScrollTrigger.batch(items, {
            start: "top 92%",
            once: true,
            onEnter: (batch) =>
              gsap.to(batch, {
                autoAlpha: 1,
                y: 0,
                duration: 0.65,
                ease: "power3.out",
                stagger: { each: 0.08, ease: "power1.in" },
                overwrite: true,
              }),
          });
        });

        gsap.utils
          .toArray<HTMLElement>("[data-anim='bloque']")
          .filter(below)
          .forEach((block) => {
            gsap.from(block, {
              autoAlpha: 0,
              y: 26,
              duration: 0.7,
              ease: "power3.out",
              scrollTrigger: { trigger: block, start: "top 90%", once: true },
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
        const track = root.current?.querySelector<HTMLElement>("[data-anim='marquesina']");
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
              gsap.to(rate, { value: self.direction < 0 ? -1 : 1, duration: 0.9, delay: 0.2, onUpdate: apply });
            },
          });
          return () => {
            animation.playbackRate = 1;
          };
        }
      });
    },
    { scope: root },
  );

  return <div ref={root}>{children}</div>;
}
