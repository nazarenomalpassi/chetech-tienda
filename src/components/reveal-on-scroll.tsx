"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

const selector = "[data-reveal]:not(.is-revealed)";

export function RevealOnScroll() {
  const pathname = usePathname();

  useEffect(() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    root.classList.add("reveal-enhanced");

    if (reducedMotion.matches || !("IntersectionObserver" in window)) {
      document.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        element.classList.add("is-revealed");
      });
      return;
    }

    const observed = new WeakSet<Element>();
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-revealed");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );

    const observe = (scope: ParentNode) => {
      scope.querySelectorAll<HTMLElement>(selector).forEach((element) => {
        if (observed.has(element)) return;
        observed.add(element);
        observer.observe(element);
      });
    };

    observe(document);
    const mutations = new MutationObserver((records) => {
      records.forEach((record) => {
        record.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          if (node.matches(selector) && !observed.has(node)) {
            observed.add(node);
            observer.observe(node);
          }
          observe(node);
        });
      });
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    return () => {
      mutations.disconnect();
      observer.disconnect();
    };
  }, [pathname]);

  return null;
}
