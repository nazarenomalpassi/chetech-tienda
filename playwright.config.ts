import { defineConfig, devices } from "@playwright/test";

// Pruebas de la tienda en un navegador de verdad (carpeta e2e/). Recorren la tienda como un cliente:
// ningún caso envía un pedido ni escribe en la base, así que se pueden correr también contra producción.
//
//   npm run build && npm run test:e2e                       contra la versión local
//   BASE_URL=https://chetechstore.com npm run test:e2e      contra la tienda publicada
//
// La primera vez hay que bajar el navegador: npx playwright install chromium
const port = 3210;
const baseURL = process.env.BASE_URL ?? `http://localhost:${port}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: 45_000,
  fullyParallel: true,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL,
    locale: "es-AR",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "celular", use: { ...devices["Pixel 7"] } },
    {
      name: "escritorio",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1366, height: 800 } },
    },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : {
        command: `npm run start -- -p ${port}`,
        url: baseURL,
        reuseExistingServer: true,
        timeout: 60_000,
      },
});
