import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

// Accesibilidad: las reglas automáticas de WCAG 2.2 A y AA (contraste, nombres, etiquetas) y lo que no
// revisa una regla: que con el teclado se pueda entrar y salir de los diálogos.
const paths = [
  "/",
  "/productos",
  "/carrito",
  "/contacto",
  "/servicio-tecnico",
  "/servicio-tecnico/televisores",
  "/ingresar",
  "/arrepentimiento",
];

for (const path of paths) {
  test(`${path} no tiene fallas de accesibilidad`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto(path, { waitUntil: "load" });
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
      .analyze();
    const found = results.violations.map(
      (item) => `${item.id}: ${item.nodes[0]?.target.join(" ")}`,
    );
    expect(found).toEqual([]);
  });
}

test("el primer Tab ofrece saltar al contenido", async ({ page, isMobile }) => {
  test.skip(isMobile, "con teclado");
  await page.goto("/");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Saltar al contenido" })).toBeFocused();
});

test("el carrito atrapa el foco y lo devuelve al cerrar", async ({ page, isMobile }) => {
  test.skip(isMobile, "con teclado");
  await page.goto("/productos");
  await page.locator("html[data-hidratada]").waitFor({ state: "attached" });
  const trigger = page.locator("header").getByRole("button", { name: /Carrito/ });
  await trigger.focus();
  await page.keyboard.press("Enter");
  const cart = page.getByRole("dialog", { name: /Tu carrito/ });
  await expect(cart).toBeVisible();
  for (let step = 0; step < 8; step += 1) {
    await page.keyboard.press("Tab");
    expect(await cart.evaluate((node) => node.contains(document.activeElement))).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(cart).toBeHidden();
  await expect(trigger).toBeFocused();
});
