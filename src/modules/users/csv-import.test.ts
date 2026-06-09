import { describe, expect, it } from "vitest";

import { parseAndValidateUserImportCsv } from "./csv-import";

const validCsv = `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
manager@acme.test,Mohan,Manager,MANAGER,,MGR-1,Operations,Manager,ACTIVE
learner@acme.test,Leela,Learner,LEARNER,manager@acme.test,EMP-1,Operations,Specialist,`;

describe("parseAndValidateUserImportCsv", () => {
  it("returns normalized rows with roles and default invited status for valid CSV", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: validCsv,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([]);
    expect(plan.rows).toEqual([
      {
        rowNumber: 2,
        email: "manager@acme.test",
        firstName: "Mohan",
        lastName: "Manager",
        role: "MANAGER",
        managerEmail: null,
        employeeId: "MGR-1",
        department: "Operations",
        title: "Manager",
        status: "ACTIVE",
      },
      {
        rowNumber: 3,
        email: "learner@acme.test",
        firstName: "Leela",
        lastName: "Learner",
        role: "LEARNER",
        managerEmail: "manager@acme.test",
        employeeId: "EMP-1",
        department: "Operations",
        title: "Specialist",
        status: "INVITED",
      },
    ]);
  });

  it("supports quoted comma-separated cells", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
"Learner@Acme.TEST",Leela,Learner,LEARNER,,EMP-1,"Operations, East","Senior Specialist",`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([]);
    expect(plan.rows[0]).toMatchObject({
      email: "learner@acme.test",
      department: "Operations, East",
      status: "INVITED",
    });
  });

  it("reports duplicate emails as row-level errors", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
duplicate@acme.test,Asha,Admin,ADMIN,,,,,
Duplicate@Acme.TEST,Leela,Learner,LEARNER,,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([
      {
        rowNumber: 3,
        field: "email",
        message: "Email is duplicated in this import",
      },
    ]);
  });

  it("reports emails outside allowed organization domains as row-level errors", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
learner@other.test,Leela,Learner,LEARNER,,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([
      {
        rowNumber: 2,
        field: "email",
        message: "Email domain is not allowed for this organization",
      },
    ]);
  });

  it("reports malformed emails as row-level errors even when the domain is allowed", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
bad local@acme.test,Leela,Learner,LEARNER,,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([
      {
        rowNumber: 2,
        field: "email",
        message: "Valid email is required",
      },
    ]);
    expect(plan.rows).toEqual([]);
  });

  it("reports invalid email local parts as row-level errors", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
bad..local@acme.test,Leela,Learner,LEARNER,,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([
      {
        rowNumber: 2,
        field: "email",
        message: "Valid email is required",
      },
    ]);
    expect(plan.rows).toEqual([]);
  });

  it("reports missing first and last names as row-level errors", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
learner@acme.test,, ,LEARNER,,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([
      {
        rowNumber: 2,
        field: "firstName",
        message: "First name is required",
      },
      {
        rowNumber: 2,
        field: "lastName",
        message: "Last name is required",
      },
    ]);
  });

  it("allows manager email to point to another row or an existing manager", () => {
    const sameImportPlan = parseAndValidateUserImportCsv({
      csv: validCsv,
      allowedEmailDomains: ["acme.test"],
    });

    const existingManagerPlan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
learner@acme.test,Leela,Learner,LEARNER,ExistingManager@Acme.TEST,EMP-1,Operations,Specialist,`,
      allowedEmailDomains: ["acme.test"],
      existingManagerEmails: ["existingmanager@acme.test"],
    });

    expect(sameImportPlan.errors).toEqual([]);
    expect(existingManagerPlan.errors).toEqual([]);
    expect(existingManagerPlan.rows[0].managerEmail).toBe("existingmanager@acme.test");
  });

  it("does not allow invalid imported rows to satisfy manager references", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
manager@other.test,Mohan,Manager,MANAGER,,MGR-1,Operations,Manager,ACTIVE
learner@acme.test,Leela,Learner,LEARNER,manager@other.test,EMP-1,Operations,Specialist,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toContainEqual({
      rowNumber: 2,
      field: "email",
      message: "Email domain is not allowed for this organization",
    });
    expect(plan.errors).toContainEqual({
      rowNumber: 3,
      field: "managerEmail",
      message: "Manager email must match a row in this import or an existing manager",
    });
    expect(plan.rows).toEqual([]);
  });

  it("reports self-manager assignments as row-level errors", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
learner@acme.test,Leela,Learner,LEARNER,learner@acme.test,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([
      {
        rowNumber: 2,
        field: "managerEmail",
        message: "A user cannot be their own manager",
      },
    ]);
  });

  it("requires supported roles and statuses", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
learner@acme.test,Leela,Learner,OWNER,,,,,PENDING`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan.errors).toEqual([
      {
        rowNumber: 2,
        field: "role",
        message: "Role must be ADMIN, MANAGER, or LEARNER",
      },
      {
        rowNumber: 2,
        field: "status",
        message: "Status must be INVITED, ACTIVE, or INACTIVE",
      },
    ]);
  });

  it("reports unterminated quoted fields as CSV-level errors", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
"learner@acme.test,Leela,Learner,LEARNER,,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan).toEqual({
      rows: [],
      errors: [
        {
          rowNumber: 2,
          field: "csv",
          message: "CSV contains an unterminated quoted field",
        },
      ],
    });
  });

  it("reports misplaced quotes as CSV-level errors", () => {
    const plan = parseAndValidateUserImportCsv({
      csv: `email,firstName,lastName,role,managerEmail,employeeId,department,title,status
"learner"@acme.test,Leela,Learner,LEARNER,,,,,`,
      allowedEmailDomains: ["acme.test"],
    });

    expect(plan).toEqual({
      rows: [],
      errors: [
        {
          rowNumber: 2,
          field: "csv",
          message: "CSV contains an invalid quoted field",
        },
      ],
    });
  });
});
