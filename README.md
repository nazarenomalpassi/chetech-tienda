# CheTech · Tienda online

### E-commerce para un comercio de tecnología

Catálogo, cuentas de clientes y pedidos por WhatsApp, con una interfaz adaptable a celulares y computadoras.

**Next.js 15 · React 19 · TypeScript · Tailwind CSS · Supabase / PostgreSQL**

[Visitar la tienda](https://chetechstore.com/) · [Sistema administrativo](https://github.com/nazarenomalpassi/chetech-admin) · [Mi perfil](https://github.com/nazarenomalpassi)

## Funcionalidades

- Catálogo con búsqueda y páginas de producto.
- Productos reacondicionados, placas para TV y servicios técnicos.
- Registro, inicio de sesión, direcciones y carrito sincronizado.
- Pedidos numerados por WhatsApp.
- Administración del catálogo público, pedidos y clientes.
- Sitemap, metadatos y datos estructurados para buscadores.

## Desarrollo local

Requiere **Node.js 22** y un entorno propio de Supabase.

```bash
git clone https://github.com/nazarenomalpassi/chetech-tienda.git
cd chetech-tienda
npm ci
```

Copiá `.env.example` a `.env.local` y completá los valores de tu entorno. Las migraciones están en `supabase/migrations/`; prepará tu base de desarrollo antes de utilizar funciones que consultan datos. Las cuentas y los datos del comercio no están incluidos.

```bash
npm run dev
```

Abrí [localhost:3000](http://localhost:3000).

## Estructura

```text
src/        Páginas, componentes, configuración e integración de datos
public/     Recursos estáticos
scripts/    Herramientas de catálogo y pruebas
supabase/   Migraciones, funciones y pruebas de base de datos
```

## Comprobaciones disponibles

```bash
npm run lint
npm run test:storefront-ui
npm run test:repair-portal
npm run test:railway-keys
npm run build
```

Las herramientas opcionales de normalización de imágenes requieren su entorno Python adicional, descrito por el script `scripts/catalog-images/catalog-images.mjs`.

## Despliegue en Railway

La tienda corre en el proyecto **chetech** de Railway, junto al sistema de gestión y la base que comparten (Postgres con el inicio de sesión, la API y los archivos de Supabase, alojados en el mismo proyecto).

- `railway.json` define la construcción, el arranque, el control de salud (`/robots.txt`, que no consulta la base) y el modo Serverless: si nadie visita la tienda durante un rato, se duerme y deja de consumir; la primera visita después tarda unos segundos más.
- `scripts/railway/with-supabase-keys.mjs` calcula la clave pública de la base a partir de `SUPABASE_ROOT_SECRET` al construir y al arrancar, con la misma derivación que el sistema de gestión. La clave no se copia a mano.
- El mismo script calcula `LEGAL_REQUEST_HASH_SALT` (clave del formulario de arrepentimiento y privacidad) si no está cargada. La base guarda solo su huella en `private.consumer_request_intake_secrets`; si algún día cambia `ROOT_SECRET`, hay que volver a cargarla con `encode(extensions.digest(encode(extensions.hmac('chetech/legal-request-salt/v1', <ROOT_SECRET>, 'sha256'), 'hex'), 'sha256'), 'hex')`.
- Variables del servicio: `NEXT_PUBLIC_SUPABASE_URL` (dirección pública de Envoy), `SUPABASE_ROOT_SECRET` (referencia a la variable de la base), `NEXT_PUBLIC_SITE_URL` y `NEXT_TELEMETRY_DISABLED=1`.
- Las fotos del catálogo se sirven desde el bucket de Railway a través de Envoy: las direcciones guardadas en `storefront_product_images.public_url` y `storefront_products.primary_image_url` apuntan a esa dirección.

## Sobre el proyecto

Desarrollado por **Nazareno Malpassi**, estudiante avanzado de Programación en UTN San Nicolás, con herramientas de IA como apoyo al desarrollo. La aplicación pública se despliega en Railway.

Este repositorio contiene una copia del código preparada para el portfolio. Excluye credenciales, archivos de trabajo, reportes e inventarios del comercio. No concede acceso al entorno administrativo.
