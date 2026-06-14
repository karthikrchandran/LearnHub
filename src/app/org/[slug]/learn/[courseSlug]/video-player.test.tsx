import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VideoPlayer } from "./video-player";

function launchPayload() {
  const lesson = {
    id: "lesson_1",
    moduleId: null,
    title: "Lesson One",
    slug: "lesson-one",
    sortOrder: 0,
    durationSeconds: 120,
    required: true,
    playbackUrl: "https://cdn.example/video.mp4",
    providerAssetId: null,
    chapters: [{ id: "chapter_1", title: "Intro", startSecond: 0, endSecond: 60, sortOrder: 0 }],
    transcriptCues: [{ id: "cue_1", startSecond: 0, endSecond: 5, text: "Welcome" }],
    progress: {
      lessonId: "lesson_1",
      lastPositionSecond: 10,
      maxWatchedSecond: 20,
      completed: false,
      lastWatchedAt: null,
    },
  };

  return {
    assignmentId: "assignment_1",
    courseId: "course_1",
    courseTitle: "Course One",
    modules: [],
    lessons: [lesson],
    currentLesson: lesson,
    courseProgressPercent: 25,
  };
}

function multiLessonLaunchPayload() {
  const lessonOne = {
    id: "lesson_1",
    moduleId: null,
    title: "Lesson One",
    slug: "lesson-one",
    sortOrder: 0,
    durationSeconds: 120,
    required: true,
    playbackUrl: "https://cdn.example/lesson-one.mp4",
    providerAssetId: null,
    chapters: [{ id: "chapter_1", title: "Intro", startSecond: 0, endSecond: 60, sortOrder: 0 }],
    transcriptCues: [{ id: "cue_1", startSecond: 0, endSecond: 5, text: "Welcome" }],
    progress: {
      lessonId: "lesson_1",
      lastPositionSecond: 10,
      maxWatchedSecond: 20,
      completed: false,
      lastWatchedAt: null,
    },
  };
  const lessonTwo = {
    id: "lesson_2",
    moduleId: null,
    title: "Lesson Two",
    slug: "lesson-two",
    sortOrder: 1,
    durationSeconds: 180,
    required: true,
    playbackUrl: "https://cdn.example/lesson-two.mp4",
    providerAssetId: null,
    chapters: [{ id: "chapter_2", title: "Deep Dive", startSecond: 30, endSecond: 90, sortOrder: 0 }],
    transcriptCues: [{ id: "cue_2", startSecond: 30, endSecond: 35, text: "Continue" }],
    progress: {
      lessonId: "lesson_2",
      lastPositionSecond: 45,
      maxWatchedSecond: 75,
      completed: false,
      lastWatchedAt: null,
    },
  };

  return {
    assignmentId: "assignment_1",
    courseId: "course_1",
    courseTitle: "Course One",
    modules: [],
    lessons: [lessonOne, lessonTwo],
    currentLesson: lessonOne,
    courseProgressPercent: 25,
  };
}

async function render(component: React.ReactElement): Promise<{ container: HTMLDivElement; root: Root }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(component);
  });
  await act(async () => {
    await Promise.resolve();
  });

  return { container, root };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("VideoPlayer", () => {
  it("renders launch data and posts progress through the runtime endpoint", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/launch") {
        return Response.json(launchPayload());
      }

      expect(url).toBe("/progress");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        lessonId: "lesson_1",
        positionSecond: 10,
        watchedSecond: 20,
      });

      return Response.json({ courseProgressPercent: 50, completed: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = await render(
      <VideoPlayer launchPath="/launch" progressPath="/progress" initialProgressPercent={0} />,
    );

    expect(container.textContent).toContain("Course One");
    expect(container.textContent).toContain("Lesson One");
    expect(container.textContent).toContain("Intro");
    expect(container.textContent).toContain("Welcome");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save progress",
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith("/progress", expect.objectContaining({ method: "POST" }));

    await act(async () => {
      root.unmount();
    });
  });

  it("selects the initial lesson from launch data and posts progress for that lesson", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url === "/launch") {
        return Response.json(multiLessonLaunchPayload());
      }

      expect(url).toBe("/progress");
      expect(init?.method).toBe("POST");
      expect(JSON.parse(String(init?.body))).toMatchObject({
        lessonId: "lesson_2",
        positionSecond: 45,
        watchedSecond: 75,
      });

      return Response.json({ courseProgressPercent: 50, completed: false });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = await render(
      <VideoPlayer
        launchPath="/launch"
        progressPath="/progress"
        initialProgressPercent={0}
        initialLessonId="lesson_2"
      />,
    );

    expect(container.textContent).toContain("Lesson Two");
    expect(container.textContent).toContain("Deep Dive");
    expect(container.textContent).toContain("Continue");
    expect(container.textContent).toContain("45s position / 75s watched");

    const saveButton = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent === "Save progress",
    );
    expect(saveButton).toBeTruthy();

    await act(async () => {
      saveButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(fetchMock).toHaveBeenCalledWith("/progress", expect.objectContaining({ method: "POST" }));

    await act(async () => {
      root.unmount();
    });
  });

  it("shows the missing media fallback for seeded placeholder video URLs", async () => {
    const payload = launchPayload();
    payload.currentLesson.playbackUrl = "https://video.learnhub.local/demo/lesson.mp4";
    payload.lessons[0].playbackUrl = payload.currentLesson.playbackUrl;

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/launch");
      return Response.json(payload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = await render(
      <VideoPlayer launchPath="/launch" progressPath="/progress" initialProgressPercent={0} />,
    );

    expect(container.textContent).toContain("Media source is not available for this lesson.");
    expect(container.querySelector("video")).toBeNull();

    await act(async () => {
      root.unmount();
    });
  });

  it("renders LearnHub demo media URLs as a playable video source", async () => {
    const payload = launchPayload();
    payload.currentLesson.playbackUrl = "/api/demo/video/lesson-one";
    payload.lessons[0].playbackUrl = payload.currentLesson.playbackUrl;

    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/launch");
      return Response.json(payload);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = await render(
      <VideoPlayer launchPath="/launch" progressPath="/progress" initialProgressPercent={0} />,
    );

    const video = container.querySelector("video");

    expect(container.textContent).not.toContain("Media source is not available for this lesson.");
    expect(video).not.toBeNull();
    expect(video?.getAttribute("src")).toBe("/api/demo/video/lesson-one");

    await act(async () => {
      root.unmount();
    });
  });

  it("uses dark runtime classes so text stays readable on the lesson media surface", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      expect(url).toBe("/launch");
      return Response.json(launchPayload());
    });
    vi.stubGlobal("fetch", fetchMock);

    const { container, root } = await render(
      <VideoPlayer launchPath="/launch" progressPath="/progress" initialProgressPercent={0} />,
    );

    expect(container.querySelector(".lh-runtime-player")).not.toBeNull();
    expect(container.querySelector(".lh-runtime-heading")).not.toBeNull();
    expect(container.querySelector(".lh-runtime-panel")).not.toBeNull();
    expect(container.querySelector(".lh-runtime-muted")).not.toBeNull();
    expect(container.innerHTML).not.toContain("text-slate-950");
    expect(container.innerHTML).not.toContain("text-slate-700");

    await act(async () => {
      root.unmount();
    });
  });
});
