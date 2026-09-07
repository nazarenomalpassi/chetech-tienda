import { deleteAddressAction, setDefaultAddressAction } from "@/app/account-actions";
import { AddressForm, type AddressRecord } from "@/components/account-forms";
import { requireAccount } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export default async function AddressesPage() {
  const account = await requireAccount("/cuenta/direcciones");
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("customer_addresses")
    .select("*")
    .eq("user_id", account.id)
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: false });
  const addresses = (data ?? []) as AddressRecord[];
  return (
    <>
      <div className="account-heading">
        <p className="eyebrow">Direcciones</p>
        <h1>Envíos más simples</h1>
        <p>Podés guardar varias direcciones o elegir retiro en el local al comprar.</p>
      </div>
      <details className="account-disclosure" open={!addresses.length}>
        <summary>Agregar una dirección</summary>
        <AddressForm />
      </details>
      <div className="address-list">
        {addresses.map((address) => (
          <article key={address.id}>
            <div>
              <span className="status-pill">
                {address.is_default ? "Predeterminada" : address.label}
              </span>
              <h2>{address.recipient_name}</h2>
              <p>
                {address.street} {address.street_number}
                {address.floor ? `, piso ${address.floor}` : ""}
                {address.apartment ? `, depto. ${address.apartment}` : ""}
              </p>
              <p>
                {address.city}, {address.province} · CP {address.postal_code}
              </p>
              <p>{address.phone}</p>
            </div>
            <div className="address-actions">
              {!address.is_default && (
                <form action={setDefaultAddressAction}>
                  <input type="hidden" name="id" value={address.id} />
                  <button className="text-button">Hacer predeterminada</button>
                </form>
              )}
              <details>
                <summary>Editar</summary>
                <AddressForm address={address} compact />
              </details>
              <form action={deleteAddressAction}>
                <input type="hidden" name="id" value={address.id} />
                <button className="text-button danger">Eliminar</button>
              </form>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
