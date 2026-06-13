export const learnhubColors = {
  ink: "#111827",
  muted: "#667085",
  mutedStrong: "#475467",
  paper: "#fffaf0",
  app: "#f6f8fb",
  surface: "#ffffff",
  line: "#d7dce5",
  blue: "#235bdb",
  teal: "#12b8a6",
  green: "#1b8a5a",
  amber: "#f5b544",
  rose: "#d94a64",
  violet: "#7457d5",
} as const;

export type CourseTone = "blue" | "teal" | "green" | "amber" | "rose" | "violet";

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
      return "from-[#235bdb] to-[#12b8a6]";
    case "green":
      return "from-[#1b8a5a] to-[#12b8a6]";
    case "amber":
      return "from-[#f5b544] to-[#d94a64]";
    case "rose":
      return "from-[#d94a64] to-[#7457d5]";
    case "violet":
      return "from-[#7457d5] to-[#235bdb]";
    case "blue":
    default:
      return "from-[#235bdb] to-[#12b8a6]";
  }
}
