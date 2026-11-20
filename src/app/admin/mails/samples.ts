import "server-only";

import { getBestSellers } from "@/lib/catalog";
import { renderMailSamples, type MailGroup, type MailSample } from "@/lib/mail/samples";

export const mailGroups: { group: MailGroup; note: string }[] = [
  { group: "Compra", note: "Le llegan al cliente mientras avanza su pedido." },
  { group: "Cuenta", note: "Los manda el ingreso de la tienda (sirven también para la gestión)." },
  { group: "Avisos", note: "Lista de espera y constancia del botón de arrepentimiento." },
  { group: "Para el local", note: "Te llegan a vos para que actúes." },
];

/** Los 21 mails con datos de ejemplo y dos productos reales con foto, para que la prueba se vea como de verdad. */
export async function loadMailSamples(): Promise<MailSample[]> {
  const products = (await getBestSellers(16))
    .filter((product) => product.image && product.price > 0)
    .slice(0, 2)
    .map((product) => ({
      name: product.name,
      price: product.price,
      image: product.image ?? null,
      slug: product.slug,
    }));
  return renderMailSamples(products);
}
