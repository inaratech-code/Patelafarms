import { LedgerDetailClient } from "@/app/ledger/[accountId]/LedgerDetailClient";

export default async function LedgerDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  return <LedgerDetailClient accountId={Number(accountId)} />;
}

