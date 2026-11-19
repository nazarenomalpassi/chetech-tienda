"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Search, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { needs } from "@/config/catalog";
import { formatPrice } from "@/lib/format";
import styles from "./search-overlay.module.css";

type Result = { slug: string; name: string; price: number; image: string | null; family: string; status: string };

// E8 · Buscador: se abre a pantalla completa y muestra resultados mientras se escribe.
export function SearchOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const listId = useId();

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focus = window.setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(focus);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    const term = query.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    setLoading(true);
    const timer = window.setTimeout(() => {
      fetch(`/api/search?q=${encodeURIComponent(term)}`, { signal: controller.signal })
        .then((response) => (response.ok ? response.json() : { results: [], total: 0 }))
        .then((payload: { results: Result[]; total: number }) => {
          setResults(payload.results);
          setTotal(payload.total);
        })
        .catch(() => undefined)
        .finally(() => setLoading(false));
    }, 140);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [query]);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const term = query.trim();
    onClose();
    router.push(term ? `/productos?buscar=${encodeURIComponent(term)}` : "/productos");
  };

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          className={styles.overlay}
          role="dialog"
          aria-modal="true"
          aria-label="Buscar"
          initial={reduce ? { opacity: 1 } : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          <motion.div
            className={styles.panel}
            initial={reduce ? false : { y: -16 }}
            animate={{ y: 0 }}
            exit={reduce ? undefined : { y: -16 }}
            transition={{ duration: 0.15, ease: [0.22, 1, 0.36, 1] }}
          >
            <form className={`page ${styles.form}`} role="search" onSubmit={submit}>
              <Search aria-hidden size={22} className={styles.icon} />
              <input
                ref={inputRef}
                type="search"
                className={styles.input}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Buscá un producto o el modelo de tu tele"
                aria-label="Buscar un producto o el modelo de tu tele"
                aria-controls={listId}
                autoComplete="off"
                enterKeyHint="search"
              />
              <button type="button" className={styles.close} onClick={onClose} aria-label="Cerrar buscador">
                <X aria-hidden size={22} />
              </button>
            </form>

            <div className={`page ${styles.body}`} id={listId} aria-live="polite">
              {query.trim().length < 2 ? (
                <div className={styles.suggestions}>
                  <p className={styles.label}>Lo que más se busca</p>
                  <ul>
                    {needs.map((need) => (
                      <li key={need.slug}>
                        <Link href={need.href ?? `/productos?necesidad=${need.slug}`} onClick={onClose}>
                          {need.label}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : results.length ? (
                <>
                  <ul className={styles.results}>
                    {results.map((result) => (
                      <li key={result.slug}>
                        <Link href={`/productos/${result.slug}`} onClick={onClose} className={styles.result}>
                          <span className={styles.thumb}>
                            {result.image ? <Image src={result.image} alt="" width={56} height={56} /> : null}
                          </span>
                          <span className={styles.resultText}>
                            <span className={styles.resultName}>{result.name}</span>
                            <span className={styles.resultMeta}>{result.family}</span>
                          </span>
                          <span className={`price ${styles.resultPrice}`}>{formatPrice(result.price)}</span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                  <button type="button" className="btn" data-variant="secondary" onClick={submit}>
                    Ver los {total} resultados
                  </button>
                </>
              ) : loading ? (
                <p className={styles.empty}>Buscando…</p>
              ) : (
                <div className={styles.empty}>
                  <p>No encontramos “{query.trim()}”.</p>
                  <p>
                    Si buscás un repuesto o una placa, mandanos el modelo por{" "}
                    <a
                      className="enlace"
                      href={`https://wa.me/5493571544683?text=${encodeURIComponent(`Hola, busco: ${query.trim()}`)}`}
                      target="_blank"
                      rel="noreferrer"
                    >
                      WhatsApp
                    </a>{" "}
                    y te decimos si lo tenemos.
                  </p>
                </div>
              )}
            </div>
          </motion.div>
          <button type="button" className={styles.scrim} aria-label="Cerrar buscador" onClick={onClose} tabIndex={-1} />
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
