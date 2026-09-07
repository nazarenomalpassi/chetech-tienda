# Publicación SQL atómica de imágenes

Este generador consume directamente el ledger terminado de `edge-upload.mjs`. No define un segundo
formato, no consulta Supabase, no sube archivos y no ejecuta SQL.

```powershell
npm run images:normalize:sql -- `
  --manifest "<manifest-all.json>" `
  --approval "<approval-full.json>" `
  --upload-ledger "<edge-upload-ledger.json>" `
  --output "<directorio-sql>"
```

Antes de generar vuelve a ejecutar `verifyApproval` y `buildUploadPlan`. Exige:

- las 185 imágenes del manifiesto `mode=all`;
- aprobación global y decisión `approved` para las 185;
- ledger `catalog-edge-storage-upload` v1 con `status=completed`;
- `storage_only=true`, `database_modified=false`, `verified=185` y `pending=0`;
- coincidencia exacta de hashes de manifiesto, aprobación y plan;
- cada item en etapa `verified`, con salida local, destino y contrato DB intactos.

## Archivos generados

1. `01-preflight-read-only.sql`;
2. `02-publish-atomic-cas.sql`;
3. `03-rollback-atomic-cas.sql`;
4. `04-postflight-read-only.sql`;
5. `publication-bundle.json`.

Los cuatro SQL están pensados para ejecutarse desde el SQL Editor o una conexión administrativa
equivalente. No deben exponerse como una operación del navegador ni ejecutarse con una clave
pública.

El preflight resuelve cada imagen por el UUID real del ledger o, cuando el RPC no expuso ese UUID,
por su `source_storage_path` único. Informa deriva de asociación, ruta, URL, orden, condición
primaria, formato del SHA-256, dimensiones, producto principal, objetos originales/nuevos y
conflictos de ruta o hash.

## Snapshot de rollback

El ledger edge no contiene las columnas DB previas completas. Para que el rollback sea exacto sin
inventar un segundo ledger, la publicación captura las filas bloqueadas dentro de la misma
transacción y guarda un único snapshot JSON en la tabla de auditoría existente
`storefront_admin_logs`.

Si cualquier validación o actualización falla, PostgreSQL revierte también ese snapshot. El
rollback generado localiza el snapshot por `run_id` y hashes, valida de nuevo el estado publicado y
restaura exactamente ruta, URL, alt, hash, dimensiones, orden, condición principal y
`primary_image_url`.

La publicación:

- usa un advisory lock y locks de fila;
- exige conteos exactos antes y después;
- actualiza las filas de `storefront_product_images`;
- en `storefront_products` modifica únicamente las `primary_image_url` correspondientes;
- nunca inserta, actualiza ni elimina `storage.objects`;
- conserva los objetos originales y normalizados.

El rollback tampoco elimina objetos. Así se evita borrar originales y se conserva la versión
normalizada para investigar o reintentar de forma segura.
