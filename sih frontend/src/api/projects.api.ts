import { apiClient } from './client';
import type { CreateProjectInput, Project, ProjectIssue, UpdateProjectInput } from '../types';
import { ProjectSector, ProjectStatus, RiskLevel } from '../types';

const ISSUE_DEFS: Record<string, { category: string; description: string }> = {
  Litigation: { category: 'Legal', description: 'Court cases on land valuation pending in the district court.' },
  'Land Dispute': { category: 'Legal', description: 'Boundary and ownership disputes on a section of parcels.' },
  'Title Issue': { category: 'Legal', description: 'Title documents incomplete for a cluster of affected parcels.' },
  'Land Record Issue': { category: 'Legal', description: 'Discrepancies found between revenue records and ground survey.' },
  'Compensation Dispute': { category: 'Financial', description: 'Disagreements on compensation valuation yet to be settled.' },
  'R&R Pending': { category: 'Social', description: 'Rehabilitation and resettlement packages awaiting coordination.' },
  'RoW Issue': { category: 'Operational', description: 'Right-of-way conflicts delaying physical land handover.' },
  Encroachment: { category: 'Legal', description: 'Unauthorised occupation on a part of the required land.' },
  'Forest Clearance Pending': { category: 'Regulatory', description: 'Forest clearance approval pending with the authorities.' },
  'Possession Pending': { category: 'Operational', description: 'Awarded land not yet handed over to the implementing agency.' },
  'Administrative Delay': { category: 'Operational', description: 'Internal approvals and paperwork creating schedule slippage.' },
};

const round1 = (value: number): number => Math.round(value * 10) / 10;

function deriveRiskLevel(input: { legalIssues?: string[]; riskFactors?: string[] }): RiskLevel {
  const flagged = (input.legalIssues?.length ?? 0) + (input.riskFactors?.length ?? 0);
  if (flagged >= 5) return RiskLevel.CRITICAL;
  if (flagged >= 3) return RiskLevel.HIGH;
  if (flagged >= 1) return RiskLevel.MEDIUM;
  return RiskLevel.LOW;
}

function buildIssues(input: Pick<CreateProjectInput, 'legalIssues' | 'riskFactors'>, riskLevel: RiskLevel): ProjectIssue[] {
  return [...input.legalIssues, ...input.riskFactors].map((title, idx) => {
    const def = ISSUE_DEFS[title] ?? { category: 'Legal', description: '' };
    return {
      id: `${idx}-${title.replace(/\s+/g, '-').toLowerCase()}`,
      title,
      category: def.category,
      description: def.description,
      severity: riskLevel,
      status: 'OPEN' as const,
    };
  });
}

function mapBackendFullViewToProject(view: any): Project {
  const p = view.project || view;
  const land = view.land_acquisition;
  const comp = view.compensation;
  const legal = view.legal_issues || [];
  const rf = view.risk_factors || [];
  const latestSnap = view.snapshots?.latest;
  const summary = view.summary;

  const statusMap: Record<string, ProjectStatus> = {
    PLANNED: ProjectStatus.PLANNING,
    ACTIVE: ProjectStatus.IN_PROGRESS,
    ON_HOLD: ProjectStatus.ON_HOLD,
    COMPLETED: ProjectStatus.COMPLETED,
    CANCELLED: ProjectStatus.ON_HOLD,
  };

  const sectorMap: Record<string, ProjectSector> = {
    ROAD: ProjectSector.ROAD,
    HIGHWAY: ProjectSector.HIGHWAY,
    METRO: ProjectSector.METRO,
    RAILWAY: ProjectSector.RAIL,
    RAIL: ProjectSector.RAIL,
    IRRIGATION: ProjectSector.IRRIGATION,
    POWER: ProjectSector.ROAD,
    WATER_SUPPLY: ProjectSector.IRRIGATION,
    BRIDGE: ProjectSector.BRIDGE,
  };

  const landRequired = land ? Number(land.land_required_ha || 0) : 0;
  const landAcquired = land ? Number(land.land_acquired_ha || 0) : 0;
  const acquisitionPercentage = land?.land_acquisition_percentage != null
    ? Number(land.land_acquisition_percentage)
    : landRequired > 0
      ? (landAcquired / landRequired) * 100
      : 0;

  // Compensation is stored in rupees in DB, represented in crores in UI (1 crore = 10,000,000)
  const compRequired = comp ? Number(comp.total_compensation_required || 0) / 10000000 : 0;
  const compPaid = comp ? Number(comp.total_compensation_paid || 0) / 10000000 : 0;
  const compPending = comp?.compensation_pending != null
    ? Number(comp.compensation_pending) / 10000000
    : Math.max(0, compRequired - compPaid);

  let riskLevel = RiskLevel.LOW;
  const issuesCount = (summary?.open_legal_issues ?? legal.length) + (summary?.open_risk_factors ?? rf.length);
  if (issuesCount >= 5) riskLevel = RiskLevel.CRITICAL;
  else if (issuesCount >= 3) riskLevel = RiskLevel.HIGH;
  else if (issuesCount >= 1) riskLevel = RiskLevel.MEDIUM;

  const issues: ProjectIssue[] = [
    ...legal.map((l: any, idx: number) => ({
      id: l.id || `leg-${idx}`,
      title: l.title || l.issue_type,
      severity: riskLevel,
      description: l.description || '',
      status: (l.status || 'OPEN') as ProjectIssue['status'],
      category: 'Legal',
    })),
    ...rf.map((r: any, idx: number) => ({
      id: r.id || `rf-${idx}`,
      title: r.factor_type || 'Risk Factor',
      severity: r.severity === 'CRITICAL' ? RiskLevel.CRITICAL : r.severity === 'HIGH' ? RiskLevel.HIGH : RiskLevel.MEDIUM,
      description: r.notes || '',
      status: (r.status || 'OPEN') as ProjectIssue['status'],
      category: 'Operational',
    })),
  ];

  return {
    id: p.id,
    code: p.project_code,
    name: p.project_name,
    state: p.state,
    district: p.district,
    sector: sectorMap[p.sector] || ProjectSector.ROAD,
    status: statusMap[p.project_status] || ProjectStatus.IN_PROGRESS,
    riskLevel,
    landRequired: round1(landRequired),
    landAcquired: round1(landAcquired),
    acquisitionPercentage: round1(acquisitionPercentage),
    compensationRequired: round1(compRequired),
    compensationPaid: round1(compPaid),
    compensationPending: round1(compPending),
    predictedDelay: null,
    lastPredictionDate: latestSnap?.snapshot_date || null,
    projectManager: 'Assigned Officer',
    startDate: p.planned_start_date || p.created_at,
    expectedEndDate: p.planned_completion_date || p.created_at,
    description: `${p.project_name} — ${p.district}, ${p.state}. Implementing agency: ${p.implementing_agency}`,
    createdAt: p.created_at,
    updatedAt: p.updated_at,
    implementingAgency: p.implementing_agency,
    affectedLandowners: land?.affected_landowners,
    affectedFamilies: land?.affected_families,
    notificationDate: land?.notification_date,
    awardDate: land?.award_date,
    possessionDate: land?.possession_date,
    issues: issues.length > 0 ? issues : undefined,
    latitude: p.latitude ? Number(p.latitude) : undefined,
    longitude: p.longitude ? Number(p.longitude) : undefined,
  };
}


export const projectsApi = {
  getProjects: async (): Promise<Project[]> => {
    try {
      const res: any = await apiClient.get('/projects?limit=100');
      if (res && res.success && res.data && Array.isArray(res.data.projects) && res.data.projects.length > 0) {
        // Fetch full view for each backend project concurrently to populate all land/compensation fields
        const fullProjects = await Promise.all(
          res.data.projects.map(async (p: any) => {
            try {
              const fullRes: any = await apiClient.get(`/projects/${p.id}/full`);
              if (fullRes && fullRes.success && fullRes.data) {
                return mapBackendFullViewToProject(fullRes.data);
              }
            } catch {
              // fallback to base project mapping
            }
            return mapBackendFullViewToProject(p);
          })
        );
        return fullProjects;
      }
      return [];
    } catch (err) {
      console.error('Backend /projects query failed:', err);
      throw err;
    }
  },

  getProjectById: async (id: string): Promise<Project> => {
    try {
      const res: any = await apiClient.get(`/projects/${id}/full`);
      if (res && res.success && res.data) {
        return mapBackendFullViewToProject(res.data);
      }
      throw new Error(`Project ${id} not found or invalid response`);
    } catch (err) {
      console.error(`Backend /projects/${id}/full fetch failed:`, err);
      throw err;
    }
  },

  createProject: async (input: CreateProjectInput): Promise<Project> => {
    const toDateOnly = (val?: string) => {
      if (!val) return new Date().toISOString().split('T')[0];
      try {
        return new Date(val).toISOString().split('T')[0];
      } catch {
        return new Date().toISOString().split('T')[0];
      }
    };

    try {
      // 1. Create base project in backend
      const projectPayload = {
        project_name: input.name.trim(),
        project_code: input.code.trim().toUpperCase(),
        state: input.state,
        district: input.district.trim(),
        sector: input.sector,
        implementing_agency: input.implementingAgency.trim(),
        planned_start_date: toDateOnly(input.startDate),
        planned_completion_date: toDateOnly(input.completionDate),
        project_status: input.startDate && new Date(input.startDate).getTime() <= Date.now() ? 'ACTIVE' : 'PLANNED',
      };

      const res: any = await apiClient.post('/projects', projectPayload);
      const newProjectId = res?.data?.project?.id || res?.data?.id;

      if (newProjectId) {
        // 2. Add land acquisition details
        if (input.landRequired > 0) {
          try {
            await apiClient.post(`/projects/${newProjectId}/land-acquisition`, {
              land_required_ha: String(input.landRequired),
              land_acquired_ha: String(Math.min(input.landAcquired, input.landRequired)),
              land_parcels_total: input.affectedLandowners > 0 ? input.affectedLandowners : 10,
              land_parcels_acquired: input.affectedLandowners > 0
                ? Math.round((Math.min(input.landAcquired, input.landRequired) / Math.max(0.001, input.landRequired)) * input.affectedLandowners)
                : 0,
              affected_landowners: input.affectedLandowners || 0,
              affected_families: input.affectedFamilies || 0,
              possession_obtained: input.landAcquired >= input.landRequired && input.landRequired > 0,
              notification_date: input.notificationDate ? toDateOnly(input.notificationDate) : null,
              award_date: input.awardDate ? toDateOnly(input.awardDate) : null,
              possession_date: input.possessionDate ? toDateOnly(input.possessionDate) : null,
            });
          } catch (landErr) {
            console.warn('Could not save land acquisition details:', landErr);
          }
        }

        // 3. Add compensation details
        if (input.compensationRequired > 0) {
          try {
            const compReqRupees = input.compensationRequired * 10000000;
            const compPaidRupees = Math.min(input.compensationPaid, input.compensationRequired) * 10000000;
            await apiClient.post(`/projects/${newProjectId}/compensation`, {
              total_compensation_required: compReqRupees.toFixed(2),
              total_compensation_paid: compPaidRupees.toFixed(2),
              payment_status: compPaidRupees >= compReqRupees ? 'COMPLETED' : compPaidRupees > 0 ? 'IN_PROGRESS' : 'NOT_STARTED',
            });
          } catch (compErr) {
            console.warn('Could not save compensation details:', compErr);
          }
        }

        // 4. Add legal issues
        if (input.legalIssues && input.legalIssues.length > 0) {
          for (const title of input.legalIssues) {
            try {
              await apiClient.post(`/projects/${newProjectId}/legal-issues`, {
                issue_type: title.toUpperCase().replace(/[\s-]+/g, '_'),
                title,
                description: ISSUE_DEFS[title]?.description || title,
                court_case: title.toLowerCase().includes('litigation') || title.toLowerCase().includes('court'),
                status: 'OPEN',
              });
            } catch (err) {
              console.warn('Could not save legal issue:', err);
            }
          }
        }

        // 5. Add risk factors
        if (input.riskFactors && input.riskFactors.length > 0) {
          for (const factor of input.riskFactors) {
            try {
              await apiClient.post(`/projects/${newProjectId}/risk-factors`, {
                factor_type: 'OPERATIONAL',
                severity: 'HIGH',
                status: 'OPEN',
                notes: factor,
              });
            } catch (err) {
              console.warn('Could not save risk factor:', err);
            }
          }
        }

        // 6. Trigger prediction assessment
        try {
          await apiClient.post(`/projects/${newProjectId}/predictions`);
        } catch (predErr) {
          console.warn('Prediction run skipped on create:', predErr);
        }

        // 7. Return the full saved project from backend
        return await projectsApi.getProjectById(newProjectId);
      }
      throw new Error('Project creation failed to return an ID');
    } catch (err) {
      console.error('Backend createProject error:', err);
      throw err;
    }
  },

  updateProject: async (id: string, changes: UpdateProjectInput): Promise<Project> => {
    try {
      const updatePayload: Record<string, unknown> = {};
      if (changes.name) updatePayload.project_name = changes.name.trim();
      if (changes.code) updatePayload.project_code = changes.code.trim().toUpperCase();
      if (changes.district) updatePayload.district = changes.district.trim();
      if (changes.state) updatePayload.state = changes.state;
      if (changes.sector) updatePayload.sector = changes.sector;
      if (changes.implementingAgency) updatePayload.implementing_agency = changes.implementingAgency.trim();
      if (changes.status) {
        const statusMap: Record<string, string> = {
          PLANNING: 'PLANNED',
          IN_PROGRESS: 'ACTIVE',
          DELAYED: 'ACTIVE',
          ON_HOLD: 'ON_HOLD',
          COMPLETED: 'COMPLETED',
        };
        updatePayload.project_status = statusMap[changes.status] || 'ACTIVE';
      }

      if (Object.keys(updatePayload).length > 0) {
        await apiClient.patch(`/projects/${id}`, updatePayload);
      }

      // Update land acquisition if needed
      if (changes.landRequired !== undefined || changes.landAcquired !== undefined) {
        try {
          await apiClient.patch(`/projects/${id}/land-acquisition`, {
            ...(changes.landRequired !== undefined && { land_required_ha: String(changes.landRequired) }),
            ...(changes.landAcquired !== undefined && { land_acquired_ha: String(changes.landAcquired) }),
          });
        } catch (e) {
          console.warn('Land acquisition patch ignored or not found:', e);
        }
      }

      // Update compensation if needed
      if (changes.compensationRequired !== undefined || changes.compensationPaid !== undefined) {
        try {
          await apiClient.patch(`/projects/${id}/compensation`, {
            ...(changes.compensationRequired !== undefined && {
              total_compensation_required: String(changes.compensationRequired * 10000000),
            }),
            ...(changes.compensationPaid !== undefined && {
              total_compensation_paid: String(changes.compensationPaid * 10000000),
            }),
          });
        } catch (e) {
          console.warn('Compensation patch ignored or not found:', e);
        }
      }

      return await projectsApi.getProjectById(id);
    } catch (err) {
      console.error(`Backend updateProject for ${id} failed:`, err);
      throw err;
    }
  },
};