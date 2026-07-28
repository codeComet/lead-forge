import { Suspense } from "react";
import { AuthForm } from "@/components/auth-form";

export const metadata = { title: "Sign up — LeadForge" };

export default function SignupPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-6">
      <Suspense>
        <AuthForm mode="signup" />
      </Suspense>
    </div>
  );
}
