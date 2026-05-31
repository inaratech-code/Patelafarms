import type { Metadata } from "next";
import { Suspense } from "react";
import { LoginClient } from "@/app/login/LoginClient";

export const metadata: Metadata = {
  title: "Sign in — Inara POS",
  description: "Sign in to Inara POS by Inara Tech",
};

export default function LoginPage() {
  // useSearchParams is used inside LoginClient; wrap in Suspense for Next build.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginClient />
    </Suspense>
  );
}

