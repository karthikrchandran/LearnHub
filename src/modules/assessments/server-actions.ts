import { normalizeKnowledgeCheckDraft, reorderKnowledgeChecks } from "./knowledge-checks";
import type { KnowledgeCheckRepository } from "./prisma-repository";
import type { KnowledgeCheckQuestionType } from "./scoring";

export type KnowledgeCheckActionResult =
  | { ok: true; id?: string }
  | { ok: false; message: string };

export type KnowledgeCheckAdminActionDeps = {
  getActorAndCourse(slug: string, courseSlug: string): Promise<{
    organizationId: string;
    courseId: string;
    actorId: string;
  }>;
  repository: Pick<KnowledgeCheckRepository, "createCheck" | "replaceCheck" | "reorderChecks" | "setCheckActive">;
};

export function createKnowledgeCheckAdminActions(deps: KnowledgeCheckAdminActionDeps) {
  return {
    async createCheck(slug: string, courseSlug: string, formData: FormData): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        const draft = normalizeKnowledgeCheckDraft(parseDraftForm(course.organizationId, course.courseId, formData));
        const created = await deps.repository.createCheck(draft);

        return { ok: true, id: created.id };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Knowledge check could not be saved" };
      }
    },
    async updateCheck(
      slug: string,
      courseSlug: string,
      checkId: string,
      formData: FormData,
    ): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        const draft = normalizeKnowledgeCheckDraft(parseDraftForm(course.organizationId, course.courseId, formData));
        await deps.repository.replaceCheck({ id: checkId, draft });

        return { ok: true, id: checkId };
      } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Knowledge check could not be saved" };
      }
    },
    async reorderChecks(slug: string, courseSlug: string, formData: FormData): Promise<KnowledgeCheckActionResult> {
      const course = await deps.getActorAndCourse(slug, courseSlug);
      const ids = JSON.parse(String(formData.get("ids") ?? "[]")) as string[];
      await deps.repository.reorderChecks({
        organizationId: course.organizationId,
        orderedIds: reorderKnowledgeChecks(ids),
      });

      return { ok: true };
    },
    async activateCheck(slug: string, courseSlug: string, checkId: string): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        await deps.repository.setCheckActive({ organizationId: course.organizationId, id: checkId, active: true });

        return { ok: true, id: checkId };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Knowledge check could not be activated",
        };
      }
    },
    async deactivateCheck(slug: string, courseSlug: string, checkId: string): Promise<KnowledgeCheckActionResult> {
      try {
        const course = await deps.getActorAndCourse(slug, courseSlug);
        await deps.repository.setCheckActive({ organizationId: course.organizationId, id: checkId, active: false });

        return { ok: true, id: checkId };
      } catch (error) {
        return {
          ok: false,
          message: error instanceof Error ? error.message : "Knowledge check could not be deactivated",
        };
      }
    },
  };
}

function parseDraftForm(organizationId: string, courseId: string, formData: FormData) {
  return {
    organizationId,
    courseId,
    lessonId: emptyToNull(formData.get("lessonId")),
    prompt: String(formData.get("prompt") ?? ""),
    questionType: String(formData.get("questionType") ?? "SINGLE_CHOICE") as KnowledgeCheckQuestionType,
    required: formData.get("required") === "on",
    active: formData.get("active") === "on",
    explanation: emptyToNull(formData.get("explanation")),
    answers: parseAnswers(String(formData.get("answers") ?? "[]")),
  };
}

function parseAnswers(raw: string): Array<{ text: string; correct: boolean; feedback: string | null; sortOrder: number }> {
  const parsed = JSON.parse(raw) as Array<{ text: string; correct: boolean; feedback?: string | null }>;

  return parsed.map((answer, index) => ({
    text: answer.text,
    correct: answer.correct,
    feedback: answer.feedback ?? null,
    sortOrder: index,
  }));
}

function emptyToNull(value: FormDataEntryValue | null): string | null {
  const text = String(value ?? "").trim();
  return text ? text : null;
}
