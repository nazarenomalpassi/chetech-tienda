import Image from "next/image";
import Link from "next/link";
import { getProducts } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { isTelevision, tvCompanions } from "@/lib/taller";
import styles from "./tv-companions.module.css";

// "Para tu tele" en el seguimiento de una reparación. Los enlaces llevan origen=taller para medir cuánto
// compran los clientes del taller.
export async function TvCompanions({ deviceType }: { deviceType: string }) {
  if (!isTelevision(deviceType)) return null;
  const products = tvCompanions(await getProducts());
  if (products.length < 2) return null;
  return (
    <section className={styles.section} aria-labelledby="para-tu-tele">
      <div className={styles.head}>
        <h2 id="para-tu-tele">Para tu tele</h2>
        <p>Lo que más se llevan quienes retiran una tele del taller. Lo sumás y lo retirás junto con la reparación.</p>
      </div>
      <ul className={styles.list}>
        {products.map((product) => (
          <li key={product.id}>
            <Link href={`/productos/${product.slug}?origen=taller`} className={styles.item}>
              <span className={styles.photo}>
                {product.image ? <Image src={product.image} alt="" fill sizes="96px" /> : null}
              </span>
              <span className={styles.text}>
                <span className={styles.name}>{product.name}</span>
                <span className={`price ${styles.price}`}>{formatPrice(product.price)}</span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link className="enlace" href="/productos?familia=para-tu-tele&origen=taller">
        Ver todo para tu tele
      </Link>
    </section>
  );
}
