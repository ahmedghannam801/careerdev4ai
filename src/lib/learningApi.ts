// Authenticated client for the B.5 Learning Hub endpoints.
//
// The catalogue endpoint is public; every user-state call is authenticated
// with the current Supabase access token, exactly like the other domain APIs.

// The shared client: the same Bearer header, JSON parsing and non-OK
// handling every API module uses.
import { apiRequest as request } from './apiClient';
import type {
  LearningCourse,
  LearningItem,
  LearningPreferences,
  LearningStatus,
  RecommendationResult,
} from '../types/learning';

export async function fetchLearningCatalog(): Promise<LearningCourse[]> {
  const data = await request<{ courses: LearningCourse[] }>('/api/learning/catalog');
  return data.courses ?? [];
}

export async function fetchLearningItems(): Promise<LearningItem[]> {
  const data = await request<{ items: LearningItem[] }>('/api/learning/items');
  return data.items ?? [];
}

export async function fetchLearningRecommendations(
  preferences: LearningPreferences = {}
): Promise<RecommendationResult> {
  return request<RecommendationResult>('/api/learning/recommendations', {
    method: 'POST',
    body: JSON.stringify(preferences),
  });
}

export interface SaveLearningInput {
  courseId: string;
  status: LearningStatus;
  progressPercent?: number;
  notes?: string | null;
  recommendationReason?: string | null;
}

export async function saveLearningItem(input: SaveLearningInput): Promise<LearningItem> {
  const data = await request<{ item: LearningItem }>('/api/learning/items', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return data.item;
}

export async function patchLearningItem(
  courseId: string,
  patch: {
    status?: LearningStatus;
    progressPercent?: number;
    notes?: string | null;
    recommendationReason?: string | null;
  }
): Promise<LearningItem> {
  const data = await request<{ item: LearningItem }>(
    `/api/learning/items/${encodeURIComponent(courseId)}`,
    {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }
  );
  return data.item;
}

export async function deleteLearningItem(courseId: string): Promise<void> {
  await request<{ success: boolean }>(`/api/learning/items/${encodeURIComponent(courseId)}`, {
    method: 'DELETE',
  });
}
