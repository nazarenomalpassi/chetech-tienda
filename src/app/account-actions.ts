"use server";

import { revalidatePath } from "next/cache";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type AccountActionState = { message?: string; error?: string };

function text(formData: FormData, name: string, max: number) {
  const raw = formData.get(name);
  return typeof raw === "string" ? raw.trim().slice(0, max) : "";
}

async function authenticatedUserId() {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.auth.getClaims();
  const id = typeof data?.claims?.sub === "string" ? data.claims.sub : null;
  return { supabase, id };
}

export async function updateProfileAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const firstName = text(formData, "firstName", 80);
  const lastName = text(formData, "lastName", 80);
  const phone = text(formData, "phone", 40);
  const marketingConsent = formData.get("marketingConsent") === "on";
  if (!firstName || !lastName) return { error: "Ingresá tu nombre y apellido." };
  const { supabase, id } = await authenticatedUserId();
  if (!id) return { error: "Tu sesión venció. Volvé a ingresar." };
  const { error } = await supabase.rpc("update_my_storefront_profile", {
    p_first_name: firstName,
    p_last_name: lastName,
    p_phone: phone || null,
    p_marketing_consent: marketingConsent,
  });
  if (error) return { error: "No pudimos guardar el perfil." };
  revalidatePath("/cuenta", "layout");
  return { message: "Perfil actualizado." };
}

export async function saveAddressAction(
  _state: AccountActionState,
  formData: FormData,
): Promise<AccountActionState> {
  const id = text(formData, "id", 40);
  const address = {
    label: text(formData, "label", 40),
    recipient_name: text(formData, "recipientName", 160),
    phone: text(formData, "phone", 40),
    street: text(formData, "street", 160),
    street_number: text(formData, "streetNumber", 30),
    floor: text(formData, "floor", 30) || null,
    apartment: text(formData, "apartment", 30) || null,
    city: text(formData, "city", 100),
    province: text(formData, "province", 100),
    postal_code: text(formData, "postalCode", 20),
    additional_info: text(formData, "additionalInfo", 500) || null,
    is_default: false,
  };
  if (
    !address.label ||
    !address.recipient_name ||
    !address.phone ||
    !address.street ||
    !address.street_number ||
    !address.city ||
    !address.province ||
    !address.postal_code
  ) {
    return { error: "Completá todos los datos obligatorios de la dirección." };
  }

  const { supabase, id: userId } = await authenticatedUserId();
  if (!userId) return { error: "Tu sesión venció. Volvé a ingresar." };
  let savedId = id;
  if (id) {
    const { data, error } = await supabase
      .from("customer_addresses")
      .update(address)
      .eq("id", id)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();
    if (error || !data) return { error: "No pudimos actualizar la dirección." };
  } else {
    const { data, error } = await supabase
      .from("customer_addresses")
      .insert({ ...address, user_id: userId })
      .select("id")
      .single();
    if (error || !data) return { error: "No pudimos guardar la dirección." };
    savedId = String(data.id);
  }
  const { count } = await supabase
    .from("customer_addresses")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (formData.get("isDefault") === "on" || count === 1)
    await supabase.rpc("set_my_default_address", { p_address_id: savedId });
  revalidatePath("/cuenta/direcciones");
  return { message: id ? "Dirección actualizada." : "Dirección guardada." };
}

export async function deleteAddressAction(formData: FormData) {
  const addressId = text(formData, "id", 40);
  const { supabase, id } = await authenticatedUserId();
  if (id && addressId)
    await supabase.from("customer_addresses").delete().eq("id", addressId).eq("user_id", id);
  revalidatePath("/cuenta/direcciones");
}

export async function setDefaultAddressAction(formData: FormData) {
  const addressId = text(formData, "id", 40);
  const { supabase, id } = await authenticatedUserId();
  if (id && addressId) await supabase.rpc("set_my_default_address", { p_address_id: addressId });
  revalidatePath("/cuenta/direcciones");
}
