import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildUploadPlan, verifyApproval } from "./storage.mjs";

const BUCKET = "storefront-products";
const LEDGER_KIND = "catalog-edge-storage-upload";
const LEDGER_SCHEMA_VERSION = 1;
const SNAPSHOT_ACTION = "catalog.images.publish_snapshot";
const SNAPSHOT_ENTITY_TYPE = "catalog_image_publication";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const SHA256_PATTERN = /^[0-9a-f]{64}$/iu;
const PROJECT_REF_PATTERN = /^[a-z0-9]{20}$/u;

const EXPECTED_RECORD = `(
  review_id text,
  locator_image_id uuid,
  product_id uuid,
  sku text,
  bucket_id text,
  old_storage_path text,
  old_public_url text,
  old_is_primary boolean,
  new_storage_path text,
  new_public_url text,
  new_content_hash text,
  new_width integer,
  new_height integer,
  new_size bigint
)`;

const SNAPSHOT_RECORD = `(
  review_id text,
  image_id uuid,
  product_id uuid,
  sku text,
  bucket_id text,
  old_storage_path text,
  old_public_url text,
  old_alt_text text,
  old_content_hash text,
  old_width integer,
  old_height integer,
  old_sort_order integer,
  old_is_primary boolean,
  old_created_at timestamptz,
  old_product_primary_url text,
  new_storage_path text,
  new_public_url text,
  new_content_hash text,
  new_width integer,
  new_height integer,
  new_size bigint
)`;

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

async function fileSha256(filename) {
  return sha256(await fs.readFile(filename));
}

async function readJson(filename) {
  return JSON.parse(await fs.readFile(filename, "utf8"));
}

async function writeAtomic(filename, content) {
  await fs.mkdir(path.dirname(filename), { recursive: true });
  const temporary = `${filename}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, content, { encoding: "utf8", flag: "wx" });
  await fs.rename(temporary, filename);
}

function requireString(value, label) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} debe ser texto no vacío.`);
  }
  return value;
}

function requireUuid(value, label) {
  const normalized = requireString(value, label).toLowerCase();
  if (!UUID_PATTERN.test(normalized)) throw new Error(`${label} no es un UUID válido.`);
  return normalized;
}

function requireSha256(value, label) {
  const normalized = requireString(value, label).toLowerCase();
  if (!SHA256_PATTERN.test(normalized)) throw new Error(`${label} no es un SHA-256 válido.`);
  return normalized;
}

function manifestProjectRef(manifest) {
  const refs = new Set();
  for (const item of manifest.items) {
    let url;
    try {
      url = new URL(item.source.production_url);
    } catch {
      throw new Error(`La URL productiva de ${item.sku} no es válida.`);
    }
    const match = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u);
    const expectedPath = `/storage/v1/object/public/${BUCKET}/${item.source.production_storage_path}`;
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.port ||
      url.search ||
      url.hash ||
      !match ||
      decodeURIComponent(url.pathname) !== expectedPath
    ) {
      throw new Error(`La URL productiva de ${item.sku} no coincide con Storage.`);
    }
    refs.add(match[1]);
  }
  if (refs.size !== 1) throw new Error("El manifiesto mezcla proyectos Supabase.");
  return [...refs][0];
}

function verifyTargetUrl(publicUrl, storagePath, bucket) {
  let url;
  try {
    url = new URL(publicUrl);
  } catch {
    throw new Error(`La URL normalizada de ${storagePath} no es válida.`);
  }
  const host = url.hostname.match(/^([a-z0-9]{20})\.supabase\.co$/u);
  const expectedPath = `/storage/v1/object/public/${bucket}/${storagePath}`;
  if (
    url.protocol !== "https:" ||
    url.username ||
    url.password ||
    url.port ||
    !host ||
    !PROJECT_REF_PATTERN.test(host[1]) ||
    decodeURIComponent(url.pathname) !== expectedPath ||
    url.search ||
    url.hash
  ) {
    throw new Error(`La URL normalizada de ${storagePath} no coincide con Storage.`);
  }
  return host[1];
}

export function edgeUploadPlanHash(plan) {
  return sha256(
    JSON.stringify(
      plan.map((item) => ({
        review_id: item.review_id,
        path: item.target_storage_path,
        sha256: item.output_hash,
        bytes: item.output_bytes,
      })),
    ),
  );
}

export const uploadPlanHash = edgeUploadPlanHash;

function validateDatabaseTransaction(item, planned, manifestItem) {
  const transaction = item.database_transaction;
  if (!transaction || typeof transaction !== "object") {
    throw new Error(`Falta database_transaction para ${planned.sku}.`);
  }
  const locator = transaction.image_locator;
  let locatorImageId = null;
  if (planned.image_id) {
    if (locator?.type !== "id") throw new Error(`Localizador incorrecto para ${planned.sku}.`);
    locatorImageId = requireUuid(locator.id, `image_locator.id de ${planned.sku}`);
    if (locatorImageId !== planned.image_id.toLowerCase()) {
      throw new Error(`El localizador por ID cambió para ${planned.sku}.`);
    }
  } else if (
    locator?.type !== "storage_path" ||
    locator.storage_path !== planned.source_storage_path
  ) {
    throw new Error(`El localizador por ruta cambió para ${planned.sku}.`);
  }

  const expected = transaction.expected_image;
  if (
    expected?.product_id !== planned.product_id ||
    expected?.storage_path !== planned.source_storage_path ||
    expected?.public_url !== manifestItem.source.production_url ||
    expected?.is_primary !== Boolean(manifestItem.is_primary) ||
    expected?.sort_order !== Number(manifestItem.position)
  ) {
    throw new Error(`Los valores DB esperados cambiaron para ${planned.sku}.`);
  }
  const replacement = transaction.replacement_image;
  if (
    replacement?.storage_path !== planned.target_storage_path ||
    replacement?.public_url !== item.target.public_url ||
    replacement?.content_hash !== planned.output_hash ||
    replacement?.width !== planned.output_width ||
    replacement?.height !== planned.output_height
  ) {
    throw new Error(`Los valores de reemplazo cambiaron para ${planned.sku}.`);
  }
  if (manifestItem.is_primary) {
    const primary = transaction.product_primary;
    if (
      primary?.product_id !== planned.product_id ||
      primary?.expected_public_url !== manifestItem.source.production_url ||
      primary?.replacement_public_url !== item.target.public_url
    ) {
      throw new Error(`El contrato de imagen principal cambió para ${planned.sku}.`);
    }
  } else if (transaction.product_primary !== null) {
    throw new Error(`Una imagen secundaria no puede actualizar ${planned.sku}.`);
  }
  return locatorImageId;
}

export function validateVerifiedUploadLedger({
  manifest,
  approval,
  plan,
  ledger,
  manifestHash,
  approvalHash,
}) {
  if (
    ledger?.kind !== LEDGER_KIND ||
    ledger?.schema_version !== LEDGER_SCHEMA_VERSION ||
    ledger?.status !== "completed" ||
    ledger?.storage_only !== true ||
    ledger?.database_modified !== false
  ) {
    throw new Error(
      `El ledger debe ser ${LEDGER_KIND} v${LEDGER_SCHEMA_VERSION}, completed y storage_only.`,
    );
  }
  if (
    ledger?.manifest?.sha256 !== manifestHash ||
    ledger?.approval?.sha256 !== approvalHash ||
    ledger.run_id !== manifest.run_id ||
    ledger.pipeline_version !== manifest.pipeline_version
  ) {
    throw new Error("El ledger edge no corresponde al manifiesto y aprobación actuales.");
  }
  const planHash = edgeUploadPlanHash(plan);
  if (ledger.plan_sha256 !== planHash) {
    throw new Error("El ledger edge no corresponde al plan local recalculado.");
  }
  if (ledger.bucket !== BUCKET) throw new Error(`El bucket debe ser ${BUCKET}.`);
  if (!Array.isArray(ledger.items) || ledger.items.length !== plan.length) {
    throw new Error("El ledger edge debe contener exactamente una entrada por imagen.");
  }
  if (
    ledger.counts?.verified !== plan.length ||
    ledger.counts?.pending !== 0 ||
    approval.items.length !== manifest.items.length ||
    plan.length !== manifest.items.length
  ) {
    throw new Error("La publicación SQL exige las 185 imágenes cargadas y aprobadas.");
  }

  const manifestItems = new Map(manifest.items.map((item) => [item.id, item]));
  const ledgerItems = new Map();
  for (const item of ledger.items) {
    const reviewId = requireString(item?.review_id, "ledger.items[].review_id");
    if (ledgerItems.has(reviewId)) throw new Error(`review_id duplicado: ${reviewId}.`);
    ledgerItems.set(reviewId, item);
  }

  const refs = new Set();
  const expected = [];
  for (const planned of plan) {
    const item = ledgerItems.get(planned.review_id);
    const manifestItem = manifestItems.get(planned.review_id);
    if (!item || !manifestItem) throw new Error(`Falta la carga verificada de ${planned.sku}.`);
    if (
      item.stage !== "verified" ||
      !Date.parse(item.verified_at ?? "") ||
      item.product_id !== planned.product_id ||
      item.sku !== planned.sku
    ) {
      throw new Error(`La identidad o verificación edge no coincide para ${planned.sku}.`);
    }
    if (item.image_id !== planned.image_id) {
      throw new Error(`El image_id edge no coincide para ${planned.sku}.`);
    }
    const local = item.local;
    if (
      path.resolve(local?.path ?? "") !== planned.output_path ||
      local?.sha256 !== planned.output_hash ||
      local?.bytes !== planned.output_bytes ||
      local?.width !== planned.output_width ||
      local?.height !== planned.output_height ||
      local?.content_type !== "image/webp"
    ) {
      throw new Error(`La salida local del ledger cambió para ${planned.sku}.`);
    }
    const target = item.target;
    if (
      target?.bucket !== BUCKET ||
      target?.storage_path !== planned.target_storage_path ||
      target?.overwrite !== false
    ) {
      throw new Error(`El destino edge cambió para ${planned.sku}.`);
    }
    refs.add(verifyTargetUrl(target.public_url, planned.target_storage_path, BUCKET));
    const locatorImageId = validateDatabaseTransaction(item, planned, manifestItem);
    expected.push({
      review_id: planned.review_id,
      locator_image_id: locatorImageId,
      product_id: planned.product_id.toLowerCase(),
      sku: planned.sku,
      bucket_id: BUCKET,
      old_storage_path: planned.source_storage_path,
      old_public_url: manifestItem.source.production_url,
      old_is_primary: Boolean(manifestItem.is_primary),
      new_storage_path: planned.target_storage_path,
      new_public_url: target.public_url,
      new_content_hash: requireSha256(planned.output_hash, `hash de ${planned.sku}`),
      new_width: planned.output_width,
      new_height: planned.output_height,
      new_size: planned.output_bytes,
    });
  }

  if (refs.size !== 1 || [...refs][0] !== manifestProjectRef(manifest)) {
    throw new Error("El ledger edge mezcla proyectos o no coincide con el manifiesto.");
  }
  for (const [label, values] of [
    ["old_storage_path", expected.map((item) => item.old_storage_path)],
    ["new_storage_path", expected.map((item) => item.new_storage_path)],
    ["new_content_hash", expected.map((item) => item.new_content_hash)],
  ]) {
    if (new Set(values).size !== values.length) {
      throw new Error(`El ledger contiene ${label} duplicados.`);
    }
  }
  const primaryProducts = expected
    .filter((item) => item.old_is_primary)
    .map((item) => item.product_id);
  if (new Set(primaryProducts).size !== primaryProducts.length) {
    throw new Error("El ledger contiene más de una imagen primaria por producto.");
  }
  return {
    expected,
    projectRef: [...refs][0],
    bucket: BUCKET,
    planHash,
  };
}

function sqlText(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlJson(value) {
  const json = JSON.stringify(value);
  let seed = sha256(json).slice(0, 16);
  let tag = `$catalog_${seed}$`;
  while (json.includes(tag)) {
    seed = sha256(`${seed}:${json}`).slice(0, 16);
    tag = `$catalog_${seed}$`;
  }
  return `${tag}${json}${tag}`;
}

function header({ title, generatedAt, manifestHash, approvalHash, ledgerHash }) {
  return `-- ${title}
-- Generated at: ${generatedAt}
-- Manifest SHA-256: ${manifestHash}
-- Approval SHA-256: ${approvalHash}
-- Edge upload ledger SHA-256: ${ledgerHash}
-- Generated file: do not edit by hand.
`;
}

function locatorJoin(image = "i", expected = "e") {
  return `((${expected}.locator_image_id is not null and ${image}.id = ${expected}.locator_image_id)
      or (${expected}.locator_image_id is null and ${image}.storage_path = ${expected}.old_storage_path))`;
}

function knownOldMatches(image = "i", expected = "e") {
  return `${locatorJoin(image, expected)}
      and ${image}.storefront_product_id is not distinct from ${expected}.product_id
      and ${image}.storage_path is not distinct from ${expected}.old_storage_path
      and ${image}.public_url is not distinct from ${expected}.old_public_url
      and ${image}.is_primary is not distinct from ${expected}.old_is_primary
      and ${image}.content_hash ~* '^[0-9a-f]{64}$'
      and ${image}.width > 0
      and ${image}.height > 0`;
}

function newMatches(image = "i", expected = "e") {
  return `${image}.storefront_product_id is not distinct from ${expected}.product_id
      and ${image}.storage_path is not distinct from ${expected}.new_storage_path
      and ${image}.public_url is not distinct from ${expected}.new_public_url
      and ${image}.content_hash is not distinct from ${expected}.new_content_hash
      and ${image}.width is not distinct from ${expected}.new_width
      and ${image}.height is not distinct from ${expected}.new_height
      and ${image}.is_primary is not distinct from ${expected}.old_is_primary`;
}

function oldSnapshotMatches(image = "i", snapshot = "s") {
  return `${image}.id = ${snapshot}.image_id
      and ${image}.storefront_product_id is not distinct from ${snapshot}.product_id
      and ${image}.storage_path is not distinct from ${snapshot}.old_storage_path
      and ${image}.public_url is not distinct from ${snapshot}.old_public_url
      and ${image}.alt_text is not distinct from ${snapshot}.old_alt_text
      and ${image}.content_hash is not distinct from ${snapshot}.old_content_hash
      and ${image}.width is not distinct from ${snapshot}.old_width
      and ${image}.height is not distinct from ${snapshot}.old_height
      and ${image}.sort_order is not distinct from ${snapshot}.old_sort_order
      and ${image}.is_primary is not distinct from ${snapshot}.old_is_primary
      and ${image}.created_at is not distinct from ${snapshot}.old_created_at`;
}

function newSnapshotMatches(image = "i", snapshot = "s") {
  return `${image}.id = ${snapshot}.image_id
      and ${image}.storefront_product_id is not distinct from ${snapshot}.product_id
      and ${image}.storage_path is not distinct from ${snapshot}.new_storage_path
      and ${image}.public_url is not distinct from ${snapshot}.new_public_url
      and ${image}.alt_text is not distinct from ${snapshot}.old_alt_text
      and ${image}.content_hash is not distinct from ${snapshot}.new_content_hash
      and ${image}.width is not distinct from ${snapshot}.new_width
      and ${image}.height is not distinct from ${snapshot}.new_height
      and ${image}.sort_order is not distinct from ${snapshot}.old_sort_order
      and ${image}.is_primary is not distinct from ${snapshot}.old_is_primary
      and ${image}.created_at is not distinct from ${snapshot}.old_created_at`;
}

function objectMatches(object = "o", expected = "e") {
  return `case
        when coalesce(${object}.metadata ->> 'size', '') ~ '^[0-9]+$'
          then (${object}.metadata ->> 'size')::bigint
        else null
      end is not distinct from ${expected}.new_size
      and lower(coalesce(
        ${object}.metadata ->> 'mimetype',
        ${object}.metadata ->> 'contentType',
        ''
      )) = 'image/webp'`;
}

function expectedCte(expected) {
  return `expected as (
  select *
  from jsonb_to_recordset(${sqlJson(expected)}::jsonb) as e ${EXPECTED_RECORD}
)`;
}

function expectedTemp(expected) {
  return `create temporary table catalog_publish_expected (
  review_id text primary key,
  locator_image_id uuid,
  product_id uuid not null,
  sku text not null,
  bucket_id text not null,
  old_storage_path text not null unique,
  old_public_url text not null,
  old_is_primary boolean not null,
  new_storage_path text not null unique,
  new_public_url text not null,
  new_content_hash text not null unique,
  new_width integer not null,
  new_height integer not null,
  new_size bigint not null
) on commit drop;

insert into catalog_publish_expected
select *
from jsonb_to_recordset(${sqlJson(expected)}::jsonb) as e ${EXPECTED_RECORD};`;
}

function snapshotTemp() {
  return `create temporary table catalog_publish_snapshot (
  review_id text primary key,
  image_id uuid not null unique,
  product_id uuid not null,
  sku text not null,
  bucket_id text not null,
  old_storage_path text not null unique,
  old_public_url text not null,
  old_alt_text text not null,
  old_content_hash text not null,
  old_width integer not null,
  old_height integer not null,
  old_sort_order integer not null,
  old_is_primary boolean not null,
  old_created_at timestamptz not null,
  old_product_primary_url text,
  new_storage_path text not null unique,
  new_public_url text not null,
  new_content_hash text not null unique,
  new_width integer not null,
  new_height integer not null,
  new_size bigint not null
) on commit drop;`;
}

export function renderPreflightSql(context) {
  const { expected, runId, snapshotEntityId, generatedAt, manifestHash, approvalHash, ledgerHash } =
    context;
  return `${header({
    title: "Catalog images: read-only SQL preflight",
    generatedAt,
    manifestHash,
    approvalHash,
    ledgerHash,
  })}
begin transaction read only;
set local statement_timeout = '120s';

with
${expectedCte(expected)},
image_checks as (
  select e.*, (${knownOldMatches("i", "e")}) as matches, to_jsonb(i) as actual
  from expected e
  left join public.storefront_product_images i on ${locatorJoin("i", "e")}
),
product_checks as (
  select e.*, (
    p.id = e.product_id and p.primary_image_url is not distinct from e.old_public_url
  ) as matches, to_jsonb(p) as actual
  from expected e
  left join public.storefront_products p
    on e.old_is_primary and p.id = e.product_id
  where e.old_is_primary
),
object_checks as (
  select e.*, (${objectMatches("o", "e")}) as matches, to_jsonb(o) as actual
  from expected e
  left join storage.objects o
    on o.bucket_id = e.bucket_id and o.name = e.new_storage_path
),
issues as (
  select jsonb_build_object(
    'type', 'image_row_drift', 'sku', sku, 'locator_image_id', locator_image_id, 'actual', actual
  ) as issue
  from image_checks where not coalesce(matches, false)
  union all
  select jsonb_build_object(
    'type', 'primary_product_drift', 'sku', sku, 'product_id', product_id, 'actual', actual
  )
  from product_checks where not coalesce(matches, false)
  union all
  select jsonb_build_object(
    'type', 'new_storage_object_drift', 'sku', sku, 'path', new_storage_path, 'actual', actual
  )
  from object_checks where not coalesce(matches, false)
  union all
  select jsonb_build_object(
    'type', 'original_storage_object_missing', 'sku', e.sku, 'path', e.old_storage_path
  )
  from expected e
  left join storage.objects o
    on o.bucket_id = e.bucket_id and o.name = e.old_storage_path
  where o.id is null
  union all
  select jsonb_build_object(
    'type', 'target_path_or_hash_conflict', 'sku', e.sku, 'conflicting_image_id', i.id
  )
  from expected e
  join public.storefront_product_images i
    on i.storage_path = e.new_storage_path or i.content_hash = e.new_content_hash
  union all
  select jsonb_build_object(
    'type', 'publication_snapshot_already_exists', 'entity_id', ${sqlText(snapshotEntityId)}
  )
  where exists (
    select 1 from public.storefront_admin_logs
    where action = ${sqlText(SNAPSHOT_ACTION)}
      and entity_type = ${sqlText(SNAPSHOT_ENTITY_TYPE)}
      and entity_id = ${sqlText(snapshotEntityId)}
  )
)
select jsonb_build_object(
  'run_id', ${sqlText(runId)},
  'mode', 'read_only_preflight',
  'expected_images', (select count(*) from expected),
  'expected_primary_products', (select count(*) from expected where old_is_primary),
  'ready', not exists (select 1 from issues),
  'issue_count', (select count(*) from issues),
  'issues', coalesce((select jsonb_agg(issue) from issues), '[]'::jsonb)
) as catalog_image_preflight;

commit;
`;
}

export function renderPublishSql(context) {
  const { expected, runId, snapshotEntityId, generatedAt, manifestHash, approvalHash, ledgerHash } =
    context;
  const imageCount = expected.length;
  const primaryCount = expected.filter((item) => item.old_is_primary).length;
  return `${header({
    title: "Catalog images: atomic compare-and-swap publication",
    generatedAt,
    manifestHash,
    approvalHash,
    ledgerHash,
  })}
begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

${expectedTemp(expected)}
${snapshotTemp()}

do $catalog_publish$
declare
  expected_count constant integer := ${imageCount};
  expected_primary_count constant integer := ${primaryCount};
  actual_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(${sqlText(
    `catalog-image-publication:${runId}`,
  )}, 0));

  select count(*) into actual_count from catalog_publish_expected;
  if actual_count <> expected_count then
    raise exception 'catalog_publish_expected_count_drift: expected %, got %',
      expected_count, actual_count;
  end if;
  if exists (
    select 1 from public.storefront_admin_logs
    where action = ${sqlText(SNAPSHOT_ACTION)}
      and entity_type = ${sqlText(SNAPSHOT_ENTITY_TYPE)}
      and entity_id = ${sqlText(snapshotEntityId)}
  ) then
    raise exception 'catalog_publish_snapshot_already_exists';
  end if;

  perform i.id
  from public.storefront_product_images i
  join catalog_publish_expected e on ${locatorJoin("i", "e")}
  order by i.id
  for update of i;

  select count(*) into actual_count
  from catalog_publish_expected e
  join public.storefront_product_images i on ${knownOldMatches("i", "e")};
  if actual_count <> expected_count then
    raise exception 'catalog_publish_image_row_drift: expected %, matched %',
      expected_count, actual_count;
  end if;

  perform p.id
  from public.storefront_products p
  join catalog_publish_expected e on e.old_is_primary and p.id = e.product_id
  order by p.id
  for update of p;

  select count(*) into actual_count
  from catalog_publish_expected e
  join public.storefront_products p
    on e.old_is_primary
    and p.id = e.product_id
    and p.primary_image_url is not distinct from e.old_public_url;
  if actual_count <> expected_primary_count then
    raise exception 'catalog_publish_primary_product_drift: expected %, matched %',
      expected_primary_count, actual_count;
  end if;

  perform o.id
  from storage.objects o
  join catalog_publish_expected e
    on o.bucket_id = e.bucket_id
    and o.name in (e.old_storage_path, e.new_storage_path)
  order by o.id
  for share of o;

  select count(*) into actual_count
  from catalog_publish_expected e
  join storage.objects o
    on o.bucket_id = e.bucket_id
    and o.name = e.new_storage_path
    and ${objectMatches("o", "e")};
  if actual_count <> expected_count then
    raise exception 'catalog_publish_new_storage_object_drift: expected %, matched %',
      expected_count, actual_count;
  end if;

  select count(*) into actual_count
  from catalog_publish_expected e
  join storage.objects o
    on o.bucket_id = e.bucket_id and o.name = e.old_storage_path;
  if actual_count <> expected_count then
    raise exception 'catalog_publish_original_storage_object_missing: expected %, matched %',
      expected_count, actual_count;
  end if;

  if exists (
    select 1
    from catalog_publish_expected e
    join public.storefront_product_images i
      on i.storage_path = e.new_storage_path or i.content_hash = e.new_content_hash
  ) then
    raise exception 'catalog_publish_target_conflict';
  end if;

  insert into catalog_publish_snapshot (
    review_id, image_id, product_id, sku, bucket_id,
    old_storage_path, old_public_url, old_alt_text, old_content_hash,
    old_width, old_height, old_sort_order, old_is_primary, old_created_at,
    old_product_primary_url, new_storage_path, new_public_url,
    new_content_hash, new_width, new_height, new_size
  )
  select
    e.review_id, i.id, e.product_id, e.sku, e.bucket_id,
    i.storage_path, i.public_url, i.alt_text, i.content_hash,
    i.width, i.height, i.sort_order, i.is_primary, i.created_at,
    case when e.old_is_primary then p.primary_image_url else null end,
    e.new_storage_path, e.new_public_url, e.new_content_hash,
    e.new_width, e.new_height, e.new_size
  from catalog_publish_expected e
  join public.storefront_product_images i on ${knownOldMatches("i", "e")}
  left join public.storefront_products p
    on e.old_is_primary and p.id = e.product_id;
  get diagnostics actual_count = row_count;
  if actual_count <> expected_count then
    raise exception 'catalog_publish_snapshot_count_drift: expected %, captured %',
      expected_count, actual_count;
  end if;

  insert into public.storefront_admin_logs (
    admin_user_id, action, entity_type, entity_id, metadata
  )
  select
    auth.uid(),
    ${sqlText(SNAPSHOT_ACTION)},
    ${sqlText(SNAPSHOT_ENTITY_TYPE)},
    ${sqlText(snapshotEntityId)},
    jsonb_build_object(
      'schema_version', 1,
      'run_id', ${sqlText(runId)},
      'manifest_sha256', ${sqlText(manifestHash)},
      'approval_sha256', ${sqlText(approvalHash)},
      'edge_ledger_sha256', ${sqlText(ledgerHash)},
      'captured_at', clock_timestamp(),
      'expected_count', expected_count,
      'expected_primary_count', expected_primary_count,
      'changes', (select jsonb_agg(to_jsonb(s) order by s.review_id)
                  from catalog_publish_snapshot s)
    );
  get diagnostics actual_count = row_count;
  if actual_count <> 1 then
    raise exception 'catalog_publish_snapshot_log_failed';
  end if;

  update public.storefront_product_images i
  set storage_path = s.new_storage_path,
      public_url = s.new_public_url,
      content_hash = s.new_content_hash,
      width = s.new_width,
      height = s.new_height
  from catalog_publish_snapshot s
  where ${oldSnapshotMatches("i", "s")};
  get diagnostics actual_count = row_count;
  if actual_count <> expected_count then
    raise exception 'catalog_publish_image_update_count_drift: expected %, updated %',
      expected_count, actual_count;
  end if;

  update public.storefront_products p
  set primary_image_url = s.new_public_url
  from catalog_publish_snapshot s
  where s.old_is_primary
    and p.id = s.product_id
    and p.primary_image_url is not distinct from s.old_product_primary_url;
  get diagnostics actual_count = row_count;
  if actual_count <> expected_primary_count then
    raise exception 'catalog_publish_primary_update_count_drift: expected %, updated %',
      expected_primary_count, actual_count;
  end if;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join public.storefront_product_images i on ${newSnapshotMatches("i", "s")};
  if actual_count <> expected_count then
    raise exception 'catalog_publish_post_image_verification_failed';
  end if;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join public.storefront_products p
    on s.old_is_primary
    and p.id = s.product_id
    and p.primary_image_url is not distinct from s.new_public_url;
  if actual_count <> expected_primary_count then
    raise exception 'catalog_publish_post_primary_verification_failed';
  end if;

  raise notice 'catalog_publish_ok: % images, % primary products, snapshot %',
    expected_count, expected_primary_count, ${sqlText(snapshotEntityId)};
end
$catalog_publish$;

commit;
`;
}

export function renderRollbackSql(context) {
  const { expected, runId, snapshotEntityId, generatedAt, manifestHash, approvalHash, ledgerHash } =
    context;
  const imageCount = expected.length;
  const primaryCount = expected.filter((item) => item.old_is_primary).length;
  return `${header({
    title: "Catalog images: atomic compare-and-swap rollback",
    generatedAt,
    manifestHash,
    approvalHash,
    ledgerHash,
  })}
begin;
set local lock_timeout = '10s';
set local statement_timeout = '180s';

${expectedTemp(expected)}
${snapshotTemp()}

do $catalog_rollback$
declare
  expected_count constant integer := ${imageCount};
  expected_primary_count constant integer := ${primaryCount};
  actual_count integer;
begin
  perform pg_advisory_xact_lock(hashtextextended(${sqlText(
    `catalog-image-publication:${runId}`,
  )}, 0));

  perform id
  from public.storefront_admin_logs
  where action = ${sqlText(SNAPSHOT_ACTION)}
    and entity_type = ${sqlText(SNAPSHOT_ENTITY_TYPE)}
    and entity_id = ${sqlText(snapshotEntityId)}
    and metadata ->> 'manifest_sha256' = ${sqlText(manifestHash)}
    and metadata ->> 'approval_sha256' = ${sqlText(approvalHash)}
    and metadata ->> 'edge_ledger_sha256' = ${sqlText(ledgerHash)}
    and metadata ->> 'expected_count' = expected_count::text
    and metadata ->> 'expected_primary_count' = expected_primary_count::text
    and jsonb_typeof(metadata -> 'changes') = 'array'
  for share;

  select count(*) into actual_count
  from public.storefront_admin_logs
  where action = ${sqlText(SNAPSHOT_ACTION)}
    and entity_type = ${sqlText(SNAPSHOT_ENTITY_TYPE)}
    and entity_id = ${sqlText(snapshotEntityId)}
    and metadata ->> 'manifest_sha256' = ${sqlText(manifestHash)}
    and metadata ->> 'approval_sha256' = ${sqlText(approvalHash)}
    and metadata ->> 'edge_ledger_sha256' = ${sqlText(ledgerHash)}
    and metadata ->> 'expected_count' = expected_count::text
    and metadata ->> 'expected_primary_count' = expected_primary_count::text
    and jsonb_typeof(metadata -> 'changes') = 'array';
  if actual_count <> 1 then
    raise exception 'catalog_rollback_snapshot_missing_or_ambiguous: matched %', actual_count;
  end if;

  insert into catalog_publish_snapshot
  select s.*
  from public.storefront_admin_logs l
  cross join lateral jsonb_to_recordset(l.metadata -> 'changes') as s ${SNAPSHOT_RECORD}
  where l.action = ${sqlText(SNAPSHOT_ACTION)}
    and l.entity_type = ${sqlText(SNAPSHOT_ENTITY_TYPE)}
    and l.entity_id = ${sqlText(snapshotEntityId)}
    and l.metadata ->> 'manifest_sha256' = ${sqlText(manifestHash)}
    and l.metadata ->> 'approval_sha256' = ${sqlText(approvalHash)}
    and l.metadata ->> 'edge_ledger_sha256' = ${sqlText(ledgerHash)}
    and l.metadata ->> 'expected_count' = expected_count::text
    and l.metadata ->> 'expected_primary_count' = expected_primary_count::text
    and jsonb_typeof(l.metadata -> 'changes') = 'array';
  get diagnostics actual_count = row_count;
  if actual_count <> expected_count then
    raise exception 'catalog_rollback_snapshot_count_drift: expected %, got %',
      expected_count, actual_count;
  end if;

  select count(*) into actual_count
  from catalog_publish_expected e
  join catalog_publish_snapshot s
    on s.review_id = e.review_id
    and s.product_id = e.product_id
    and s.sku = e.sku
    and s.bucket_id = e.bucket_id
    and s.old_storage_path = e.old_storage_path
    and s.old_public_url = e.old_public_url
    and s.old_is_primary = e.old_is_primary
    and s.new_storage_path = e.new_storage_path
    and s.new_public_url = e.new_public_url
    and s.new_content_hash = e.new_content_hash
    and s.new_width = e.new_width
    and s.new_height = e.new_height
    and s.new_size = e.new_size;
  if actual_count <> expected_count then
    raise exception 'catalog_rollback_snapshot_payload_drift';
  end if;

  perform i.id
  from public.storefront_product_images i
  join catalog_publish_snapshot s on s.image_id = i.id
  order by i.id
  for update of i;

  perform p.id
  from public.storefront_products p
  join catalog_publish_snapshot s on s.old_is_primary and s.product_id = p.id
  order by p.id
  for update of p;

  perform o.id
  from storage.objects o
  join catalog_publish_snapshot s
    on o.bucket_id = s.bucket_id
    and o.name in (s.old_storage_path, s.new_storage_path)
  order by o.id
  for share of o;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join public.storefront_product_images i on ${newSnapshotMatches("i", "s")};
  if actual_count <> expected_count then
    raise exception 'catalog_rollback_image_row_drift: expected %, matched %',
      expected_count, actual_count;
  end if;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join public.storefront_products p
    on s.old_is_primary
    and p.id = s.product_id
    and p.primary_image_url is not distinct from s.new_public_url;
  if actual_count <> expected_primary_count then
    raise exception 'catalog_rollback_primary_product_drift';
  end if;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join storage.objects o
    on o.bucket_id = s.bucket_id and o.name = s.old_storage_path;
  if actual_count <> expected_count then
    raise exception 'catalog_rollback_original_storage_object_missing';
  end if;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join storage.objects o
    on o.bucket_id = s.bucket_id
    and o.name = s.new_storage_path
    and ${objectMatches("o", "s")};
  if actual_count <> expected_count then
    raise exception 'catalog_rollback_new_storage_object_drift';
  end if;

  if exists (
    select 1
    from catalog_publish_snapshot s
    join public.storefront_product_images i
      on i.id <> s.image_id
      and (i.storage_path = s.old_storage_path or i.content_hash = s.old_content_hash)
  ) then
    raise exception 'catalog_rollback_original_path_or_hash_conflict';
  end if;

  update public.storefront_product_images i
  set storage_path = s.old_storage_path,
      public_url = s.old_public_url,
      alt_text = s.old_alt_text,
      content_hash = s.old_content_hash,
      width = s.old_width,
      height = s.old_height,
      sort_order = s.old_sort_order,
      is_primary = s.old_is_primary
  from catalog_publish_snapshot s
  where ${newSnapshotMatches("i", "s")};
  get diagnostics actual_count = row_count;
  if actual_count <> expected_count then
    raise exception 'catalog_rollback_image_update_count_drift: expected %, updated %',
      expected_count, actual_count;
  end if;

  update public.storefront_products p
  set primary_image_url = s.old_product_primary_url
  from catalog_publish_snapshot s
  where s.old_is_primary
    and p.id = s.product_id
    and p.primary_image_url is not distinct from s.new_public_url;
  get diagnostics actual_count = row_count;
  if actual_count <> expected_primary_count then
    raise exception 'catalog_rollback_primary_update_count_drift';
  end if;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join public.storefront_product_images i on ${oldSnapshotMatches("i", "s")};
  if actual_count <> expected_count then
    raise exception 'catalog_rollback_post_image_verification_failed';
  end if;

  select count(*) into actual_count
  from catalog_publish_snapshot s
  join public.storefront_products p
    on s.old_is_primary
    and p.id = s.product_id
    and p.primary_image_url is not distinct from s.old_product_primary_url;
  if actual_count <> expected_primary_count then
    raise exception 'catalog_rollback_post_primary_verification_failed';
  end if;

  raise notice 'catalog_rollback_ok: % images; original and normalized objects preserved',
    expected_count;
end
$catalog_rollback$;

commit;
`;
}

export function renderPostflightSql(context) {
  const { expected, runId, snapshotEntityId, generatedAt, manifestHash, approvalHash, ledgerHash } =
    context;
  const imageCount = expected.length;
  const primaryCount = expected.filter((item) => item.old_is_primary).length;
  return `${header({
    title: "Catalog images: read-only SQL postflight",
    generatedAt,
    manifestHash,
    approvalHash,
    ledgerHash,
  })}
begin transaction read only;
set local statement_timeout = '120s';

with
${expectedCte(expected)},
image_checks as (
  select e.*, (${newMatches("i", "e")}) as matches, to_jsonb(i) as actual
  from expected e
  left join public.storefront_product_images i on i.storage_path = e.new_storage_path
),
product_checks as (
  select e.*, (
    p.id = e.product_id and p.primary_image_url is not distinct from e.new_public_url
  ) as matches, to_jsonb(p) as actual
  from expected e
  left join public.storefront_products p
    on e.old_is_primary and p.id = e.product_id
  where e.old_is_primary
),
object_checks as (
  select e.*, (${objectMatches("o", "e")}) as matches, to_jsonb(o) as actual
  from expected e
  left join storage.objects o
    on o.bucket_id = e.bucket_id and o.name = e.new_storage_path
),
issues as (
  select jsonb_build_object(
    'type', 'published_image_row_drift', 'sku', sku, 'actual', actual
  ) as issue
  from image_checks where not coalesce(matches, false)
  union all
  select jsonb_build_object(
    'type', 'published_primary_product_drift', 'sku', sku, 'actual', actual
  )
  from product_checks where not coalesce(matches, false)
  union all
  select jsonb_build_object(
    'type', 'published_storage_object_drift', 'sku', sku, 'actual', actual
  )
  from object_checks where not coalesce(matches, false)
  union all
  select jsonb_build_object(
    'type', 'original_storage_object_missing', 'sku', e.sku, 'path', e.old_storage_path
  )
  from expected e
  left join storage.objects o
    on o.bucket_id = e.bucket_id and o.name = e.old_storage_path
  where o.id is null
  union all
  select jsonb_build_object(
    'type', 'rollback_snapshot_missing_or_ambiguous', 'entity_id', ${sqlText(snapshotEntityId)}
  )
  where (
    select count(*) from public.storefront_admin_logs
    where action = ${sqlText(SNAPSHOT_ACTION)}
      and entity_type = ${sqlText(SNAPSHOT_ENTITY_TYPE)}
      and entity_id = ${sqlText(snapshotEntityId)}
      and metadata ->> 'manifest_sha256' = ${sqlText(manifestHash)}
      and metadata ->> 'approval_sha256' = ${sqlText(approvalHash)}
      and metadata ->> 'edge_ledger_sha256' = ${sqlText(ledgerHash)}
      and metadata ->> 'expected_count' = ${sqlText(String(imageCount))}
      and metadata ->> 'expected_primary_count' = ${sqlText(String(primaryCount))}
      and jsonb_typeof(metadata -> 'changes') = 'array'
      and jsonb_array_length(metadata -> 'changes') = ${imageCount}
  ) <> 1
)
select jsonb_build_object(
  'run_id', ${sqlText(runId)},
  'mode', 'read_only_postflight',
  'expected_images', (select count(*) from expected),
  'expected_primary_products', (select count(*) from expected where old_is_primary),
  'published_state_valid', not exists (select 1 from issues),
  'original_objects_preserved', not exists (
    select 1 from issues where issue ->> 'type' = 'original_storage_object_missing'
  ),
  'rollback_snapshot_entity_id', ${sqlText(snapshotEntityId)},
  'issue_count', (select count(*) from issues),
  'issues', coalesce((select jsonb_agg(issue) from issues), '[]'::jsonb)
) as catalog_image_postflight;

commit;
`;
}

export function renderPublicationSqlBundle(context) {
  return {
    preflight: renderPreflightSql(context),
    publish: renderPublishSql(context),
    rollback: renderRollbackSql(context),
    postflight: renderPostflightSql(context),
  };
}

export async function generatePublicationSqlBundle({
  manifestPath,
  approvalPath,
  uploadLedgerPath,
  outputDirectory,
  now = () => new Date(),
}) {
  const manifestFile = path.resolve(manifestPath);
  const approvalFile = path.resolve(approvalPath);
  const ledgerFile = path.resolve(uploadLedgerPath);
  const output = path.resolve(outputDirectory);
  const { manifest, approval, approvedItems } = await verifyApproval(manifestFile, approvalFile);
  if (approvedItems.length !== manifest.items.length) {
    throw new Error("La publicación SQL exige que las 185 imágenes estén aprobadas.");
  }
  const plan = await buildUploadPlan(manifest, approvedItems);
  const [manifestHash, approvalHash, ledgerHash, ledger] = await Promise.all([
    fileSha256(manifestFile),
    fileSha256(approvalFile),
    fileSha256(ledgerFile),
    readJson(ledgerFile),
  ]);
  const verified = validateVerifiedUploadLedger({
    manifest,
    approval,
    plan,
    ledger,
    manifestHash,
    approvalHash,
  });
  const generatedAt = now().toISOString();
  const snapshotEntityId = `catalog-images:${manifest.run_id}:${ledgerHash.slice(0, 32)}`;
  if (snapshotEntityId.length > 160) {
    throw new Error("El run_id es demasiado largo para identificar el snapshot de rollback.");
  }
  const context = {
    expected: verified.expected,
    runId: manifest.run_id,
    snapshotEntityId,
    generatedAt,
    manifestHash,
    approvalHash,
    ledgerHash,
  };
  const sql = renderPublicationSqlBundle(context);
  const names = {
    preflight: "01-preflight-read-only.sql",
    publish: "02-publish-atomic-cas.sql",
    rollback: "03-rollback-atomic-cas.sql",
    postflight: "04-postflight-read-only.sql",
  };
  await Promise.all(
    Object.entries(names).map(([key, filename]) =>
      writeAtomic(path.join(output, filename), sql[key]),
    ),
  );
  const bundle = {
    schema_version: 1,
    kind: "catalog-image-sql-publication-bundle",
    generated_at: generatedAt,
    run_id: manifest.run_id,
    pipeline_version: manifest.pipeline_version,
    project_ref: verified.projectRef,
    bucket: verified.bucket,
    manifest_path: manifestFile,
    manifest_sha256: manifestHash,
    approval_path: approvalFile,
    approval_sha256: approvalHash,
    edge_upload_ledger_path: ledgerFile,
    edge_upload_ledger_sha256: ledgerHash,
    edge_upload_plan_sha256: verified.planHash,
    expected_images: verified.expected.length,
    expected_primary_products: verified.expected.filter((item) => item.old_is_primary).length,
    rollback_snapshot_entity_id: snapshotEntityId,
    files: Object.fromEntries(
      Object.entries(names).map(([key, filename]) => [
        key,
        { path: path.join(output, filename), sha256: sha256(sql[key]) },
      ]),
    ),
    safety: {
      preflight_read_only: true,
      atomic_compare_and_swap: true,
      exact_count_guards: true,
      writes_storage_objects: false,
      preserves_original_objects: true,
      updates_only_product_primary_image_url: true,
      rollback_uses_atomic_admin_log_snapshot: true,
    },
  };
  const bundlePath = path.join(output, "publication-bundle.json");
  await writeAtomic(bundlePath, `${JSON.stringify(bundle, null, 2)}\n`);
  return { ...bundle, bundle_path: bundlePath };
}

function usage() {
  return `Uso:
  node scripts/catalog-images/sql-publication.mjs \\
    --manifest <manifest.json> \\
    --approval <approval.full.json> \\
    --upload-ledger <edge-upload-ledger.json> \\
    --output <directorio>

Genera SQL solamente. No ejecuta consultas ni modifica Supabase.
`;
}

function parseArguments(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (!argument.startsWith("--")) throw new Error(`Argumento inesperado: ${argument}`);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Falta el valor de ${argument}.`);
    options[argument.slice(2)] = value;
    index += 1;
  }
  return options;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(usage());
    return;
  }
  for (const option of ["manifest", "approval", "upload-ledger", "output"]) {
    if (!options[option]) throw new Error(`Falta --${option}.\n\n${usage()}`);
  }
  const result = await generatePublicationSqlBundle({
    manifestPath: options.manifest,
    approvalPath: options.approval,
    uploadLedgerPath: options["upload-ledger"],
    outputDirectory: options.output,
  });
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))
) {
  main().catch((error) => {
    process.stderr.write(`${error?.stack ?? error}\n`);
    process.exitCode = 1;
  });
}

export const SQL_PUBLICATION_CONTRACT = Object.freeze({
  ledger_kind: LEDGER_KIND,
  ledger_schema_version: LEDGER_SCHEMA_VERSION,
  bucket: BUCKET,
  rollback_snapshot_action: SNAPSHOT_ACTION,
});
