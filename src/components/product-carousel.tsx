"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
} from "react";
import { ProductCard } from "@/components/product-card";
import type { Product } from "@/lib/types";

type CarouselMetrics = {
  firstOffset: number;
  step: number;
  visibleCount: number;
  maxIndex: number;
};

type DragState = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startScrollLeft: number;
  moved: boolean;
};

const INITIAL_METRICS: CarouselMetrics = {
  firstOffset: 0,
  step: 1,
  visibleCount: 1,
  maxIndex: 0,
};

const INTERACTION_PAUSE_MS = 3600;

export function ProductCarousel({
  products,
  intervalMs = 3200,
  className = "",
  ariaLabel = "Productos destacados",
}: {
  products: Product[];
  intervalMs?: number;
  className?: string;
  ariaLabel?: string;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const resumeTimerRef = useRef<number | undefined>(undefined);
  const scrollFrameRef = useRef<number | undefined>(undefined);
  const [metrics, setMetrics] = useState<CarouselMetrics>(INITIAL_METRICS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [hoverPaused, setHoverPaused] = useState(false);
  const [focusPaused, setFocusPaused] = useState(false);
  const [interactionPaused, setInteractionPaused] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [documentHidden, setDocumentHidden] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);

  const pauseTemporarily = useCallback((duration = INTERACTION_PAUSE_MS) => {
    setInteractionPaused(true);
    if (resumeTimerRef.current !== undefined) {
      window.clearTimeout(resumeTimerRef.current);
    }
    resumeTimerRef.current = window.setTimeout(() => {
      resumeTimerRef.current = undefined;
      setInteractionPaused(false);
    }, duration);
  }, []);

  const scrollToIndex = useCallback(
    (requestedIndex: number, behavior?: ScrollBehavior) => {
      const viewport = viewportRef.current;
      if (!viewport) return;

      const index = Math.min(Math.max(requestedIndex, 0), metrics.maxIndex);
      viewport.scrollTo({
        left: metrics.firstOffset + metrics.step * index,
        behavior: behavior ?? (reducedMotion ? "auto" : "smooth"),
      });
      setCurrentIndex(index);
    },
    [metrics.firstOffset, metrics.maxIndex, metrics.step, reducedMotion],
  );

  const showPrevious = useCallback(
    (manual = true) => {
      if (metrics.maxIndex === 0) return;
      if (manual) pauseTemporarily();
      const previousIndex = currentIndex <= 0 ? metrics.maxIndex : currentIndex - 1;
      scrollToIndex(previousIndex);
    },
    [currentIndex, metrics.maxIndex, pauseTemporarily, scrollToIndex],
  );

  const showNext = useCallback(
    (manual = true) => {
      if (metrics.maxIndex === 0) return;
      if (manual) pauseTemporarily();
      const nextIndex = currentIndex >= metrics.maxIndex ? 0 : currentIndex + 1;
      scrollToIndex(nextIndex);
    },
    [currentIndex, metrics.maxIndex, pauseTemporarily, scrollToIndex],
  );

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
    const viewport = viewportRef.current;
    if (!viewport) return;

    const measure = () => {
      const slides = Array.from(
        viewport.querySelectorAll<HTMLElement>("[data-product-carousel-slide]"),
      );

      if (slides.length === 0) {
        setMetrics(INITIAL_METRICS);
        setCurrentIndex(0);
        return;
      }

      const firstOffset = slides[0].offsetLeft;
      const firstWidth = Math.max(slides[0].getBoundingClientRect().width, 1);
      const step =
        slides.length > 1
          ? Math.max(slides[1].offsetLeft - slides[0].offsetLeft, firstWidth)
          : firstWidth;
      const gap = Math.max(step - firstWidth, 0);
      const visibleCount = Math.max(
        1,
        Math.min(slides.length, Math.floor((viewport.clientWidth + gap + 0.5) / step)),
      );
      const maxIndex = Math.max(0, slides.length - visibleCount);
      const nextMetrics = { firstOffset, step, visibleCount, maxIndex };

      setMetrics(nextMetrics);
      setCurrentIndex((index) => {
        const clampedIndex = Math.min(index, maxIndex);
        if (clampedIndex !== index) {
          viewport.scrollTo({
            left: firstOffset + step * clampedIndex,
            behavior: "auto",
          });
        }
        return clampedIndex;
      });
    };

    measure();

    const resizeObserver =
      typeof ResizeObserver === "undefined" ? undefined : new ResizeObserver(measure);
    resizeObserver?.observe(viewport);

    const firstSlide = viewport.querySelector<HTMLElement>("[data-product-carousel-slide]");
    if (firstSlide) resizeObserver?.observe(firstSlide);

    window.addEventListener("resize", measure);
    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [products.length]);

  useEffect(() => {
    if (
      products.length < 2 ||
      metrics.maxIndex === 0 ||
      reducedMotion ||
      documentHidden ||
      hoverPaused ||
      focusPaused ||
      interactionPaused ||
      dragging
    ) {
      return;
    }

    const timeout = window.setTimeout(() => showNext(false), intervalMs);
    return () => window.clearTimeout(timeout);
  }, [
    currentIndex,
    documentHidden,
    dragging,
    focusPaused,
    hoverPaused,
    interactionPaused,
    intervalMs,
    metrics.maxIndex,
    products.length,
    reducedMotion,
    showNext,
  ]);

  useEffect(
    () => () => {
      if (resumeTimerRef.current !== undefined) {
        window.clearTimeout(resumeTimerRef.current);
      }
      if (scrollFrameRef.current !== undefined) {
        window.cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );

  const syncIndexFromScroll = () => {
    const viewport = viewportRef.current;
    if (!viewport || metrics.step <= 0) return;

    if (scrollFrameRef.current !== undefined) {
      window.cancelAnimationFrame(scrollFrameRef.current);
    }
    scrollFrameRef.current = window.requestAnimationFrame(() => {
      scrollFrameRef.current = undefined;
      const rawIndex = Math.round((viewport.scrollLeft - metrics.firstOffset) / metrics.step);
      setCurrentIndex(Math.min(Math.max(rawIndex, 0), metrics.maxIndex));
    });
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;

    dragRef.current = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startScrollLeft: event.currentTarget.scrollLeft,
      moved: false,
    };
    setDragging(true);
    setInteractionPaused(true);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;

    const distance = event.clientX - drag.startX;
    if (Math.abs(distance) > 3) {
      drag.moved = true;
    }
    if (drag.pointerType === "touch") return;

    if (drag.moved && !event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    event.currentTarget.scrollLeft = drag.startScrollLeft - distance;
    event.preventDefault();
  };

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    dragRef.current = null;
    setDragging(false);
    pauseTemporarily();

    if (!drag || drag.pointerId !== event.pointerId) return;
    suppressClickRef.current = drag.moved;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    const rawIndex = Math.round(
      (event.currentTarget.scrollLeft - metrics.firstOffset) / metrics.step,
    );
    scrollToIndex(rawIndex);
  };

  const cancelDrag = (event: PointerEvent<HTMLDivElement>) => {
    dragRef.current = null;
    setDragging(false);
    pauseTemporarily();
    suppressClickRef.current = false;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (
      target !== event.currentTarget &&
      target.matches("a, button, input, select, textarea, [contenteditable='true']")
    ) {
      return;
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      showPrevious();
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      showNext();
    }
  };

  if (products.length === 0) return null;

  const hasOverflow = metrics.maxIndex > 0;

  return (
    <div
      className={`product-carousel ${className} ${dragging ? "is-dragging" : ""}`.trim()}
      role="region"
      aria-roledescription="carrusel"
      aria-label={ariaLabel}
      data-reveal
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onMouseEnter={() => setHoverPaused(true)}
      onMouseLeave={() => setHoverPaused(false)}
      onFocusCapture={() => setFocusPaused(true)}
      onBlurCapture={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setFocusPaused(false);
        }
      }}
    >
      <div className="product-carousel-toolbar" role="group" aria-label="Controles del carrusel">
        <button
          type="button"
          className="product-carousel-arrow product-carousel-arrow-prev"
          aria-label="Mostrar productos anteriores"
          disabled={!hasOverflow}
          onClick={() => showPrevious()}
        >
          <ChevronLeft aria-hidden="true" />
        </button>
        <button
          type="button"
          className="product-carousel-arrow product-carousel-arrow-next"
          aria-label="Mostrar productos siguientes"
          disabled={!hasOverflow}
          onClick={() => showNext()}
        >
          <ChevronRight aria-hidden="true" />
        </button>
      </div>

      <div
        ref={viewportRef}
        className="product-carousel-viewport"
        onScroll={syncIndexFromScroll}
        onWheel={() => pauseTemporarily()}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={finishDrag}
        onPointerCancel={cancelDrag}
        onClickCapture={(event) => {
          if (!suppressClickRef.current) return;
          suppressClickRef.current = false;
          event.preventDefault();
          event.stopPropagation();
        }}
      >
        <div className="product-carousel-track">
          {products.map((product, index) => (
            <div
              key={product.id}
              className="product-carousel-slide"
              data-product-carousel-slide
              role="group"
              aria-label={`${index + 1} de ${products.length}`}
            >
              <ProductCard
                product={product}
                sizes="(max-width: 600px) 84vw, (max-width: 900px) 50vw, (max-width: 1180px) 33vw, 25vw"
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
