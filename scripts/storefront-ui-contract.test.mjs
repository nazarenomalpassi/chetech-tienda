// Contrato de la tienda nueva (plan, secciones 4 a 6): lo que no se puede romper sin decidirlo a propósito.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("la tarjeta de producto agrega al carrito, comparte la foto con la ficha y no manda a WhatsApp", async () => {
  const card = await source("src/components/store/product-card.tsx");

  assert.match(card, /add\(product/);
  assert.match(card, /ViewTransition name=\{`producto-\$\{product\.slug\}`\}/);
  assert.doesNotMatch(card, /productWhatsApp|whatsappUrl/);
  assert.doesNotMatch(card, /product\.(?:shortDescription|description)\b/);
});

test("la ficha tiene una sola descripción, datos estructurados y complementos", async () => {
  const detail = await source("src/app/productos/[slug]/page.tsx");

  assert.equal(detail.match(/<h2 id="descripcion">Descripción<\/h2>/g)?.length, 1);
  assert.match(detail, /sku:\s*product\.sku/);
  assert.match(detail, /application\/ld\+json/);
  assert.match(detail, /<BuyBox/);
});

test("el pedido del cliente no muestra códigos internos", async () => {
  const order = await source("src/app/pedido/[numero]/page.tsx");
  const legacyOrder = await source("src/app/cuenta/pedidos/[id]/page.tsx");

  assert.doesNotMatch(order, />\s*\{item\.sku\}/);
  assert.doesNotMatch(legacyOrder, /\{item\.sku_snapshot\}/);
  assert.match(order, /robots:\s*\{\s*index:\s*false/);
});

test("la compra nunca confía en el navegador para marcar un pago", async () => {
  const [webhook, sync, payments, checkout] = await Promise.all([
    source("src/app/api/payments/mercadopago/webhook/route.ts"),
    source("src/app/api/payments/mercadopago/sync/route.ts"),
    source("src/lib/commerce/payments.ts"),
    source("src/app/api/checkout/route.ts"),
  ]);

  assert.match(webhook, /verifySignature\(/);
  assert.match(webhook, /storefront_register_webhook/);
  assert.match(sync, /applyMercadoPagoPayment\(/);
  assert.match(payments, /getPayment\(/);
  assert.match(payments, /paymentProblem\(/);
  // Del carrito solo viajan producto y cantidad: el precio lo pone la base.
  assert.match(checkout, /storefront_product_id: String\(item\.id \?\? ""\), quantity:/);
  assert.match(checkout, /access_token_hash:\s*hashToken\(token\)/);
});

test("el movimiento respeta la preferencia de reducirlo", async () => {
  const [base, card, story, hero] = await Promise.all([
    source("src/styles/base.css"),
    source("src/components/store/product-card.module.css"),
    source("src/components/store/home/repair-story.tsx"),
    source("src/components/store/home/tv-hero.tsx"),
  ]);

  assert.match(base, /prefers-reduced-motion:\s*reduce/);
  assert.match(card, /prefers-reduced-motion:\s*reduce/);
  assert.match(story, /prefers-reduced-motion|useReducedMotion/);
  assert.match(hero, /prefers-reduced-motion|useReducedMotion/);
});

test("el catálogo acota la página pedida y oculta los productos sin foto", async () => {
  const query = await source("src/lib/catalog-query.ts");

  assert.match(query, /Math\.min\(Math\.max\(Math\.trunc\(query\.page \?\? 1\), 1\), totalPages\)/);
  assert.match(query, /export function isSellable/);
  assert.match(query, /hiddenWithoutPhoto/);
});

test("el servicio técnico expone sus seis rutas con una sola experiencia", async () => {
  const [config, landing, detail, components, accordion, sitemap, repairsCta] = await Promise.all([
    source("src/config/service-categories.ts"),
    source("src/app/servicio-tecnico/page.tsx"),
    source("src/app/servicio-tecnico/[slug]/page.tsx"),
    source("src/components/service-tech.tsx"),
    source("src/components/service-accordion.tsx"),
    source("src/app/sitemap.ts"),
    source("src/components/service-repairs-cta.tsx"),
  ]);

  for (const slug of [
    "computadoras-notebooks",
    "televisores",
    "celulares-tablets",
    "joysticks-consolas",
    "mantenimiento",
    "otros-equipos",
  ]) {
    assert.match(config, new RegExp(`slug: "${slug}"`));
    assert.match(config, new RegExp(`/servicio-tecnico/${slug}`));
  }

  assert.match(landing, /<ServiceLanding/);
  assert.match(detail, /generateStaticParams/);
  assert.match(detail, /generateMetadata/);
  assert.match(sitemap, /serviceCategories\.map/);
  assert.match(components, /whatsappUrl\(category\.contextualWhatsAppMessage\)/);
  assert.doesNotMatch(components, /wa\.me\/\d/);
  assert.match(accordion, /aria-expanded=\{expanded\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  assert.match(repairsCta, /Consultar estado de mi reparación/);
});
