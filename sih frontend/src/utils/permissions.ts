import { UserRole } from '@/types';
import type { Project, User } from '@/types';

/**
 * Who may change a project record.
 *
 * `full`    - a government officer may edit any project.
 * `assigned`- a project manager may edit only the project assigned to them,
 *            and only the progress fields, never the official record fields.
 * `none`    - viewers, and managers looking at any other project.
 */
export type ProjectEditScope = 'none' | 'assigned' | 'full';

export function isGovernmentOfficer(user: User | null | undefined): boolean {
  return user?.role === UserRole.GOVERNMENT_OFFICER;
}

export function isProjectManager(user: User | null | undefined): boolean {
  return user?.role === UserRole.PROJECT_MANAGER;
}

/**
 * The project a manager is responsible for. Read from the profile column
 * `assigned_project_id`, which an administrator sets during onboarding.
 */
export function getAssignedProjectId(user: User | null | undefined): string | null {
  const assigned = user?.assignedProjectId?.trim();
  return assigned ? assigned : null;
}

export function getProjectEditScope(user: User | null | undefined, project: Project | null | undefined): ProjectEditScope {
  if (!user || !project) return 'none';
  if (isGovernmentOfficer(user)) return 'full';
  if (isProjectManager(user)) {
    const assignedId = getAssignedProjectId(user);
    return assignedId && assignedId === project.id ? 'assigned' : 'none';
  }
  return 'none';
}

export function canEditProject(user: User | null | undefined, project: Project | null | undefined): boolean {
  return getProjectEditScope(user, project) !== 'none';
}

/** Only officers may create new project records. */
export function canCreateProject(user: User | null | undefined): boolean {
  return isGovernmentOfficer(user);
}

export interface ScopeReason {
  allowed: boolean;
  title: string;
  message: string;
}

/**
 * Explains why the edit screen is unavailable, so a denied manager sees the
 * reason rather than a generic error.
 */
export function describeEditDenial(
  user: User | null | undefined,
  project: Project | null | undefined,
): ScopeReason {
  if (!user) {
    return { allowed: true, title: '', message: '' };
  }

  if (isGovernmentOfficer(user)) {
    return { allowed: true, title: '', message: '' };
  }

  if (isProjectManager(user)) {
    const assignedId = getAssignedProjectId(user);
    if (!assignedId) {
      return {
        allowed: false,
        title: 'No project assigned yet',
        message:
          'A project manager can update one assigned project. Ask an administrator to set your assigned project before editing.',
      };
    }
    if (!project || project.id !== assignedId) {
      return {
        allowed: false,
        title: 'This project is not assigned to you',
        message: 'Project managers can only update the project assigned to their account. All other projects stay read-only.',
      };
    }
    return { allowed: true, title: '', message: '' };
  }

  return {
    allowed: false,
    title: 'Read-only access',
    message: 'Your role does not include project editing. Ask an administrator if you need this access.',
  };
}
