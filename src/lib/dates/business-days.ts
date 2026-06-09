function isWeekend(date: Date): boolean {
  const day = date.getUTCDay();

  return day === 0 || day === 6;
}

export function addBusinessDays(startDate: Date, businessDays: number): Date {
  if (businessDays < 0) {
    throw new Error("Business day count cannot be negative");
  }

  const dueDate = new Date(startDate);
  let remaining = businessDays;

  while (remaining > 0) {
    dueDate.setUTCDate(dueDate.getUTCDate() + 1);

    if (!isWeekend(dueDate)) {
      remaining -= 1;
    }
  }

  return dueDate;
}
