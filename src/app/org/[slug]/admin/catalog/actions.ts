"use server";

import { requireOrganizationUsersAdminBySlug } from "@/lib/auth/guards";
import { createPrismaCatalogRepository } from "@/modules/catalog/prisma-repository";
import { createCatalogActions } from "@/modules/catalog/server-actions";

async function getActorAndOrganization(slug: string) {
  const { context, organizationId } = await requireOrganizationUsersAdminBySlug(slug);

  return {
    actorId: context.userId,
    organizationId,
  };
}

async function createActions() {
  const { prisma } = await import("@/lib/prisma");

  return createCatalogActions({
    getActorAndOrganization,
    repository: createPrismaCatalogRepository(prisma),
  });
}

export async function createCategoryFormAction(slug: string, formData: FormData) {
  return (await createActions()).createCategory(slug, formData);
}

export async function createTagFormAction(slug: string, formData: FormData) {
  return (await createActions()).createTag(slug, formData);
}

export async function createCourseFormAction(slug: string, formData: FormData) {
  return (await createActions()).createCourse(slug, formData);
}

export async function updateCourseLifecycleFormAction(slug: string, formData: FormData) {
  return (await createActions()).updateLifecycle(slug, formData);
}
