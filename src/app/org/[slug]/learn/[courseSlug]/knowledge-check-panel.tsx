"use client";

import { useState, type FormEvent } from "react";

type LearnerCheck = {
  id: string;
  prompt: string;
  questionType: "SINGLE_CHOICE" | "MULTIPLE_CHOICE" | "TRUE_FALSE";
  answers: Array<{ id: string; text: string }>;
};

type SubmitResult = {
  correct: boolean;
  scorePercent: number;
  attemptNumber: number;
  selectedAnswerFeedback: string[];
  explanation: string | null;
};

export function KnowledgeCheckPanel({
  slug,
  assignmentId,
  checks,
  feedbackEndpoint,
}: {
  slug: string;
  assignmentId: string;
  checks: LearnerCheck[];
  feedbackEndpoint: string;
}) {
  const [selectedByCheck, setSelectedByCheck] = useState<Record<string, string[]>>({});
  const [resultByCheck, setResultByCheck] = useState<Record<string, SubmitResult>>({});
  const [stars, setStars] = useState<number | null>(null);
  const [feedbackText, setFeedbackText] = useState("");
  const [ratingSaved, setRatingSaved] = useState(false);

  async function submitAnswer(check: LearnerCheck) {
    const selectedAnswerIds = selectedByCheck[check.id] ?? [];
    const response = await fetch(`/api/org/${encodeURIComponent(slug)}/assignments/${encodeURIComponent(assignmentId)}/checks/${encodeURIComponent(check.id)}/submit`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ selectedAnswerIds }),
    });

    if (!response.ok) {
      throw new Error("Knowledge check could not be submitted");
    }

    const result = (await response.json()) as SubmitResult;
    setResultByCheck((current) => ({ ...current, [check.id]: result }));
  }

  async function submitRating(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!stars) {
      return;
    }

    const response = await fetch(feedbackEndpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ stars, text: feedbackText.trim() || null }),
    });

    if (!response.ok) {
      throw new Error("Course rating could not be submitted");
    }

    setRatingSaved(true);
  }

  function toggleAnswer(check: LearnerCheck, answerId: string) {
    setSelectedByCheck((current) => {
      const existing = current[check.id] ?? [];

      if (check.questionType === "MULTIPLE_CHOICE") {
        return {
          ...current,
          [check.id]: existing.includes(answerId)
            ? existing.filter((candidate) => candidate !== answerId)
            : [...existing, answerId],
        };
      }

      return { ...current, [check.id]: [answerId] };
    });
  }

  return (
    <section className="rounded-md border border-slate-200 p-4">
      <h2 className="text-lg font-semibold text-slate-950">Knowledge checks</h2>
      <div className="mt-4 space-y-4">
        {checks.map((check) => {
          const selected = selectedByCheck[check.id] ?? [];
          const result = resultByCheck[check.id];
          const inputType = check.questionType === "MULTIPLE_CHOICE" ? "checkbox" : "radio";

          return (
            <form
              key={check.id}
              className="space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                void submitAnswer(check);
              }}
            >
              <p className="text-sm font-medium text-slate-900">{check.prompt}</p>
              {check.answers.map((answer) => (
                <label key={answer.id} className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type={inputType}
                    name={`check-${check.id}`}
                    checked={selected.includes(answer.id)}
                    onChange={() => toggleAnswer(check, answer.id)}
                  />
                  {answer.text}
                </label>
              ))}
              <button type="submit" className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
                Submit answer
              </button>
              {result ? (
                <div className="rounded-md bg-slate-50 p-3 text-sm text-slate-700">
                  <p>{result.correct ? "Correct" : "Review needed"}</p>
                  <p>Score: {result.scorePercent}%</p>
                  {result.selectedAnswerFeedback.map((feedback) => <p key={feedback}>{feedback}</p>)}
                  {result.explanation ? <p>{result.explanation}</p> : null}
                </div>
              ) : null}
            </form>
          );
        })}
      </div>

      <form className="mt-6 space-y-3 border-t border-slate-200 pt-4" onSubmit={submitRating}>
        <h3 className="text-base font-semibold text-slate-950">Course rating</h3>
        <div className="flex flex-wrap gap-3">
          {[1, 2, 3, 4, 5].map((value) => (
            <label key={value} className="text-sm text-slate-700">
              <input type="radio" name="stars" checked={stars === value} onChange={() => setStars(value)} />
              {value} stars
            </label>
          ))}
        </div>
        <label className="block text-sm text-slate-700">
          Optional feedback
          <textarea
            value={feedbackText}
            onChange={(event) => setFeedbackText(event.target.value)}
            className="mt-1 block w-full rounded-md border border-slate-200 p-2"
          />
        </label>
        <button type="submit" className="rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700">
          Submit rating
        </button>
        {ratingSaved ? <p className="text-sm text-slate-600">Rating saved</p> : null}
      </form>
    </section>
  );
}
