import { createSignedMuxPlaybackUrl, type MuxPlaybackSigningConfig } from "@/modules/providers/video/mux-video-provider";

import type { VideoRuntimeLaunch } from "./video-runtime";

export class MuxPlaybackConfigurationError extends Error {}

export function signMuxRuntimePlayback(
  runtime: VideoRuntimeLaunch,
  signingConfig: MuxPlaybackSigningConfig | null,
  nowSeconds?: number,
): VideoRuntimeLaunch {
  if (!signingConfig && runtime.lessons.some((lesson) => lesson.providerPlaybackId)) {
    throw new MuxPlaybackConfigurationError("Mux signed playback is not configured on this server.");
  }

  const lessons = runtime.lessons.map((lesson) => ({
    ...lesson,
    playbackUrl: lesson.providerPlaybackId && signingConfig
      ? createSignedMuxPlaybackUrl(lesson.providerPlaybackId, signingConfig, nowSeconds)
      : lesson.playbackUrl,
  }));
  const currentLesson = lessons.find((lesson) => lesson.id === runtime.currentLesson.id);

  return {
    ...runtime,
    lessons,
    currentLesson: currentLesson ?? runtime.currentLesson,
  };
}