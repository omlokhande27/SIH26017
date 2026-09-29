import { Suspense, lazy } from 'react';
import { createBrowserRouter } from 'react-router';
import { RouterProvider } from 'react-router/dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { ProtectedRoute } from './ProtectedRoute';
import { UserRole } from '@/types';

const Landing = lazy(() => import('@/pages/Landing'));
const Login = lazy(() => import('@/pages/Login'));
const ResetPassword = lazy(() => import('@/pages/ResetPassword'));
const Dashboard = lazy(() => import('@/pages/Dashboard'));
const Projects = lazy(() => import('@/pages/Projects'));
const ProjectDetails = lazy(() => import('@/pages/ProjectDetails'));
const EditProject = lazy(() => import('@/pages/EditProject'));
const AddProject = lazy(() => import('@/pages/AddProject'));
const RiskMonitor = lazy(() => import('@/pages/RiskMonitor'));
const Prediction = lazy(() => import('@/pages/Prediction'));
const PredictionDetail = lazy(() => import('@/pages/PredictionDetail'));
const Recommendations = lazy(() => import('@/pages/Recommendations'));
const RecommendationDetail = lazy(() => import('@/pages/RecommendationDetail'));
const RiskMap = lazy(() => import('@/pages/RiskMap'));
const Analytics = lazy(() => import('@/pages/Analytics'));
const Reports = lazy(() => import('@/pages/Reports'));
const Settings = lazy(() => import('@/pages/Settings'));
const NotFound = lazy(() => import('@/pages/NotFound'));

function LoadingSkeleton() {
  return (
    <div className="flex h-full w-full items-center justify-center p-8">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-primary border-t-transparent" />
    </div>
  );
}

const router = createBrowserRouter([
  { path: '/', element: <Landing /> },
  { path: '/login', element: <Login /> },
  { path: '/reset-password', element: <ResetPassword /> },
  {
    element: <AppLayout />,
    children: [
      {
        element: <ProtectedRoute />,
        children: [
          { path: '/dashboard', element: <Dashboard /> },
          { path: '/projects', element: <Projects /> },
          { path: '/projects/:id', element: <ProjectDetails /> },
          { path: '/risk-monitor', element: <RiskMonitor /> },
          { path: '/risk-map', element: <RiskMap /> },
          { path: '/recommendations', element: <Recommendations /> },
          { path: '/recommendations/:id', element: <RecommendationDetail /> },
        ],
      },
      {
        element: (
          <ProtectedRoute
            requiredRoles={[UserRole.GOVERNMENT_OFFICER, UserRole.PROJECT_MANAGER]}
          />
        ),
        children: [
          { path: '/projects/:id/edit', element: <EditProject /> },
          { path: '/projects/new', element: <AddProject /> },
          { path: '/prediction', element: <Prediction /> },
          { path: '/prediction/:id', element: <PredictionDetail /> },
          { path: '/reports', element: <Reports /> },
        ],
      },
      {
        element: (
          <ProtectedRoute
            requiredRoles={[
              UserRole.GOVERNMENT_OFFICER,
              UserRole.PROJECT_MANAGER,
              UserRole.VIEWER,
            ]}
          />
        ),
        children: [{ path: '/analytics', element: <Analytics /> }],
      },
      {
        element: <ProtectedRoute requiredRoles={[UserRole.GOVERNMENT_OFFICER]} />,
        children: [
          { path: '/administration', element: <Settings /> },
          { path: '/settings', element: <Settings /> },
        ],
      },
      { path: '*', element: <NotFound /> },
    ],
  },
]);

export default function AppRoutes() {
  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <RouterProvider router={router} />
    </Suspense>
  );
}
