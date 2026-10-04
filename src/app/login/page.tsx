import type { Metadata } from "next";

import { PublicHeader } from "@/components/site-header";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader aside="Private" />
      <main className="gutter flex flex-1 flex-col justify-between pt-5 pb-8 md:pt-6">
        <LoginForm />
      </main>
    </div>
  );
}
