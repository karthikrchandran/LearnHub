import {
  normalizeCatalogSlug,
  requireCatalogTitle,
} from "./catalog-validation";

export type CreateCatalogTaxonomyInput = {
  organizationId: string;
  actorId: string;
  name: string;
  slug: string;
};

export type CatalogTaxonomyRepository = {
  runInTransaction<T>(operation: () => Promise<T>): Promise<T>;
  createCategory(data: { organizationId: string; name: string; slug: string }): Promise<{ id: string; slug: string }>;
  createTag(data: { organizationId: string; name: string; slug: string }): Promise<{ id: string; slug: string }>;
  recordAuditLog(data: {
    organizationId: string;
    actorId: string;
    action: "catalog.category_created" | "catalog.tag_created";
    targetType: "course_category" | "course_tag";
    targetId: string;
  }): Promise<void>;
};

export async function createCategory(
  input: CreateCatalogTaxonomyInput,
  repository: CatalogTaxonomyRepository,
): Promise<{ id: string; slug: string }> {
  const organizationId = requireNonEmptyValue(input.organizationId, "Organization id is required");
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const name = requireCatalogTitle(input.name);
  const slug = normalizeCatalogSlug(input.slug);

  return runWithDuplicateSlugTranslation(async () =>
    repository.runInTransaction(async () => {
      const category = await repository.createCategory({ organizationId, name, slug });

      await repository.recordAuditLog({
        organizationId,
        actorId,
        action: "catalog.category_created",
        targetType: "course_category",
        targetId: category.id,
      });

      return category;
    }),
  );
}

export async function createTag(
  input: CreateCatalogTaxonomyInput,
  repository: CatalogTaxonomyRepository,
): Promise<{ id: string; slug: string }> {
  const organizationId = requireNonEmptyValue(input.organizationId, "Organization id is required");
  const actorId = requireNonEmptyValue(input.actorId, "Actor id is required");
  const name = requireCatalogTitle(input.name);
  const slug = normalizeCatalogSlug(input.slug);

  return runWithDuplicateSlugTranslation(async () =>
    repository.runInTransaction(async () => {
      const tag = await repository.createTag({ organizationId, name, slug });

      await repository.recordAuditLog({
        organizationId,
        actorId,
        action: "catalog.tag_created",
        targetType: "course_tag",
        targetId: tag.id,
      });

      return tag;
    }),
  );
}

function requireNonEmptyValue(value: string, message: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(message);
  }

  return normalized;
}

async function runWithDuplicateSlugTranslation<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new Error("Catalog slug already exists");
    }

    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
