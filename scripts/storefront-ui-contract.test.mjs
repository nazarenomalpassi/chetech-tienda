import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

async function source(path) {
  return readFile(new URL(path, root), "utf8");
}

test("the shared public product card stays compact and keeps its core actions", async () => {
  const card = await source("src/components/product-card.tsx");

  assert.doesNotMatch(card, /product\.sku/);
  assert.doesNotMatch(card, /product\.(?:shortDescription|description)/);
  assert.doesNotMatch(card, /productWhatsApp|WhatsApp/);
  assert.match(card, /className="product-card-link"/);
  assert.match(card, /add\(product\)/);
});

test("the product detail hides SKU, renders one description section and keeps commerce actions", async () => {
  const detail = await source("src/app/productos/[slug]/page.tsx");

  assert.equal(detail.match(/product\.sku/g)?.length, 1, "SKU should only remain in JSON-LD");
  assert.match(detail, /sku:\s*product\.sku/);
  assert.equal(detail.match(/<p className="eyebrow">Descripción<\/p>/g)?.length, 1);
  assert.match(detail, /<ProductActions product=\{product\}/);
  assert.match(detail, /getRelatedProducts\(product,\s*4\)/);
});

test("customer cart and order detail do not render SKU snapshots", async () => {
  const cart = await source("src/components/cart-page-client.tsx");
  const order = await source("src/app/cuenta/pedidos/[id]/page.tsx");

  assert.doesNotMatch(cart, /product\.sku/);
  assert.doesNotMatch(order, /\{item\.sku_snapshot\}/);
});

test("home products are selected once from real catalog data and moved client-side", async () => {
  const home = await source("src/app/page.tsx");
  const catalog = await source("src/lib/catalog.ts");
  const carousel = await source("src/components/product-carousel.tsx");

  assert.match(home, /getCatalog\(\{\s*pageSize:\s*48\s*\}\)/);
  assert.match(home, /selectHomeProducts\(catalog\.products,\s*12\)/);
  assert.match(home, /<ProductCarousel products=\{products\}/);
  assert.match(catalog, /product\.featured/);
  assert.match(catalog, /interleaveCategories/);
  assert.doesNotMatch(carousel, /supabase|fetch\(/i);
  assert.match(carousel, /ResizeObserver/);
  assert.match(carousel, /prefers-reduced-motion/);
});

test("hero controls and scroll reveals follow the accessibility contract", async () => {
  const hero = await source("src/components/hero-service-carousel.tsx");
  const reveal = await source("src/components/reveal-on-scroll.tsx");

  assert.doesNotMatch(hero, /\b(?:Pause|Play|Pausar|Reanudar)\b/);
  assert.match(hero, /hero-carousel-arrow-prev/);
  assert.match(hero, /hero-carousel-arrow-next/);
  assert.match(hero, /prefers-reduced-motion/);
  assert.match(hero, /ArrowLeft/);
  assert.match(reveal, /IntersectionObserver/);
  assert.match(reveal, /unobserve/);
  assert.match(reveal, /MutationObserver/);
});

test("catalog protects page bounds and the compact responsive grid", async () => {
  const page = await source("src/app/productos/page.tsx");
  const css = await source("src/app/globals.css");

  assert.match(page, /page > catalog\.totalPages/);
  assert.match(page, /invalidCategory/);
  assert.match(css, /@media \(min-width: 1280px\)[\s\S]*repeat\(4, minmax\(0, 1fr\)\)/);
  assert.match(css, /\.product-media\s*\{[\s\S]*aspect-ratio:\s*4\s*\/\s*3/);
  assert.match(css, /-webkit-line-clamp:\s*2/);
  assert.match(css, /\.reveal-enhanced \[data-reveal\]/);
});

test("technical service exposes six real routes through one reusable experience", async () => {
  const [config, landing, detail, components, accordion, sitemap, repairsCta, css] =
    await Promise.all([
      source("src/config/service-categories.ts"),
      source("src/app/servicio-tecnico/page.tsx"),
      source("src/app/servicio-tecnico/[slug]/page.tsx"),
      source("src/components/service-tech.tsx"),
      source("src/components/service-accordion.tsx"),
      source("src/app/sitemap.ts"),
      source("src/components/service-repairs-cta.tsx"),
      source("src/app/globals.css"),
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
  assert.match(detail, /<ServiceDetailLayout category=\{category\}/);
  assert.match(sitemap, /serviceCategories\.map/);
  assert.match(components, /className="service-tech-card"/);
  assert.match(components, /whatsappUrl\(category\.contextualWhatsAppMessage\)/);
  assert.match(config, /serviceLandingHero/);
  assert.match(config, /image:\s*"\/brand\/services\/mantenimiento\.webp"/);
  assert.match(components, /className="service-tech-lab-layout service-tech-shell"/);
  assert.match(components, /src=\{serviceLandingHero\.image\}/);
  assert.doesNotMatch(components, /service-tech-hero-grid|service-tech-hero-visual/);
  assert.match(
    css,
    /calc\(100svh - var\(--site-header-stack\) - var\(--service-rail-height\) - 2px\)/,
  );
  assert.doesNotMatch(components, /wa\.me\/\d/);
  assert.doesNotMatch(
    components,
    /ST \/ 06|01—08|category\.index|service-tech-(?:hero-index|solution-index|process-mark)/,
  );
  assert.match(accordion, /aria-expanded=\{expanded\}/);
  assert.match(accordion, /aria-controls=\{panelId\}/);
  assert.match(repairsCta, /Consultar estado de mi reparación/);
});
