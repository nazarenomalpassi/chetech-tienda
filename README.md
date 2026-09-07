# CheTech · Tienda online

### E-commerce para un comercio de tecnología

Catálogo, cuentas de clientes y pedidos por WhatsApp, con una interfaz adaptable a celulares y computadoras.

**Next.js 15 · React 19 · TypeScript · Tailwind CSS · Supabase / PostgreSQL**

[Visitar la tienda](https://chetech-tienda.vercel.app/) · [Sistema administrativo](https://github.com/nazarenomalpassi/chetech-admin) · [Mi perfil](https://github.com/nazarenomalpassi)

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
npm run build
```

Las herramientas opcionales de normalización de imágenes requieren su entorno Python adicional, descrito por el script `scripts/catalog-images/catalog-images.mjs`.

## Sobre el proyecto

Desarrollado por **Nazareno Malpassi**, estudiante avanzado de Programación en UTN San Nicolás, con herramientas de IA como apoyo al desarrollo. La aplicación pública se despliega en Vercel.

Este repositorio contiene una copia del código preparada para el portfolio. Excluye credenciales, archivos de trabajo, reportes e inventarios del comercio. No concede acceso al entorno administrativo.
