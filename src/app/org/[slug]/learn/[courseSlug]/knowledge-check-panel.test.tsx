import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { KnowledgeCheckPanel } from "./knowledge-check-panel";

function render(ui: ReactNode) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(ui);
  });

  return { container, root };
}

function cleanup(root: Root, container: HTMLElement) {
  act(() => {
    root.unmount();
  });
  container.remove();
}

function getInputByLabel(container: HTMLElement, text: string): HTMLInputElement {
  const label = [...container.querySelectorAll("label")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  const input = label?.querySelector("input");

  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input labelled ${text} was not found`);
  }

  return input;
}

function getTextareaByLabel(container: HTMLElement, text: string): HTMLTextAreaElement {
  const label = [...container.querySelectorAll("label")].find((candidate) =>
    candidate.textContent?.includes(text),
  );
  const textarea = label?.querySelector("textarea");

  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Textarea labelled ${text} was not found`);
  }

  return textarea;
}

function getButton(container: HTMLElement, text: string): HTMLButtonElement {
  const button = [...container.querySelectorAll("button")].find((candidate) =>
    candidate.textContent?.includes(text),
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button ${text} was not found`);
  }

  return button;
}

async function click(element: HTMLElement) {
  await act(async () => {
    element.click();
  });
}

async function change(element: HTMLTextAreaElement, value: string) {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    valueSetter?.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
    element.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function waitFor(assertion: () => void) {
  let lastError: unknown;

  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  throw lastError;
}

describe("KnowledgeCheckPanel", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = "";
  });

  it("submits selected answers and renders returned feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        correct: true,
        scorePercent: 100,
        attemptNumber: 1,
        selectedAnswerFeedback: ["Correct."],
        explanation: "Open questions reveal blockers.",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = render(
      <KnowledgeCheckPanel
        slug="acme"
        assignmentId="assignment_1"
        checks={[
          {
            id: "check_1",
            prompt: "Which response is best?",
            questionType: "SINGLE_CHOICE",
            answers: [
              { id: "answer_1", text: "What happened?" },
              { id: "answer_2", text: "Why did you fail?" },
            ],
          },
        ]}
        feedbackEndpoint="/api/org/acme/assignments/assignment_1/feedback"
      />,
    );

    await click(getInputByLabel(container, "What happened?"));
    await click(getButton(container, "Submit answer"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/org/acme/assignments/assignment_1/checks/check_1/submit",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ selectedAnswerIds: ["answer_1"] }),
        }),
      ),
    );
    await waitFor(() => expect(container.textContent).toContain("Score: 100%"));
    expect(container.textContent).toContain("Correct.");
    expect(container.textContent).toContain("Open questions reveal blockers.");
    cleanup(root, container);
  });

  it("submits one-to-five star course feedback", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = render(
      <KnowledgeCheckPanel
        slug="acme"
        assignmentId="assignment_1"
        checks={[]}
        feedbackEndpoint="/api/org/acme/assignments/assignment_1/feedback"
      />,
    );

    await click(getInputByLabel(container, "5 stars"));
    await change(getTextareaByLabel(container, "Optional feedback"), "  Helpful.  ");
    await click(getButton(container, "Submit rating"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/org/acme/assignments/assignment_1/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ stars: 5, text: "Helpful." }),
        }),
      ),
    );
    cleanup(root, container);
  });

  it("sends blank rating text as null", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = render(
      <KnowledgeCheckPanel
        slug="acme"
        assignmentId="assignment_1"
        checks={[]}
        feedbackEndpoint="/api/org/acme/assignments/assignment_1/feedback"
      />,
    );

    await click(getInputByLabel(container, "4 stars"));
    await click(getButton(container, "Submit rating"));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/org/acme/assignments/assignment_1/feedback",
        expect.objectContaining({
          method: "POST",
          body: JSON.stringify({ stars: 4, text: null }),
        }),
      ),
    );
    cleanup(root, container);
  });
});
