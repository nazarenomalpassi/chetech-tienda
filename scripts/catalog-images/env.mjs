import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const PROJECT_ROOT = path.resolve(SCRIPT_DIR, "..", "..");

function unquoteEnvValue(value) {
  const trimmed = String(value ?? "").trim();
  if (
    trimmed.length >= 2 &&
    ((trimmed.startsWith('"') && trimmed.endsWith('"')) ||
      (trimmed.startsWith("'") && trimmed.endsWith("'")))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

export async function loadEnvFile(filename, target = process.env) {
  try {
    const content = await fs.readFile(filename, "utf8");
    for (const line of content.split(/\r?\n/u)) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/u);
      if (!match || target[match[1]] !== undefined) continue;
      target[match[1]] = unquoteEnvValue(match[2]);
    }
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  return target;
}

export async function loadCatalogEnvironment({
  projectRoot = PROJECT_ROOT,
  target = process.env,
} = {}) {
  await loadEnvFile(path.join(projectRoot, ".env.local"), target);
  await loadEnvFile(path.join(projectRoot, ".env.development.local"), target);

  const supabaseUrl = target.SUPABASE_URL ?? target.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey =
    target.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? target.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !publishableKey) {
    throw new Error(
      "Faltan NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY en el entorno local.",
    );
  }

  return {
    supabaseUrl,
    publishableKey,
    projectRef: projectRefFromUrl(supabaseUrl),
  };
}

export function projectRefFromUrl(value) {
  try {
    return new URL(value).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export async function createReadOnlyCatalogClient(options = {}) {
  const environment = await loadCatalogEnvironment(options);
  // supabase-js 2.110 initializes its Realtime client eagerly. Node 20 has no
  // native WebSocket, but this audit never opens a Realtime connection. A
  // deliberately disabled transport keeps the read-only HTTP client usable
  // without adding a runtime dependency or weakening the no-write boundary.
  class DisabledRealtimeTransport {
    constructor() {
      throw new Error("Realtime no esta habilitado en el inventario de imagenes.");
    }
  }
  const client = createClient(environment.supabaseUrl, environment.publishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    realtime: {
      transport: DisabledRealtimeTransport,
    },
  });
  return { client, environment };
}
