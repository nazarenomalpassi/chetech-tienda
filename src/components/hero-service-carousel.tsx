"use client";

import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./hero-service-carousel.module.css";

const serviceSlides = [
  {
    src: "/brand/servicio-computadoras.jpg",
    alt: "Reparación de computadoras y notebooks en Chetech",
  },
  {
    src: "/brand/servicio-televisores.jpg",
    alt: "Reparación de televisores en Chetech",
  },
  {
    src: "/brand/servicio-electrodomesticos.jpg",
    alt: "Reparación de electrodomésticos en Chetech",
  },
] as const;

type SwipeStart = {
  pointerId: number;
  x: number;
  y: number;
};

export function HeroServiceCarousel({
  intervalMs = 3000,
  className = "",
}: {
  intervalMs?: number;
  className?: string;
}) {
  const [activeSlide, setActiveSlide] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [pointerPaused, setPointerPaused] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const swipeStartRef = useRef<SwipeStart | null>(null);

  const showPrevious = useCallback(() => {
    setActiveSlide((current) => (current - 1 + serviceSlides.length) % serviceSlides.length);
  }, []);

  const showNext = useCallback(() => {
    setActiveSlide((current) => (current + 1) % serviceSlides.length);
  }, []);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    const syncEnvironment = () => {
      setReducedMotion(mediaQuery.matches);
      setDocumentHidden(document.hidden);
    };

    syncEnvironment();
    document.addEventListener("visibilitychange", syncEnvironment);
    mediaQuery.addEventListener("change", syncEnvironment);

    return () => {
      document.removeEventListener("visibilitychange", syncEnvironment);
      mediaQuery.removeEventListener("change", syncEnvironment);
    };
  }, []);

  useEffect(() => {
    if (
      reducedMotion ||
      documentHidden ||
      hoverPaused ||
      focusPaused ||
      pointerPaused ||
      serviceSlides.length < 2
    ) {
      return;
    }

    const timeout = window.setTimeout(showNext, intervalMs);
    return () => window.clearTimeout(timeout);
  }, [
    activeSlide,
    documentHidden,
    focusPaused,
    hoverPaused,
    intervalMs,
    pointerPaused,
    reducedMotion,
    showNext,
  ]);

  const finishSwipe = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = swipeStartRef.current;
    swipeStartRef.current = null;
    setPointerPaused(false);

    if (!start || start.pointerId !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const horizontalDistance = event.clientX - start.x;
    const verticalDistance = event.clientY - start.y;
    const isHorizontalSwipe =
      Math.abs(horizontalDistance) >= 44 &&
      Math.abs(horizontalDistance) > Math.abs(verticalDistance) * 1.15;

    if (!isHorizontalSwipe) return;
    if (horizontalDistance > 0) showPrevious();
    else showNext();
  };

  return (
    <div
      className={`${styles.carousel} ${className}`.trim()}
      role="region"
      aria-roledescription="carrusel"
      aria-label="Servicios de reparación de Chetech"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          showPrevious();
        } else if (event.key === "ArrowRight") {
          event.preventDefault();
          showNext();
        }
      }}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setFocusPaused(false);
        }
      }}
      onPointerDown={(event) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        if ((event.target as Element).closest("button")) return;
        swipeStartRef.current = {
          pointerId: event.pointerId,
          x: event.clientX,
          y: event.clientY,
        };
        setPointerPaused(true);
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerUp={finishSwipe}
      onPointerCancel={(event) => {
        swipeStartRef.current = null;
        setPointerPaused(false);
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
      }}
      onDragStart={(event) => event.preventDefault()}
    >
      {serviceSlides.map((slide, index) => (
        <Image
          key={slide.src}
          src={slide.src}
          fill
          priority={index === 0}
          loading={index === 0 ? "eager" : "lazy"}
          sizes="(max-width: 900px) 100vw, 40vw"
          alt={slide.alt}
          aria-hidden={index !== activeSlide}
          draggable={false}
          className={styles.slide}
          data-active={index === activeSlide}
        />
      ))}

      <button
        type="button"
        className={`${styles.arrow} ${styles.prev}`}
        aria-label="Mostrar servicio anterior"
        onClick={showPrevious}
      >
        <ChevronLeft aria-hidden="true" />
      </button>
      <button
        type="button"
        className={`${styles.arrow} ${styles.next}`}
        aria-label="Mostrar servicio siguiente"
        onClick={showNext}
      >
        <ChevronRight aria-hidden="true" />
      </button>

      <div className={styles.dots} role="group" aria-label="Elegir servicio">
          {serviceSlides.map((slide, index) => (
            <button
              key={slide.src}
              type="button"
              className={styles.dot}
              aria-label={`Mostrar: ${slide.alt}`}
              aria-pressed={index === activeSlide}
              onClick={() => setActiveSlide(index)}
            />
          ))}
      </div>
    </div>
  );
}
