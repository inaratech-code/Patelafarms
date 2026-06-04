import type { Metadata } from "next";
import { LoginClient } from "@/app/login/LoginClient";

export const metadata: Metadata = {
  title: "Sign in — Inara POS",
  description: "Sign in to Inara POS by Inara Tech",
};

export default function LoginPage() {
  return <LoginClient />;
}
