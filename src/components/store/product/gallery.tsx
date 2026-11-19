"use client";

import Image from "next/image";
import { ViewTransition, useEffect, useRef, useState } from "react";
import { isDirectVideo, lqip, markLoaded } from "@/lib/images";
import { clearPointerVars, writePointerVars } from "@/lib/pointer-vars";
import styles from "./gallery.module.css";

type Props = { slug: string; name: string; images: string[]; videoUrl?: string };

// Galería de la ficha. La foto principal comparte nombre con la de la tarjeta, así crece desde la
// grilla hasta acá al abrir el producto (E5).
export function ProductGallery({ slug, name, images, videoUrl: rawVideoUrl }: Props) {
  // Solo un archivo de video entra en la galería; Instagram y YouTube se muestran como enlace en la ficha.
  const videoUrl = isDirectVideo(rawVideoUrl) ? rawVideoUrl : undefined;
  const [active, setActive] = useState(0);
  const touch = useRef<number | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const frame = useRef(0);
  const total = images.length + (videoUrl ? 1 : 0);
  const showingVideo = Boolean(videoUrl) && active === images.length;

  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const move = (direction: 1 | -1) => {
    if (total < 2) return;
    setActive((value) => (value + direction + total) % total);
  };

  return (
    <div className={styles.gallery}>
      <div
        className={styles.stage}
        data-zoom={!showingVideo && Boolean(images[active])}
        onPointerMove={(event) => writePointerVars(event, bubble.current, frame)}
        onPointerLeave={() => clearPointerVars(bubble.current, frame)}
        onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touch.current === null) return;
          const delta = (event.changedTouches[0]?.clientX ?? 0) - touch.current;
          touch.current = null;
          if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1);
        }}
      >
        <ViewTransition name={`producto-${slug}`} share="morph">
          <div
            className={styles.bubble}
            ref={bubble}
            style={
              !showingVideo && images[active]
                ? ({ "--lqip": lqip(images[active]) } as React.CSSProperties)
                : undefined
            }
          >
            {showingVideo && videoUrl ? (
              <video className={styles.video} src={videoUrl} controls playsInline preload="metadata" aria-label={`Video de ${name}`} />
            ) : images[active] ? (
              <Image
                key={images[active]}
                src={images[active]}
                alt={active === 0 ? name : `${name}, foto ${active + 1}`}
                fill
                priority={active === 0}
                sizes="(min-width: 960px) 560px, 92vw"
                className={styles.image}
                onLoad={markLoaded}
              />
            ) : (
              <span className={styles.placeholder}>Foto en preparación</span>
            )}
            {/* El escáner vuelve a pasar con cada foto. */}
            {showingVideo ? null : <span key={active} className={styles.sweep} aria-hidden />}
          </div>
        </ViewTransition>
        {total > 1 ? (
          <p className={styles.counter} aria-live="polite">
            <span key={active} className={styles.counterNumber}>
              {active + 1}
            </span>{" "}
            de {total}
          </p>
        ) : null}
      </div>

      {total > 1 ? (
        <div className={styles.thumbs} role="group" aria-label="Fotos del producto">
          {images.map((image, index) => (
            <button
              key={image}
              type="button"
              className={styles.thumb}
              aria-label={`Ver foto ${index + 1}`}
              aria-pressed={active === index}
              onClick={() => setActive(index)}
            >
              <Image src={image} alt="" fill sizes="72px" />
            </button>
          ))}
          {videoUrl ? (
            <button
              type="button"
              className={`${styles.thumb} ${styles.videoThumb}`}
              aria-label="Ver video"
              aria-pressed={showingVideo}
              onClick={() => setActive(images.length)}
            >
              Video
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
