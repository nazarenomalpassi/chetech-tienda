import { createClient } from "npm:@supabase/supabase-js@2.110.7";
import { ContractError, resolveAdminKey } from "./core.mjs";
import { createCatalogImageUploadHandler } from "./handler.mjs";

const BUCKET = "storefront-products";

type RuntimeEnvironment = Record<string, string | undefined>;

function environment(): RuntimeEnvironment {
  return {
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
    SUPABASE_SECRET_KEYS: Deno.env.get("SUPABASE_SECRET_KEYS"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_PUBLISHABLE_KEYS: Deno.env.get("SUPABASE_PUBLISHABLE_KEYS"),
    SUPABASE_PUBLISHABLE_KEY: Deno.env.get("SUPABASE_PUBLISHABLE_KEY"),
    SUPABASE_ANON_KEY: Deno.env.get("SUPABASE_ANON_KEY"),
  };
}

function runtimeConfig() {
  return {
    enabled: Deno.env.get("CATALOG_UPLOAD_ENABLED") === "true",
    token: Deno.env.get("CATALOG_UPLOAD_TOKEN") ?? "",
    pipelineVersion: Deno.env.get("CATALOG_ALLOWED_PIPELINE_VERSION") ?? "",
    runId: Deno.env.get("CATALOG_ALLOWED_RUN_ID") ?? "",
  };
}

function isStorageNotFound(error: unknown) {
  const candidate = error as { status?: number; statusCode?: number | string; message?: string };
  const status = Number(candidate?.status ?? candidate?.statusCode ?? 0);
  return (
    status === 404 ||
    /object not found|not found|no such key/iu.test(String(candidate?.message ?? ""))
  );
}

function isStorageConflict(error: unknown) {
  const candidate = error as { status?: number; statusCode?: number | string; message?: string };
  const status = Number(candidate?.status ?? candidate?.statusCode ?? 0);
  return (
    status === 409 ||
    /already exists|asset already exists|duplicate/iu.test(String(candidate?.message ?? ""))
  );
}

function createAdminStorage() {
  const env = environment();
  const url = env.SUPABASE_URL;
  if (!url) throw new ContractError(503, "configuration_error");
  try {
    const parsed = new URL(url);
    if (
      parsed.username ||
      parsed.password ||
      (parsed.protocol !== "https:" &&
        !(
          parsed.protocol === "http:" && ["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
        ))
    ) {
      throw new Error("invalid");
    }
  } catch {
    throw new ContractError(503, "configuration_error");
  }
  const secret = resolveAdminKey(env);
  const supabase = createClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
  const bucket = supabase.storage.from(BUCKET);
  return {
    async inspect(storagePath: string): Promise<Uint8Array | null> {
      const { data, error } = await bucket.download(storagePath);
      if (error) {
        if (isStorageNotFound(error)) return null;
        throw new ContractError(502, "storage_error");
      }
      return new Uint8Array(await data.arrayBuffer());
    },

    async upload(storagePath: string, bytes: Uint8Array): Promise<"uploaded" | "exists"> {
      const uploadBody = bytes.slice().buffer;
      const { error } = await bucket.upload(
        storagePath,
        new Blob([uploadBody], { type: "image/webp" }),
        {
          contentType: "image/webp",
          cacheControl: "31536000",
          upsert: false,
        },
      );
      if (!error) return "uploaded";
      if (isStorageConflict(error)) return "exists";
      throw new ContractError(502, "storage_error");
    },

    publicUrl(storagePath: string): string {
      return bucket.getPublicUrl(storagePath).data.publicUrl;
    },
  };
}

let storage: ReturnType<typeof createAdminStorage> | undefined;

const handler = createCatalogImageUploadHandler({
  getConfig: runtimeConfig,
  createStorage() {
    storage ??= createAdminStorage();
    return storage;
  },
});

Deno.serve(handler);
