"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type ScormApi = {
  LMSInitialize(value: string): string;
  LMSFinish(value: string): string;
  LMSGetValue(key: string): string;
  LMSSetValue(key: string, value: string): string;
  LMSCommit(value: string): string;
  LMSGetLastError(): string;
  LMSGetErrorString(code: string): string;
  LMSGetDiagnostic(code: string): string;
};

declare global {
  interface Window {
    API?: ScormApi;
  }
}

type ScormLaunch = {
  assignmentId: string;
  packageId: string;
  launchUrl: string;
  cmiData: Record<string, unknown>;
  launchCount: number;
};

type ScormCommitResult = {
  progressPercent: number;
  completed: boolean;
  registration: {
    cmiData: Record<string, unknown>;
    lessonStatus: string;
    scoreRaw: number | null;
    launchCount: number;
  };
};

type ScormPlayerProps = {
  launchPath: string;
  commitPath: string;
  initialProgressPercent: number;
  initialScore: number | null;
};

const allowedCmiKeys = new Set([
  "cmi.core.lesson_status",
  "cmi.core.score.raw",
  "cmi.core.session_time",
  "cmi.core.exit",
  "cmi.core.lesson_location",
  "cmi.suspend_data",
  "cmi.comments",
]);

export function ScormPlayer({ launchPath, commitPath, initialProgressPercent, initialScore }: ScormPlayerProps) {
  const [launch, setLaunch] = useState<ScormLaunch | null>(null);
  const [progressPercent, setProgressPercent] = useState(initialProgressPercent);
  const [scoreRaw, setScoreRaw] = useState<number | null>(initialScore);
  const [lessonStatus, setLessonStatus] = useState("not attempted");
  const [statusMessage, setStatusMessage] = useState("Loading SCORM package...");
  const [lastErrorCode, setLastErrorCode] = useState("0");
  const cmiDataRef = useRef<Record<string, string>>({});
  const initializedRef = useRef(false);
  const lastErrorCodeRef = useRef("0");
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const setScormError = useCallback((code: string) => {
    lastErrorCodeRef.current = code;
    setLastErrorCode(code);
  }, []);

  const commitSession = useCallback(async () => {
    try {
      const response = await fetch(commitPath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cmiDataRef.current),
      });

      if (!response.ok) {
        throw new Error("SCORM commit failed");
      }

      const result = (await response.json()) as ScormCommitResult;
      const committedCmiData = stringsOnly(result.registration.cmiData);

      cmiDataRef.current = committedCmiData;
      setProgressPercent(result.progressPercent);
      setLessonStatus(result.registration.lessonStatus);
      setScoreRaw(result.registration.scoreRaw);
      setStatusMessage(result.completed ? "Course complete" : "SCORM data committed");
      setScormError("0");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "SCORM commit failed");
      setScormError("101");
    }
  }, [commitPath, setScormError]);

  useEffect(() => {
    let active = true;

    async function launchPackage() {
      try {
        const response = await fetch(launchPath);

        if (!response.ok) {
          throw new Error("SCORM launch failed");
        }

        const nextLaunch = (await response.json()) as ScormLaunch;
        const nextCmiData = stringsOnly(nextLaunch.cmiData);

        if (!active) {
          return;
        }

        cmiDataRef.current = nextCmiData;
        setLaunch({
          ...nextLaunch,
          launchUrl: scormBridgeLaunchUrl(nextLaunch.launchUrl, nextCmiData),
        });
        setLessonStatus(nextCmiData["cmi.core.lesson_status"] ?? "not attempted");
        setScoreRaw(readScore(nextCmiData["cmi.core.score.raw"]) ?? initialScore);
        setStatusMessage("SCORM package ready");
        setScormError("0");
      } catch (error) {
        if (active) {
          setStatusMessage(error instanceof Error ? error.message : "SCORM launch failed");
          setScormError("101");
        }
      }
    }

    void launchPackage();

    return () => {
      active = false;
    };
  }, [initialScore, launchPath, setScormError]);

  useEffect(() => {
    if (!launch) {
      return;
    }

    window.API = {
      LMSInitialize() {
        initializedRef.current = true;
        setScormError("0");

        return "true";
      },
      LMSFinish() {
        if (!initializedRef.current) {
          setScormError("301");

          return "false";
        }

        void commitSession();
        initializedRef.current = false;
        setScormError("0");

        return "true";
      },
      LMSGetValue(key) {
        if (!allowedCmiKeys.has(key)) {
          setScormError("401");

          return "";
        }

        setScormError("0");

        return cmiDataRef.current[key] ?? "";
      },
      LMSSetValue(key, value) {
        if (!initializedRef.current) {
          setScormError("301");

          return "false";
        }

        if (!allowedCmiKeys.has(key)) {
          setScormError("401");

          return "false";
        }

        cmiDataRef.current = {
          ...cmiDataRef.current,
          [key]: value,
        };

        if (key === "cmi.core.lesson_status") {
          setLessonStatus(value);
        }

        if (key === "cmi.core.score.raw") {
          setScoreRaw(readScore(value));
        }

        setScormError("0");

        return "true";
      },
      LMSCommit() {
        if (!initializedRef.current) {
          setScormError("301");

          return "false";
        }

        void commitSession();
        setScormError("0");

        return "true";
      },
      LMSGetLastError() {
        return lastErrorCodeRef.current;
      },
      LMSGetErrorString(code) {
        return scormErrorText(code);
      },
      LMSGetDiagnostic(code) {
        return scormErrorText(code || lastErrorCodeRef.current);
      },
    };

    return () => {
      delete window.API;
    };
  }, [commitSession, launch, setScormError]);

  useEffect(() => {
    if (!launch) {
      return;
    }

    function receiveScormBridgeMessage(event: MessageEvent) {
      if (event.source !== iframeRef.current?.contentWindow || !isScormCmiMessage(event.data)) {
        return;
      }

      const nextCmiData = stringsOnly(event.data.cmiData);

      cmiDataRef.current = {
        ...cmiDataRef.current,
        ...nextCmiData,
      };

      if (nextCmiData["cmi.core.lesson_status"]) {
        setLessonStatus(nextCmiData["cmi.core.lesson_status"]);
      }

      if (nextCmiData["cmi.core.score.raw"]) {
        setScoreRaw(readScore(nextCmiData["cmi.core.score.raw"]));
      }

      setScormError("0");

      if (event.data.commit) {
        void commitSession();
      }
    }

    window.addEventListener("message", receiveScormBridgeMessage);

    return () => {
      window.removeEventListener("message", receiveScormBridgeMessage);
    };
  }, [commitSession, launch, setScormError]);

  if (!launch) {
    return (
      <section className="rounded-md border border-slate-200 p-4">
        <p className="text-sm text-slate-600">{statusMessage}</p>
      </section>
    );
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <iframe
        ref={iframeRef}
        title="SCORM content"
        src={launch.launchUrl}
        sandbox="allow-scripts allow-forms allow-popups"
        className="aspect-video w-full rounded-md border border-slate-200 bg-white"
      />

      <aside className="rounded-md border border-slate-200 p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-950">Launch</h2>
          <button
            type="button"
            onClick={() => void commitSession()}
            className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white"
          >
            Commit
          </button>
        </div>
        <dl className="mt-4 grid gap-3 text-sm">
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">Progress</dt>
            <dd className="mt-1 text-slate-950">{progressPercent}%</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">Lesson status</dt>
            <dd className="mt-1 text-slate-950">{lessonStatus}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">Score</dt>
            <dd className="mt-1 text-slate-950">{scoreRaw ?? "Not reported"}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">Launch count</dt>
            <dd className="mt-1 text-slate-950">Launch count {launch.launchCount}</dd>
          </div>
          <div className="rounded-md bg-slate-50 p-3">
            <dt className="font-medium text-slate-500">API status</dt>
            <dd className="mt-1 text-slate-950">
              {statusMessage} / error {lastErrorCode}
            </dd>
          </div>
        </dl>
      </aside>
    </section>
  );
}

type ScormCmiBridgeMessage = {
  type: "learnhub:scorm:cmi";
  cmiData: Record<string, unknown>;
  commit?: boolean;
};

function isScormCmiMessage(value: unknown): value is ScormCmiBridgeMessage {
  return (
    typeof value === "object" &&
    value !== null &&
    "type" in value &&
    value.type === "learnhub:scorm:cmi" &&
    "cmiData" in value &&
    typeof value.cmiData === "object" &&
    value.cmiData !== null
  );
}

function scormBridgeLaunchUrl(launchUrl: string, cmiData: Record<string, string>): string {
  const url = new URL(launchUrl, window.location.origin);
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));

  hash.set("lh_scorm_state", encodeURIComponent(JSON.stringify(cmiData)));
  url.hash = hash.toString();

  return `${url.pathname}${url.search}${url.hash}`;
}

function stringsOnly(input: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(Object.entries(input).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
}

function readScore(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const score = Number(value);

  return Number.isFinite(score) ? Math.round(score) : null;
}

function scormErrorText(code: string): string {
  switch (code) {
    case "0":
      return "No error";
    case "101":
      return "General exception";
    case "301":
      return "Not initialized";
    case "401":
      return "Unsupported data model element";
    default:
      return "Unknown SCORM error";
  }
}
