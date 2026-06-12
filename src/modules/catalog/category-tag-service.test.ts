import { describe, expect, it, vi } from "vitest";

import {
  createCategory,
  createTag,
  type CatalogTaxonomyRepository,
} from "./category-tag-service";

function createRepository(): CatalogTaxonomyRepository & { calls: string[] } {
  const calls: string[] = [];

  return {
    calls,
    runInTransaction: vi.fn(async (operation) => {
      calls.push("transaction:start");
      const result = await operation();
      calls.push("transaction:end");

      return result;
    }),
    createCategory: vi.fn(async (data) => {
      calls.push(`category:${data.slug}`);

      return { id: "category_1", slug: data.slug };
    }),
    createTag: vi.fn(async (data) => {
      calls.push(`tag:${data.slug}`);

      return { id: "tag_1", slug: data.slug };
    }),
    recordAuditLog: vi.fn(async (data) => {
      calls.push(`audit:${data.action}:${data.targetId}`);
    }),
  };
}

describe("catalog taxonomy service", () => {
  it("creates categories with validated name and slug inside one transaction", async () => {
    const repository = createRepository();

    const category = await createCategory(
      {
        organizationId: "org_1",
        actorId: "actor_1",
        name: " Safety ",
        slug: " safety ",
      },
      repository,
    );

    expect(category).toEqual({ id: "category_1", slug: "safety" });
    expect(repository.createCategory).toHaveBeenCalledWith({
      organizationId: "org_1",
      name: "Safety",
      slug: "safety",
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorId: "actor_1",
      action: "catalog.category_created",
      targetType: "course_category",
      targetId: "category_1",
    });
    expect(repository.calls).toEqual([
      "transaction:start",
      "category:safety",
      "audit:catalog.category_created:category_1",
      "transaction:end",
    ]);
  });

  it("creates tags with validated name and slug inside one transaction", async () => {
    const repository = createRepository();

    const tag = await createTag(
      {
        organizationId: "org_1",
        actorId: "actor_1",
        name: " Leadership ",
        slug: " leadership ",
      },
      repository,
    );

    expect(tag).toEqual({ id: "tag_1", slug: "leadership" });
    expect(repository.createTag).toHaveBeenCalledWith({
      organizationId: "org_1",
      name: "Leadership",
      slug: "leadership",
    });
    expect(repository.recordAuditLog).toHaveBeenCalledWith({
      organizationId: "org_1",
      actorId: "actor_1",
      action: "catalog.tag_created",
      targetType: "course_tag",
      targetId: "tag_1",
    });
    expect(repository.calls).toEqual([
      "transaction:start",
      "tag:leadership",
      "audit:catalog.tag_created:tag_1",
      "transaction:end",
    ]);
  });

  it("rejects blank ids, blank names, and unsafe slugs before writes", async () => {
    const invalidCases = [
      {
        input: { organizationId: " ", actorId: "actor_1", name: "Safety", slug: "safety" },
        error: "Organization id is required",
      },
      {
        input: { organizationId: "org_1", actorId: " ", name: "Safety", slug: "safety" },
        error: "Actor id is required",
      },
      {
        input: { organizationId: "org_1", actorId: "actor_1", name: " ", slug: "safety" },
        error: "Course title is required",
      },
      {
        input: { organizationId: "org_1", actorId: "actor_1", name: "Safety", slug: "Safety" },
        error: "Slug must use lowercase letters, numbers, and hyphens",
      },
    ];

    for (const invalidCase of invalidCases) {
      const repository = createRepository();

      await expect(createCategory(invalidCase.input, repository)).rejects.toThrow(invalidCase.error);
      expect(repository.runInTransaction).not.toHaveBeenCalled();
      expect(repository.createCategory).not.toHaveBeenCalled();
      expect(repository.recordAuditLog).not.toHaveBeenCalled();
    }
  });

  it("translates duplicate taxonomy slugs", async () => {
    const repository = createRepository();
    vi.mocked(repository.createCategory).mockRejectedValueOnce({ code: "P2002" });

    await expect(
      createCategory(
        {
          organizationId: "org_1",
          actorId: "actor_1",
          name: "Safety",
          slug: "safety",
        },
        repository,
      ),
    ).rejects.toThrow("Catalog slug already exists");
  });
});
