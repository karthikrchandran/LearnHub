import { z } from "zod";

const videoLessonDraftSchema = z.object({
  title: z.string().trim().min(1).max(160),
  durationMinutes: z.number().int().min(1).max(20),
  learningObjectives: z.array(z.string().trim().min(1).max(240)).min(1).max(6),
  narrationScript: z.string().trim().min(1).max(20_000),
  videoGenerationPrompt: z.string().trim().min(1).max(8_000),
  scenes: z.array(z.object({
    durationSeconds: z.number().int().min(1).max(300),
    visualDescription: z.string().trim().min(1).max(800),
    narration: z.string().trim().min(1).max(1_000),
  })).min(1).max(12),
});

export type AiVideoLessonDraft = z.infer<typeof videoLessonDraftSchema>;

export type GenerateAiVideoLessonDraftInput = {
  brief: string;
  audience: string;
  tone: string;
  durationMinutes: number;
};

type ChatCompletionResponse = {
  choices?: Array<{ message?: { content?: string | null } }>;
};

export async function generateAiVideoLessonDraft(
  input: GenerateAiVideoLessonDraftInput,
  options: { apiKey: string; model: string; fetcher?: typeof fetch },
): Promise<AiVideoLessonDraft> {
  const brief = input.brief.trim();
  const audience = input.audience.trim();

  if (!brief || brief.length > 2_000) {
    throw new Error("Describe what learners should learn (up to 2,000 characters).");
  }

  if (!audience || audience.length > 240) {
    throw new Error("Provide a target audience (up to 240 characters).");
  }

  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 1 || input.durationMinutes > 20) {
    throw new Error("Video duration must be between 1 and 20 minutes.");
  }

  const response = await (options.fetcher ?? fetch)("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${options.apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: [
            "Create an original, practical microlearning video production package.",
            "Return only JSON with keys: title, durationMinutes, learningObjectives, narrationScript, videoGenerationPrompt, scenes.",
            "Each scene must contain durationSeconds, visualDescription, narration. Scene durations should approximately match the requested duration.",
            "Make the videoGenerationPrompt usable with a text-to-video model and describe original visuals; do not request copyrighted characters, brands, or imitation of a living artist.",
            "Keep narration accurate, accessible, and appropriate for the audience and requested tone.",
          ].join(" "),
        },
        {
          role: "user",
          content: JSON.stringify({
            learningBrief: brief,
            audience,
            tone: input.tone.slice(0, 120),
            targetDurationMinutes: input.durationMinutes,
          }),
        },
      ],
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    throw new Error(`AI video draft request failed (${response.status}).`);
  }

  const body = await response.json() as ChatCompletionResponse;
  const content = body.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("The AI provider returned an empty lesson draft.");
  }

  let generated: unknown;

  try {
    generated = JSON.parse(content);
  } catch {
    throw new Error("The AI provider returned an invalid lesson draft.");
  }

  return videoLessonDraftSchema.parse(generated);
}