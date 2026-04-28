import { Suspense } from "react";
import { LoginClient } from "@/app/login/LoginClient";

export default function LoginPage() {
  // useSearchParams is used inside LoginClient; wrap in Suspense for Next build.
  return (
    <Suspense fallback={<div className="min-h-screen bg-background" />}>
      <LoginClient />
    </Suspense>
  );
}

