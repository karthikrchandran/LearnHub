"use server";

import { requirePlatformOwner } from "@/lib/auth/guards";
import { createPrismaGlobalLibraryRepository } from "@/modules/library/prisma-repository";
import { createPlatformLibraryActions } from "@/modules/library/server-actions";
import { revalidatePath } from "next/cache";

async function createActions() {
  const { prisma } = await import("@/lib/prisma");

  return createPlatformLibraryActions({
    getActor: requirePlatformOwner,
    repository: createPrismaGlobalLibraryRepository(prisma),
  });
}

export async function createGlobalLibraryCourseFormAction(formData: FormData) {
  const result = await (await createActions()).createCourse(formData);

  if (result.status === "success") {
    revalidatePath("/platform/library");
  }

  return result;
}

export async function updateGlobalLibraryCourseLifecycleFormAction(formData: FormData) {
  const result = await (await createActions()).updateLifecycle(formData);

  if (result.status === "success") {
    const courseSlug = formData.get("courseSlug");

    revalidatePath("/platform/library");

    if (typeof courseSlug === "string" && courseSlug.trim()) {
      revalidatePath(`/platform/library/${courseSlug}`);
    }
  }

  return result;
}
