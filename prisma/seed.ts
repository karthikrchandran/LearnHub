import { addBusinessDays } from "../src/lib/dates/business-days";
import { hashPassword } from "../src/lib/auth/password";
import { createPrismaClient } from "../src/lib/prisma";

const prisma = createPrismaClient();

async function main() {
  const passwordHash = await hashPassword("LearnHubDemo123!");

  const platformOwner = await prisma.user.upsert({
    where: { email: "owner@learnhub.local" },
    update: {
      firstName: "Platform",
      lastName: "Owner",
      passwordHash,
      status: "ACTIVE",
      isPlatformOwner: true,
    },
    create: {
      email: "owner@learnhub.local",
      firstName: "Platform",
      lastName: "Owner",
      passwordHash,
      status: "ACTIVE",
      isPlatformOwner: true,
    },
  });

  const organization = await prisma.organization.upsert({
    where: { slug: "acme" },
    update: {
      name: "Acme Learning",
      primaryColor: "#2563eb",
      accentColor: "#14b8a6",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
    },
    create: {
      name: "Acme Learning",
      slug: "acme",
      primaryColor: "#2563eb",
      accentColor: "#14b8a6",
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@acme.test" },
    update: {
      firstName: "Asha",
      lastName: "Admin",
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      email: "admin@acme.test",
      firstName: "Asha",
      lastName: "Admin",
      passwordHash,
      status: "ACTIVE",
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: "manager@acme.test" },
    update: {
      firstName: "Mohan",
      lastName: "Manager",
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      email: "manager@acme.test",
      firstName: "Mohan",
      lastName: "Manager",
      passwordHash,
      status: "ACTIVE",
    },
  });

  const learner = await prisma.user.upsert({
    where: { email: "learner@acme.test" },
    update: {
      firstName: "Leela",
      lastName: "Learner",
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      email: "learner@acme.test",
      firstName: "Leela",
      lastName: "Learner",
      passwordHash,
      status: "ACTIVE",
    },
  });

  const adminMembership = await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: admin.id,
      },
    },
    update: {
      roles: ["ADMIN"],
      status: "ACTIVE",
      department: "Learning",
      title: "LMS Admin",
    },
    create: {
      organizationId: organization.id,
      userId: admin.id,
      roles: ["ADMIN"],
      status: "ACTIVE",
      department: "Learning",
      title: "LMS Admin",
    },
  });

  const managerMembership = await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: manager.id,
      },
    },
    update: {
      roles: ["MANAGER"],
      status: "ACTIVE",
      department: "Operations",
      title: "Operations Manager",
    },
    create: {
      organizationId: organization.id,
      userId: manager.id,
      roles: ["MANAGER"],
      status: "ACTIVE",
      department: "Operations",
      title: "Operations Manager",
    },
  });

  const learnerMembership = await prisma.organizationMembership.upsert({
    where: {
      organizationId_userId: {
        organizationId: organization.id,
        userId: learner.id,
      },
    },
    update: {
      managerMembershipId: managerMembership.id,
      roles: ["LEARNER"],
      status: "ACTIVE",
      employeeId: "ACME-1001",
      department: "Operations",
      title: "Operations Specialist",
    },
    create: {
      organizationId: organization.id,
      userId: learner.id,
      managerMembershipId: managerMembership.id,
      roles: ["LEARNER"],
      status: "ACTIVE",
      employeeId: "ACME-1001",
      department: "Operations",
      title: "Operations Specialist",
    },
  });

  const category = await prisma.courseCategory.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "compliance",
      },
    },
    update: {
      name: "Compliance",
    },
    create: {
      organizationId: organization.id,
      name: "Compliance",
      slug: "compliance",
    },
  });

  const tag = await prisma.courseTag.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "onboarding",
      },
    },
    update: {
      name: "Onboarding",
    },
    create: {
      organizationId: organization.id,
      name: "Onboarding",
      slug: "onboarding",
    },
  });

  const course = await prisma.course.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "workplace-security-basics",
      },
    },
    update: {
      title: "Workplace Security Basics",
      description: "Demo native video course foundation record.",
      status: "PUBLISHED",
      type: "NATIVE_VIDEO",
      estimatedCompletionBusinessDays: 5,
      expectedDurationMinutes: 45,
      categoryId: category.id,
    },
    create: {
      organizationId: organization.id,
      title: "Workplace Security Basics",
      slug: "workplace-security-basics",
      description: "Demo native video course foundation record.",
      status: "PUBLISHED",
      type: "NATIVE_VIDEO",
      estimatedCompletionBusinessDays: 5,
      expectedDurationMinutes: 45,
      categoryId: category.id,
    },
  });

  await prisma.courseTagLink.upsert({
    where: {
      organizationId_courseId_tagId: {
        organizationId: organization.id,
        courseId: course.id,
        tagId: tag.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      courseId: course.id,
      tagId: tag.id,
    },
  });

  const startDate = new Date("2026-06-15T12:00:00.000Z");

  await prisma.courseAssignment.upsert({
    where: {
      id: "seed-acme-learner-security-basics",
    },
    update: {
      organizationId: organization.id,
      courseId: course.id,
      membershipId: learnerMembership.id,
      assignedByMembershipId: adminMembership.id,
      startDate,
      dueDate: addBusinessDays(startDate, course.estimatedCompletionBusinessDays),
      status: "ASSIGNED",
    },
    create: {
      id: "seed-acme-learner-security-basics",
      organizationId: organization.id,
      courseId: course.id,
      membershipId: learnerMembership.id,
      assignedByMembershipId: adminMembership.id,
      startDate,
      dueDate: addBusinessDays(startDate, course.estimatedCompletionBusinessDays),
      status: "ASSIGNED",
    },
  });

  await prisma.auditLog.upsert({
    where: {
      id: "seed-acme-demo-created",
    },
    update: {
      organizationId: organization.id,
      actorId: platformOwner.id,
      action: "seed.demo_created",
      targetType: "organization",
      targetId: organization.id,
      metadata: {
        adminMembershipId: adminMembership.id,
        managerMembershipId: managerMembership.id,
        learnerMembershipId: learnerMembership.id,
      },
    },
    create: {
      id: "seed-acme-demo-created",
      organizationId: organization.id,
      actorId: platformOwner.id,
      action: "seed.demo_created",
      targetType: "organization",
      targetId: organization.id,
      metadata: {
        adminMembershipId: adminMembership.id,
        managerMembershipId: managerMembership.id,
        learnerMembershipId: learnerMembership.id,
      },
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
