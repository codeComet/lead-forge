import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Log in — LeadForge" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Suspense>
        <AuthForm mode="login" />
      </Suspense>
    </div>
  );
}
