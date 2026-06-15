"use server";

import { requireOrganizationMemberBySlug } from "@/lib/auth/guards";
import { createPrismaAssignmentRepository } from "@/modules/assignments/prisma-repository";
import { createAssignCourseAction, createBulkAssignCourseAction } from "@/modules/assignments/server-actions";
import { scheduleAssignmentNotifications } from "@/modules/notifications/notification-jobs";
import { createPrismaNotificationRepository } from "@/modules/notifications/prisma-repository";

async function getActorAndOrganization(slug: string) {
  const { context, organizationId } = await requireOrganizationMemberBySlug(slug);

  return { actor: context, organizationId };
}

export async function assignCourseFormAction(slug: string, formData: FormData) {
  const [{ env }, { prisma }] = await Promise.all([import("@/lib/env"), import("@/lib/prisma")]);
  const notificationRepository = createPrismaNotificationRepository(prisma);

  return createAssignCourseAction({
    getActorAndOrganization,
    repository: createPrismaAssignmentRepository(prisma),
    notificationScheduler: {
      scheduleAssignmentNotifications: (input) => scheduleAssignmentNotifications(input, notificationRepository),
    },
    buildAssignmentUrl: (organizationSlug) =>
      `${env.APP_BASE_URL.replace(/\/+$/, "")}/org/${encodeURIComponent(organizationSlug)}/learn`,
    now: () => new Date(),
  })(slug, formData);
}

export async function bulkAssignCourseFormAction(slug: string, formData: FormData) {
  const [{ env }, { prisma }] = await Promise.all([import("@/lib/env"), import("@/lib/prisma")]);
  const notificationRepository = createPrismaNotificationRepository(prisma);

  return createBulkAssignCourseAction({
    getActorAndOrganization,
    repository: createPrismaAssignmentRepository(prisma),
    notificationScheduler: {
      scheduleAssignmentNotifications: (input) => scheduleAssignmentNotifications(input, notificationRepository),
    },
    buildAssignmentUrl: (organizationSlug) =>
      `${env.APP_BASE_URL.replace(/\/+$/, "")}/org/${encodeURIComponent(organizationSlug)}/learn`,
    now: () => new Date(),
  })(slug, formData);
}
