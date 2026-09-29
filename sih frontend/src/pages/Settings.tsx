import {
  BellRing,
  Building2,
  CheckCircle2,
  Database,
  KeyRound,
  Map,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/context/useAuth';
import { UserRole } from '@/types';

function formatLabel(value: string) {
  return value
    .toLowerCase()
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function StatusRow({ label, value, tone = 'success' }: { label: string; value: string; tone?: 'success' | 'info' }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-gray-100 py-3 last:border-b-0 last:pb-0 first:pt-0">
      <span className="text-sm text-gray-600">{label}</span>
      <span className={`text-right text-xs font-bold ${tone === 'success' ? 'text-emerald-700' : 'text-blue-700'}`}>{value}</span>
    </div>
  );
}

export default function Settings() {
  const { currentUser, accessRole, accessMode } = useAuth();
  const role = accessRole ?? currentUser?.role ?? UserRole.VIEWER;

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader
        title="Workspace administration"
        description="A clear view of the workspace settings, access controls, security status, and monitoring signals protecting this LandGuard environment."
      />

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-subtle text-brand-primary">
                <Users className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Access control</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">Permissions are assigned by your organization and verified against your Supabase profile.</p>
              </div>
            </div>
            <div className="mt-6">
              <StatusRow label="Assigned role" value={formatLabel(role)} />
              <StatusRow label="Current workspace" value={accessMode === 'OFFICER' ? 'Officer · Manage & edit' : 'Viewer · Read only'} tone="info" />
              <StatusRow label="Account email" value={currentUser?.email ?? 'Not available'} tone="info" />
              <StatusRow label="Profile record" value="Protected by row-level security" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <ShieldCheck className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Security status</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">Your session and account recovery flow use Supabase authentication.</p>
              </div>
            </div>
            <div className="mt-6">
              <StatusRow label="Authentication" value="Supabase session" />
              <StatusRow label="Password recovery" value="Secure email link" />
              <StatusRow label="Role elevation" value="Database-controlled" />
              <StatusRow label="Service credentials" value="Never exposed to browser" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Map className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Risk monitoring</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">The national map keeps geographic context visible while you review project signals.</p>
              </div>
            </div>
            <div className="mt-6">
              <StatusRow label="Map coverage" value="India · state boundaries" tone="info" />
              <StatusRow label="Project markers" value="Risk severity encoded" tone="info" />
              <StatusRow label="Reference data" value="GeoJSON + Esri tiles" />
              <StatusRow label="Demo records" value="Illustrative coordinates" tone="info" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-50 text-violet-700">
                <BellRing className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-base font-semibold text-gray-900">Data & notifications</h2>
                <p className="mt-1 text-sm leading-6 text-gray-500">Notification preferences remain available from your account menu.</p>
              </div>
            </div>
            <div className="mt-6">
              <StatusRow label="Project records" value="Role-scoped access" />
              <StatusRow label="In-portal updates" value="Available in account menu" tone="info" />
              <StatusRow label="Browser alerts" value="Permission controlled by browser" tone="info" />
              <StatusRow label="Email alerts" value="Configure through Supabase" tone="info" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-brand-navy/15 bg-white px-5 py-4 shadow-sm">
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
        <div>
          <p className="text-sm font-semibold text-gray-900">Account details stay in one place</p>
          <p className="mt-1 text-sm leading-6 text-gray-500">Open your avatar menu in the top bar to view identity, role, workspace mode, notifications, session status, and last visit.</p>
        </div>
      </div>

      <div className="flex items-center gap-2 px-1 text-xs text-gray-400">
        <Database className="h-3.5 w-3.5" /> Workspace policy is managed by your LandGuard administrator.
        <KeyRound className="ml-2 h-3.5 w-3.5" /> No credentials are stored in the browser.
        <Building2 className="ml-2 h-3.5 w-3.5" /> Organization: Land Acquisition Department
      </div>
    </div>
  );
}
