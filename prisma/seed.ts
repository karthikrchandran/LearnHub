import { addBusinessDays } from "../src/lib/dates/business-days";
import { hashPassword } from "../src/lib/auth/password";
import { createPrismaClient } from "../src/lib/prisma";

const prisma = createPrismaClient();
const demoAdminEmail = "admin@example.com";
const legacyDemoAdminEmail = "admin@acme.test";
const demoAppBaseUrl = process.env.APP_BASE_URL ?? process.env.NEXTAUTH_URL ?? "http://localhost:3100";
const demoCertificateBaseUrl = `${demoAppBaseUrl.replace(/\/+$/, "")}/certificates`;
const demoVideoPlaybackUrl = (lessonSlug: string) => `/api/demo/video/${lessonSlug}`;

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
      allowedEmailDomains: ["example.com", "acme.test"],
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
    },
    create: {
      name: "Acme Learning",
      slug: "acme",
      primaryColor: "#2563eb",
      accentColor: "#14b8a6",
      allowedEmailDomains: ["example.com", "acme.test"],
      enrollmentPolicy: "ASSIGNMENT_AND_SELF_ENROLLMENT",
      globalLibraryEnabled: true,
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: demoAdminEmail },
    update: {
      firstName: "Asha",
      lastName: "Admin",
      passwordHash,
      status: "ACTIVE",
    },
    create: {
      email: demoAdminEmail,
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

  async function upsertCategory(slug: string, name: string) {
    return prisma.courseCategory.upsert({
      where: { organizationId_slug: { organizationId: organization.id, slug } },
      update: { name },
      create: { organizationId: organization.id, slug, name },
    });
  }

  async function upsertTag(slug: string, name: string) {
    return prisma.courseTag.upsert({
      where: { organizationId_slug: { organizationId: organization.id, slug } },
      update: { name },
      create: { organizationId: organization.id, slug, name },
    });
  }

  type QuestionType = "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  type AnswerSeed = {
    id: string;
    text: string;
    correct: boolean;
    feedback: string;
    sortOrder: number;
  };

  async function upsertPublishedNativeCourse(input: {
    slug: string;
    title: string;
    description: string;
    status: "PUBLISHED";
    type: "NATIVE_VIDEO";
    expectedDurationMinutes: number;
    estimatedCompletionBusinessDays: number;
    categoryId: string;
    tagIds: string[];
  }) {
    const course = await prisma.course.upsert({
      where: {
        organizationId_slug: {
          organizationId: organization.id,
          slug: input.slug,
        },
      },
      update: {
        title: input.title,
        description: input.description,
        status: input.status,
        type: input.type,
        estimatedCompletionBusinessDays: input.estimatedCompletionBusinessDays,
        expectedDurationMinutes: input.expectedDurationMinutes,
        categoryId: input.categoryId,
      },
      create: {
        organizationId: organization.id,
        title: input.title,
        slug: input.slug,
        description: input.description,
        status: input.status,
        type: input.type,
        estimatedCompletionBusinessDays: input.estimatedCompletionBusinessDays,
        expectedDurationMinutes: input.expectedDurationMinutes,
        categoryId: input.categoryId,
      },
    });

    for (const tagId of input.tagIds) {
      await prisma.courseTagLink.upsert({
        where: {
          organizationId_courseId_tagId: {
            organizationId: organization.id,
            courseId: course.id,
            tagId,
          },
        },
        update: {},
        create: {
          organizationId: organization.id,
          courseId: course.id,
          tagId,
        },
      });
    }

    await prisma.courseTagLink.deleteMany({
      where: {
        organizationId: organization.id,
        courseId: course.id,
        tagId: { notIn: input.tagIds },
      },
    });

    return course;
  }

  async function upsertNativeCourseSurface(
    course: { id: string },
    input: {
      moduleSlug: string;
      moduleTitle: string;
      lessons: [string, string, number][];
    },
  ) {
    const courseModule = await prisma.courseModule.upsert({
      where: {
        organizationId_courseId_slug: {
          organizationId: organization.id,
          courseId: course.id,
          slug: input.moduleSlug,
        },
      },
      update: {
        title: input.moduleTitle,
        sortOrder: 0,
      },
      create: {
        organizationId: organization.id,
        courseId: course.id,
        title: input.moduleTitle,
        slug: input.moduleSlug,
        sortOrder: 0,
      },
    });

    const lessonsBySlug: Record<string, { id: string; durationSeconds: number }> = {};

    for (const [sortOrder, [lessonSlug, title, durationSeconds]] of input.lessons.entries()) {
      const lesson = await prisma.videoLesson.upsert({
        where: {
          organizationId_courseId_slug: {
            organizationId: organization.id,
            courseId: course.id,
            slug: lessonSlug,
          },
        },
        update: {
          moduleId: courseModule.id,
          title,
          sortOrder,
          durationSeconds,
          required: true,
          providerAssetId: null,
          providerUploadId: null,
          providerPlaybackId: null,
          providerStatus: "READY",
          providerError: null,
          playbackUrl: demoVideoPlaybackUrl(lessonSlug),
          transcriptLanguage: "en",
        },
        create: {
          organizationId: organization.id,
          courseId: course.id,
          moduleId: courseModule.id,
          title,
          slug: lessonSlug,
          sortOrder,
          durationSeconds,
          required: true,
          providerStatus: "READY",
          playbackUrl: demoVideoPlaybackUrl(lessonSlug),
          transcriptLanguage: "en",
        },
      });

      lessonsBySlug[lessonSlug] = { id: lesson.id, durationSeconds };

      const firstBreak = Math.floor(durationSeconds / 3);
      const secondBreak = Math.floor((durationSeconds * 2) / 3);

      await prisma.videoChapter.deleteMany({
        where: {
          organizationId: organization.id,
          lessonId: lesson.id,
        },
      });

      await prisma.videoChapter.createMany({
        data: [
          {
            organizationId: organization.id,
            lessonId: lesson.id,
            title: "Set the Context",
            startSecond: 0,
            endSecond: firstBreak,
            sortOrder: 0,
          },
          {
            organizationId: organization.id,
            lessonId: lesson.id,
            title: "Practice the Skill",
            startSecond: firstBreak,
            endSecond: secondBreak,
            sortOrder: 1,
          },
          {
            organizationId: organization.id,
            lessonId: lesson.id,
            title: "Apply on the Job",
            startSecond: secondBreak,
            endSecond: null,
            sortOrder: 2,
          },
        ],
      });

      await prisma.videoTranscriptCue.deleteMany({
        where: {
          organizationId: organization.id,
          lessonId: lesson.id,
        },
      });

      await prisma.videoTranscriptCue.createMany({
        data: [
          {
            organizationId: organization.id,
            lessonId: lesson.id,
            startSecond: 0,
            endSecond: firstBreak,
            text: `${title} opens with why this topic matters to Acme learners.`,
          },
          {
            organizationId: organization.id,
            lessonId: lesson.id,
            startSecond: firstBreak,
            endSecond: secondBreak,
            text: "The lesson demonstrates practical decisions and common mistakes to avoid.",
          },
          {
            organizationId: organization.id,
            lessonId: lesson.id,
            startSecond: secondBreak,
            endSecond: null,
            text: "Learners close by choosing one action to apply during their next shift or team meeting.",
          },
        ],
      });
    }

    return lessonsBySlug;
  }

  async function upsertKnowledgeCheckQuestion(input: {
    id: string;
    courseId: string;
    lessonId: string;
    prompt: string;
    questionType: QuestionType;
    sortOrder: number;
    explanation: string;
    answers: AnswerSeed[];
  }) {
    const question = await prisma.courseKnowledgeCheckQuestion.upsert({
      where: { id: input.id },
      update: {
        courseId: input.courseId,
        lessonId: input.lessonId,
        sourceGlobalQuestionId: null,
        prompt: input.prompt,
        questionType: input.questionType,
        sortOrder: input.sortOrder,
        required: true,
        active: true,
        explanation: input.explanation,
      },
      create: {
        id: input.id,
        organizationId: organization.id,
        courseId: input.courseId,
        lessonId: input.lessonId,
        prompt: input.prompt,
        questionType: input.questionType,
        sortOrder: input.sortOrder,
        required: true,
        active: true,
        explanation: input.explanation,
      },
    });

    const answers = await Promise.all(
      input.answers.map((answer) =>
        prisma.courseKnowledgeCheckAnswer.upsert({
          where: { id: answer.id },
          update: {
            questionId: question.id,
            text: answer.text,
            correct: answer.correct,
            feedback: answer.feedback,
            sortOrder: answer.sortOrder,
          },
          create: {
            id: answer.id,
            organizationId: organization.id,
            questionId: question.id,
            text: answer.text,
            correct: answer.correct,
            feedback: answer.feedback,
            sortOrder: answer.sortOrder,
          },
        }),
      ),
    );

    await prisma.courseKnowledgeCheckAnswer.deleteMany({
      where: {
        organizationId: organization.id,
        questionId: question.id,
        id: { notIn: input.answers.map((answer) => answer.id) },
      },
    });

    return { question, answers };
  }

  const complianceCategory = await upsertCategory("compliance", "Compliance");
  const securityCategory = await upsertCategory("security", "Security");
  const leadershipCategory = await upsertCategory("leadership", "Leadership");
  const privacyCategory = await upsertCategory("privacy", "Data Privacy");
  const customerCareCategory = await upsertCategory("customer-care", "Customer Care");
  const safetyCategory = await upsertCategory("safety", "Safety");

  const onboardingTag = await upsertTag("onboarding", "Onboarding");
  const securityTag = await upsertTag("security", "Security");
  const leadershipTag = await upsertTag("leadership", "Leadership");
  const privacyTag = await upsertTag("privacy", "Privacy");
  const customerCareTag = await upsertTag("customer-care", "Customer Care");
  const safetyTag = await upsertTag("safety", "Safety");
  const inclusionTag = await upsertTag("inclusion", "Inclusion");

  const securityCourse = await upsertPublishedNativeCourse({
    slug: "workplace-security-basics",
    title: "Workplace Security Basics",
    description: "Learn how to spot phishing, protect company devices, and report suspicious requests before they become incidents.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    expectedDurationMinutes: 45,
    estimatedCompletionBusinessDays: 5,
    categoryId: securityCategory.id,
    tagIds: [onboardingTag.id, securityTag.id],
  });

  const coachingCourse = await upsertPublishedNativeCourse({
    slug: "manager-coaching-basics",
    title: "Manager Coaching Basics",
    description: "Practice one-on-one coaching habits that help managers listen, ask better questions, and close with clear commitments.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    expectedDurationMinutes: 30,
    estimatedCompletionBusinessDays: 3,
    categoryId: leadershipCategory.id,
    tagIds: [leadershipTag.id],
  });

  const privacyCourse = await upsertPublishedNativeCourse({
    slug: "data-privacy-essentials",
    title: "Data Privacy Essentials",
    description: "Build everyday habits for collecting, sharing, and storing customer and employee data with care.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    expectedDurationMinutes: 38,
    estimatedCompletionBusinessDays: 4,
    categoryId: privacyCategory.id,
    tagIds: [privacyTag.id, onboardingTag.id],
  });

  const difficultConversationsCourse = await upsertPublishedNativeCourse({
    slug: "handling-difficult-conversations",
    title: "Handling Difficult Conversations",
    description: "Use calm, structured conversation moves to de-escalate tension and keep customer commitments clear.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    expectedDurationMinutes: 52,
    estimatedCompletionBusinessDays: 5,
    categoryId: customerCareCategory.id,
    tagIds: [customerCareTag.id, leadershipTag.id],
  });

  const safetyCourse = await upsertPublishedNativeCourse({
    slug: "warehouse-safety-fundamentals",
    title: "Warehouse Safety Fundamentals",
    description: "Review the safety routines that prevent injuries around equipment, aisles, lifting, and incident reporting.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    expectedDurationMinutes: 42,
    estimatedCompletionBusinessDays: 3,
    categoryId: safetyCategory.id,
    tagIds: [safetyTag.id, onboardingTag.id],
  });

  const inclusiveCommunicationCourse = await upsertPublishedNativeCourse({
    slug: "inclusive-team-communication",
    title: "Inclusive Team Communication",
    description: "Practice clearer team communication that makes meetings, feedback, and handoffs easier for everyone to follow.",
    status: "PUBLISHED",
    type: "NATIVE_VIDEO",
    expectedDurationMinutes: 34,
    estimatedCompletionBusinessDays: 4,
    categoryId: customerCareCategory.id,
    tagIds: [inclusionTag.id, leadershipTag.id],
  });

  const securityLessons = await upsertNativeCourseSurface(securityCourse, {
    moduleSlug: "security-foundations",
    moduleTitle: "Security Foundations",
    lessons: [
      ["welcome-and-course-goals", "Welcome and Course Goals", 240],
      ["password-and-device-hygiene", "Password and Device Hygiene", 540],
      ["recognize-suspicious-requests", "Recognize Suspicious Requests", 660],
      ["reporting-security-incidents", "Reporting Security Incidents", 420],
    ],
  });

  const coachingLessons = await upsertNativeCourseSurface(coachingCourse, {
    moduleSlug: "manager-foundations",
    moduleTitle: "Manager Foundations",
    lessons: [
      ["coaching-conversation-basics", "Coaching Conversation Basics", 420],
      ["listen-and-reflect", "Listen and Reflect", 480],
      ["commitments-and-follow-up", "Commitments and Follow-Up", 360],
    ],
  });

  const privacyLessons = await upsertNativeCourseSurface(privacyCourse, {
    moduleSlug: "privacy-foundations",
    moduleTitle: "Privacy Foundations",
    lessons: [
      ["identify-personal-data", "Identify Personal Data", 420],
      ["share-data-safely", "Share Data Safely", 540],
      ["privacy-incident-response", "Privacy Incident Response", 360],
    ],
  });

  const difficultConversationLessons = await upsertNativeCourseSurface(difficultConversationsCourse, {
    moduleSlug: "conversation-practice",
    moduleTitle: "Conversation Practice",
    lessons: [
      ["prepare-for-high-emotion", "Prepare for High Emotion", 480],
      ["de-escalate-in-the-moment", "De-escalate in the Moment", 660],
      ["close-with-next-steps", "Close with Next Steps", 420],
    ],
  });

  const safetyLessons = await upsertNativeCourseSurface(safetyCourse, {
    moduleSlug: "warehouse-safety-basics",
    moduleTitle: "Warehouse Safety Basics",
    lessons: [
      ["ppe-and-floor-awareness", "PPE and Floor Awareness", 420],
      ["safe-lifting-and-equipment", "Safe Lifting and Equipment", 540],
      ["reporting-near-misses", "Reporting Near Misses", 360],
    ],
  });

  const inclusiveCommunicationLessons = await upsertNativeCourseSurface(inclusiveCommunicationCourse, {
    moduleSlug: "inclusive-communication-basics",
    moduleTitle: "Inclusive Communication Basics",
    lessons: [
      ["set-shared-context", "Set Shared Context", 360],
      ["invite-every-voice", "Invite Every Voice", 480],
      ["confirm-understanding", "Confirm Understanding", 420],
    ],
  });

  const securityIncidentCheck = await upsertKnowledgeCheckQuestion({
    id: "seed-kcq-security-incident-report",
    courseId: securityCourse.id,
    lessonId: securityLessons["recognize-suspicious-requests"].id,
    prompt: "Security incident practice quiz: which message should be reported?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Unexpected urgency, payment pressure, and external links are common incident signals.",
    answers: [
      {
        id: "seed-kca-security-incident-urgent-link",
        text: "An urgent payment request with an external link from an unknown sender.",
        correct: true,
        feedback: "Urgency, payment pressure, and unknown links are strong reporting signals.",
        sortOrder: 0,
      },
      {
        id: "seed-kca-security-incident-team-calendar",
        text: "A calendar reminder for the weekly team meeting from your manager.",
        correct: false,
        feedback: "Known sender and expected context make this much less suspicious.",
        sortOrder: 1,
      },
      {
        id: "seed-kca-security-incident-benefits-news",
        text: "A benefits newsletter from the approved HR mailbox.",
        correct: false,
        feedback: "Approved internal senders are not automatic incident signals.",
        sortOrder: 2,
      },
    ],
  });

  await upsertKnowledgeCheckQuestion({
    id: "seed-kcq-security-passwords",
    courseId: securityCourse.id,
    lessonId: securityLessons["password-and-device-hygiene"].id,
    prompt: "What is the safest way to manage a new work password?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 1,
    explanation: "A password manager and unique password reduce reuse and phishing risk.",
    answers: [
      {
        id: "seed-kca-security-password-manager",
        text: "Create a unique password and store it in the approved password manager.",
        correct: true,
        feedback: "Unique credentials and approved storage are the right pattern.",
        sortOrder: 0,
      },
      {
        id: "seed-kca-security-password-reuse",
        text: "Reuse a memorable personal password so you do not forget it.",
        correct: false,
        feedback: "Password reuse lets one breach unlock multiple systems.",
        sortOrder: 1,
      },
    ],
  });

  await upsertKnowledgeCheckQuestion({
    id: "seed-kcq-coaching-listening",
    courseId: coachingCourse.id,
    lessonId: coachingLessons["listen-and-reflect"].id,
    prompt: "Which response best shows active listening in a coaching conversation?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Reflecting what you heard before advising keeps the conversation learner-centered.",
    answers: [
      {
        id: "seed-kca-coaching-reflect",
        text: "Summarize what you heard and ask whether you understood correctly.",
        correct: true,
        feedback: "Reflection confirms understanding before moving to advice.",
        sortOrder: 0,
      },
      {
        id: "seed-kca-coaching-solve-fast",
        text: "Interrupt with the solution once you recognize the issue.",
        correct: false,
        feedback: "Solving too early can miss the real blocker.",
        sortOrder: 1,
      },
    ],
  });

  const privacyPersonalDataCheck = await upsertKnowledgeCheckQuestion({
    id: "seed-kcq-privacy-personal-data",
    courseId: privacyCourse.id,
    lessonId: privacyLessons["identify-personal-data"].id,
    prompt: "Which item should be treated as personal data?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Customer contact details can identify a person and need privacy controls.",
    answers: [
      {
        id: "seed-kca-privacy-customer-email",
        text: "A customer email address linked to an account.",
        correct: true,
        feedback: "Emails tied to accounts can identify customers.",
        sortOrder: 0,
      },
      {
        id: "seed-kca-privacy-office-hours",
        text: "The public office holiday schedule.",
        correct: false,
        feedback: "Public schedules do not usually identify an individual.",
        sortOrder: 1,
      },
    ],
  });

  await upsertKnowledgeCheckQuestion({
    id: "seed-kcq-conversations-deescalate",
    courseId: difficultConversationsCourse.id,
    lessonId: difficultConversationLessons["de-escalate-in-the-moment"].id,
    prompt: "What should you do first when a customer conversation becomes tense?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Acknowledging emotion and slowing the pace helps restore a productive conversation.",
    answers: [
      {
        id: "seed-kca-conversations-acknowledge",
        text: "Acknowledge the concern and restate the shared goal.",
        correct: true,
        feedback: "This lowers tension while keeping the conversation focused.",
        sortOrder: 0,
      },
      {
        id: "seed-kca-conversations-policy-only",
        text: "Repeat the policy louder until the customer accepts it.",
        correct: false,
        feedback: "Volume and repetition usually escalate tension.",
        sortOrder: 1,
      },
    ],
  });

  await upsertKnowledgeCheckQuestion({
    id: "seed-kcq-safety-near-miss",
    courseId: safetyCourse.id,
    lessonId: safetyLessons["reporting-near-misses"].id,
    prompt: "Why should a near miss be reported even when no one is hurt?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Near-miss reports help teams remove hazards before they cause injuries.",
    answers: [
      {
        id: "seed-kca-safety-prevent",
        text: "It helps the team fix hazards before an injury happens.",
        correct: true,
        feedback: "Near misses are early warning signals.",
        sortOrder: 0,
      },
      {
        id: "seed-kca-safety-ignore",
        text: "It should not be reported unless equipment was damaged.",
        correct: false,
        feedback: "No-damage incidents can still reveal unsafe conditions.",
        sortOrder: 1,
      },
    ],
  });

  await upsertKnowledgeCheckQuestion({
    id: "seed-kcq-inclusive-understanding",
    courseId: inclusiveCommunicationCourse.id,
    lessonId: inclusiveCommunicationLessons["confirm-understanding"].id,
    prompt: "Which habit makes team handoffs more inclusive?",
    questionType: "SINGLE_CHOICE",
    sortOrder: 0,
    explanation: "Confirming decisions and next steps reduces ambiguity for everyone involved.",
    answers: [
      {
        id: "seed-kca-inclusive-summarize",
        text: "Summarize the decision, owner, and next step before ending the handoff.",
        correct: true,
        feedback: "Clear summaries give every teammate the same context.",
        sortOrder: 0,
      },
      {
        id: "seed-kca-inclusive-assume",
        text: "Assume experienced teammates already know what you mean.",
        correct: false,
        feedback: "Assumptions create avoidable gaps in shared understanding.",
        sortOrder: 1,
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
      categoryId: complianceCategory.id,
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
      categoryId: complianceCategory.id,
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
        courseId: coachingCourse.id,
        membershipId: learnerMembership.id,
      },
    },
    update: {
      assignedByMembershipId: adminMembership.id,
      startDate,
      dueDate: addBusinessDays(startDate, coachingCourse.estimatedCompletionBusinessDays),
      status: "ASSIGNED",
    },
    create: {
      id: "seed-acme-learner-manager-coaching",
      organizationId: organization.id,
      courseId: coachingCourse.id,
      membershipId: learnerMembership.id,
      assignedByMembershipId: adminMembership.id,
      startDate,
      dueDate: addBusinessDays(startDate, coachingCourse.estimatedCompletionBusinessDays),
      status: "ASSIGNED",
    },
  });

  const securityAssignment = await prisma.courseAssignment.upsert({
    where: {
      organizationId_courseId_membershipId: {
        organizationId: organization.id,
        courseId: securityCourse.id,
        membershipId: learnerMembership.id,
      },
    },
    update: {
      assignedByMembershipId: adminMembership.id,
      startDate,
      dueDate: addBusinessDays(startDate, securityCourse.estimatedCompletionBusinessDays),
      status: "IN_PROGRESS",
    },
    create: {
      id: "seed-acme-learner-security-basics",
      organizationId: organization.id,
      courseId: securityCourse.id,
      membershipId: learnerMembership.id,
      assignedByMembershipId: adminMembership.id,
      startDate,
      dueDate: addBusinessDays(startDate, securityCourse.estimatedCompletionBusinessDays),
      status: "IN_PROGRESS",
    },
  });

  const securityAssignmentProgressPayload = {
    progressPercent: 58,
    lastEventAt: new Date("2026-06-12T15:00:00.000Z"),
  };

  await prisma.assignmentProgress.upsert({
    where: {
      organizationId_assignmentId: {
        organizationId: organization.id,
        assignmentId: securityAssignment.id,
      },
    },
    update: securityAssignmentProgressPayload,
    create: {
      organizationId: organization.id,
      assignmentId: securityAssignment.id,
      ...securityAssignmentProgressPayload,
    },
  });

  const securityResumeLesson = securityLessons["recognize-suspicious-requests"];
  const securityLessonProgressPayload = {
    lastPositionSecond: 420,
    maxWatchedSecond: 510,
    completed: false,
    lastWatchedAt: new Date("2026-06-12T15:00:00.000Z"),
  };

  await prisma.videoLessonProgress.upsert({
    where: {
      organizationId_assignmentId_lessonId: {
        organizationId: organization.id,
        assignmentId: securityAssignment.id,
        lessonId: securityResumeLesson.id,
      },
    },
    update: {
      courseId: securityCourse.id,
      ...securityLessonProgressPayload,
    },
    create: {
      organizationId: organization.id,
      courseId: securityCourse.id,
      assignmentId: securityAssignment.id,
      lessonId: securityResumeLesson.id,
      ...securityLessonProgressPayload,
    },
  });

  const completedQuestion = securityIncidentCheck.question;
  const correctAnswer = securityIncidentCheck.answers.find((answer) => answer.correct);

  if (!correctAnswer) {
    throw new Error("Seed security incident knowledge check is missing a correct answer.");
  }

  await prisma.knowledgeCheckAttempt.upsert({
    where: {
      organizationId_assignmentId_questionId_attemptNumber: {
        organizationId: organization.id,
        assignmentId: securityAssignment.id,
        questionId: completedQuestion.id,
        attemptNumber: 1,
      },
    },
    update: {
      selectedAnswerIds: [correctAnswer.id],
      correct: true,
      scorePercent: 100,
      submittedAt: new Date("2026-06-12T15:00:00.000Z"),
    },
    create: {
      organizationId: organization.id,
      assignmentId: securityAssignment.id,
      questionId: completedQuestion.id,
      attemptNumber: 1,
      selectedAnswerIds: [correctAnswer.id],
      correct: true,
      scorePercent: 100,
      submittedAt: new Date("2026-06-12T15:00:00.000Z"),
    },
  });

  const completedStartDate = new Date("2026-06-03T12:00:00.000Z");
  const completedAssignment = await prisma.courseAssignment.upsert({
    where: {
      organizationId_courseId_membershipId: {
        organizationId: organization.id,
        courseId: privacyCourse.id,
        membershipId: learnerMembership.id,
      },
    },
    update: {
      assignedByMembershipId: adminMembership.id,
      startDate: completedStartDate,
      dueDate: addBusinessDays(completedStartDate, privacyCourse.estimatedCompletionBusinessDays),
      status: "COMPLETED",
    },
    create: {
      id: "seed-acme-learner-data-privacy",
      organizationId: organization.id,
      courseId: privacyCourse.id,
      membershipId: learnerMembership.id,
      assignedByMembershipId: adminMembership.id,
      startDate: completedStartDate,
      dueDate: addBusinessDays(completedStartDate, privacyCourse.estimatedCompletionBusinessDays),
      status: "COMPLETED",
    },
  });

  await prisma.assignmentProgress.upsert({
    where: {
      organizationId_assignmentId: {
        organizationId: organization.id,
        assignmentId: completedAssignment.id,
      },
    },
    update: {
      progressPercent: 100,
      lastEventAt: new Date("2026-06-10T14:00:00.000Z"),
    },
    create: {
      organizationId: organization.id,
      assignmentId: completedAssignment.id,
      progressPercent: 100,
      lastEventAt: new Date("2026-06-10T14:00:00.000Z"),
    },
  });

  const privacyLessonProgressPayload = {
    completed: true,
    lastWatchedAt: new Date("2026-06-10T13:45:00.000Z"),
  };

  for (const lesson of Object.values(privacyLessons)) {
    await prisma.videoLessonProgress.upsert({
      where: {
        organizationId_assignmentId_lessonId: {
          organizationId: organization.id,
          assignmentId: completedAssignment.id,
          lessonId: lesson.id,
        },
      },
      update: {
        courseId: privacyCourse.id,
        lastPositionSecond: lesson.durationSeconds,
        maxWatchedSecond: lesson.durationSeconds,
        ...privacyLessonProgressPayload,
      },
      create: {
        organizationId: organization.id,
        courseId: privacyCourse.id,
        assignmentId: completedAssignment.id,
        lessonId: lesson.id,
        lastPositionSecond: lesson.durationSeconds,
        maxWatchedSecond: lesson.durationSeconds,
        ...privacyLessonProgressPayload,
      },
    });
  }

  const privacyCorrectAnswer = privacyPersonalDataCheck.answers.find((answer) => answer.correct);

  if (!privacyCorrectAnswer) {
    throw new Error("Seed privacy knowledge check is missing a correct answer.");
  }

  const privacyKnowledgeCheckAttempt = await prisma.knowledgeCheckAttempt.upsert({
    where: {
      organizationId_assignmentId_questionId_attemptNumber: {
        organizationId: organization.id,
        assignmentId: completedAssignment.id,
        questionId: privacyPersonalDataCheck.question.id,
        attemptNumber: 1,
      },
    },
    update: {
      selectedAnswerIds: [privacyCorrectAnswer.id],
      correct: true,
      scorePercent: 100,
      submittedAt: new Date("2026-06-10T13:50:00.000Z"),
    },
    create: {
      organizationId: organization.id,
      assignmentId: completedAssignment.id,
      questionId: privacyPersonalDataCheck.question.id,
      attemptNumber: 1,
      selectedAnswerIds: [privacyCorrectAnswer.id],
      correct: true,
      scorePercent: 100,
      submittedAt: new Date("2026-06-10T13:50:00.000Z"),
    },
  });

  if (!privacyKnowledgeCheckAttempt.correct) {
    throw new Error("Seed privacy knowledge check attempt did not converge to correct.");
  }

  const dataPrivacyVerificationCode = "LHACMEDATAPRIVACY1";
  const certificatePayload = {
    courseId: privacyCourse.id,
    membershipId: learnerMembership.id,
    userId: learner.id,
    learnerName: "Leela Learner",
    learnerEmail: "learner@acme.test",
    courseTitle: "Data Privacy Essentials",
    issuerName: organization.name,
    issuerLogoUrl: organization.logoUrl,
    issuerPrimaryColor: organization.primaryColor,
    issuerAccentColor: organization.accentColor,
    artifactStorageKey: null,
    artifactContentType: "text/html",
    verificationCode: dataPrivacyVerificationCode,
    verificationUrl: `${demoCertificateBaseUrl}/${dataPrivacyVerificationCode}`,
    issuedAt: new Date("2026-06-10T14:00:00.000Z"),
  };

  await prisma.certificate.upsert({
    where: {
      organizationId_assignmentId: {
        organizationId: organization.id,
        assignmentId: completedAssignment.id,
      },
    },
    update: certificatePayload,
    create: {
      organizationId: organization.id,
      assignmentId: completedAssignment.id,
      ...certificatePayload,
    },
  });

  const legacyAdmin = await prisma.user.findUnique({
    where: { email: legacyDemoAdminEmail },
    select: {
      id: true,
      memberships: {
        where: { organizationId: organization.id },
        select: { id: true },
      },
    },
  });

  if (legacyAdmin) {
    const legacyMembershipIds = legacyAdmin.memberships.map((membership) => membership.id);

    if (legacyMembershipIds.length > 0) {
      await prisma.courseAssignment.updateMany({
        where: {
          organizationId: organization.id,
          assignedByMembershipId: { in: legacyMembershipIds },
        },
        data: {
          assignedByMembershipId: adminMembership.id,
        },
      });

      await prisma.organizationMembership.deleteMany({
        where: {
          organizationId: organization.id,
          userId: legacyAdmin.id,
        },
      });
    }

    await prisma.user.delete({
      where: { id: legacyAdmin.id },
    });
  }

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
