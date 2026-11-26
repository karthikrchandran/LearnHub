import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, Button, Pressable, StyleSheet, Text, View } from "react-native";
import { useVideoPlayer, VideoView } from "expo-video";

import { launchVideo, recordVideoProgress, type VideoLaunch } from "./api";

type VideoPlayerScreenProps = {
  baseUrl: string;
  organizationSlug: string;
  assignmentId: string;
  onBack: () => void;
};

export function VideoPlayerScreen({ baseUrl, organizationSlug, assignmentId, onBack }: VideoPlayerScreenProps) {
  const [runtime, setRuntime] = useState<VideoLaunch | null>(null);
  const [error, setError] = useState("");
  const [progressLabel, setProgressLabel] = useState("");
  const latestPosition = useRef(0);
  const latestWatched = useRef(0);
  const runtimeRef = useRef<VideoLaunch | null>(null);
  const player = useVideoPlayer(runtime?.currentLesson.playbackUrl ?? null, (videoPlayer) => {
    videoPlayer.loop = false;
  });

  const flushProgress = useCallback(async () => {
    const currentRuntime = runtimeRef.current;
    if (!currentRuntime) return;

    try {
      const result = await recordVideoProgress(baseUrl, organizationSlug, assignmentId, {
        lessonId: currentRuntime.currentLesson.id,
        positionSecond: latestPosition.current,
        watchedSecond: latestWatched.current,
      });
      setProgressLabel(result.completed ? "Completed" : `${result.courseProgressPercent}% complete`);
    } catch {
      setProgressLabel("Progress will retry while you remain online");
    }
  }, [assignmentId, baseUrl, organizationSlug]);

  useEffect(() => {
    let active = true;
    void launchVideo(baseUrl, organizationSlug, assignmentId)
      .then((nextRuntime) => {
        if (active) {
          runtimeRef.current = nextRuntime;
          latestPosition.current = nextRuntime.currentLesson.progress.lastPositionSecond;
          latestWatched.current = nextRuntime.currentLesson.progress.maxWatchedSecond;
          setRuntime(nextRuntime);
        }
      })
      .catch((nextError) => {
        if (active) setError(nextError instanceof Error ? nextError.message : "Unable to open this lesson.");
      });

    return () => {
      active = false;
    };
  }, [assignmentId, baseUrl, organizationSlug]);

  useEffect(() => {
    if (!runtime) return;

    const resumeSecond = runtime.currentLesson.progress.lastPositionSecond;
    if (resumeSecond > 0) {
      // expo-video exposes resume position through an imperative player API.
      // eslint-disable-next-line react-hooks/immutability
      player.currentTime = resumeSecond;
    }

    const interval = setInterval(() => {
      void flushProgress();
    }, 10_000);

    return () => {
      clearInterval(interval);
      void flushProgress();
    };
  }, [flushProgress, player, runtime]);

  useEffect(() => {
    const subscription = player.addListener("timeUpdate", ({ currentTime }) => {
      latestPosition.current = Math.floor(currentTime);
      latestWatched.current = Math.max(latestWatched.current, Math.floor(currentTime));
    });

    return () => subscription.remove();
  }, [player]);

  if (error) {
    return <View style={styles.container}><Text style={styles.error}>{error}</Text><Button title="Back" onPress={onBack} /></View>;
  }

  if (!runtime) {
    return <View style={styles.container}><ActivityIndicator color="#0f766e" /></View>;
  }

  return (
    <View style={styles.container}>
      <Pressable onPress={onBack}><Text style={styles.back}>Back to courses</Text></Pressable>
      <Text style={styles.title}>{runtime.courseTitle}</Text>
      <Text style={styles.lesson}>{runtime.currentLesson.title}</Text>
      {runtime.currentLesson.playbackUrl ? (
        <VideoView player={player} style={styles.video} nativeControls allowsFullscreen />
      ) : <Text style={styles.error}>This lesson is not ready for playback yet.</Text>}
      <Text style={styles.progress}>{progressLabel || `${runtime.courseProgressPercent}% complete`}</Text>
      <Text style={styles.note}>Online playback is available. Progress syncs every 10 seconds and when you leave this lesson.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 24, gap: 16, backgroundColor: "#f4f7f5" },
  back: { color: "#0f766e", fontWeight: "700" },
  title: { color: "#17332f", fontSize: 26, fontWeight: "700" },
  lesson: { color: "#52635f", fontSize: 16 },
  video: { width: "100%", aspectRatio: 16 / 9, backgroundColor: "#10201d" },
  progress: { color: "#0f766e", fontWeight: "700" },
  note: { color: "#71827d", fontSize: 13, lineHeight: 19 },
  error: { color: "#b42318", lineHeight: 21 },
});