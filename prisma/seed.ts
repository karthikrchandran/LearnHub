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
      allowedEmailDomains: ["acme.test"],
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
    },
    create: {
      name: "Acme Learning",
      slug: "acme",
      primaryColor: "#2563eb",
      accentColor: "#14b8a6",
      allowedEmailDomains: ["acme.test"],
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

  const leadershipTag = await prisma.courseTag.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "leadership",
      },
    },
    update: {
      name: "Leadership",
    },
    create: {
      organizationId: organization.id,
      name: "Leadership",
      slug: "leadership",
    },
  });

  const coachingCourse = await prisma.course.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "manager-coaching-basics",
      },
    },
    update: {
      title: "Manager Coaching Basics",
      description: "Demo published course for manager assignment flows.",
      status: "PUBLISHED",
      type: "NATIVE_VIDEO",
      estimatedCompletionBusinessDays: 3,
      expectedDurationMinutes: 30,
      categoryId: category.id,
    },
    create: {
      organizationId: organization.id,
      title: "Manager Coaching Basics",
      slug: "manager-coaching-basics",
      description: "Demo published course for manager assignment flows.",
      status: "PUBLISHED",
      type: "NATIVE_VIDEO",
      estimatedCompletionBusinessDays: 3,
      expectedDurationMinutes: 30,
      categoryId: category.id,
    },
  });

  await prisma.courseTagLink.upsert({
    where: {
      organizationId_courseId_tagId: {
        organizationId: organization.id,
        courseId: coachingCourse.id,
        tagId: leadershipTag.id,
      },
    },
    update: {},
    create: {
      organizationId: organization.id,
      courseId: coachingCourse.id,
      tagId: leadershipTag.id,
    },
  });

  const coachingModule = await prisma.courseModule.upsert({
    where: {
      organizationId_courseId_slug: {
        organizationId: organization.id,
        courseId: coachingCourse.id,
        slug: "manager-foundations",
      },
    },
    update: {
      title: "Manager Foundations",
      sortOrder: 0,
    },
    create: {
      organizationId: organization.id,
      courseId: coachingCourse.id,
      title: "Manager Foundations",
      slug: "manager-foundations",
      sortOrder: 0,
    },
  });

  const coachingLesson = await prisma.videoLesson.upsert({
    where: {
      organizationId_courseId_slug: {
        organizationId: organization.id,
        courseId: coachingCourse.id,
        slug: "coaching-conversation-basics",
      },
    },
    update: {
      moduleId: coachingModule.id,
      title: "Coaching Conversation Basics",
      sortOrder: 0,
      durationSeconds: 180,
      required: true,
      providerAssetId: null,
      playbackUrl: "https://video.learnhub.local/demo/coaching-conversation-basics.mp4",
      transcriptLanguage: "en",
    },
    create: {
      organizationId: organization.id,
      courseId: coachingCourse.id,
      moduleId: coachingModule.id,
      title: "Coaching Conversation Basics",
      slug: "coaching-conversation-basics",
      sortOrder: 0,
      durationSeconds: 180,
      required: true,
      playbackUrl: "https://video.learnhub.local/demo/coaching-conversation-basics.mp4",
      transcriptLanguage: "en",
    },
  });

  await prisma.videoChapter.deleteMany({
    where: {
      organizationId: organization.id,
      lessonId: coachingLesson.id,
    },
  });

  await prisma.videoChapter.createMany({
    data: [
      {
        organizationId: organization.id,
        lessonId: coachingLesson.id,
        title: "Open the Conversation",
        startSecond: 0,
        endSecond: 45,
        sortOrder: 0,
      },
      {
        organizationId: organization.id,
        lessonId: coachingLesson.id,
        title: "Ask Better Questions",
        startSecond: 45,
        endSecond: 120,
        sortOrder: 1,
      },
      {
        organizationId: organization.id,
        lessonId: coachingLesson.id,
        title: "Close with Commitments",
        startSecond: 120,
        endSecond: null,
        sortOrder: 2,
      },
    ],
  });

  await prisma.videoTranscriptCue.deleteMany({
    where: {
      organizationId: organization.id,
      lessonId: coachingLesson.id,
    },
  });

  await prisma.videoTranscriptCue.createMany({
    data: [
      {
        organizationId: organization.id,
        lessonId: coachingLesson.id,
        startSecond: 0,
        endSecond: 30,
        text: "Welcome to coaching conversation basics for managers.",
      },
      {
        organizationId: organization.id,
        lessonId: coachingLesson.id,
        startSecond: 30,
        endSecond: 90,
        text: "Start by naming the goal and inviting the team member to share context.",
      },
      {
        organizationId: organization.id,
        lessonId: coachingLesson.id,
        startSecond: 90,
        endSecond: 150,
        text: "Use open questions to understand blockers before offering advice.",
      },
      {
        organizationId: organization.id,
        lessonId: coachingLesson.id,
        startSecond: 150,
        endSecond: null,
        text: "End with clear commitments, owners, and a follow-up date.",
      },
    ],
  });

  const scormCourse = await prisma.course.upsert({
    where: {
      organizationId_slug: {
        organizationId: organization.id,
        slug: "archived-policy-orientation",
      },
    },
    update: {
      title: "Archived Policy Orientation",
      description: "Demo deprecated course for lifecycle gating.",
      status: "DEPRECATED",
      type: "SCORM_1_2",
      estimatedCompletionBusinessDays: 5,
      expectedDurationMinutes: 40,
      categoryId: category.id,
    },
    create: {
      organizationId: organization.id,
      title: "Archived Policy Orientation",
      slug: "archived-policy-orientation",
      description: "Demo deprecated course for lifecycle gating.",
      status: "DEPRECATED",
      type: "SCORM_1_2",
      estimatedCompletionBusinessDays: 5,
      expectedDurationMinutes: 40,
      categoryId: category.id,
    },
  });

  await prisma.scormPackage.upsert({
    where: {
      organizationId_courseId: {
        organizationId: organization.id,
        courseId: scormCourse.id,
      },
    },
    update: {
      originalFileName: "archived-policy-orientation.zip",
      contentType: "application/zip",
      byteSize: 4096,
      storageKey: `org/${organization.id}/courses/${scormCourse.id}/scorm/seed-archived-policy-orientation/archived-policy-orientation.zip`,
      contentRootKey: `org/${organization.id}/courses/${scormCourse.id}/scorm/seed-archived-policy-orientation/content`,
      launchPath: "index.html",
      manifestTitle: "Archived Policy Orientation",
      uploadedByUserId: admin.id,
      active: true,
    },
    create: {
      id: "seed-archived-policy-orientation",
      organizationId: organization.id,
      courseId: scormCourse.id,
      originalFileName: "archived-policy-orientation.zip",
      contentType: "application/zip",
      byteSize: 4096,
      storageKey: `org/${organization.id}/courses/${scormCourse.id}/scorm/seed-archived-policy-orientation/archived-policy-orientation.zip`,
      contentRootKey: `org/${organization.id}/courses/${scormCourse.id}/scorm/seed-archived-policy-orientation/content`,
      launchPath: "index.html",
      manifestTitle: "Archived Policy Orientation",
      uploadedByUserId: admin.id,
      active: true,
    },
  });

  const startDate = new Date("2026-06-15T12:00:00.000Z");

  await prisma.courseAssignment.upsert({
    where: {
      organizationId_courseId_membershipId: {
        organizationId: organization.id,
        courseId: course.id,
        membershipId: learnerMembership.id,
      },
    },
    update: {
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
