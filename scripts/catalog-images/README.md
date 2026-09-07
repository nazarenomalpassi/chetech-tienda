# Pipeline de imágenes del catálogo

Pipeline no destructivo y versionado para normalizar fotografías reales de productos. No genera ni reconstruye contenido. Los originales, los backups de producción, las máscaras, las salidas y sus hashes quedan separados.

## Estándar `catalog-style-v1`

- Lienzo maestro: 1600 × 1600 px.
- Fondo: `#F4F4F2` con iluminación radial mínima `#F8F8F6`.
- Ocupación máxima del producto: 78 %.
- Margen mínimo: 8 %.
- Centrado vertical: 47 % del lienzo.
- Sombra: derivada de la máscara real, opacidad 11 %, desenfoque 28 px.
- Corrección moderada: contraste 1.025, saturación 1.01 y nitidez 1.04.
- Marca sobre la foto: desactivada. La identidad oficial ya está presente en la interfaz y el activo queda limpio.
- Exportaciones:
  - master PNG 1600 × 1600;
  - catálogo WebP 1600 × 1600, calidad 86;
  - tarjeta WebP 1000 × 1000, calidad 84;
  - miniatura WebP 500 × 500, calidad 80.

La configuración exacta está en `catalog-style-v1.json`.

## Instalación reproducible

```powershell
py -3.13 -m venv .codex-tmp\catalog-images-venv
.\.codex-tmp\catalog-images-venv\Scripts\python.exe -m pip install -r scripts\catalog-images\requirements.lock
```

El modelo por defecto es `isnet-general-use`. Se reutiliza una sesión ONNX en CPU para todo el lote y se registra el SHA-256 del checkpoint en cada manifiesto.

## Comandos

### Comando recomendado para uso diario

El comando incremental consulta nuevamente los productos y sus galerías, descarga la
imagen que está publicada y procesa solamente las fotos que todavía no tienen
`catalog-style-v1`:

```powershell
npm run images:unify
```

Muestra el avance imagen por imagen (`[1/N] SKU`), conserva el archivo publicado
como backup inmutable y genera una revisión HTML. No cambia Supabase durante esta
etapa.

Comprobar el estado sin procesar:

```powershell
npm run images:unify:check
```

Forzar todo el catálogo o limitarlo a productos puntuales:

```powershell
npm run images:unify -- --all
npm run images:unify -- --sku AUR-003 --sku VAR-043
```

La publicación siempre exige un manifiesto revisado y una aprobación explícita:

```powershell
npm run images:unify -- --publish --manifest <manifest.json> --approval <approval.json>
```

Las rutas de Storage son versionadas y se suben con `upsert: false`; la imagen
anterior no se elimina. Los buckets públicos se usan solo para servir las fotos,
mientras las escrituras requieren credenciales privadas ejecutadas del lado
servidor.

Inventario, fuentes y backup inmutable:

```powershell
npm run images:normalize:inventory
```

Piloto estratificado de 14 productos:

```powershell
npm run images:normalize:pilot
```

Uno o más SKU, incluyendo todas sus imágenes de galería:

```powershell
npm run images:normalize -- --sku ADA-003 --sku AUR-003
```

Regenerar únicamente el reporte:

```powershell
npm run images:normalize -- --report-only --manifest <manifest.json>
```

Lote completo, bloqueado hasta recibir un archivo de aprobación del piloto:

```powershell
npm run images:normalize -- --all --pilot-approval <approval.json>
```

Preflight de publicación sin escribir:

```powershell
npm run images:normalize -- --upload --manifest <manifest.json> --approval <approval.json> --dry-run
```

Publicación aprobada y rollback:

```powershell
npm run images:normalize -- --upload --manifest <manifest.json> --approval <approval.json>
npm run images:normalize -- --rollback <upload-rollback.json>
```

`--upload` y `--rollback` requieren `SUPABASE_SECRET_KEY` privada. Cada publicación usa una ruta nueva para evitar cachés viejas, preserva el objeto anterior y genera un ledger de rollback.

## Revisión y fallback

Cada imagen produce:

- recorte PNG con alfa;
- master, catálogo, tarjeta y miniatura;
- comparación antes/después;
- control de bordes sobre blanco, negro, verde y gris;
- metadata y SHA-256;
- alertas automáticas;
- estado de revisión pendiente.

Una aprobación automática nunca habilita la publicación. Los casos dudosos se rechazan o se corrigen mediante `--overrides`:

```powershell
npm run images:normalize -- --sku PAR-001 --overrides scripts/catalog-images/overrides.template.json
```

El override puede indicar una fuente mejor, un recorte explícito o una máscara PNG/L revisada. Nunca se rellenan ni reconstruyen piezas faltantes.

## Integridad

- El inventario usa lectura pública/RPC; no escribe en Supabase.
- El backup conserva la jerarquía original de Storage y valida hashes antes de reutilizar archivos.
- Las galerías se procesan por imagen y preservan producto, posición y condición de principal.
- El lote completo necesita aprobación del piloto.
- La publicación necesita aprobación global y decisión individual por imagen.
- Si una asociación o ruta productiva cambió después de la revisión, la carga se cancela.
