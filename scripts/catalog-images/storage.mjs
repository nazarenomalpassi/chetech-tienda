import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_DIR = path.resolve(SCRIPT_DIR, "../..");
const BUCKET = "storefront-products";
const EXPECTED_FULL_IMAGE_COUNT = 185;
const IMAGE_COLUMNS =
  "id,storefront_product_id,storage_path,public_url,alt_text,content_hash,width,height,sort_order,is_primary";

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, "utf8"));
}

async function writeJsonAtomic(filename, value) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await fs.rename(temporary, filename);
}

async function fileHash(filename) {
  return createHash("sha256")
    .update(await fs.readFile(filename))
    .digest("hex");
}

function bufferHash(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

async function inspectImageBuffer(buffer) {
  const metadata = await sharp(buffer, { failOn: "warning" }).metadata();
  return {
    sha256: bufferHash(buffer),
    bytes: buffer.length,
    width: metadata.width ?? null,
    height: metadata.height ?? null,
    format: metadata.format ?? null,
  };
}

async function inspectImageFile(filename) {
  const buffer = await fs.readFile(filename);
  return inspectImageBuffer(buffer);
}

async function loadEnvFile(filename) {
  try {
    const content = await fs.readFile(filename, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2].trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[match[1]] = value;
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
}

async function createAdminClient() {
  await loadEnvFile(path.join(PROJECT_DIR, ".env.local"));
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;
  const publicKey =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !secret || secret === publicKey) {
    throw new Error(
      "La publicación/rollback requiere SUPABASE_SECRET_KEY privada en el entorno local.",
    );
  }
  class DisabledRealtimeTransport {
    constructor() {
      throw new Error("Realtime no está habilitado en la gestión de imágenes.");
    }
  }
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    realtime: { transport: DisabledRealtimeTransport },
  });
}

function isRetryable(error) {
  const status = Number(error?.status ?? error?.statusCode ?? error?.cause?.status ?? 0);
  if (status) return status === 408 || status === 425 || status === 429 || status >= 500;
  return /fetch failed|network|timeout|econnreset|socket hang up/iu.test(
    String(error?.message ?? error),
  );
}

async function withRetry(label, operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const result = await operation();
      if (result?.error) throw result.error;
      return result;
    } catch (error) {
      lastError = error;
      if (!isRetryable(error) || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${label}: ${lastError?.message ?? lastError}`, { cause: lastError });
}

function isStorageNotFound(error) {
  const status = Number(error?.status ?? error?.statusCode ?? 0);
  return (
    status === 404 ||
    /not found|object not found|no such key|resource was not found/iu.test(
      String(error?.message ?? error),
    )
  );
}

function chunks(values, size = 40) {
  const result = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

export function createSupabaseStorageAdapter(client) {
  return {
    async getImage({ imageId, storagePath }) {
      let query = client.from("storefront_product_images").select(IMAGE_COLUMNS);
      query = imageId ? query.eq("id", imageId) : query.eq("storage_path", storagePath);
      const response = await withRetry("Leer registro de imagen", () => query.single());
      return response.data;
    },

    async findImagesByHashes(hashes) {
      const result = [];
      for (const group of chunks([...new Set(hashes.filter(Boolean))])) {
        if (!group.length) continue;
        const response = await withRetry("Buscar conflictos de hash", () =>
          client
            .from("storefront_product_images")
            .select("id,storefront_product_id,storage_path,content_hash")
            .in("content_hash", group),
        );
        result.push(...(response.data ?? []));
      }
      return result;
    },

    async getProduct(productId) {
      const response = await withRetry("Leer producto", () =>
        client
          .from("storefront_products")
          .select("id,primary_image_url")
          .eq("id", productId)
          .single(),
      );
      return response.data;
    },

    async updateImage(imageId, values, expected) {
      if (
        !expected ||
        !Object.hasOwn(expected, "storage_path") ||
        !Object.hasOwn(expected, "public_url") ||
        expected.storage_path === undefined ||
        expected.public_url === undefined
      ) {
        throw new Error("Actualizar una imagen requiere storage_path y public_url esperadas.");
      }
      let query = client.from("storefront_product_images").update(values).eq("id", imageId);
      query =
        expected.storage_path === null
          ? query.is("storage_path", null)
          : query.eq("storage_path", expected.storage_path);
      query =
        expected.public_url === null
          ? query.is("public_url", null)
          : query.eq("public_url", expected.public_url);
      const response = await withRetry("Actualizar registro de imagen", () =>
        query.select(IMAGE_COLUMNS).maybeSingle(),
      );
      if (!response.data) {
        throw new Error(
          `Conflicto compare-and-swap: la imagen ${imageId} cambió antes del UPDATE.`,
        );
      }
      return response.data;
    },

    async updateProduct(productId, values, expected) {
      if (
        !expected ||
        !Object.hasOwn(expected, "primary_image_url") ||
        expected.primary_image_url === undefined
      ) {
        throw new Error("Actualizar un producto requiere la primary_image_url esperada.");
      }
      let query = client.from("storefront_products").update(values).eq("id", productId);
      query =
        expected.primary_image_url === null
          ? query.is("primary_image_url", null)
          : query.eq("primary_image_url", expected.primary_image_url);
      const response = await withRetry("Actualizar imagen principal del producto", () =>
        query.select("id,primary_image_url").maybeSingle(),
      );
      if (!response.data) {
        throw new Error(
          `Conflicto compare-and-swap: el producto ${productId} cambió antes del UPDATE.`,
        );
      }
      return response.data;
    },

    async uploadObject(storagePath, buffer) {
      await withRetry("Subir versión normalizada", () =>
        client.storage.from(BUCKET).upload(storagePath, buffer, {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        }),
      );
    },

    async removeObject(storagePath) {
      await withRetry("Retirar objeto normalizado", () =>
        client.storage.from(BUCKET).remove([storagePath]),
      );
    },

    async inspectObject(storagePath) {
      let response;
      try {
        response = await withRetry(`Descargar objeto ${storagePath}`, () =>
          client.storage.from(BUCKET).download(storagePath),
        );
      } catch (error) {
        if (isStorageNotFound(error)) return null;
        throw error;
      }
      const buffer = Buffer.from(await response.data.arrayBuffer());
      return { ...(await inspectImageBuffer(buffer)), buffer };
    },

    publicUrl(storagePath) {
      return client.storage.from(BUCKET).getPublicUrl(storagePath).data.publicUrl;
    },
  };
}

function safePart(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/gu, "-")
    .replace(/^-+|-+$/gu, "");
}

function nowIso() {
  return new Date().toISOString();
}

export function validateManifestForUpload(
  manifest,
  expectedImageCount = EXPECTED_FULL_IMAGE_COUNT,
) {
  const errors = Array.isArray(manifest?.errors) ? manifest.errors : [];
  if (manifest?.mode !== "all") {
    throw new Error("La publicación masiva requiere un manifiesto con mode=all.");
  }
  if (
    Number(manifest?.summary?.requested) !== expectedImageCount ||
    Number(manifest?.summary?.processed) !== expectedImageCount ||
    Number(manifest?.summary?.errors) !== 0 ||
    errors.length !== 0 ||
    !Array.isArray(manifest?.items) ||
    manifest.items.length !== expectedImageCount
  ) {
    throw new Error(
      `El manifiesto completo debe contener ${expectedImageCount}/${expectedImageCount} imágenes procesadas y 0 errores.`,
    );
  }
  const itemIds = manifest.items.map((item) => item.id);
  if (new Set(itemIds).size !== itemIds.length || itemIds.some((id) => !id)) {
    throw new Error("El manifiesto contiene IDs de revisión vacíos o duplicados.");
  }
}

export async function verifyApproval(manifestPath, approvalPath) {
  const manifest = await readJson(manifestPath);
  const approval = await readJson(approvalPath);
  validateManifestForUpload(manifest);
  const actualHash = await fileHash(manifestPath);
  if (approval.manifest_sha256 !== actualHash) {
    throw new Error("El manifiesto cambió después de crear la aprobación.");
  }
  if (
    approval.run_id !== manifest.run_id ||
    approval.pipeline_version !== manifest.pipeline_version
  ) {
    throw new Error("La aprobación no corresponde a este lote.");
  }
  if (approval.scope !== manifest.mode) {
    throw new Error("El alcance de la aprobación no corresponde a este manifiesto.");
  }
  if (approval.decision !== "approved") {
    throw new Error("El lote todavía no tiene una aprobación global explícita.");
  }
  if (!String(approval.reviewed_by ?? "").trim() || !Date.parse(approval.reviewed_at ?? "")) {
    throw new Error("La aprobación debe indicar reviewed_by y reviewed_at válidos.");
  }
  if (!Array.isArray(approval.items) || approval.items.length !== manifest.items.length) {
    throw new Error("La aprobación debe contener una decisión por cada imagen del manifiesto.");
  }
  const decisions = new Map();
  for (const item of approval.items) {
    if (!item.image_id || decisions.has(item.image_id)) {
      throw new Error("La aprobación contiene IDs vacíos o duplicados.");
    }
    if (!["approved", "rejected"].includes(item.decision)) {
      throw new Error(`Decisión inválida para ${item.image_id}.`);
    }
    decisions.set(item.image_id, item.decision);
  }
  for (const item of manifest.items) {
    if (!decisions.has(item.id)) throw new Error(`Falta revisar ${item.sku} (${item.id}).`);
  }
  const approvedItems = manifest.items.filter((item) => decisions.get(item.id) === "approved");
  if (!approvedItems.length) throw new Error("La aprobación no contiene imágenes aprobadas.");
  return { manifest, approval, approvedItems };
}

export async function buildUploadPlan(manifest, approvedItems) {
  const plan = [];
  for (const item of approvedItems) {
    const catalog = item?.outputs?.catalog;
    if (
      !item.product_id ||
      !item?.source?.production_storage_path ||
      !catalog?.path ||
      !catalog?.sha256 ||
      !catalog?.width ||
      !catalog?.height
    ) {
      throw new Error(`El manifiesto no tiene datos publicables completos para ${item.sku}.`);
    }
    const inspected = await inspectImageFile(catalog.path);
    if (
      inspected.sha256 !== catalog.sha256 ||
      inspected.width !== Number(catalog.width) ||
      inspected.height !== Number(catalog.height) ||
      inspected.format !== "webp"
    ) {
      throw new Error(`La salida local de ${item.sku} cambió o no es el WebP aprobado.`);
    }
    plan.push({
      review_id: item.id,
      image_id: item.database_image_id ?? null,
      product_id: item.product_id,
      sku: item.sku,
      source_storage_path: item.source.production_storage_path,
      output_path: path.resolve(catalog.path),
      output_hash: catalog.sha256,
      output_width: Number(catalog.width),
      output_height: Number(catalog.height),
      output_bytes: inspected.bytes,
      target_storage_path: `${item.product_id}/normalized/${safePart(
        manifest.pipeline_version,
      )}/${safePart(manifest.run_id)}/${safePart(item.sku)}-${safePart(item.id).slice(
        0,
        12,
      )}-${catalog.sha256.slice(0, 12)}.webp`,
    });
  }

  const hashGroups = new Map();
  const targetPaths = new Set();
  for (const item of plan) {
    const group = hashGroups.get(item.output_hash) ?? [];
    group.push(item);
    hashGroups.set(item.output_hash, group);
    if (targetPaths.has(item.target_storage_path)) {
      throw new Error(`El plan genera una ruta de Storage duplicada: ${item.target_storage_path}.`);
    }
    targetPaths.add(item.target_storage_path);
  }
  const duplicated = [...hashGroups.entries()].filter(([, items]) => items.length > 1);
  if (duplicated.length) {
    throw new Error(
      `El lote contiene hashes de salida duplicados: ${duplicated
        .map(
          ([hash, items]) => `${hash.slice(0, 12)} (${items.map((item) => item.sku).join(", ")})`,
        )
        .join("; ")}.`,
    );
  }
  return plan;
}

export async function validateManifestLocalOutputs(manifest) {
  const inspections = new Map();
  for (const item of manifest.items) {
    const catalog = item?.outputs?.catalog;
    if (!catalog?.path || !catalog?.sha256 || !catalog?.width || !catalog?.height) {
      throw new Error(`Falta la salida local declarada para ${item.sku} (${item.id}).`);
    }
    const inspected = await inspectImageFile(catalog.path);
    if (
      inspected.sha256 !== catalog.sha256 ||
      inspected.width !== Number(catalog.width) ||
      inspected.height !== Number(catalog.height) ||
      inspected.format !== "webp"
    ) {
      throw new Error(`La salida local de ${item.sku} cambió o no es el WebP aprobado.`);
    }
    inspections.set(item.id, inspected);
  }
  return inspections;
}

function imageRestoreValues(image) {
  return {
    storage_path: image.storage_path,
    public_url: image.public_url,
    alt_text: image.alt_text,
    content_hash: image.content_hash,
    width: image.width,
    height: image.height,
    sort_order: image.sort_order,
    is_primary: image.is_primary,
  };
}

function replacementValues(replacement) {
  return {
    storage_path: replacement.storage_path,
    public_url: replacement.public_url,
    content_hash: replacement.content_hash,
    width: replacement.width,
    height: replacement.height,
  };
}

function assertObjectMatchesRow(object, row, label) {
  if (!object) throw new Error(`No existe el objeto de Storage ${label}.`);
  if (row.content_hash && object.sha256 !== row.content_hash) {
    throw new Error(`El hash del objeto ${label} no coincide con la fila actual.`);
  }
  if (row.width && Number(row.width) !== object.width) {
    throw new Error(`El ancho del objeto ${label} no coincide con la fila actual.`);
  }
  if (row.height && Number(row.height) !== object.height) {
    throw new Error(`El alto del objeto ${label} no coincide con la fila actual.`);
  }
}

function validateExistingLedger(ledger, context, plan) {
  if (ledger.schema_version !== 2 || !Array.isArray(ledger.changes)) {
    throw new Error("El ledger existente no es compatible con el uploader reanudable v2.");
  }
  if (
    ledger.manifest_sha256 !== context.manifestHash ||
    ledger.approval_sha256 !== context.approvalHash ||
    ledger.run_id !== context.manifest.run_id ||
    ledger.pipeline_version !== context.manifest.pipeline_version
  ) {
    throw new Error("El ledger existente pertenece a otra aprobación o manifiesto.");
  }
  if (ledger.changes.length !== plan.length) {
    throw new Error("El ledger parcial no contiene exactamente el plan aprobado.");
  }
  const byReview = new Map(ledger.changes.map((change) => [change.review_id, change]));
  for (const planned of plan) {
    const change = byReview.get(planned.review_id);
    if (
      !change ||
      change.product_id !== planned.product_id ||
      change.source_storage_path !== planned.source_storage_path ||
      change.replacement?.storage_path !== planned.target_storage_path ||
      change.replacement?.content_hash !== planned.output_hash
    ) {
      throw new Error(`El ledger parcial no coincide con el plan de ${planned.sku}.`);
    }
  }
}

async function readLedgerIfPresent(filename) {
  try {
    return await readJson(filename);
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }
}

async function remotePreflight({ adapter, plan, existingLedger }) {
  const existingByReview = new Map(
    (existingLedger?.changes ?? []).map((change) => [change.review_id, change]),
  );
  const states = [];
  for (const planned of plan) {
    const existing = existingByReview.get(planned.review_id);
    const row = await adapter.getImage({
      imageId: existing?.previous?.id ?? planned.image_id,
      storagePath: planned.source_storage_path,
    });
    if (row.storefront_product_id !== planned.product_id) {
      throw new Error(`La asociación de producto cambió para ${planned.sku}.`);
    }
    if (
      row.storage_path !== planned.source_storage_path &&
      row.storage_path !== planned.target_storage_path
    ) {
      throw new Error(`La ruta productiva cambió de forma inesperada para ${planned.sku}.`);
    }
    if (existing?.previous) {
      if (
        existing.previous.id !== row.id ||
        existing.previous.storage_path !== planned.source_storage_path
      ) {
        throw new Error(`El ledger no conserva la versión original de ${planned.sku}.`);
      }
    } else if (row.storage_path !== planned.source_storage_path) {
      throw new Error(`Existe una versión normalizada sin ledger para ${planned.sku}.`);
    }

    const activeObject = await adapter.inspectObject(row.storage_path);
    assertObjectMatchesRow(activeObject, row, `${planned.sku}/${row.storage_path}`);
    const targetObject =
      row.storage_path === planned.target_storage_path
        ? activeObject
        : await adapter.inspectObject(planned.target_storage_path);
    if (targetObject) {
      if (
        targetObject.sha256 !== planned.output_hash ||
        targetObject.width !== planned.output_width ||
        targetObject.height !== planned.output_height
      ) {
        throw new Error(`La ruta normalizada de ${planned.sku} ya contiene otros bytes.`);
      }
      if (!existing) {
        throw new Error(`La ruta normalizada de ${planned.sku} existe sin ledger.`);
      }
    }
    if (row.storage_path === planned.target_storage_path && !targetObject) {
      throw new Error(`La fila de ${planned.sku} apunta a un objeto normalizado inexistente.`);
    }

    const previous = existing?.previous ?? row;
    const product = previous.is_primary ? await adapter.getProduct(planned.product_id) : null;
    if (
      product &&
      ![previous.public_url, existing?.replacement?.public_url].includes(product.primary_image_url)
    ) {
      throw new Error(`La imagen principal del producto ${planned.sku} cambió externamente.`);
    }
    if (
      row.storage_path === planned.source_storage_path &&
      product &&
      product.primary_image_url !== previous.public_url
    ) {
      throw new Error(`La fila y la imagen principal de ${planned.sku} no son coherentes.`);
    }

    let resumeStage = "planned";
    if (row.storage_path === planned.source_storage_path && targetObject) resumeStage = "uploaded";
    if (row.storage_path === planned.target_storage_path) {
      resumeStage =
        !product || product.primary_image_url === existing.replacement.public_url
          ? "applied"
          : "row_updated";
    }
    states.push({ planned, row, previous, product, targetObject, resumeStage });
  }

  const conflicts = await adapter.findImagesByHashes(plan.map((item) => item.output_hash));
  const stateByHash = new Map(states.map((state) => [state.planned.output_hash, state]));
  for (const conflict of conflicts) {
    const state = stateByHash.get(conflict.content_hash);
    if (!state || conflict.id !== state.row.id) {
      throw new Error(
        `El hash ${String(conflict.content_hash).slice(0, 12)} ya pertenece a otra imagen.`,
      );
    }
  }
  return states;
}

function createLedger(context, plan, preflight, adapter) {
  const stateByReview = new Map(preflight.map((state) => [state.planned.review_id, state]));
  return {
    schema_version: 2,
    generated_at: nowIso(),
    updated_at: nowIso(),
    status: "preflight_complete",
    manifest_path: context.manifestPath,
    manifest_sha256: context.manifestHash,
    approval_path: context.approvalPath,
    approval_sha256: context.approvalHash,
    run_id: context.manifest.run_id,
    pipeline_version: context.manifest.pipeline_version,
    changes: plan.map((planned) => {
      const state = stateByReview.get(planned.review_id);
      return {
        review_id: planned.review_id,
        image_id: state.row.id,
        product_id: planned.product_id,
        sku: planned.sku,
        source_storage_path: planned.source_storage_path,
        output_path: planned.output_path,
        output_hash: planned.output_hash,
        output_width: planned.output_width,
        output_height: planned.output_height,
        previous: state.previous,
        replacement: {
          storage_path: planned.target_storage_path,
          public_url: adapter.publicUrl(planned.target_storage_path),
          content_hash: planned.output_hash,
          width: planned.output_width,
          height: planned.output_height,
        },
        stage: state.resumeStage,
        attempts: 0,
        last_error: null,
        history: [{ at: nowIso(), stage: state.resumeStage, reason: "remote_preflight" }],
      };
    }),
  };
}

function reconcileLedger(ledger, preflight) {
  const stateByReview = new Map(preflight.map((state) => [state.planned.review_id, state]));
  for (const change of ledger.changes) {
    const state = stateByReview.get(change.review_id);
    change.stage = state.resumeStage;
    change.last_error = null;
    change.history.push({ at: nowIso(), stage: state.resumeStage, reason: "resume_preflight" });
  }
  ledger.status = "preflight_complete";
  ledger.updated_at = nowIso();
}

async function persistStage(ledgerPath, ledger, change, stage, details = null) {
  change.stage = stage;
  change.last_error = null;
  change.history.push({ at: nowIso(), stage, ...(details ? { details } : {}) });
  ledger.updated_at = nowIso();
  await writeJsonAtomic(ledgerPath, ledger);
}

async function verifyAppliedChange(adapter, change) {
  const row = await adapter.getImage({ imageId: change.image_id });
  const replacement = change.replacement;
  if (
    row.storefront_product_id !== change.product_id ||
    row.storage_path !== replacement.storage_path ||
    row.public_url !== replacement.public_url ||
    row.content_hash !== replacement.content_hash ||
    Number(row.width) !== Number(replacement.width) ||
    Number(row.height) !== Number(replacement.height)
  ) {
    throw new Error(`La verificación de fila falló para ${change.sku}.`);
  }
  const object = await adapter.inspectObject(replacement.storage_path);
  if (
    !object ||
    object.sha256 !== replacement.content_hash ||
    object.width !== Number(replacement.width) ||
    object.height !== Number(replacement.height)
  ) {
    throw new Error(`La verificación del objeto normalizado falló para ${change.sku}.`);
  }
  const originalObject = await adapter.inspectObject(change.previous.storage_path);
  assertObjectMatchesRow(originalObject, change.previous, `${change.sku}/original`);
  if (change.previous.is_primary) {
    const product = await adapter.getProduct(change.product_id);
    if (product.primary_image_url !== replacement.public_url) {
      throw new Error(`La verificación de imagen principal falló para ${change.sku}.`);
    }
  }
  return true;
}

async function verifyRolledBackChange(adapter, change) {
  const row = await adapter.getImage({ imageId: change.image_id });
  if (
    row.storage_path !== change.previous.storage_path ||
    row.public_url !== change.previous.public_url ||
    row.content_hash !== change.previous.content_hash ||
    Number(row.width) !== Number(change.previous.width) ||
    Number(row.height) !== Number(change.previous.height)
  ) {
    throw new Error(`La verificación de rollback falló para ${change.sku}.`);
  }
  const originalObject = await adapter.inspectObject(change.previous.storage_path);
  assertObjectMatchesRow(originalObject, change.previous, `${change.sku}/original`);
  if (await adapter.inspectObject(change.replacement.storage_path)) {
    throw new Error(`El objeto revertido de ${change.sku} todavía existe.`);
  }
  if (change.previous.is_primary) {
    const product = await adapter.getProduct(change.product_id);
    if (product.primary_image_url !== change.previous.public_url) {
      throw new Error(`La imagen principal no se restauró para ${change.sku}.`);
    }
  }
  return true;
}

async function compensateChange(adapter, ledgerPath, ledger, change) {
  await persistStage(ledgerPath, ledger, change, "compensating");
  const row = await adapter.getImage({ imageId: change.image_id });
  if (
    row.storage_path !== change.previous.storage_path &&
    row.storage_path !== change.replacement.storage_path
  ) {
    throw new Error(`No es seguro compensar ${change.sku}: la fila cambió externamente.`);
  }
  if (row.storage_path === change.replacement.storage_path) {
    await persistStage(ledgerPath, ledger, change, "compensating_row");
    await adapter.updateImage(change.image_id, imageRestoreValues(change.previous), {
      storage_path: change.replacement.storage_path,
      public_url: change.replacement.public_url,
    });
  }
  if (change.previous.is_primary) {
    const product = await adapter.getProduct(change.product_id);
    if (
      ![change.previous.public_url, change.replacement.public_url].includes(
        product.primary_image_url,
      )
    ) {
      throw new Error(
        `No es seguro compensar ${change.sku}: la imagen principal cambió externamente.`,
      );
    }
    if (product.primary_image_url === change.replacement.public_url) {
      await persistStage(ledgerPath, ledger, change, "compensating_primary");
      await adapter.updateProduct(
        change.product_id,
        {
          primary_image_url: change.previous.public_url,
          updated_at: nowIso(),
        },
        {
          primary_image_url: change.replacement.public_url,
        },
      );
    }
  }
  if (await adapter.inspectObject(change.replacement.storage_path)) {
    await persistStage(ledgerPath, ledger, change, "compensating_object");
    await adapter.removeObject(change.replacement.storage_path);
  }
  await verifyRolledBackChange(adapter, change);
  await persistStage(ledgerPath, ledger, change, "compensated");
}

async function applyChange(adapter, ledgerPath, ledger, change) {
  change.attempts += 1;
  await persistStage(ledgerPath, ledger, change, change.stage, {
    attempt: change.attempts,
  });
  try {
    let row = await adapter.getImage({ imageId: change.image_id });
    let targetObject = await adapter.inspectObject(change.replacement.storage_path);
    if (!targetObject) {
      await persistStage(ledgerPath, ledger, change, "uploading");
      const buffer = await fs.readFile(change.output_path);
      if (bufferHash(buffer) !== change.output_hash) {
        throw new Error(`La salida local de ${change.sku} cambió antes de subirla.`);
      }
      await adapter.uploadObject(change.replacement.storage_path, buffer);
      await persistStage(ledgerPath, ledger, change, "uploaded");
      targetObject = await adapter.inspectObject(change.replacement.storage_path);
    }
    if (
      !targetObject ||
      targetObject.sha256 !== change.output_hash ||
      targetObject.width !== Number(change.output_width) ||
      targetObject.height !== Number(change.output_height)
    ) {
      throw new Error(`El objeto subido de ${change.sku} no coincide con la salida aprobada.`);
    }

    if (row.storage_path === change.previous.storage_path) {
      await persistStage(ledgerPath, ledger, change, "updating_row");
      row = await adapter.updateImage(change.image_id, replacementValues(change.replacement), {
        storage_path: change.previous.storage_path,
        public_url: change.previous.public_url,
      });
      await persistStage(ledgerPath, ledger, change, "row_updated");
    } else if (row.storage_path !== change.replacement.storage_path) {
      throw new Error(`La fila de ${change.sku} cambió durante la publicación.`);
    }

    if (change.previous.is_primary) {
      const product = await adapter.getProduct(change.product_id);
      if (product.primary_image_url === change.previous.public_url) {
        await persistStage(ledgerPath, ledger, change, "updating_primary");
        await adapter.updateProduct(
          change.product_id,
          {
            primary_image_url: change.replacement.public_url,
            updated_at: nowIso(),
          },
          {
            primary_image_url: change.previous.public_url,
          },
        );
        await persistStage(ledgerPath, ledger, change, "primary_updated");
      } else if (product.primary_image_url !== change.replacement.public_url) {
        throw new Error(`La imagen principal de ${change.sku} cambió durante la publicación.`);
      }
    }
    await verifyAppliedChange(adapter, change);
    await persistStage(ledgerPath, ledger, change, "verified");
  } catch (error) {
    change.last_error = String(error?.message ?? error);
    change.history.push({ at: nowIso(), stage: "item_failed", error: change.last_error });
    ledger.status = "item_failed";
    ledger.updated_at = nowIso();
    await writeJsonAtomic(ledgerPath, ledger);
    try {
      await compensateChange(adapter, ledgerPath, ledger, change);
      ledger.status = "failed_item_compensated";
      ledger.updated_at = nowIso();
      await writeJsonAtomic(ledgerPath, ledger);
    } catch (compensationError) {
      change.stage = "compensation_failed";
      change.last_error = `${change.last_error}; compensación: ${
        compensationError?.message ?? compensationError
      }`;
      change.history.push({
        at: nowIso(),
        stage: "compensation_failed",
        error: String(compensationError?.message ?? compensationError),
      });
      ledger.status = "compensation_failed";
      ledger.updated_at = nowIso();
      await writeJsonAtomic(ledgerPath, ledger);
      throw new AggregateError(
        [error, compensationError],
        `Falló ${change.sku} y su compensación no pudo completarse.`,
      );
    }
    throw new Error(`Falló ${change.sku}; el ítem fue compensado: ${error.message}`, {
      cause: error,
    });
  }
}

async function buildContext(manifestPath, approvalPath) {
  const resolvedManifest = path.resolve(manifestPath);
  const resolvedApproval = path.resolve(approvalPath);
  const verified = await verifyApproval(resolvedManifest, resolvedApproval);
  return {
    ...verified,
    manifestPath: resolvedManifest,
    approvalPath: resolvedApproval,
    manifestHash: await fileHash(resolvedManifest),
    approvalHash: await fileHash(resolvedApproval),
  };
}

export async function uploadApproved({
  manifestPath,
  approvalPath,
  rollbackPath,
  dryRun = false,
  adapter: providedAdapter = null,
}) {
  const context = await buildContext(manifestPath, approvalPath);
  await validateManifestLocalOutputs(context.manifest);
  const plan = await buildUploadPlan(context.manifest, context.approvedItems);
  const ledgerPath = path.resolve(
    rollbackPath ?? path.join(path.dirname(context.manifestPath), "upload-rollback.json"),
  );
  const existingLedger = await readLedgerIfPresent(ledgerPath);
  if (existingLedger) validateExistingLedger(existingLedger, context, plan);

  const adapter = providedAdapter ?? createSupabaseStorageAdapter(await createAdminClient());
  const preflight = await remotePreflight({ adapter, plan, existingLedger });
  if (dryRun) {
    return {
      mode: "upload-dry-run",
      database_modified: false,
      storage_modified: false,
      remote_preflight: "passed",
      resumable_ledger: existingLedger ? ledgerPath : null,
      plan,
    };
  }

  const ledger = existingLedger ?? createLedger(context, plan, preflight, adapter);
  if (existingLedger) reconcileLedger(ledger, preflight);
  ledger.status = "in_progress";
  ledger.updated_at = nowIso();
  await writeJsonAtomic(ledgerPath, ledger);

  for (const change of ledger.changes) {
    if (change.stage === "applied" || change.stage === "verified") {
      await verifyAppliedChange(adapter, change);
      if (change.stage !== "verified") {
        await persistStage(ledgerPath, ledger, change, "verified");
      }
      continue;
    }
    await applyChange(adapter, ledgerPath, ledger, change);
  }

  for (const change of ledger.changes) await verifyAppliedChange(adapter, change);
  ledger.status = "completed";
  ledger.completed_at = nowIso();
  ledger.updated_at = ledger.completed_at;
  await writeJsonAtomic(ledgerPath, ledger);
  return {
    mode: "upload",
    database_modified: ledger.changes.length > 0,
    storage_modified: ledger.changes.length > 0,
    uploaded: ledger.changes.length,
    rejected: context.manifest.items.length - context.approvedItems.length,
    remote_preflight: "passed",
    post_batch_verification: "passed",
    rollback: ledgerPath,
    resumed: Boolean(existingLedger),
    note: "Los objetos anteriores se preservaron y cada etapa quedó registrada.",
    approval: context.approval,
  };
}

async function rollbackChange(adapter, ledgerPath, ledger, change) {
  await persistStage(ledgerPath, ledger, change, "rollback_started");
  try {
    const row = await adapter.getImage({ imageId: change.image_id });
    if (
      row.storage_path !== change.previous.storage_path &&
      row.storage_path !== change.replacement.storage_path
    ) {
      throw new Error(`No es seguro revertir ${change.sku}: la fila cambió externamente.`);
    }
    if (row.storage_path === change.replacement.storage_path) {
      await persistStage(ledgerPath, ledger, change, "rollback_restoring_row");
      await adapter.updateImage(change.image_id, imageRestoreValues(change.previous), {
        storage_path: change.replacement.storage_path,
        public_url: change.replacement.public_url,
      });
    }
    if (change.previous.is_primary) {
      const product = await adapter.getProduct(change.product_id);
      if (
        ![change.previous.public_url, change.replacement.public_url].includes(
          product.primary_image_url,
        )
      ) {
        throw new Error(`No es seguro revertir ${change.sku}: el producto cambió externamente.`);
      }
      if (product.primary_image_url === change.replacement.public_url) {
        await persistStage(ledgerPath, ledger, change, "rollback_restoring_primary");
        await adapter.updateProduct(
          change.product_id,
          {
            primary_image_url: change.previous.public_url,
            updated_at: nowIso(),
          },
          {
            primary_image_url: change.replacement.public_url,
          },
        );
      }
    }
    if (await adapter.inspectObject(change.replacement.storage_path)) {
      await persistStage(ledgerPath, ledger, change, "rollback_removing_object");
      await adapter.removeObject(change.replacement.storage_path);
    }
    await verifyRolledBackChange(adapter, change);
    await persistStage(ledgerPath, ledger, change, "rolled_back");
  } catch (error) {
    change.stage = "rollback_failed";
    change.last_error = String(error?.message ?? error);
    change.history.push({ at: nowIso(), stage: "rollback_failed", error: change.last_error });
    ledger.status = "rollback_failed";
    ledger.updated_at = nowIso();
    await writeJsonAtomic(ledgerPath, ledger);
    throw error;
  }
}

export async function rollbackUpload({
  rollbackPath,
  dryRun = false,
  adapter: providedAdapter = null,
}) {
  const ledgerPath = path.resolve(rollbackPath);
  const ledger = await readJson(ledgerPath);
  if (ledger.schema_version !== 2 || !Array.isArray(ledger.changes)) {
    throw new Error("Ledger de rollback inválido o no reanudable.");
  }
  if (dryRun && !providedAdapter) {
    return {
      mode: "rollback-dry-run",
      database_modified: false,
      storage_modified: false,
      changes: ledger.changes.length,
      note: "Preflight local; use SUPABASE_SECRET_KEY para verificación remota.",
    };
  }
  const adapter = providedAdapter ?? createSupabaseStorageAdapter(await createAdminClient());
  if (dryRun) {
    const states = [];
    for (const change of ledger.changes) {
      const row = await adapter.getImage({ imageId: change.image_id });
      if (
        row.storage_path !== change.previous.storage_path &&
        row.storage_path !== change.replacement.storage_path
      ) {
        throw new Error(`No es seguro revertir ${change.sku}: la fila cambió externamente.`);
      }
      states.push({
        sku: change.sku,
        state:
          row.storage_path === change.previous.storage_path
            ? "already_restored"
            : "ready_to_restore",
      });
    }
    return {
      mode: "rollback-dry-run",
      database_modified: false,
      storage_modified: false,
      remote_preflight: "passed",
      states,
    };
  }

  ledger.status = "rollback_in_progress";
  ledger.rollback_started_at ??= nowIso();
  ledger.updated_at = nowIso();
  await writeJsonAtomic(ledgerPath, ledger);
  for (const change of [...ledger.changes].reverse()) {
    if (change.stage === "rolled_back") {
      await verifyRolledBackChange(adapter, change);
      continue;
    }
    await rollbackChange(adapter, ledgerPath, ledger, change);
  }
  for (const change of ledger.changes) await verifyRolledBackChange(adapter, change);
  ledger.status = "rolled_back";
  ledger.rolled_back_at = nowIso();
  ledger.updated_at = ledger.rolled_back_at;
  await writeJsonAtomic(ledgerPath, ledger);

  const resultPath = path.join(path.dirname(ledgerPath), "rollback-result.json");
  const result = {
    rolled_back_at: ledger.rolled_back_at,
    source_ledger: ledgerPath,
    restored: ledger.changes.map((change) => change.image_id),
    database_modified: ledger.changes.length > 0,
    storage_modified: ledger.changes.length > 0,
    post_rollback_verification: "passed",
    resumable: true,
  };
  await writeJsonAtomic(resultPath, result);
  return result;
}
