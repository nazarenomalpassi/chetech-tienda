import { ProfileForm } from "@/components/account-forms";
import { requireAccount } from "@/lib/auth";

export default async function ProfilePage() {
  const account = await requireAccount("/cuenta/perfil");
  return (
    <>
      <div className="account-heading">
        <p className="eyebrow">Perfil</p>
        <h1>Tus datos</h1>
        <p>Usamos estos datos para agilizar tus próximos pedidos.</p>
      </div>
      <ProfileForm profile={account} />
    </>
  );
}
