import AuthForm from "@/components/auth-form";
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const { notice } = await searchParams;
  return (
    <AuthForm
      notice={
        notice === "inactive"
          ? "Dein Zugang ist noch nicht freigeschaltet. Bitte wende dich an deine Teamleitung."
          : notice === "expired"
            ? "Dieser Link ist ungültig oder abgelaufen. Bitte fordere einen neuen Passwort-Link an."
            : ""
      }
    />
  );
}
