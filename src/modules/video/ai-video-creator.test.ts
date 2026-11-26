import { describe, expect, it, vi } from "vitest";

import { generateAiVideoLessonDraft } from "./ai-video-creator";

const validDraft = {
  title: "Safer password habits",
  durationMinutes: 3,
  learningObjectives: ["Create a unique passphrase"],
  narrationScript: "Start with a unique passphrase.",
  videoGenerationPrompt: "A clean, original animated security explainer.",
  scenes: [{ durationSeconds: 20, visualDescription: "A person signs in on a laptop.", narration: "Use a unique passphrase." }],
};

describe("generateAiVideoLessonDraft", () => {
  it("requests and validates a structured video lesson package", async () => {
    const fetcher = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      expect(init?.headers).toMatchObject({ authorization: "Bearer test-key" });
      expect(JSON.parse(String(init?.body))).toMatchObject({ model: "test-model", response_format: { type: "json_object" } });
      return Response.json({ choices: [{ message: { content: JSON.stringify(validDraft) } }] });
    });

    await expect(generateAiVideoLessonDraft(
      { brief: "Teach password safety", audience: "New employees", tone: "Friendly", durationMinutes: 3 },
      { apiKey: "test-key", model: "test-model", fetcher: fetcher as typeof fetch },
    )).resolves.toEqual(validDraft);
  });

  it("rejects empty briefs before calling the provider", async () => {
    const fetcher = vi.fn();

    await expect(generateAiVideoLessonDraft(
      { brief: " ", audience: "New employees", tone: "Friendly", durationMinutes: 3 },
      { apiKey: "test-key", model: "test-model", fetcher: fetcher as typeof fetch },
    )).rejects.toThrow("Describe what learners should learn");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects malformed provider output", async () => {
    await expect(generateAiVideoLessonDraft(
      { brief: "Teach password safety", audience: "New employees", tone: "Friendly", durationMinutes: 3 },
      {
        apiKey: "test-key",
        model: "test-model",
        fetcher: vi.fn(async () => Response.json({ choices: [{ message: { content: "{}" } }] })) as typeof fetch,
      },
    )).rejects.toThrow();
  });
});