import { expect, test, type Page } from "@playwright/test";

/** La página ya responde a los clics (antes de eso el HTML se ve, pero los botones todavía no andan). */
const ready = (page: Page) => page.locator("html[data-hidratada]").waitFor({ state: "attached" });

// El camino de una compra, hasta el último paso antes de enviar. No envía el pedido: no deja nada en la
// base ni manda mensajes.
test("un cliente elige un producto, lo suma al carrito y llega al formulario de compra", async ({
  page,
}) => {
  await page.goto("/productos");
  await ready(page);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

  // Primera tarjeta que se puede comprar.
  const card = page
    .locator("article")
    .filter({ has: page.getByRole("button", { name: /^Agregar .* al carrito$/ }) })
    .first();
  await expect(card).toBeVisible();
  const name = (await card.getByRole("heading").innerText()).trim();
  await card.getByRole("button", { name: /^Agregar .* al carrito$/ }).click();

  // Se abre el carrito con ese producto.
  const cart = page.getByRole("dialog", { name: /Tu carrito/ });
  await expect(cart).toBeVisible();
  await expect(cart.getByRole("heading", { name: /Tu carrito/ })).toContainText("1 producto");
  await expect(cart.getByRole("link", { name })).toBeVisible();

  // Sumar una unidad cambia la cantidad.
  await cart.getByRole("button", { name: "Sumar una unidad" }).click();
  await expect(cart.getByRole("heading", { name: /Tu carrito/ })).toContainText("2 productos");

  await cart.getByRole("link", { name: "Finalizar compra" }).click();
  await expect(page).toHaveURL(/\/carrito/);
  await expect(page.getByRole("heading", { level: 1, name: "Finalizar compra" })).toBeVisible();
  await expect(page.getByText(name).first()).toBeVisible();

  // El formulario está listo para completar y enviar (no se envía).
  const fullName = page.getByLabel(/Nombre y apellido/);
  await fullName.fill("Cliente de Prueba");
  await expect(fullName).toHaveValue("Cliente de Prueba");
  const submit = page.locator("main form button[type=submit]").last();
  await expect(submit).toBeVisible();
  await expect(submit).toBeEnabled();
});

test("la ficha de un producto muestra precio, entrega y botón de compra", async ({ page }) => {
  await page.goto("/productos");
  const link = page.locator("article h3 a").first();
  const name = (await link.innerText()).trim();
  await link.click();
  await expect(page).toHaveURL(/\/productos\/.+/);
  await expect(page.getByRole("heading", { level: 1 })).toContainText(name);
  await expect(
    page
      .locator("main")
      .getByText(/\$\s?[\d.]+/)
      .first(),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Agregar al carrito|Comprar ahora|Avisarme/ }).first(),
  ).toBeVisible();
});

test("el buscador encuentra productos mientras se escribe", async ({ page }) => {
  await page.goto("/");
  await ready(page);
  await page.getByRole("button", { name: "Buscá un producto o modelo" }).click();
  const dialog = page.getByRole("dialog", { name: "Buscar" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("searchbox").fill("cargador");
  await expect(
    dialog
      .getByRole("link")
      .filter({ hasText: /cargador/i })
      .first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});
