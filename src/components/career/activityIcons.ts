/**
 * The icon that represents an activity type.
 *
 * The mapping lives on its own so the dashboard's recent-activity panel and
 * the full Activity Center cannot drift apart: the same event has to look
 * the same wherever it appears.
 */

import {
  Activity,
  Award,
  Briefcase,
  CheckCircle2,
  FileText,
  FolderGit2,
  Target,
} from 'lucide-react';

import type { ActivityActionType } from '../../types/career';

/** The icon that stands for one kind of recorded activity. */
export function getActionIcon(type: ActivityActionType) {
  switch (type) {
    case 'completed_task':
      return CheckCircle2;
    case 'applied_job':
    case 'saved_job':
      return Briefcase;
    case 'mock_interview':
      return Target;
    case 'acquired_skill':
    case 'added_evidence':
      return Award;
    case 'added_project':
      return FolderGit2;
    case 'uploaded_cv':
    case 'document_saved':
      return FileText;
    case 'goal_updated':
      return Target;
    default:
      return Activity;
  }
}
