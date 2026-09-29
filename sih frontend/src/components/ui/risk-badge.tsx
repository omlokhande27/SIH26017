import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { RiskLevel } from '@/types';
import { cn } from '@/lib/utils';
import { Badge } from './badge';

interface RiskBadgeProps {
  risk: RiskLevel;
  className?: string;
  showIcon?: boolean;
}

export function RiskBadge({ risk, className, showIcon = true }: RiskBadgeProps) {
  const config: Record<RiskLevel, { className: string; label: string }> = {
    [RiskLevel.LOW]: { className: 'bg-[var(--color-risk-low)]/10 text-[var(--color-risk-low)]', label: 'Low Risk' },
    [RiskLevel.MEDIUM]: { className: 'bg-[var(--color-risk-medium)]/10 text-[var(--color-risk-medium)]', label: 'Medium Risk' },
    [RiskLevel.HIGH]: { className: 'bg-[var(--color-risk-high)]/10 text-[var(--color-risk-high)]', label: 'High Risk' },
    [RiskLevel.CRITICAL]: { className: 'bg-[var(--color-risk-critical)]/10 text-[var(--color-risk-critical)]', label: 'Critical' },
  };

  const { className: badgeClass, label } = config[risk] || { className: '', label: 'Unknown' };

  return (
    <Badge className={cn(badgeClass, className)}>
      {showIcon && <ShieldAlert className="mr-1 h-3 w-3" />}
      {label}
    </Badge>
  );
}
