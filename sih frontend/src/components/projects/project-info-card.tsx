import { Calendar, Hash, Landmark, MapPin, User, Users, Briefcase, Clock, Tag } from 'lucide-react';
import type { Project } from '@/types';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { formatShortDate, getSectorLabel } from '@/utils/formatting';

interface ProjectInfoCardProps {
  project: Project;
}

interface InfoRowProps {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}

function InfoRow({ icon, label, value }: InfoRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md bg-[var(--color-bg-muted)] text-[var(--color-brand-primary)]">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">{label}</p>
        <p className="truncate text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

export function ProjectInfoCard({ project }: ProjectInfoCardProps) {
  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
      <Card className="xl:col-span-2">
        <CardHeader className="pb-4">
          <CardTitle className="text-base">About the Project</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm leading-relaxed text-gray-600">{project.description}</p>
          <div className="mt-6 grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-3">
            <InfoRow icon={<Hash className="h-4 w-4" />} label="Project Code" value={project.code} />
            <InfoRow icon={<MapPin className="h-4 w-4" />} label="Location" value={`${project.district}, ${project.state}`} />
            <InfoRow icon={<Tag className="h-4 w-4" />} label="Sector" value={getSectorLabel(project.sector)} />
            <InfoRow icon={<Landmark className="h-4 w-4" />} label="Implementing Agency" value={project.implementingAgency ?? '—'} />
            <InfoRow icon={<User className="h-4 w-4" />} label="Project Manager" value={project.projectManager} />
            <InfoRow icon={<Briefcase className="h-4 w-4" />} label="Status" value={project.status} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base">Key Dates</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-5">
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Start Date" value={formatShortDate(project.startDate)} />
            <InfoRow icon={<Calendar className="h-4 w-4" />} label="Expected End Date" value={formatShortDate(project.expectedEndDate)} />
            <InfoRow icon={<Users className="h-4 w-4" />} label="Affected Landowners" value={String(project.affectedLandowners ?? '—')} />
            <InfoRow icon={<Users className="h-4 w-4" />} label="Affected Families" value={String(project.affectedFamilies ?? '—')} />
            <InfoRow icon={<Clock className="h-4 w-4" />} label="Last Updated" value={formatShortDate(project.updatedAt)} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}