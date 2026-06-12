import { describe, expect, it, vi } from "vitest";

import {
  createKnowledgeCheckAdminActions,
  type KnowledgeCheckAdminActionDeps,
} from "./server-actions";

function createValidFormData(): FormData {
  const formData = new FormData();
  formData.set("prompt", "Which response is best?");
  formData.set("questionType", "SINGLE_CHOICE");
  formData.set("lessonId", "lesson_1");
  formData.set("required", "on");
  formData.set("active", "on");
  formData.set("explanation", "Use neutral language.");
  formData.set(
    "answers",
    JSON.stringify([
      { text: "What happened?", correct: true, feedback: "Correct." },
      { text: "Why did you fail?", correct: false, feedback: "Too accusatory." },
    ]),
  );

  return formData;
}

function createActions(overrides: {
  repository?: Record<string, unknown>;
  getActorAndCourse?: KnowledgeCheckAdminActionDeps["getActorAndCourse"];
} = {}) {
  const repository = {
    createCheck: vi.fn().mockResolvedValue({ id: "check_1" }),
    replaceCheck: vi.fn().mockResolvedValue(undefined),
    reorderChecks: vi.fn().mockResolvedValue(undefined),
    setCheckActive: vi.fn().mockResolvedValue(undefined),
    ...overrides.repository,
  };
  const getActorAndCourse: KnowledgeCheckAdminActionDeps["getActorAndCourse"] =
    overrides.getActorAndCourse ??
    vi.fn(async () => ({
      organizationId: "org_1",
      courseId: "course_1",
      actorId: "user_1",
    }));

  return {
    actions: createKnowledgeCheckAdminActions({
      getActorAndCourse,
      repository: repository as never,
    }),
    repository,
    getActorAndCourse,
  };
}

describe("createKnowledgeCheckAdminActions", () => {
  it("creates a normalized check from form data", async () => {
    const { actions, repository, getActorAndCourse } = createActions();

    await expect(actions.createCheck("acme", "manager-basics", createValidFormData())).resolves.toEqual({
      ok: true,
      id: "check_1",
    });
    expect(getActorAndCourse).toHaveBeenCalledWith("acme", "manager-basics");
    expect(repository.createCheck).toHaveBeenCalledWith(
      expect.objectContaining({
        organizationId: "org_1",
        courseId: "course_1",
        lessonId: "lesson_1",
        prompt: "Which response is best?",
        questionType: "SINGLE_CHOICE",
        required: true,
        active: true,
        explanation: "Use neutral language.",
        answers: [
          { text: "What happened?", correct: true, feedback: "Correct.", sortOrder: 0 },
          { text: "Why did you fail?", correct: false, feedback: "Too accusatory.", sortOrder: 1 },
        ],
      }),
    );
  });

  it("updates an existing check through the authenticated course scope", async () => {
    const { actions, repository } = createActions();

    await expect(actions.updateCheck("acme", "manager-basics", "check_1", createValidFormData())).resolves.toEqual({
      ok: true,
      id: "check_1",
    });
    expect(repository.replaceCheck).toHaveBeenCalledWith({
      id: "check_1",
      draft: expect.objectContaining({
        organizationId: "org_1",
        courseId: "course_1",
      }),
    });
  });

  it("returns invalid draft messages without throwing", async () => {
    const { actions, repository } = createActions();
    const formData = createValidFormData();
    formData.set("prompt", " ");

    await expect(actions.createCheck("acme", "manager-basics", formData)).resolves.toEqual({
      ok: false,
      message: "Knowledge check prompt is required",
    });
    expect(repository.createCheck).not.toHaveBeenCalled();
  });

  it("reorders checks from a JSON id array", async () => {
    const { actions, repository } = createActions();
    const formData = new FormData();
    formData.set("ids", JSON.stringify(["check_b", "check_a"]));

    await expect(actions.reorderChecks("acme", "manager-basics", formData)).resolves.toEqual({ ok: true });
    expect(repository.reorderChecks).toHaveBeenCalledWith({
      organizationId: "org_1",
      orderedIds: [
        { id: "check_b", sortOrder: 0 },
        { id: "check_a", sortOrder: 1 },
      ],
    });
  });

  it("activates and deactivates checks with authenticated organization scope", async () => {
    const { actions, repository } = createActions();

    await expect(actions.activateCheck("acme", "manager-basics", "check_1")).resolves.toEqual({
      ok: true,
      id: "check_1",
    });
    await expect(actions.deactivateCheck("acme", "manager-basics", "check_1")).resolves.toEqual({
      ok: true,
      id: "check_1",
    });

    expect(repository.setCheckActive).toHaveBeenCalledWith({
      organizationId: "org_1",
      id: "check_1",
      active: true,
    });
    expect(repository.setCheckActive).toHaveBeenCalledWith({
      organizationId: "org_1",
      id: "check_1",
      active: false,
    });
  });

  it("returns repository validation errors when activation fails", async () => {
    const { actions } = createActions({
      repository: {
        setCheckActive: vi
          .fn()
          .mockRejectedValue(new Error("Active knowledge checks require at least one correct answer")),
      },
    });

    await expect(actions.activateCheck("acme", "manager-basics", "check_1")).resolves.toEqual({
      ok: false,
      message: "Active knowledge checks require at least one correct answer",
    });
  });
});
