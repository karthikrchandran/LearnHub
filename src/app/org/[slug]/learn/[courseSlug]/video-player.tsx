"use client";

import { useEffect, useMemo, useState } from "react";

type VideoRuntimeChapter = {
  id: string;
  title: string;
  startSecond: number;
  endSecond: number | null;
  sortOrder: number;
};

type VideoRuntimeTranscriptCue = {
  id: string;
  startSecond: number;
  endSecond: number | null;
  text: string;
};

type VideoRuntimeLessonProgress = {
  lessonId: string;
  lastPositionSecond: number;
  maxWatchedSecond: number;
  completed: boolean;
  lastWatchedAt: string | null;
};

type VideoRuntimeLesson = {
  id: string;
  title: string;
  slug: string;
  durationSeconds: number;
  required: boolean;
  playbackUrl: string | null;
  providerAssetId: string | null;
  chapters: VideoRuntimeChapter[];
  transcriptCues: VideoRuntimeTranscriptCue[];
  progress: VideoRuntimeLessonProgress;
};

type VideoRuntimeLaunch = {
  courseTitle: string;
  lessons: VideoRuntimeLesson[];
  currentLesson: VideoRuntimeLesson;
  courseProgressPercent: number;
};

type VideoProgressResponse = {
  courseProgressPercent: number;
  completed: boolean;
};

type VideoPlayerProps = {
  launchPath: string;
  progressPath: string;
  initialProgressPercent: number;
  initialLessonId?: string;
};

export function VideoPlayer({ launchPath, progressPath, initialProgressPercent, initialLessonId }: VideoPlayerProps) {
  const [runtime, setRuntime] = useState<VideoRuntimeLaunch | null>(null);
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(null);
  const [positionSecond, setPositionSecond] = useState(0);
  const [watchedSecond, setWatchedSecond] = useState(0);
  const [progressPercent, setProgressPercent] = useState(initialProgressPercent);
  const [statusMessage, setStatusMessage] = useState("Loading player...");

  useEffect(() => {
    let active = true;

    async function launch() {
      try {
        const response = await fetch(launchPath);

        if (!response.ok) {
          throw new Error("Video launch failed");
        }

        const nextRuntime = (await response.json()) as VideoRuntimeLaunch;

        if (!active) {
          return;
        }

        const initialLesson = initialLessonId
          ? nextRuntime.lessons.find((lesson) => lesson.id === initialLessonId)
          : null;
        const nextLesson = initialLesson ?? nextRuntime.currentLesson;

        setRuntime(nextRuntime);
        setSelectedLessonId(nextLesson.id);
        setPositionSecond(nextLesson.progress.lastPositionSecond);
        setWatchedSecond(nextLesson.progress.maxWatchedSecond);
        setProgressPercent(nextRuntime.courseProgressPercent);
        setStatusMessage("Player ready");
      } catch (error) {
        if (active) {
          setStatusMessage(error instanceof Error ? error.message : "Video launch failed");
        }
      }
    }

    void launch();

    return () => {
      active = false;
    };
  }, [initialLessonId, launchPath]);

  const currentLesson = useMemo(() => {
    if (!runtime) {
      return null;
    }

    return runtime.lessons.find((lesson) => lesson.id === selectedLessonId) ?? runtime.currentLesson;
  }, [runtime, selectedLessonId]);

  function selectLesson(lesson: VideoRuntimeLesson) {
    setSelectedLessonId(lesson.id);
    setPositionSecond(lesson.progress.lastPositionSecond);
    setWatchedSecond(lesson.progress.maxWatchedSecond);
  }

  async function saveProgress() {
    if (!currentLesson) {
      return;
    }

    try {
      const response = await fetch(progressPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lessonId: currentLesson.id,
          positionSecond,
          watchedSecond,
        }),
      });

      if (!response.ok) {
        throw new Error("Progress save failed");
      }

      const result = (await response.json()) as VideoProgressResponse;
      setProgressPercent(result.courseProgressPercent);
      setStatusMessage(result.completed ? "Course complete" : "Progress saved");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Progress save failed");
    }
  }

  function updateVideoPosition(nextPositionSecond: number) {
    const normalizedPosition = Math.max(0, Math.floor(nextPositionSecond));

    setPositionSecond(normalizedPosition);
    setWatchedSecond((current) => Math.max(current, normalizedPosition));
  }

  if (!runtime || !currentLesson) {
    return (
      <section className="lh-runtime-panel">
        <p className="lh-runtime-muted">{statusMessage}</p>
      </section>
    );
  }

  const playbackUrl = playablePlaybackUrl(currentLesson.playbackUrl);

  return (
    <section className="lh-runtime-player">
      <div className="flex flex-col gap-4">
        <header>
          <p className="lh-runtime-label">Learning runtime</p>
          <h2 className="lh-runtime-heading">{runtime.courseTitle}</h2>
          <p className="lh-runtime-muted">
            {progressPercent}% complete / {statusMessage}
          </p>
        </header>

        {playbackUrl ? (
          <video
            controls
            className="lh-runtime-video"
            src={playbackUrl}
            onTimeUpdate={(event) => updateVideoPosition(event.currentTarget.currentTime)}
            onLoadedMetadata={(event) => {
              event.currentTarget.currentTime = currentLesson.progress.lastPositionSecond;
            }}
          />
        ) : (
          <div className="lh-runtime-missing-media">
            Media source is not available for this lesson.
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void saveProgress()}
            className="lh-runtime-action"
          >
            Save progress
          </button>
          <span className="lh-runtime-stat">
            {positionSecond}s position / {watchedSecond}s watched
          </span>
        </div>

        <section className="lh-runtime-panel">
          <h3 className="lh-runtime-subheading">Lessons</h3>
          <div className="mt-3 grid gap-2">
            {runtime.lessons.map((lesson) => (
              <button
                key={lesson.id}
                type="button"
                onClick={() => selectLesson(lesson)}
                className="lh-runtime-list-button"
              >
                {lesson.title}
              </button>
            ))}
          </div>
        </section>
      </div>

      <aside className="flex flex-col gap-4">
        <section className="lh-runtime-panel">
          <h3 className="lh-runtime-subheading">Chapters</h3>
          <div className="mt-4 flex flex-col gap-2">
            {currentLesson.chapters.length === 0 ? (
              <p className="lh-runtime-muted">No chapters recorded.</p>
            ) : (
              currentLesson.chapters.map((chapter) => (
                <button
                  key={chapter.id}
                  type="button"
                  onClick={() => updateVideoPosition(chapter.startSecond)}
                  className="lh-runtime-list-button"
                >
                  {chapter.title}
                </button>
              ))
            )}
          </div>
        </section>

        <section className="lh-runtime-panel">
          <h3 className="lh-runtime-subheading">Transcript</h3>
          <div className="mt-4 space-y-3">
            {currentLesson.transcriptCues.length === 0 ? (
              <p className="lh-runtime-muted">No transcript cues recorded.</p>
            ) : (
              currentLesson.transcriptCues.map((cue) => (
                <button
                  key={cue.id}
                  type="button"
                  onClick={() => updateVideoPosition(cue.startSecond)}
                  className="lh-runtime-transcript-button"
                >
                  {formatSeconds(cue.startSecond)} {cue.text}
                </button>
              ))
            )}
          </div>
        </section>
      </aside>
    </section>
  );
}

function playablePlaybackUrl(value: string | null): string | null {
  if (!value) {
    return null;
  }

  if (value.startsWith("/")) {
    return value;
  }

  try {
    const url = new URL(value);

    if (url.hostname === "video.learnhub.local") {
      return null;
    }

    return value;
  } catch {
    return null;
  }
}

function formatSeconds(value: number): string {
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
