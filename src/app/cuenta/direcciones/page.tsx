import { deleteAddressAction, setDefaultAddressAction } from "@/app/account-actions";
import { AddressForm, type AddressRecord } from "@/components/account-forms";
import { requireAccount } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { AccountHeading } from "../account-heading";
import styles from "../account.module.css";

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
      <AccountHeading title="Direcciones">
        Guardá dónde recibís tus compras. Si retirás en el local, no hace falta cargar ninguna.
      </AccountHeading>
      <details className={styles.disclosure} open={!addresses.length}>
        <summary>Agregar una dirección</summary>
        <AddressForm />
      </details>
      {addresses.length ? (
        <ul className={styles.addresses}>
          {addresses.map((address) => (
            <li key={address.id} className={styles.address} data-default={address.is_default || undefined}>
              <span className={styles.tag}>{address.is_default ? "Por defecto" : address.label}</span>
              <h2>{address.recipient_name}</h2>
              <p>
                {address.street} {address.street_number}
                {address.floor ? `, piso ${address.floor}` : ""}
                {address.apartment ? `, depto. ${address.apartment}` : ""}
                <br />
                {address.city}, {address.province}, CP {address.postal_code}
              </p>
              {address.phone ? <p>{address.phone}</p> : null}
              <div className={styles.actions}>
                {!address.is_default ? (
                  <form action={setDefaultAddressAction}>
                    <input type="hidden" name="id" value={address.id} />
                    <button className={styles.textButton}>Usar por defecto</button>
                  </form>
                ) : null}
                <form action={deleteAddressAction}>
                  <input type="hidden" name="id" value={address.id} />
                  <button className={styles.textButton}>Borrar</button>
                </form>
                <details>
                  <summary>Editar</summary>
                  <AddressForm address={address} />
                </details>
              </div>
            </li>
          ))}
        </ul>
      ) : null}
    </>
  );
}
