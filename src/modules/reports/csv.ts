export function formatCsv(rows: Array<Array<string | number | boolean | null>>): string {
  return rows
    .map((values) => values.map((value) => formatCsvValue(value ?? "")).join(","))
    .join("\r\n");
}

function formatCsvValue(value: string | number | boolean): string {
  const text = String(value);

  if (/[",\r\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }

  return text;
}
