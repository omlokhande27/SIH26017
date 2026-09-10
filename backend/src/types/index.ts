import { Request } from 'express';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: string;
}

// Extends Express Request to carry the verified user after auth middleware
export interface AuthenticatedRequest extends Request {
  user?: AuthenticatedUser;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  message?: string;
  error?: string;
}

export interface PaginationQuery {
  page: number;
  limit: number;
}
