import type { RiskFactor } from '@/types';
import { RiskLevel } from '@/types';
import { Modal } from '@/components/ui/modal';
import { RiskBadge } from '@/components/ui/risk-badge';
import { factorContributionRisk } from '@/utils/prediction-helpers';

interface FactorDetailModalProps {
  factor: RiskFactor | null;
  onClose: () => void;
}

export function FactorDetailModal({ factor, onClose }: FactorDetailModalProps) {
  const level = factor ? factorContributionRisk(factor.contributionScore ?? 0) : RiskLevel.LOW;

  return (
    <Modal isOpen={factor !== null} onClose={onClose} title={factor?.name ?? ''}>
      {factor && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Impact</p>
              <div className="mt-2">
                <RiskBadge risk={level} />
              </div>
            </div>
            <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Contribution</p>
              <p className="mt-2 text-2xl font-bold tabular-nums text-gray-900">
                {factor.contributionScore !== undefined ? factor.contributionScore.toFixed(2) : '—'}
              </p>
            </div>
          </div>

          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wider text-gray-400">Explanation</p>
            <p className="mt-1.5 text-sm leading-relaxed text-gray-600">{factor.description}</p>
          </div>

          <div className="rounded-lg bg-gray-50 px-3 py-2 text-[11px] text-gray-400">
            Category: {factor.category} · Direction:{' '}
            {factor.impact === 'NEGATIVE'
              ? 'increases delay'
              : factor.impact === 'POSITIVE'
                ? 'reduces delay'
                : 'neutral'}
          </div>
        </div>
      )}
    </Modal>
  );
}