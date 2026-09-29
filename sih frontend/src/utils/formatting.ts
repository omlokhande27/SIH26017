import { RiskLevel, ProjectStatus, ProjectSector } from '../types';

export function formatINR(amountInCrores: number): string {
  if (amountInCrores < 1) {
    return `₹${Math.round(amountInCrores * 100)} L`;
  }
  return `₹${amountInCrores.toFixed(2)} Cr`;
}

export function formatHectares(ha: number): string {
  return `${ha.toFixed(2)} Ha`;
}

export function formatPercentage(value: number): string {
  return `${value.toFixed(1)}%`;
}

export function formatDate(date: string | Date): string {
  const d = new Date(date);
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  });
}

export function formatRelativeTime(date: string | Date): string {
  const now = new Date();
  const d = new Date(date);
  const diffMs = now.getTime() - d.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  if (diffDays < 30) return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
  return formatDate(date);
}

export function getRiskColor(risk: RiskLevel): string {
  switch (risk) {
    case RiskLevel.LOW: return 'var(--color-risk-low)';
    case RiskLevel.MEDIUM: return 'var(--color-risk-medium)';
    case RiskLevel.HIGH: return 'var(--color-risk-high)';
    case RiskLevel.CRITICAL: return 'var(--color-risk-critical)';
    default: return 'currentColor';
  }
}

export function getRiskBgColor(risk: RiskLevel): string {
  switch (risk) {
    case RiskLevel.LOW: return 'rgba(22, 163, 74, 0.1)';
    case RiskLevel.MEDIUM: return 'rgba(233, 122, 10, 0.1)';
    case RiskLevel.HIGH: return 'rgba(220, 38, 38, 0.1)';
    case RiskLevel.CRITICAL: return 'rgba(127, 29, 29, 0.1)';
    default: return 'transparent';
  }
}

export function getRiskLabel(risk: RiskLevel): string {
  switch (risk) {
    case RiskLevel.LOW: return 'Low Risk';
    case RiskLevel.MEDIUM: return 'Medium Risk';
    case RiskLevel.HIGH: return 'High Risk';
    case RiskLevel.CRITICAL: return 'Critical Risk';
    default: return 'Unknown';
  }
}

export function getStatusColor(status: ProjectStatus): string {
  switch (status) {
    case ProjectStatus.PLANNING: return '#3B82B8';
    case ProjectStatus.IN_PROGRESS: return '#16A34A';
    case ProjectStatus.DELAYED: return '#E97A0A';
    case ProjectStatus.ON_HOLD: return '#DC2626';
    case ProjectStatus.COMPLETED: return '#1B3A5C';
    default: return '#0F2440';
  }
}

export function getStatusLabel(status: ProjectStatus): string {
  switch (status) {
    case ProjectStatus.PLANNING: return 'Planning';
    case ProjectStatus.IN_PROGRESS: return 'In Progress';
    case ProjectStatus.DELAYED: return 'Delayed';
    case ProjectStatus.ON_HOLD: return 'On Hold';
    case ProjectStatus.COMPLETED: return 'Completed';
    default: return 'Unknown';
  }
}

export function getSectorLabel(sector: ProjectSector): string {
  switch (sector) {
    case ProjectSector.ROAD: return 'Road';
    case ProjectSector.METRO: return 'Metro';
    case ProjectSector.RAIL: return 'Rail';
    case ProjectSector.HIGHWAY: return 'Highway';
    case ProjectSector.IRRIGATION: return 'Irrigation';
    case ProjectSector.BRIDGE: return 'Bridge';
    default: return sector;
  }
}

export function formatShortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | Date): string {
  const d = new Date(iso);
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}
