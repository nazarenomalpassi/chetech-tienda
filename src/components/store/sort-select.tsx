"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { CatalogSort } from "@/lib/types";
import styles from "./sort-select.module.css";

const options: { value: CatalogSort; label: string }[] = [
  { value: "popular", label: "Más vendidos" },
  { value: "recent", label: "Nuevos" },
  { value: "price-asc", label: "Menor precio" },
  { value: "price-desc", label: "Mayor precio" },
  { value: "name", label: "Nombre" },
];

export function SortSelect({ value }: { value: CatalogSort }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  return (
    <label className={styles.sort}>
      <span>Ordenar por</span>
      <select
        value={value}
        onChange={(event) => {
          const next = new URLSearchParams(searchParams.toString());
          if (event.target.value === "popular") next.delete("orden");
          else next.set("orden", event.target.value);
          next.delete("pagina");
          const query = next.toString();
          router.push(query ? `${pathname}?${query}` : pathname, { scroll: false });
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
