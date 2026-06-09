import { normalizeEmail, requireAllowedOrganizationEmail } from "../auth/email";

export type UserImportRole = "ADMIN" | "MANAGER" | "LEARNER";
export type UserImportStatus = "INVITED" | "ACTIVE" | "INACTIVE";

export type ValidatedUserImportRow = {
  rowNumber: number;
  email: string;
  firstName: string;
  lastName: string;
  role: UserImportRole;
  managerEmail: string | null;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  status: UserImportStatus;
};

export type UserImportValidationError = {
  rowNumber: number;
  field: string;
  message: string;
};

export type UserImportPlan = {
  rows: ValidatedUserImportRow[];
  errors: UserImportValidationError[];
};

type ParsedUserImportRow = ValidatedUserImportRow & {
  hasErrors: boolean;
};

type CsvParseResult =
  | { records: string[][]; error: null }
  | { records: []; error: UserImportValidationError };

const requiredHeaders = ["email", "firstName", "lastName", "role", "managerEmail", "employeeId", "department", "title", "status"];
const roles: UserImportRole[] = ["ADMIN", "MANAGER", "LEARNER"];
const statuses: UserImportStatus[] = ["INVITED", "ACTIVE", "INACTIVE"];

export function parseAndValidateUserImportCsv(input: {
  csv: string;
  allowedEmailDomains: string[];
  existingManagerEmails?: string[];
}): UserImportPlan {
  const parseResult = parseCsv(input.csv);
  const errors: UserImportValidationError[] = [];

  if (parseResult.error) {
    return { rows: [], errors: [parseResult.error] };
  }

  const { records } = parseResult;

  if (records.length === 0) {
    return { rows: [], errors: [{ rowNumber: 1, field: "csv", message: "CSV header row is required" }] };
  }

  const headers = records[0].map((header) => header.trim());
  const missingHeader = requiredHeaders.find((header) => !headers.includes(header));

  if (missingHeader) {
    return { rows: [], errors: [{ rowNumber: 1, field: missingHeader, message: `Missing required header: ${missingHeader}` }] };
  }

  const seenEmails = new Set<string>();
  const parsedRows: ParsedUserImportRow[] = [];

  for (const [index, record] of records.slice(1).entries()) {
    const rowNumber = index + 2;

    if (record.every((cell) => cell.trim() === "")) {
      continue;
    }

    const getCell = (header: string): string => record[headers.indexOf(header)]?.trim() ?? "";
    const rowErrors: UserImportValidationError[] = [];
    const rawEmail = getCell("email");
    const email = normalizeEmail(rawEmail);

    if (!email) {
      rowErrors.push({ rowNumber, field: "email", message: "Email is required" });
    } else {
      if (seenEmails.has(email)) {
        rowErrors.push({ rowNumber, field: "email", message: "Email is duplicated in this import" });
      }

      try {
        requireAllowedOrganizationEmail(email, input.allowedEmailDomains);
      } catch (error) {
        rowErrors.push({
          rowNumber,
          field: "email",
          message: error instanceof Error ? error.message : "Email domain is not allowed for this organization",
        });
      }
    }

    seenEmails.add(email);

    const firstName = getCell("firstName");
    const lastName = getCell("lastName");
    const role = normalizeRole(getCell("role"));
    const status = normalizeStatus(getCell("status"));
    const managerEmail = normalizeNullableEmail(getCell("managerEmail"));

    if (!firstName) {
      rowErrors.push({ rowNumber, field: "firstName", message: "First name is required" });
    }

    if (!lastName) {
      rowErrors.push({ rowNumber, field: "lastName", message: "Last name is required" });
    }

    if (!role) {
      rowErrors.push({ rowNumber, field: "role", message: "Role must be ADMIN, MANAGER, or LEARNER" });
    }

    if (!status) {
      rowErrors.push({ rowNumber, field: "status", message: "Status must be INVITED, ACTIVE, or INACTIVE" });
    }

    if (managerEmail === email) {
      rowErrors.push({ rowNumber, field: "managerEmail", message: "A user cannot be their own manager" });
    }

    errors.push(...rowErrors);
    parsedRows.push({
      rowNumber,
      email,
      firstName,
      lastName,
      role: role ?? "LEARNER",
      managerEmail,
      employeeId: normalizeNullable(getCell("employeeId")),
      department: normalizeNullable(getCell("department")),
      title: normalizeNullable(getCell("title")),
      status: status ?? "INVITED",
      hasErrors: rowErrors.length > 0,
    });
  }

  const existingManagerEmails = new Set((input.existingManagerEmails ?? []).map((email) => normalizeEmail(email)));
  const validImportEmails = new Set(parsedRows.filter((row) => !row.hasErrors).map((row) => row.email));

  for (const row of parsedRows) {
    if (!row.managerEmail || row.managerEmail === row.email) {
      continue;
    }

    if (!validImportEmails.has(row.managerEmail) && !existingManagerEmails.has(row.managerEmail)) {
      errors.push({
        rowNumber: row.rowNumber,
        field: "managerEmail",
        message: "Manager email must match a row in this import or an existing manager",
      });
      row.hasErrors = true;
    }
  }

  return {
    rows: parsedRows.filter((row) => !row.hasErrors).map(toValidatedUserImportRow),
    errors,
  };
}

function toValidatedUserImportRow(row: ParsedUserImportRow): ValidatedUserImportRow {
  return {
    rowNumber: row.rowNumber,
    email: row.email,
    firstName: row.firstName,
    lastName: row.lastName,
    role: row.role,
    managerEmail: row.managerEmail,
    employeeId: row.employeeId,
    department: row.department,
    title: row.title,
    status: row.status,
  };
}

function normalizeNullable(value: string): string | null {
  const trimmed = value.trim();

  return trimmed ? trimmed : null;
}

function normalizeNullableEmail(value: string): string | null {
  const trimmed = normalizeNullable(value);

  return trimmed ? normalizeEmail(trimmed) : null;
}

function normalizeRole(value: string): UserImportRole | null {
  const normalized = value.trim().toUpperCase();

  return roles.includes(normalized as UserImportRole) ? (normalized as UserImportRole) : null;
}

function normalizeStatus(value: string): UserImportStatus | null {
  const normalized = value.trim().toUpperCase();

  if (!normalized) {
    return "INVITED";
  }

  return statuses.includes(normalized as UserImportStatus) ? (normalized as UserImportStatus) : null;
}

function parseCsv(input: string): CsvParseResult {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;
  let quotedFieldStartRow = 1;

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    const nextCharacter = input[index + 1];

    if (character === '"') {
      if (!inQuotes) {
        quotedFieldStartRow = rows.length + 1;
      }

      if (inQuotes && nextCharacter === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (character === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((character === "\n" || character === "\r") && !inQuotes) {
      if (character === "\r" && nextCharacter === "\n") {
        index += 1;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += character;
  }

  if (inQuotes) {
    return {
      records: [],
      error: {
        rowNumber: quotedFieldStartRow,
        field: "csv",
        message: "CSV contains an unterminated quoted field",
      },
    };
  }

  row.push(cell);

  if (row.length > 1 || row[0].trim() !== "") {
    rows.push(row);
  }

  return { records: rows, error: null };
}
