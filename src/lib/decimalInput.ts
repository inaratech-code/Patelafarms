/** Digits + one decimal point; strips meaningless leading zeros on the whole part (keeps 0.5). */
export function normalizeDecimalInput(raw: string, maxFractionDigits?: number): string {
  let s = raw.replace(/[^\d.]/g, "");
  const firstDot = s.indexOf(".");
  if (firstDot !== -1) {
    s = s.slice(0, firstDot + 1) + s.slice(firstDot + 1).replace(/\./g, "");
  }
  if (s === "") return "";

  const endsWithDot = s.endsWith(".") && (s.match(/\./g) ?? []).length === 1;
  const parts = s.split(".");
  let intPart = parts[0] ?? "";
  let fracPart = parts[1];

  if (intPart === "" && fracPart !== undefined) {
    intPart = "0";
  }
  if (intPart.length > 1) {
    intPart = intPart.replace(/^0+/, "") || "0";
  }

  if (fracPart !== undefined) {
    if (maxFractionDigits != null && maxFractionDigits >= 0) {
      fracPart = fracPart.slice(0, maxFractionDigits);
    }
    if (fracPart === "" && endsWithDot) return `${intPart}.`;
    return `${intPart}.${fracPart}`;
  }
  return intPart;
}

export function parseDecimalInput(s: string): number | null {
  const t = s.trim();
  if (t === "" || t === ".") return null;
  const n = Number.parseFloat(t);
  if (!Number.isFinite(n)) return null;
  return n;
}
