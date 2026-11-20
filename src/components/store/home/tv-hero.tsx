"use client";

import Image from "next/image";
import Link from "next/link";
import { Pause, Play } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "gsap";
import { ScrambleTextPlugin } from "gsap/ScrambleTextPlugin";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/lib/format";
import { trackEvent } from "@/lib/track";
import type { Product } from "@/lib/types";
import styles from "./tv-hero.module.css";

if (typeof window !== "undefined") gsap.registerPlugin(useGSAP, ScrollTrigger, ScrambleTextPlugin);

type Channel = { product: Product; line: string };

/** Segundos que queda cada oferta en pantalla antes de que el tele cambie solo de canal. */
const CHANNEL_SECONDS = 6;
const SHUTTERS = [0, 1, 2, 3, 4, 5];
const NOISE_WIDTH = 160;
const NOISE_HEIGHT = 100;

// E1 y E2 · El televisor de la portada. Se enciende, cambia solo de canal con un golpe de estática,
// la foto se abre en franjas diagonales (como las placas de la marca) y el aparato acompaña al mouse
// y al scroll. Con "reducir movimiento" queda quieto: el canal cambia solo cuando lo pide la persona.
export function TvHero({
  channels,
  title,
  children,
}: {
  channels: Channel[];
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const { add } = useCart();
  const [index, setIndex] = useState(0);
  const [auto, setAuto] = useState(true);
  const [announcement, setAnnouncement] = useState("");
  const [clock, setClock] = useState("");

  const root = useRef<HTMLElement>(null);
  const setRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const tiltRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLDivElement>(null);
  const noiseRef = useRef<HTMLCanvasElement>(null);
  const touchStart = useRef<number | null>(null);

  const indexRef = useRef(0);
  const tunedIndex = useRef(0);
  const tuneIn = useRef<gsap.core.Timeline | null>(null);
  const progress = useRef<gsap.core.Tween | null>(null);
  const noise = useRef<{ frames: ImageData[]; context: CanvasRenderingContext2D | null; tick: (() => void) | null }>({
    frames: [],
    context: null,
    tick: null,
  });
  // Motivos para frenar el cambio automático: fuera de pantalla, pestaña oculta, mouse o foco encima.
  const hold = useRef({ offscreen: false, hidden: false, hover: false, focus: false });

  const total = channels.length;
  const current = channels[index];

  const syncPlayback = useCallback(() => {
    const state = hold.current;
    progress.current?.paused(state.offscreen || state.hidden || state.hover || state.focus);
  }, []);

  const go = useCallback(
    (direction: 1 | -1, manual: boolean) => {
      if (total < 2) return;
      const next = (indexRef.current + direction + total) % total;
      indexRef.current = next;
      setIndex(next);
      // El lector de pantalla anuncia solo los cambios que pide la persona, no los automáticos.
      if (manual) {
        const channel = channels[next];
        setAnnouncement(`Canal ${next + 1}: ${channel.product.name}, ${formatPrice(channel.product.price)}`);
      }
    },
    [channels, total],
  );

  // Reloj del menú en pantalla: la hora real, como en cualquier tele.
  useEffect(() => {
    const tick = () =>
      setClock(new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()));
    const first = window.requestAnimationFrame(tick);
    const timer = window.setInterval(tick, 20_000);
    return () => {
      window.cancelAnimationFrame(first);
      window.clearInterval(timer);
    };
  }, []);

  // Con la pestaña oculta el tele no gasta batería cambiando de canal.
  useEffect(() => {
    const onVisibility = () => {
      hold.current.hidden = document.hidden;
      syncPlayback();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [syncPlayback]);

  // Montaje: scroll, inclinación con el mouse y pausa cuando el tele sale de la pantalla.
  useGSAP(
    () => {
      const section = root.current;
      const set = setRef.current;
      const tilt = tiltRef.current;
      const scroller = scrollRef.current;
      if (!section || !set || !tilt || !scroller) return;

      ScrollTrigger.create({
        trigger: section,
        start: "top bottom",
        end: "bottom top",
        onToggle: (self) => {
          hold.current.offscreen = !self.isActive;
          syncPlayback();
        },
      });

      const media = gsap.matchMedia();

      media.add("(prefers-reduced-motion: no-preference)", () => {
        // Al scrollear, el tele se recuesta y las formas de atrás se mueven más lento que la página.
        const scrollTrigger = { trigger: section, start: 0, end: () => `+=${section.offsetHeight}`, scrub: 0.5 };
        gsap.to(scroller, { yPercent: -4, rotationX: 10, scale: 0.95, ease: "none", scrollTrigger });
        gsap.to("[data-stage='formas']", { yPercent: 16, ease: "none", scrollTrigger: { ...scrollTrigger } });
      });

      media.add("(prefers-reduced-motion: no-preference) and (hover: hover) and (pointer: fine)", () => {
        // El aparato sigue al mouse: se inclina unos grados y el reflejo cruza la pantalla.
        const rotateX = gsap.quickTo(tilt, "rotationX", { duration: 0.7, ease: "power3" });
        const rotateY = gsap.quickTo(tilt, "rotationY", { duration: 0.7, ease: "power3" });
        const glare = gsap.quickTo("[data-tv='reflejo']", "xPercent", { duration: 0.9, ease: "power3" });
        let box = set.getBoundingClientRect();
        const enter = () => {
          box = set.getBoundingClientRect();
        };
        const move = (event: PointerEvent) => {
          const x = (event.clientX - box.left) / box.width - 0.5;
          const y = (event.clientY - box.top) / box.height - 0.5;
          rotateY(x * 10);
          rotateX(y * -7);
          glare(x * 70);
        };
        const leave = () => {
          rotateX(0);
          rotateY(0);
          glare(0);
        };
        set.addEventListener("pointerenter", enter);
        set.addEventListener("pointermove", move);
        set.addEventListener("pointerleave", leave);
        return () => {
          set.removeEventListener("pointerenter", enter);
          set.removeEventListener("pointermove", move);
          set.removeEventListener("pointerleave", leave);
        };
      });

      return () => {
        const state = noise.current;
        if (state.tick) gsap.ticker.remove(state.tick);
      };
    },
    { scope: root },
  );

  // Cada canal nuevo: estática, salto de imagen, franjas que se abren y textos que entran.
  useGSAP(
    () => {
      const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const changed = tunedIndex.current !== index;
      tunedIndex.current = index;
      progress.current?.kill();
      progress.current = null;

      const segments = gsap.utils.toArray<HTMLElement>("[data-tv='tramo']");
      gsap.set(segments, { scaleX: (position: number) => (position < index ? 1 : 0) });

      if (reduce) {
        if (segments[index]) gsap.set(segments[index], { scaleX: 1 });
        return;
      }

      if (auto && total > 1 && segments[index]) {
        progress.current = gsap.fromTo(
          segments[index],
          { scaleX: 0 },
          { scaleX: 1, duration: CHANNEL_SECONDS, ease: "none", onComplete: () => go(1, false) },
        );
        syncPlayback();
      } else if (segments[index]) {
        gsap.set(segments[index], { scaleX: 1 });
      }

      // El primer canal ya viene dibujado desde el servidor (lo recibe el encendido, no la estática),
      // y pausar o reanudar no cambia de canal.
      if (!changed) return;
      tuneIn.current?.kill();

      const state = noise.current;
      const canvas = noiseRef.current;
      if (canvas && !state.context) {
        canvas.width = NOISE_WIDTH;
        canvas.height = NOISE_HEIGHT;
        state.context = canvas.getContext("2d");
        if (state.context) {
          for (let frame = 0; frame < 5; frame += 1) {
            const image = state.context.createImageData(NOISE_WIDTH, NOISE_HEIGHT);
            for (let pixel = 0; pixel < image.data.length; pixel += 4) {
              const value = Math.floor(Math.random() * 256);
              image.data[pixel] = value;
              image.data[pixel + 1] = value;
              image.data[pixel + 2] = value;
              image.data[pixel + 3] = 255;
            }
            state.frames.push(image);
          }
        }
      }
      const stopNoise = () => {
        if (state.tick) gsap.ticker.remove(state.tick);
        state.tick = null;
      };
      stopNoise();
      if (state.context && state.frames.length) {
        let step = 0;
        state.tick = () => {
          step += 1;
          // Un cuadro de nieve cada dos refrescos, corrido en vertical para que no se repita.
          if (step % 2 === 0 && state.context)
            state.context.putImageData(state.frames[(step / 2) % state.frames.length], 0, -((step * 7) % 20));
        };
        gsap.ticker.add(state.tick);
      }

      const price = current?.product.price ?? 0;
      const counter = { value: Math.round(price * 0.55) };
      const priceNode = root.current?.querySelector<HTMLElement>("[data-tv='precio']");
      const rounding = price >= 10_000 ? 500 : 50;

      tuneIn.current = gsap
        .timeline({ defaults: { ease: "power3.out" }, onComplete: stopNoise, onInterrupt: stopNoise })
        .set("[data-tv='nieve']", { autoAlpha: 1 })
        .fromTo("[data-tv='imagen']", { yPercent: -9 }, { yPercent: 0, duration: 0.24, ease: "steps(3)" }, 0)
        .to("[data-tv='nieve']", { autoAlpha: 0, duration: 0.34, ease: "power1.in" }, 0.1)
        .fromTo("[data-stage='luz']", { opacity: 1, scale: 1.12 }, { opacity: 0.55, scale: 1, duration: 1.1 }, 0)
        .fromTo("[data-tv='canal']", { scale: 1.9 }, { scale: 1, duration: 0.5, delay: 0.5 }, 0)
        .fromTo(
          "[data-tv='franja']",
          { scaleY: 1 },
          { scaleY: 0, duration: 0.6, ease: "power3.inOut", stagger: 0.05 },
          0.12,
        )
        .fromTo(
          "[data-tv='texto'] > *",
          { y: 18, autoAlpha: 0 },
          { y: 0, autoAlpha: 1, duration: 0.5, stagger: 0.07 },
          0.22,
        )
        .to(
          "[data-tv='linea']",
          { duration: 0.8, ease: "none", scrambleText: { text: current?.line ?? "", chars: "upperCase", speed: 0.5 } },
          0.22,
        )
        .to(
          counter,
          {
            value: price,
            duration: 0.75,
            ease: "power2.out",
            onUpdate: () => {
              if (priceNode) priceNode.textContent = formatPrice(Math.round(counter.value / rounding) * rounding);
            },
            onComplete: () => {
              if (priceNode) priceNode.textContent = formatPrice(price);
            },
          },
          0.3,
        );
    },
    { dependencies: [index, auto], scope: root },
  );

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1, true);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1, true);
    }
  };

  const buy = () => {
    if (!current) return;
    add(current.product, 1, { origin: imageRef.current?.getBoundingClientRect() ?? null });
    trackEvent("add_to_cart", {
      value: current.product.price,
      items: [{ id: current.product.id, name: current.product.name, price: current.product.price, family: current.product.familyName }],
    });
  };

  const setHold = (reason: "hover" | "focus", value: boolean) => {
    hold.current[reason] = value;
    syncPlayback();
  };

  return (
    <section
      className={`oscuro ${styles.hero}`}
      aria-labelledby="hero-titulo"
      ref={root}
      // El botón de pausa del tele frena todo lo que se mueve solo en la portada: también la marquesina.
      data-movimiento={auto ? undefined : "pausado"}
    >
      <div className={`page ${styles.grid}`}>
        <div className={styles.title}>{title}</div>
        <div className={styles.copy}>{children}</div>

        <div
          className={styles.set}
          ref={setRef}
          onPointerEnter={(event) => event.pointerType === "mouse" && setHold("hover", true)}
          onPointerLeave={() => setHold("hover", false)}
          onFocus={(event) => setHold("focus", event.target.matches(":focus-visible"))}
          onBlur={() => setHold("focus", false)}
        >
          {/* Detrás del aparato, las formas en chaflán de las placas de la marca y la luz de la pantalla. */}
          <div className={styles.stage} aria-hidden>
            <div className={styles.shapes} data-stage="formas">
              <svg className={styles.shapeA} viewBox="0 0 600 520" fill="none">
                <path d="M150 35H450L565 150V370L450 485H150L35 370V150Z" strokeWidth="70" />
              </svg>
              <svg className={styles.shapeB} viewBox="0 0 460 400" fill="none">
                <path d="M120 30H340L430 120V280L340 370H120L30 280V120Z" strokeWidth="54" />
              </svg>
              <svg className={styles.traces} viewBox="0 0 900 700" fill="none">
                <g className={styles.traceBase}>
                  <path d="M0 630H170L236 564V470" />
                  <path d="M900 120H770L706 56V0" />
                  <path d="M40 0V96L96 152H190" />
                  <path d="M900 520H800L740 580V700" />
                </g>
                <g className={styles.tracePulse}>
                  <path pathLength="100" d="M0 630H170L236 564V470" />
                  <path pathLength="100" d="M900 120H770L706 56V0" />
                  <path pathLength="100" d="M40 0V96L96 152H190" />
                  <path pathLength="100" d="M900 520H800L740 580V700" />
                </g>
                <g className={styles.traceNodes}>
                  <rect x="232" y="462" width="8" height="8" />
                  <rect x="186" y="148" width="8" height="8" />
                  <rect x="702" y="-4" width="8" height="8" />
                  <rect x="736" y="576" width="8" height="8" />
                </g>
              </svg>
            </div>
            <span className={styles.light} data-stage="luz" />
          </div>

          <div className={styles.scroll} ref={scrollRef}>
            <div className={styles.tilt} ref={tiltRef}>
              <div className={styles.float}>
                <div
                  className={styles.tv}
                  role="region"
                  aria-roledescription="televisor con ofertas"
                  aria-label={current ? `Canal ${index + 1} de ${total}: ${current.product.name}` : "Ofertas"}
                  tabIndex={0}
                  onKeyDown={onKeyDown}
                  onTouchStart={(event) => (touchStart.current = event.touches[0]?.clientX ?? null)}
                  onTouchEnd={(event) => {
                    if (touchStart.current === null) return;
                    const delta = (event.changedTouches[0]?.clientX ?? 0) - touchStart.current;
                    touchStart.current = null;
                    if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1, true);
                  }}
                >
                  <div className={styles.screen}>
                    <div className={styles.power} aria-hidden>
                      <span className={styles.powerLine} />
                      <span className={styles.powerCarta} />
                    </div>

                    {current ? (
                      <div className={styles.channel} data-tv="imagen">
                        <div className={styles.picture} ref={imageRef}>
                          {channels.map((channel, position) =>
                            channel.product.image ? (
                              <Image
                                key={channel.product.id}
                                src={channel.product.image}
                                alt={position === index ? channel.product.name : ""}
                                fill
                                priority={position === 0}
                                sizes="(min-width: 960px) 280px, 42vw"
                                data-active={position === index}
                              />
                            ) : null,
                          )}
                          <span className={styles.shutters} aria-hidden>
                            {SHUTTERS.map((shutter) => (
                              <span key={shutter} data-tv="franja" />
                            ))}
                          </span>
                        </div>
                        <div className={styles.info} data-tv="texto" key={current.product.id}>
                          <p className={styles.line} data-tv="linea">
                            {current.line}
                          </p>
                          <Link href={`/productos/${current.product.slug}`} className={styles.name}>
                            {current.product.name}
                          </Link>
                          <p className={styles.priceRow}>
                            <span className={`price ${styles.price}`} data-tv="precio">
                              {formatPrice(current.product.price)}
                            </span>
                            {current.product.previousPrice ? (
                              <s className={styles.before}>{formatPrice(current.product.previousPrice)}</s>
                            ) : null}
                          </p>
                          <button type="button" className="btn" onClick={buy}>
                            Comprar
                          </button>
                        </div>
                      </div>
                    ) : null}

                    {total > 1 ? (
                      <div className={styles.segments} aria-hidden>
                        {channels.map((channel) => (
                          <span key={channel.product.id}>
                            <i data-tv="tramo" />
                          </span>
                        ))}
                      </div>
                    ) : null}
                    <div className={styles.osd} aria-hidden>
                      <span className={styles.osdChannel} data-tv="canal">
                        CH {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className={styles.signal}>
                        <i />
                        <i />
                        <i />
                        <i />
                      </span>
                      <span className={styles.clock}>{clock}</span>
                    </div>

                    <canvas className={styles.noise} data-tv="nieve" ref={noiseRef} aria-hidden />
                    <span className={styles.scanlines} aria-hidden />
                    <span className={styles.sweep} aria-hidden />
                    <span className={styles.glare} data-tv="reflejo" aria-hidden />
                  </div>
                  <span className={styles.led} aria-hidden />
                </div>
                <span className={styles.base} aria-hidden />
              </div>
            </div>
          </div>

          {total > 1 ? (
            <div className={styles.remote} role="group" aria-label="Control del televisor">
              <button type="button" onClick={() => go(-1, true)} aria-label="P−: canal anterior">
                P−
              </button>
              <button type="button" className={styles.ok} onClick={buy} aria-label={current ? `OK: comprar ${current.product.name}` : "OK: comprar"}>
                OK
              </button>
              <button type="button" onClick={() => go(1, true)} aria-label="P+: canal siguiente">
                P+
              </button>
              <button
                type="button"
                className={styles.toggle}
                onClick={() => setAuto((value) => !value)}
                aria-label={auto ? "Pausar el movimiento" : "Reanudar el movimiento"}
              >
                {auto ? <Pause aria-hidden size={16} /> : <Play aria-hidden size={16} />}
              </button>
            </div>
          ) : null}
          <p className="visually-hidden" aria-live="polite">
            {announcement}
          </p>
        </div>
      </div>
    </section>
  );
}
