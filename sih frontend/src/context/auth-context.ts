import { createContext } from 'react';
import type { Project, User, UserRole } from '@/types';
import type { ProjectEditScope } from '@/utils/permissions';

export interface LoginCredentials {
  email: string;
  password: string;
  governmentId?: string;
}

export interface RegisterCredentials {
  fullName: string;
  email: string;
  password: string;
  department?: string;
  designation?: string;
  /**
   * Role the applicant is requesting. This is only recorded as a request:
   * the database profile still starts at VIEWER until an administrator
   * verifies the identifier and promotes the role.
   */
  requestedRole?: UserRole;
  /** Official ID for the requested role, e.g. government or agency ID. */
  roleIdentifier?: string;
  /** Government employee ID, captured for officer registrations. */
  officerId?: string;
  /** Project manager registration ID, captured for manager registrations. */
  managerId?: string;
  /** State code and district selected during registration. */
  stateCode?: string;
  district?: string;
  /** Government profession recorded for officer registrations. */
  profession?: string;
  /** Scope of authority for officer registrations. */
  officerLevel?: OfficerLevel;
  /** Project the manager is assigned to. */
  assignedProjectId?: string;
}

export type OfficerLevel = 'NATIONAL' | 'STATE' | 'DISTRICT';

export interface RegistrationResult {
  user: User;
  requiresEmailConfirmation: boolean;
}

export interface ProfileUpdate {
  fullName: string;
  department: string;
  designation: string;
}

export type AccessMode = 'OFFICER' | 'VIEWER';

export interface AuthContextType {
  currentUser: User | null;
  user: User | null;
  accessMode: AccessMode;
  accessRole: UserRole | null;
  canManage: boolean;
  setAccessMode: (mode: AccessMode, accountUser?: User | null) => boolean;
  login: (credentials: LoginCredentials) => Promise<User>;
  register: (credentials: RegisterCredentials) => Promise<RegistrationResult>;
  updateProfile: (profile: ProfileUpdate) => Promise<User>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  hasPermission: (requiredRoles: UserRole[]) => boolean;
  /** True only for government officers, who manage the whole portfolio. */
  isOfficer: boolean;
  /** Edit scope for a given project, or 'none' when the project is read-only. */
  editScopeFor: (project: Project | null | undefined) => ProjectEditScope;
  loading: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
