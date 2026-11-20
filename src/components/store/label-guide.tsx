import styles from "./label-guide.module.css";

// Guía de Placas de TV: dónde está la etiqueta con el modelo. Es un dibujo (no una foto) para que sirva
// para cualquier marca: la parte de atrás de la tele, la etiqueta marcada y, ampliada, la línea que hay
// que leer.
export function LabelGuide() {
  return (
    <figure className={styles.guide}>
      <svg
        className={styles.drawing}
        viewBox="0 0 360 158"
        role="img"
        aria-label="Dibujo de la parte de atrás de un televisor. La etiqueta está abajo, cerca de las conexiones, y el modelo figura en la primera línea."
      >
        {/* Parte de atrás del televisor */}
        <rect className={styles.body} x="6" y="8" width="204" height="128" rx="6" />
        <rect className={styles.bulge} x="52" y="44" width="112" height="70" rx="5" />
        <g className={styles.vents}>
          <path d="M70 58h76M70 66h76M70 74h76" />
        </g>
        <g className={styles.holes}>
          <circle cx="86" cy="90" r="2.4" />
          <circle cx="130" cy="90" r="2.4" />
          <circle cx="86" cy="104" r="2.4" />
          <circle cx="130" cy="104" r="2.4" />
        </g>
        {/* Conexiones */}
        <g className={styles.ports}>
          <rect x="176" y="50" width="22" height="7" rx="1.5" />
          <rect x="176" y="62" width="22" height="7" rx="1.5" />
          <rect x="176" y="74" width="14" height="7" rx="1.5" />
          <circle cx="183" cy="92" r="3.4" />
        </g>
        {/* Patas */}
        <path className={styles.feet} d="M44 136l-12 16h26l-4-16zM172 136l12 16h-26l4-16z" />

        {/* La etiqueta, marcada */}
        <rect className={styles.sticker} x="150" y="98" width="46" height="18" rx="1.5" />
        <path className={styles.stickerLines} d="M154 104h26M154 109h34" />
        <circle className={styles.ring} cx="173" cy="107" r="24" />
        <path className={styles.callout} d="M194 95l38-30" />

        {/* La etiqueta ampliada */}
        <g transform="translate(232 14)">
          <rect className={styles.label} width="122" height="110" rx="3" />
          <rect className={styles.modelRow} x="7" y="9" width="108" height="30" rx="2" />
          <text className={styles.caption} x="13" y="21">
            MODELO
          </text>
          <text className={styles.model} x="13" y="34">
            32LB561B
          </text>
          <text className={styles.caption} x="13" y="55">
            N.º DE SERIE
          </text>
          <path className={styles.labelLines} d="M13 62h64M13 74h84M13 81h52" />
          <path
            className={styles.code}
            d="M13 90v13M16 90v13M20 90v13M22 90v13M27 90v13M30 90v13M32 90v13M37 90v13M41 90v13M43 90v13M48 90v13M51 90v13M55 90v13M57 90v13M62 90v13M66 90v13M69 90v13M73 90v13M75 90v13M80 90v13"
          />
        </g>
      </svg>
      <figcaption>
        La etiqueta está atrás, casi siempre cerca de las conexiones. Buscá la línea que dice{" "}
        <strong>Modelo</strong> o <strong>Model</strong>.
      </figcaption>
    </figure>
  );
}
