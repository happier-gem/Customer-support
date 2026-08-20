import Link from "next/link";
import { AuthCard } from "@/components/auth-card";
import { linkClass } from "@/lib/ui";

export default function RegisterPage() {
  return (
    <AuthCard title="No self-registration here" subtitle="Support agent & owner portal.">
      <p className="text-center text-sm text-muted-foreground">
        Accounts on this portal are created by your organization&apos;s owner via a team invitation. If you&apos;ve
        received an invite email, use the link in that email to set up your account. Otherwise, ask your Tenant
        Owner to invite you.
      </p>
      <Link href="/login" className={`${linkClass} block text-center text-sm`}>
        Back to sign in
      </Link>
    </AuthCard>
  );
}
