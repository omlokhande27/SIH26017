export enum RiskLevel { LOW = 'LOW', MEDIUM = 'MEDIUM', HIGH = 'HIGH', CRITICAL = 'CRITICAL' }
export enum ProjectStatus { PLANNING = 'PLANNING', IN_PROGRESS = 'IN_PROGRESS', DELAYED = 'DELAYED', ON_HOLD = 'ON_HOLD', COMPLETED = 'COMPLETED' }
export enum ProjectSector { ROAD = 'ROAD', METRO = 'METRO', RAIL = 'RAIL', HIGHWAY = 'HIGHWAY', IRRIGATION = 'IRRIGATION', BRIDGE = 'BRIDGE' }
export enum UserRole { GOVERNMENT_OFFICER = 'GOVERNMENT_OFFICER', PROJECT_MANAGER = 'PROJECT_MANAGER', WORKER = 'WORKER', VIEWER = 'VIEWER' }
export enum ActionStatus { PENDING = 'PENDING', IN_PROGRESS = 'IN_PROGRESS', COMPLETED = 'COMPLETED', OVERDUE = 'OVERDUE', BLOCKED = 'BLOCKED' }
export enum NotificationType { RISK_CHANGE = 'RISK_CHANGE', PREDICTION_READY = 'PREDICTION_READY', ACTION_DEADLINE = 'ACTION_DEADLINE', COMPENSATION_UPDATE = 'COMPENSATION_UPDATE', GENERAL = 'GENERAL' }

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  avatar?: string;
  department: string;
  designation: string;
  /**
   * Project this account is responsible for. Set by an administrator; a
   * project manager may only edit this project.
   */
  assignedProjectId?: string | null;
}

export interface Project {
  id: string;
  code: string;
  name: string;
  state: string;
  district: string;
  sector: ProjectSector;
  status: ProjectStatus;
  riskLevel: RiskLevel;
  landRequired: number; // in Ha
  landAcquired: number; // in Ha
  acquisitionPercentage: number;
  compensationRequired: number; // in crores
  compensationPaid: number;
  compensationPending: number;
  predictedDelay: number | null; // days
  lastPredictionDate: string | null;
  projectManager: string;
  startDate: string;
  expectedEndDate: string;
  description: string;
  createdAt: string;
  updatedAt: string;

  // Detail-page fields (optional for backward compatibility)
  implementingAgency?: string;
  affectedLandowners?: number;
  affectedFamilies?: number;
  notificationDate?: string;
  awardDate?: string;
  possessionDate?: string;
  issues?: ProjectIssue[];
  predictionHistory?: PredictionHistoryEntry[];

  // Geographic coordinates (mock, illustrative only)
  latitude?: number;
  longitude?: number;
}

export interface ProjectIssue {
  id: string;
  title: string;
  severity: RiskLevel;
  description: string;
  status: 'OPEN' | 'IN_PROGRESS' | 'MONITORING' | 'RESOLVED';
  category: string;
}

export interface CreateProjectInput {
  name: string;
  code: string;
  state: string;
  district: string;
  sector: ProjectSector;
  implementingAgency: string;
  startDate: string;
  completionDate: string;
  landRequired: number;
  landAcquired: number;
  affectedLandowners: number;
  affectedFamilies: number;
  notificationDate?: string;
  awardDate?: string;
  possessionDate?: string;
  compensationRequired: number;
  compensationPaid: number;
  legalIssues: string[];
  riskFactors: string[];
}

export interface UpdateProjectInput extends Partial<CreateProjectInput> {
  description?: string;
  status?: ProjectStatus;
  riskLevel?: RiskLevel;
  expectedEndDate?: string;
  /**
   * Replaces the recorded delay causes outright. Used by the project manager
   * progress screen, which edits issues directly rather than through the
   * legal/risk factor lists.
   */
  issues?: ProjectIssue[];
}

export interface PredictionHistoryEntry {
  id: string;
  date: string;
  predictedDelay: number;
  riskLevel: RiskLevel;
  modelVersion?: string;
}

export interface LandAcquisition {
  id: string;
  projectId: string;
  parcelId: string;
  ownerName: string;
  area: number;
  status: string;
  compensationAmount: number;
  compensationPaid: number;
  disputeStatus: string;
  surveyNumber: string;
}

export interface RiskFactor {
  id: string;
  name: string;
  category: string;
  weight: number;
  value: number;
  impact: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
  description: string;
  contributionScore?: number;
}

export interface Prediction {
  id: string;
  projectId: string;
  projectName: string;
  predictedDelay: number;
  riskLevel: RiskLevel;
  confidence?: number;
  factors: RiskFactor[];
  createdAt: string;
  modelVersion: string;
  dataOrigin?: DataOrigin;
}

export interface PredictionExplanation {
  predictionId: string;
  summary: string;
  topFactors: RiskFactor[];
  historicalComparison: string;
  recommendations: string[];
}

export type ActionOutcomeStatus = 'IMPROVED' | 'NO_IMPROVEMENT' | 'RISK_INCREASED' | 'AWAITING_PREDICTION';

export interface ActionOutcome {
  status: ActionOutcomeStatus;
  beforeDelay: number;
  afterDelay: number | null;
  note: string;
  isMock: boolean;
}

export interface Recommendation {
  id: string;
  projectId: string;
  projectName: string;
  title: string;
  description: string;
  priority: RiskLevel;
  category: string;
  estimatedImpact: string;
  deadline: string;
  actionStatus: ActionStatus;
  assignedTo?: string;
  createdAt: string;

  // Priority Action Plan fields
  priorityRank: number;
  riskFactor: string;
  recommendedAction: string;
  impact: RiskLevel;
  owner: string;
  riskLevel: RiskLevel;
  predictedDelayAtRecommendation: number;

  // Status transition timestamps
  startedAt?: string;
  completedAt?: string;
  blockedAt?: string | null;
  blockedReason?: string;

  // Mock outcome recorded on completion
  outcome?: ActionOutcome | null;
}

export interface Action {
  id: string;
  recommendationId: string;
  projectId: string;
  title: string;
  description: string;
  status: ActionStatus;
  assignedTo: string;
  dueDate: string;
  completedDate?: string;
  notes?: string;
}

export interface ActivityItem {
  id: string;
  type: string;
  message: string;
  projectId?: string;
  projectName?: string;
  timestamp: string;
  read: boolean;
}

export interface DashboardSummary {
  totalProjects: number;
  activeProjects: number;
  atRiskProjects: number;
  criticalProjects: number;
  avgPredictedDelay: number;
  totalCompensationPending: number;
  riskDistribution: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  };
  recentActivity: ActivityItem[];
}

export interface Notification {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  projectId?: string;
  projectName?: string;
  timestamp: string;
  read: boolean;
  priority: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface DelayTrend {
  month: string;
  avgDelay: number;
  projectCount: number;
}

export type DataOrigin = 'live' | 'demo';
export type ExplanationSource = 'model' | 'derived' | 'unavailable';

export type IntelligenceMetricId =
  | 'delayedCases'
  | 'highRiskCases'
  | 'averageDelay'
  | 'additionalExpenditure';

export interface IntelligenceMetric {
  id: IntelligenceMetricId;
  label: string;
  value: string;
  numericValue: number;
  detail: string;
  path: string;
  origin: DataOrigin;
}

export interface EarlyWarningCase {
  project: Project;
  predictionId: string | null;
  modelVersion: string | null;
  riskProbability: number | null;
  factors: RiskFactor[];
  explanationSource: ExplanationSource;
  mainIssue: string;
  currentDelay: number | null;
  predictedDelay: number | null;
  additionalDelay: number | null;
  financialExposure: number | null;
  recommendations: string[];
  origin: DataOrigin;
}

export interface DelayReasonTotals {
  /** Projects carrying at least one unresolved issue. */
  affectedProjects: number;
  /** Sum of per-category counts. A project can appear in more than one. */
  reasonRecords: number;
}

export interface DelayReasonSlice {
  key: string;
  label: string;
  /** Number of projects carrying at least one open issue of this category. */
  cases: number;
  share: number;
  color: string;
}

export interface StateDelayPerformance {
  state: string;
  averageDelayDays: number;
  projectCount: number;
  elevatedCount: number;
  /** Share of the worst state average, used for bar scaling. */
  intensity: number;
  band: DelayBand;
}

export type DelayBand = 'severe' | 'high' | 'moderate' | 'contained';

export interface CommandCenterData {
  metrics: IntelligenceMetric[];
  earlyWarnings: EarlyWarningCase[];
  dataOrigin: DataOrigin;
  modelStatus: string;
  missingFields: string[];
}

export interface NavItem {
  label: string;
  path: string;
  icon: string;
  roles: UserRole[];
  badge?: string;
}

// ── Executive dashboard types (moved from mock/executive) ──────────────────

export type KpiId = 'total' | 'highRisk' | 'avgDelay' | 'pendingActions';
export type DeltaTone = 'good' | 'bad' | 'neutral';

export interface ExecKpi {
  id: KpiId;
  title: string;
  value: string;
  delta: string;
  tone: DeltaTone;
  path: string;
}

export interface RiskBucket {
  key: 'LOW' | 'MEDIUM' | 'HIGH';
  label: string;
  count: number;
  color: string;
}

export interface ExecHighRiskProject {
  id: string;
  name: string;
  state: string;
  district: string;
  sector: string;
  risk: RiskLevel;
  delay: number;
  topIssue: string;
}

export interface DelayTrendPoint {
  date: string;
  avgDelay: number;
  highRiskCount: number;
}

export type TrendRange = '7D' | '30D' | '90D' | '1Y';

export interface InsightFactor {
  name: string;
  share: number;
  trend: 'up' | 'down' | 'flat';
}

export interface PriorityActionItem {
  id: string;
  priority: RiskLevel;
  project: string;
  issue: string;
  impact: 'HIGH IMPACT' | 'MEDIUM IMPACT' | 'LOW IMPACT';
  recommendedAction: string;
  status: ActionStatus;
  daysLeft?: number;
}

export interface InterventionOutcome {
  id: string;
  project: string;
  intervention: string;
  before: number;
  after: number;
  improvement: number;
  date: string;
}

export interface QuickActionDef {
  label: string;
  description: string;
  path: string;
  icon: import('lucide-react').LucideIcon;
}
