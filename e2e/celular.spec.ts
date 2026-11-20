import { expect, test } from "@playwright/test";

// Ninguna página pública se pasa del ancho de un celular chico (320 px) ni de uno común (390 px).
const paths = [
  "/",
  "/productos",
  "/productos?buscar=cargador",
  "/carrito",
  "/contacto",
  "/ingresar",
  "/registrarse",
  "/nosotros",
  "/servicio-tecnico",
  "/servicio-tecnico/televisores",
  "/placas-tv",
  "/reacondicionados",
  "/ig",
  "/terminos-y-condiciones",
  "/cambios-y-devoluciones",
  "/arrepentimiento",
  "/no-existe-esta-pagina",
];

test.describe("ancho de celular", () => {
  test.skip(({ isMobile }) => !isMobile, "solo en el proyecto celular");

  for (const width of [320, 390]) {
    test(`ninguna página se pasa de ${width} px`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width, height: 780 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      const wide: string[] = [];
      for (const path of paths) {
        await page.goto(path, { waitUntil: "load" });
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        if (overflow > 1) wide.push(`${path} se pasa ${overflow} px`);
      }
      expect(wide).toEqual([]);
    });
  }
});
