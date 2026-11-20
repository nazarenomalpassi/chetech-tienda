"use client";

import { Minus, Plus } from "lucide-react";
import { useState } from "react";

export type ServiceAccordionItem = {
  id: string;
  eyebrow?: string;
  title: string;
  summary?: string;
  details: readonly string[];
};

type ServiceAccordionProps = {
  ariaLabel: string;
  idPrefix: string;
  items: readonly ServiceAccordionItem[];
  initialOpen?: number | null;
  variant?: "process" | "faq";
};

export function ServiceAccordion({
  ariaLabel,
  idPrefix,
  items,
  initialOpen = null,
  variant = "faq",
}: ServiceAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(initialOpen);

  return (
    <div
      className={`service-tech-accordion service-tech-accordion--${variant}`}
      role="group"
      aria-label={ariaLabel}
      data-anim="grupo"
    >
      {items.map((item, index) => {
        const expanded = openIndex === index;
        const buttonId = `${idPrefix}-button-${item.id}`;
        const panelId = `${idPrefix}-panel-${item.id}`;

        return (
          <article className={expanded ? "is-open" : undefined} key={item.id}>
            <h3>
              <button
                id={buttonId}
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => setOpenIndex(expanded ? null : index)}
              >
                <span className="service-tech-accordion-copy">
                  {item.eyebrow && <span>{item.eyebrow}</span>}
                  <strong>{item.title}</strong>
                  {item.summary && <small>{item.summary}</small>}
                </span>
                <span className="service-tech-accordion-icon" aria-hidden="true">
                  {expanded ? <Minus /> : <Plus />}
                </span>
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={buttonId}
              className="service-tech-accordion-panel"
              hidden={!expanded}
            >
              {item.details.length === 1 ? (
                <p>{item.details[0]}</p>
              ) : (
                <ul>
                  {item.details.map((detail) => (
                    <li key={detail}>{detail}</li>
                  ))}
                </ul>
              )}
            </div>
          </article>
        );
      })}
    </div>
  );
}
