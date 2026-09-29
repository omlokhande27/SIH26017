import { Navigate, Outlet } from 'react-router';
import { useAuth } from '@/context/useAuth';
import { UserRole } from '@/types';
import { AlertTriangle } from 'lucide-react';

interface ProtectedRouteProps {
  requiredRoles?: UserRole[];
}

export function ProtectedRoute({ requiredRoles }: ProtectedRouteProps) {
  const { user, isAuthenticated, loading, hasPermission } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-gray-500">
          Checking authentication...
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return <Navigate to="/login" replace />;
  }

  if (requiredRoles && !hasPermission(requiredRoles)) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-8 text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 text-red-600">
          <AlertTriangle className="h-8 w-8" />
        </div>

        <h2 className="mb-2 text-2xl font-bold">
          Access Denied
        </h2>

        <p className="max-w-md text-gray-500">
          You do not have permission to access this page.
        </p>
      </div>
    );
  }

  return <Outlet />;
}