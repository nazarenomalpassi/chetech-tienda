import { ProfileForm } from "@/components/account-forms";
import { requireAccount } from "@/lib/auth";
import { AccountHeading } from "../account-heading";

export default async function ProfilePage() {
  const account = await requireAccount("/cuenta/perfil");
  return (
    <>
      <AccountHeading title="Mis datos">Con estos datos completamos la próxima compra por vos.</AccountHeading>
      <ProfileForm profile={account} />
    </>
  );
}
