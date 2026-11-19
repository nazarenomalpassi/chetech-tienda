"use client";

import Image from "next/image";
import { ViewTransition, useRef, useState } from "react";
import styles from "./gallery.module.css";

type Props = { slug: string; name: string; images: string[]; videoUrl?: string };

// Galería de la ficha. La foto principal comparte nombre con la de la tarjeta, así crece desde la
// grilla hasta acá al abrir el producto (E5).
export function ProductGallery({ slug, name, images, videoUrl }: Props) {
  const [active, setActive] = useState(0);
  const touch = useRef<number | null>(null);
  const total = images.length + (videoUrl ? 1 : 0);
  const showingVideo = Boolean(videoUrl) && active === images.length;

  const move = (direction: 1 | -1) => {
    if (total < 2) return;
    setActive((value) => (value + direction + total) % total);
  };

  return (
    <div className={styles.gallery}>
      <div
        className={styles.stage}
        onTouchStart={(event) => (touch.current = event.touches[0]?.clientX ?? null)}
        onTouchEnd={(event) => {
          if (touch.current === null) return;
          const delta = (event.changedTouches[0]?.clientX ?? 0) - touch.current;
          touch.current = null;
          if (Math.abs(delta) > 40) move(delta < 0 ? 1 : -1);
        }}
      >
        <ViewTransition name={`producto-${slug}`} share="morph">
          <div className={styles.bubble}>
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
              />
            ) : (
              <span className={styles.placeholder}>Foto en preparación</span>
            )}
          </div>
        </ViewTransition>
        {total > 1 ? (
          <p className={styles.counter} aria-live="polite">
            {active + 1} de {total}
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
