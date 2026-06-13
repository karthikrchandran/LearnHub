export const learnhubColors = {
  ink: "#0f172a",
  muted: "#64748b",
  mutedStrong: "#475569",
  paper: "#f8fafc",
  app: "#f1f5f9",
  surface: "#ffffff",
  line: "#cbd5e1",
  blue: "#2563eb",
  teal: "#60a5fa",
  green: "#1d4ed8",
  amber: "#93c5fd",
  rose: "#1e3a8a",
  violet: "#334155",
} as const;

export type CourseTone = "blue" | "teal" | "green" | "amber" | "rose" | "violet";

export const learnhubToneClasses: Record<CourseTone, string> = {
  blue: "border-[var(--learnhub-blue)] bg-[color-mix(in_srgb,var(--learnhub-blue)_12%,white)] text-[var(--learnhub-ink)]",
  teal: "border-[var(--learnhub-teal)] bg-[color-mix(in_srgb,var(--learnhub-teal)_14%,white)] text-[var(--learnhub-ink)]",
  green: "border-[var(--learnhub-green)] bg-[color-mix(in_srgb,var(--learnhub-green)_12%,white)] text-[var(--learnhub-ink)]",
  amber: "border-[var(--learnhub-amber)] bg-[color-mix(in_srgb,var(--learnhub-amber)_18%,white)] text-[var(--learnhub-ink)]",
  rose: "border-[var(--learnhub-rose)] bg-[color-mix(in_srgb,var(--learnhub-rose)_12%,white)] text-[var(--learnhub-ink)]",
  violet: "border-[var(--learnhub-violet)] bg-[color-mix(in_srgb,var(--learnhub-violet)_12%,white)] text-[var(--learnhub-ink)]",
};

const categoryToneMap: Record<string, CourseTone> = {
  compliance: "blue",
  security: "teal",
  leadership: "amber",
  "customer-care": "violet",
  privacy: "green",
  safety: "rose",
};

export function courseToneForCategory(categorySlug: string | null | undefined): CourseTone {
  if (!categorySlug) {
    return "blue";
  }

  return categoryToneMap[categorySlug] ?? "blue";
}

export function courseGradientForCategory(categorySlug: string | null | undefined): string {
  switch (courseToneForCategory(categorySlug)) {
    case "teal":
      return "from-[#1e3a8a] to-[#2563eb]";
    case "green":
      return "from-[#1d4ed8] to-[#60a5fa]";
    case "amber":
      return "from-[#334155] to-[#2563eb]";
    case "rose":
      return "from-[#1e40af] to-[#64748b]";
    case "violet":
      return "from-[#1e3a8a] to-[#334155]";
    case "blue":
    default:
      return "from-[#1e3a8a] to-[#2563eb]";
  }
}
