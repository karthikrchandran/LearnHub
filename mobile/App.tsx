import { useState } from "react";
import { ActivityIndicator, Button, Platform, Pressable, SafeAreaView, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

import { getLearnerAssignments, getManagerReports, MobileApiError, signIn, signOut, type LearnerAssignment, type ManagerReport, validateApiBaseUrl } from "./src/api";
import { VideoPlayerScreen } from "./src/video-player";

const configuredApiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:3000";

export default function App() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [organizationSlug, setOrganizationSlug] = useState("");
  const [role, setRole] = useState<"learner" | "manager">("learner");
  const [assignments, setAssignments] = useState<LearnerAssignment[]>([]);
  const [reports, setReports] = useState<ManagerReport[]>([]);
  const [loading, setLoading] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState("");
  const [selectedAssignmentId, setSelectedAssignmentId] = useState<string | null>(null);

  async function handleSignIn() {
    setLoading(true);
    setError("");

    try {
      const apiBaseUrl = validateApiBaseUrl(configuredApiBaseUrl, process.env.NODE_ENV !== "production");
      await signIn(apiBaseUrl, email.trim(), password);
      setSignedIn(true);
      await loadWorkspace(role);
    } catch (nextError) {
      setError(nextError instanceof MobileApiError ? nextError.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  }

  async function loadWorkspace(nextRole: "learner" | "manager") {
    setLoading(true);
    setError("");

    try {
      const apiBaseUrl = validateApiBaseUrl(configuredApiBaseUrl, process.env.NODE_ENV !== "production");
      if (nextRole === "learner") {
        setAssignments(await getLearnerAssignments(apiBaseUrl, organizationSlug.trim()));
      } else {
        setReports(await getManagerReports(apiBaseUrl, organizationSlug.trim()));
      }
    } catch (nextError) {
      setError(nextError instanceof MobileApiError ? nextError.message : "Unable to load the workspace.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignOut() {
    await signOut(configuredApiBaseUrl);
    setSignedIn(false);
    setAssignments([]);
    setReports([]);
  }

  if (!signedIn) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.container}>
          <Text style={styles.eyebrow}>LEARNHUB</Text>
          <Text style={styles.title}>Learning that travels with you.</Text>
          <Text style={styles.subtitle}>Sign in to continue assigned learning or check in on your team.</Text>
          <Field label="Organization slug" value={organizationSlug} onChangeText={setOrganizationSlug} autoCapitalize="none" />
          <Field label="Email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" />
          <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {loading ? <ActivityIndicator color="#0f766e" /> : <Button title="Sign in" onPress={handleSignIn} />}
          <Text style={styles.platformNote}>{Platform.OS === "ios" ? "iOS secure storage is enabled." : "Android secure storage is enabled."}</Text>
        </ScrollView>
      </SafeAreaView>
    );
  }

  if (selectedAssignmentId) {
    return <VideoPlayerScreen baseUrl={configuredApiBaseUrl} organizationSlug={organizationSlug.trim()} assignmentId={selectedAssignmentId} onBack={() => setSelectedAssignmentId(null)} />;
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView contentContainerStyle={styles.container}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.eyebrow}>{role === "learner" ? "MY LEARNING" : "TEAM LEARNING"}</Text>
            <Text style={styles.title}>{role === "learner" ? "Keep moving." : "Keep your team moving."}</Text>
          </View>
          <Pressable onPress={handleSignOut}><Text style={styles.link}>Sign out</Text></Pressable>
        </View>
        <View style={styles.segmented}>
          <Pressable style={[styles.segment, role === "learner" && styles.segmentActive]} onPress={() => { setRole("learner"); void loadWorkspace("learner"); }}><Text>Learner</Text></Pressable>
          <Pressable style={[styles.segment, role === "manager" && styles.segmentActive]} onPress={() => { setRole("manager"); void loadWorkspace("manager"); }}><Text>Manager</Text></Pressable>
        </View>
        {loading ? <ActivityIndicator color="#0f766e" /> : role === "learner" ? <LearnerView assignments={assignments} onOpenAssignment={setSelectedAssignmentId} /> : <ManagerView reports={reports} />}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function Field(props: React.ComponentProps<typeof TextInput> & { label: string }) {
  return <View style={styles.field}><Text style={styles.label}>{props.label}</Text><TextInput {...props} style={styles.input} /></View>;
}

function LearnerView({ assignments, onOpenAssignment }: { assignments: LearnerAssignment[]; onOpenAssignment: (assignmentId: string) => void }) {
  return <View>{assignments.length === 0 ? <Text style={styles.empty}>No assigned courses yet.</Text> : assignments.map((assignment) => <Pressable onPress={() => onOpenAssignment(assignment.id)} style={styles.card} key={assignment.id}><Text style={styles.cardTitle}>{assignment.course.title}</Text><Text style={styles.cardMeta}>{assignment.status.replaceAll("_", " ")}  |  {assignment.progressPercent}% complete</Text><Text style={styles.cardBody}>{assignment.course.description || "Continue your assigned learning."}</Text><Text style={styles.link}>Open lesson</Text></Pressable>)}</View>;
}

function ManagerView({ reports }: { reports: ManagerReport[] }) {
  return <View>{reports.length === 0 ? <Text style={styles.empty}>No direct reports yet.</Text> : reports.map((report) => <View style={styles.card} key={report.id}><Text style={styles.cardTitle}>{report.firstName} {report.lastName}</Text><Text style={styles.cardMeta}>{report.department ?? "Team member"}  |  {report.progressPercent}% average progress</Text><Text style={styles.cardBody}>{report.assignments.length} assignments  |  {report.certificateCount} certificates</Text></View>)}</View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: "#f4f7f5" },
  container: { padding: 24, gap: 18 },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  eyebrow: { color: "#0f766e", fontSize: 12, fontWeight: "700", letterSpacing: 1.5 },
  title: { color: "#17332f", fontSize: 30, fontWeight: "700", marginTop: 8 },
  subtitle: { color: "#52635f", fontSize: 16, lineHeight: 23 },
  label: { color: "#52635f", fontSize: 13, marginBottom: 6 },
  field: { gap: 4 },
  input: { backgroundColor: "#ffffff", borderColor: "#d4dfda", borderRadius: 8, borderWidth: 1, padding: 13, fontSize: 16 },
  error: { color: "#b42318", fontSize: 14 },
  platformNote: { color: "#71827d", fontSize: 12, textAlign: "center" },
  link: { color: "#0f766e", fontWeight: "700" },
  segmented: { flexDirection: "row", backgroundColor: "#dce9e4", borderRadius: 8, padding: 3 },
  segment: { flex: 1, alignItems: "center", padding: 11, borderRadius: 6 },
  segmentActive: { backgroundColor: "#ffffff" },
  card: { backgroundColor: "#ffffff", borderColor: "#dce5e1", borderRadius: 8, borderWidth: 1, padding: 18, gap: 8, marginBottom: 12 },
  cardTitle: { color: "#17332f", fontSize: 18, fontWeight: "700" },
  cardMeta: { color: "#0f766e", fontSize: 13, fontWeight: "600" },
  cardBody: { color: "#52635f", fontSize: 14, lineHeight: 20 },
  empty: { color: "#52635f", fontSize: 16, textAlign: "center", paddingVertical: 32 },
});