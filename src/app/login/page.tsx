import type { Metadata } from "next";

import { PublicHeader } from "@/components/site-header";

import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  link: "That sign-in link is invalid or has expired. Request a new one.",
  forbidden: "That account is not allowed to use this site.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader aside="Private" />
      <main className="gutter flex flex-1 flex-col justify-between pt-5 pb-8 md:pt-6">
        <LoginForm notice={error ? (NOTICES[error] ?? null) : null} />
      </main>
    </div>
  );
}
