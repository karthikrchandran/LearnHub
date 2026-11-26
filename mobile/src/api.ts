import * as SecureStore from "expo-secure-store";

export type MobileCourse = {
  id: string;
  title: string;
  slug: string;
  description: string;
  type: string;
  durationMinutes: number;
  credentialProvider: string | null;
};

export type LearnerAssignment = {
  id: string;
  status: string;
  startDate: string | null;
  dueDate: string | null;
  progressPercent: number;
  certificateIssued: boolean;
  course: MobileCourse;
};

export type ManagerReport = {
  id: string;
  employeeId: string | null;
  department: string | null;
  title: string | null;
  firstName: string;
  lastName: string;
  email: string;
  assignments: Array<{ id: string; status: string; progressPercent: number }>;
  certificateCount: number;
  progressPercent: number;
};

export type VideoLaunch = {
  assignmentId: string;
  courseId: string;
  courseTitle: string;
  currentLesson: {
    id: string;
    title: string;
    durationSeconds: number;
    playbackUrl: string | null;
    progress: { lastPositionSecond: number; maxWatchedSecond: number; completed: boolean };
  };
  courseProgressPercent: number;
};

const tokenKey = "learnhub.mobile.access-token";
const refreshTokenKey = "learnhub.mobile.refresh-token";

export class MobileApiError extends Error {}

export function validateApiBaseUrl(baseUrl: string, isDevelopment = false): string {
  const normalized = baseUrl.trim().replace(/\/$/, "");

  if (!normalized) {
    throw new MobileApiError("A LearnHub API URL is required.");
  }

  const url = new URL(normalized);

  if (url.protocol !== "https:" && !isDevelopment) {
    throw new MobileApiError("LearnHub requires an HTTPS API URL outside development.");
  }

  return normalized;
}

export async function signIn(baseUrl: string, email: string, password: string): Promise<void> {
  const response = await fetch(`${baseUrl}/api/v1/mobile/auth/token`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    throw new MobileApiError(await readError(response));
  }

  const body = (await response.json()) as { accessToken: string; refreshToken: string };
  await SecureStore.setItemAsync(tokenKey, body.accessToken);
  await SecureStore.setItemAsync(refreshTokenKey, body.refreshToken);
}

export async function signOut(baseUrl: string): Promise<void> {
  const token = await SecureStore.getItemAsync(tokenKey);

  if (token) {
    await fetch(`${baseUrl}/api/v1/mobile/auth/revoke`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    }).catch(() => undefined);
  }

  await SecureStore.deleteItemAsync(tokenKey);
  await SecureStore.deleteItemAsync(refreshTokenKey);
}

export async function getLearnerAssignments(baseUrl: string, organizationSlug: string): Promise<LearnerAssignment[]> {
  const body = await request<{ assignments: LearnerAssignment[] }>(
    `${baseUrl}/api/v1/mobile/org/${encodeURIComponent(organizationSlug)}/learner/assignments`,
  );
  return body.assignments;
}

export async function getManagerReports(baseUrl: string, organizationSlug: string): Promise<ManagerReport[]> {
  const body = await request<{ reports: ManagerReport[] }>(
    `${baseUrl}/api/v1/mobile/org/${encodeURIComponent(organizationSlug)}/manager/direct-reports`,
  );
  return body.reports;
}

export async function launchVideo(baseUrl: string, organizationSlug: string, assignmentId: string): Promise<VideoLaunch> {
  return request<VideoLaunch>(
    `${baseUrl}/api/v1/mobile/org/${encodeURIComponent(organizationSlug)}/learner/assignments/${encodeURIComponent(assignmentId)}/video/launch`,
  );
}

export async function recordVideoProgress(
  baseUrl: string,
  organizationSlug: string,
  assignmentId: string,
  input: { lessonId: string; positionSecond: number; watchedSecond: number },
): Promise<{ courseProgressPercent: number; completed: boolean }> {
  return request(
    `${baseUrl}/api/v1/mobile/org/${encodeURIComponent(organizationSlug)}/learner/assignments/${encodeURIComponent(assignmentId)}/video/progress`,
    { method: "POST", headers: { "content-type": "application/json", "idempotency-key": createOperationId() }, body: JSON.stringify(input) },
  );
}

export async function registerDevice(
  baseUrl: string,
  organizationSlug: string,
  input: { platform: "IOS" | "ANDROID"; pushToken: string; appVersion?: string; permissionStatus?: string },
): Promise<{ id: string }> {
  const body = await request<{ device: { id: string } }>(
    `${baseUrl}/api/v1/mobile/org/${encodeURIComponent(organizationSlug)}/devices`,
    { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) },
  );
  return body.device;
}

async function request<T>(url: string, init: RequestInit = {}): Promise<T> {
  const token = await SecureStore.getItemAsync(tokenKey);
  let response = await fetchWithToken(url, token, init);

  if (response.status === 401) {
    const refreshed = await refreshAccessToken(new URL(url).origin);
    response = await fetchWithToken(url, refreshed, init);
  }

  if (!response.ok) {
    throw new MobileApiError(await readError(response));
  }

  return (await response.json()) as T;
}

async function readError(response: Response): Promise<string> {
  const body = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
  return body?.error?.message ?? "The LearnHub request failed.";
}

async function fetchWithToken(url: string, token: string | null, init: RequestInit): Promise<Response> {
  return fetch(url, {
    ...init,
    headers: { ...init.headers, ...(token ? { authorization: `Bearer ${token}` } : {}) },
  });
}

async function refreshAccessToken(baseUrl: string): Promise<string> {
  const refreshToken = await SecureStore.getItemAsync(refreshTokenKey);

  if (!refreshToken) {
    throw new MobileApiError("Your session has expired. Please sign in again.");
  }

  const response = await fetch(`${baseUrl}/api/v1/mobile/auth/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });

  if (!response.ok) {
    await signOut(baseUrl);
    throw new MobileApiError(await readError(response));
  }

  const body = (await response.json()) as { accessToken: string; refreshToken: string };
  await SecureStore.setItemAsync(tokenKey, body.accessToken);
  await SecureStore.setItemAsync(refreshTokenKey, body.refreshToken);
  return body.accessToken;
}

function createOperationId(): string {
  return `mobile-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}