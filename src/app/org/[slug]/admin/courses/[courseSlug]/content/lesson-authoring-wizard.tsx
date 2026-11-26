"use client";

import { useState, type FormEvent } from "react";

type LessonModule = { id: string; title: string };
type GeneratedDraft = {
  title: string;
  durationMinutes: number;
  learningObjectives: string[];
  narrationScript: string;
  videoGenerationPrompt: string;
  scenes: Array<{ durationSeconds: number; visualDescription: string; narration: string }>;
};
type ActionResult = { status: "success" | "error"; message: string };
type LessonAuthoringWizardProps = {
  action: (formData: FormData) => Promise<ActionResult>;
  aiDraftUrl: string;
  aiConfigured: boolean;
  modules: LessonModule[];
  nextSortOrder: number;
};

export function LessonAuthoringWizard({
  action,
  aiDraftUrl,
  aiConfigured,
  modules,
  nextSortOrder,
}: LessonAuthoringWizardProps) {
  const [title, setTitle] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(5);
  const [aiDurationMinutes, setAiDurationMinutes] = useState(5);
  const [brief, setBrief] = useState("");
  const [audience, setAudience] = useState("New employees");
  const [tone, setTone] = useState("Clear and engaging");
  const [draft, setDraft] = useState<GeneratedDraft | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  async function generateDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");

    try {
      const response = await fetch(aiDraftUrl, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ brief, audience, tone, durationMinutes: aiDurationMinutes }),
      });
      const body = await response.json() as GeneratedDraft | { error?: string };

      if (!response.ok) {
        const errorMessage = "error" in body && body.error ? body.error : "AI could not create this lesson package.";
        throw new Error(errorMessage);
      }

      const generated = body as GeneratedDraft;
      setDraft(generated);
      setTitle(generated.title);
      setDurationMinutes(generated.durationMinutes);
      setAiDurationMinutes(generated.durationMinutes);
      setMessage("Draft ready. Review it, then save the lesson before uploading your finished video.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "AI could not create this lesson package.");
    } finally {
      setBusy(false);
    }
  }

  async function saveLesson(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    const formData = new FormData(event.currentTarget);
    formData.set("title", title);
    formData.set("durationMinutes", String(durationMinutes));
    formData.set("sortOrder", String(nextSortOrder));
    formData.set("authoringPrompt", brief);
    formData.set("narrationScript", draft?.narrationScript ?? "");
    formData.set("videoGenerationPrompt", draft?.videoGenerationPrompt ?? "");

    try {
      const result = await action(formData);
      setMessage(result.message);

      if (result.status === "success") {
        window.location.reload();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not save the lesson draft.");
    } finally {
      setBusy(false);
    }
  }

  async function copyText(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setMessage("Copied to clipboard.");
    } catch {
      setMessage("Clipboard access was blocked. Select and copy the text instead.");
    }
  }

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <form onSubmit={saveLesson} className="grid content-start gap-4 rounded-md border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs font-bold uppercase text-teal-700">Step 1 · Lesson setup</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Create a lesson draft</h2>
          <p className="mt-1 text-sm text-slate-600">Add the lesson first. Upload its video after you generate or record it.</p>
        </div>
        <label className="grid gap-1 text-sm font-medium text-slate-700">
          Lesson title
          <input required maxLength={160} value={title} onChange={(event) => setTitle(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2" placeholder="e.g. Recognize a phishing attempt" />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Module
            <select name="moduleId" className="rounded-md border border-slate-300 px-3 py-2">
              <option value="">Unsectioned</option>
              {modules.map((module) => <option key={module.id} value={module.id}>{module.title}</option>)}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            Target length (minutes)
            <input type="number" min={1} max={600} required value={durationMinutes} onChange={(event) => setDurationMinutes(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2" />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input name="required" type="checkbox" defaultChecked className="h-4 w-4 rounded border-slate-300" />
          Learners must complete this lesson
        </label>
        <button type="submit" disabled={busy || !title.trim()} className="min-h-11 rounded-md bg-slate-950 px-4 py-2 text-sm font-bold text-white disabled:cursor-not-allowed disabled:bg-slate-400">
          {busy ? "Saving…" : draft ? "Save lesson and AI package" : "Save lesson draft"}
        </button>
        {message ? <p role="status" className="text-sm text-slate-700">{message}</p> : null}
      </form>

      <div className="grid content-start gap-4 rounded-md border border-slate-200 bg-white p-5">
        <div>
          <p className="text-xs font-bold uppercase text-teal-700">Step 2 · AI video studio</p>
          <h2 className="mt-1 text-xl font-bold text-slate-950">Turn a learning goal into a video package</h2>
          <p className="mt-1 text-sm text-slate-600">AI drafts the narration, objectives, scenes, and a prompt for your text-to-video tool. Render the clip there, then upload it to Mux below.</p>
        </div>
        {!aiConfigured ? (
          <p className="rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">AI authoring is not configured yet. Add <code>OPENAI_API_KEY</code> to the server environment to enable generation.</p>
        ) : null}
        <form onSubmit={generateDraft} className="grid gap-3">
          <label className="grid gap-1 text-sm font-medium text-slate-700">
            What should learners understand or do?
            <textarea required maxLength={2_000} value={brief} onChange={(event) => setBrief(event.target.value)} className="min-h-24 rounded-md border border-slate-300 px-3 py-2" placeholder="Describe the skill, process, or behavior this lesson should teach." />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Audience
              <input required maxLength={240} value={audience} onChange={(event) => setAudience(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700">
              Tone
              <select value={tone} onChange={(event) => setTone(event.target.value)} className="rounded-md border border-slate-300 px-3 py-2">
                <option>Clear and engaging</option><option>Warm and reassuring</option><option>Direct and concise</option><option>Scenario-based</option>
              </select>
            </label>
            <label className="grid gap-1 text-sm font-medium text-slate-700 sm:col-span-2">
              Target AI video length (minutes)
              <input type="number" min={1} max={20} required value={aiDurationMinutes} onChange={(event) => setAiDurationMinutes(Number(event.target.value))} className="rounded-md border border-slate-300 px-3 py-2" />
            </label>
          </div>
          <button type="submit" disabled={!aiConfigured || busy || !brief.trim()} className="min-h-11 rounded-md border border-teal-700 px-4 py-2 text-sm font-bold text-teal-800 disabled:cursor-not-allowed disabled:border-slate-300 disabled:text-slate-400">
            {busy ? "Preparing lesson package…" : "Generate with AI"}
          </button>
        </form>
        {draft ? (
          <div className="grid gap-3 border-t border-slate-200 pt-4">
            <div>
              <h3 className="font-bold text-slate-950">{draft.title}</h3>
              <p className="text-sm text-slate-600">{draft.durationMinutes} min · {draft.scenes.length} scenes</p>
            </div>
            <div>
              <h4 className="text-sm font-bold text-slate-800">Learning objectives</h4>
              <ul className="mt-1 list-inside list-disc text-sm text-slate-700">
                {draft.learningObjectives.map((objective) => <li key={objective}>{objective}</li>)}
              </ul>
            </div>
            <details className="rounded-md bg-slate-50 p-3">
              <summary className="cursor-pointer text-sm font-bold text-slate-800">Narration script and scene outline</summary>
              <pre className="mt-3 whitespace-pre-wrap font-sans text-sm text-slate-700">{draft.narrationScript}</pre>
              <ol className="mt-3 grid gap-2 text-sm text-slate-700">
                {draft.scenes.map((scene, index) => <li key={`${index}-${scene.durationSeconds}`}><strong>Scene {index + 1} · {scene.durationSeconds}s:</strong> {scene.visualDescription}<br />{scene.narration}</li>)}
              </ol>
            </details>
            <div className="rounded-md border border-slate-200 p-3">
              <div className="flex items-start justify-between gap-2">
                <h4 className="text-sm font-bold text-slate-800">Text-to-video prompt</h4>
                <button type="button" onClick={() => void copyText(draft.videoGenerationPrompt)} className="shrink-0 text-sm font-bold text-teal-800">Copy prompt</button>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{draft.videoGenerationPrompt}</p>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
