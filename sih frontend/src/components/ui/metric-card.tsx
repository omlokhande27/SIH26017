import React from 'react';
import { ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from './card';
import { cn } from '@/lib/utils';

interface MetricCardProps {
  title: string;
  value: string | number;
  icon: LucideIcon;
  trend?: {
    value: number;
    isPositive: boolean;
  };
  className?: string;
}

export function MetricCard({ title, value, icon: Icon, trend, className }: MetricCardProps) {
  return (
    <Card className={className}>
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex flex-col space-y-1">
            <span className="text-sm font-medium text-gray-500">{title}</span>
            <span className="text-2xl font-bold text-gray-900">{value}</span>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[var(--color-brand-primary)]/10">
            <Icon className="h-6 w-6 text-[var(--color-brand-primary)]" />
          </div>
        </div>
        {trend && (
          <div className="mt-4 flex items-center text-sm">
            {trend.isPositive ? (
              <ArrowUpRight className="mr-1 h-4 w-4 text-[var(--color-risk-low)]" />
            ) : (
              <ArrowDownRight className="mr-1 h-4 w-4 text-[var(--color-risk-high)]" />
            )}
            <span
              className={cn(
                'font-medium',
                trend.isPositive ? 'text-[var(--color-risk-low)]' : 'text-[var(--color-risk-high)]'
              )}
            >
              {Math.abs(trend.value)}%
            </span>
            <span className="ml-2 text-gray-500">vs last month</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
