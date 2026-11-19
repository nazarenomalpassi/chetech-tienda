"use client";

import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useCart } from "@/components/cart-provider";
import { formatPrice } from "@/lib/format";
import { trackEvent } from "@/lib/track";
import type { Product } from "@/lib/types";
import styles from "./tv-hero.module.css";

type Channel = { product: Product; line: string };

export function TvHero({
  channels,
  title,
  children,
}: {
  channels: Channel[];
  title: React.ReactNode;
  children: React.ReactNode;
}) {
  const reduce = useReducedMotion();
  const { add } = useCart();
  const [index, setIndex] = useState(0);
  const [badgeVisible, setBadgeVisible] = useState(false);
  const imageRef = useRef<HTMLDivElement>(null);
  const touchStart = useRef<number | null>(null);
  const badgeTimer = useRef<number | undefined>(undefined);
  const total = channels.length;
  const current = channels[index];

  const go = useCallback(
    (direction: 1 | -1) => {
      if (total < 2) return;
      setIndex((value) => (value + direction + total) % total);
      setBadgeVisible(true);
      window.clearTimeout(badgeTimer.current);
      badgeTimer.current = window.setTimeout(() => setBadgeVisible(false), 1500);
    },
    [total],
  );

  useEffect(() => () => window.clearTimeout(badgeTimer.current), []);

  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      go(1);
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      go(-1);
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

  return (
    <section className={styles.hero} aria-labelledby="hero-titulo">
      <div className={`page ${styles.grid}`}>
        <div className={styles.title}>{title}</div>
        <div className={styles.copy}>{children}</div>

        <div className={styles.set}>
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
              if (Math.abs(delta) > 40) go(delta < 0 ? 1 : -1);
            }}
          >
            <div className={styles.screen}>
              <div className={styles.power} aria-hidden>
                <span className={styles.powerLine} />
                <span className={`carta ${styles.powerCarta}`} />
              </div>
              <span className={styles.scanlines} aria-hidden />

              {current ? (
                <AnimatePresence mode="popLayout" initial={false}>
                  <motion.div
                    key={current.product.id}
                    className={styles.channel}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, scaleY: 0.96, filter: "brightness(1.8)" }}
                    animate={{ opacity: 1, scaleY: 1, filter: "brightness(1)" }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, scaleY: 0.96 }}
                    transition={{ duration: reduce ? 0.1 : 0.18, ease: "easeOut" }}
                  >
                    <div className={styles.channelImage} ref={imageRef}>
                      {current.product.image ? (
                        <Image
                          src={current.product.image}
                          alt={current.product.name}
                          fill
                          priority={index === 0}
                          sizes="(min-width: 960px) 260px, 40vw"
                        />
                      ) : null}
                    </div>
                    <div className={styles.channelText}>
                      <p className={styles.line}>{current.line}</p>
                      <Link href={`/productos/${current.product.slug}`} className={styles.name}>
                        {current.product.name}
                      </Link>
                      <p className={styles.priceRow}>
                        <span className={`price ${styles.price}`}>{formatPrice(current.product.price)}</span>
                        {current.product.previousPrice ? (
                          <s className={styles.before}>{formatPrice(current.product.previousPrice)}</s>
                        ) : null}
                      </p>
                      <button type="button" className="btn" data-variant="screen" onClick={buy}>
                        Comprar
                      </button>
                    </div>
                  </motion.div>
                </AnimatePresence>
              ) : null}

              <span className={styles.badge} data-visible={badgeVisible} aria-hidden>
                Canal {index + 1}
              </span>
            </div>
            <span className={styles.led} aria-hidden />
          </div>

          {total > 1 ? (
            <div className={styles.remote} role="group" aria-label="Cambiar de canal">
              <button type="button" onClick={() => go(-1)} aria-label="Canal anterior">
                P−
              </button>
              <button type="button" className={styles.ok} onClick={buy} aria-label={current ? `Comprar ${current.product.name}` : "Comprar"}>
                OK
              </button>
              <button type="button" onClick={() => go(1)} aria-label="Canal siguiente">
                P+
              </button>
              <div className={styles.dots} aria-hidden>
                {channels.map((channel, dot) => (
                  <span key={channel.product.id} data-active={dot === index} />
                ))}
              </div>
            </div>
          ) : null}
          <p className="visually-hidden" aria-live="polite">
            {current ? `Canal ${index + 1}: ${current.product.name}, ${formatPrice(current.product.price)}` : ""}
          </p>
        </div>
      </div>
    </section>
  );
}
