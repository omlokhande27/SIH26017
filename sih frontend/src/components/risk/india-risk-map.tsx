import { useEffect, useMemo } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router';
import L from 'leaflet';
import {
  CircleMarker,
  GeoJSON as GeoJsonLayer,
  MapContainer,
  Popup,
  TileLayer,
  Tooltip,
  useMap,
} from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import { Globe, Maximize2 } from 'lucide-react';
import { useSidebar } from '@/context/useSidebar';
import { buildFactorsForProject } from '@/utils/prediction-helpers';
import { getSectorLabel, formatHectares, formatINR, formatPercentage } from '@/utils/formatting';
import { RiskBadge } from '@/components/ui/risk-badge';
import { RiskLevel } from '@/types';
import type { DelayBand, Project, StateDelayPerformance } from '@/types';
import { cn } from '@/lib/utils';
import indiaStatesRaw from '@/assets/india-states.geojson?raw';

interface IndiaStateProperties {
  name: string;
  type?: string;
}

const indiaStates = JSON.parse(indiaStatesRaw) as GeoJSON.FeatureCollection<GeoJSON.Geometry, IndiaStateProperties>;

const INDIA_CENTER: [number, number] = [22.5, 80.2];
const INDIA_BOUNDS = L.latLngBounds([5.5, 67.5], [37, 98.5]);

const riskColorHex: Record<RiskLevel, string> = {
  [RiskLevel.CRITICAL]: '#7F1D1D',
  [RiskLevel.HIGH]: '#DC2626',
  [RiskLevel.MEDIUM]: '#E97A0A',
  [RiskLevel.LOW]: '#16A34A',
};

const riskDotClass: Record<RiskLevel, string> = {
  [RiskLevel.CRITICAL]: 'bg-[var(--color-risk-critical)]',
  [RiskLevel.HIGH]: 'bg-[var(--color-risk-high)]',
  [RiskLevel.MEDIUM]: 'bg-[var(--color-risk-medium)]',
  [RiskLevel.LOW]: 'bg-[var(--color-risk-low)]',
};

const LEGEND_ITEMS: Array<{ level: RiskLevel; label: string }> = [
  { level: RiskLevel.CRITICAL, label: 'Critical' },
  { level: RiskLevel.HIGH, label: 'High' },
  { level: RiskLevel.MEDIUM, label: 'Medium' },
  { level: RiskLevel.LOW, label: 'Low' },
];

function markerRadius(risk: RiskLevel) {
  if (risk === RiskLevel.CRITICAL) return 9;
  if (risk === RiskLevel.HIGH) return 8;
  if (risk === RiskLevel.MEDIUM) return 7;
  return 6;
}

function IndiaViewport() {
  const map = useMap();

  useEffect(() => {
    map.fitBounds(INDIA_BOUNDS, { padding: [24, 24], animate: false });
  }, [map]);

  return null;
}

function MapResizeController() {
  const map = useMap();
  const { isCollapsed, isMobileOpen } = useSidebar();

  useEffect(() => {
    const refreshMapSize = () => map.invalidateSize({ animate: false, pan: false });
    const refreshTimer = window.setTimeout(refreshMapSize, 300);
    window.addEventListener('resize', refreshMapSize);

    return () => {
      window.clearTimeout(refreshTimer);
      window.removeEventListener('resize', refreshMapSize);
    };
  }, [isCollapsed, isMobileOpen, map]);

  return null;
}

interface MapControlsProps {
  projects: Project[];
}

function MapControls({ projects }: MapControlsProps) {
  const map = useMap();

  const showIndia = () => map.fitBounds(INDIA_BOUNDS, { padding: [24, 24], animate: true });
  const fitProjects = () => {
    const coordinates = projects
      .filter((project): project is Project & { latitude: number; longitude: number } =>
        project.latitude != null && project.longitude != null,
      )
      .map((project) => [project.latitude, project.longitude] as [number, number]);

    if (coordinates.length === 0) {
      showIndia();
      return;
    }
    map.fitBounds(L.latLngBounds(coordinates), { padding: [56, 56], maxZoom: 7, animate: true });
  };

  const buttons: Array<{ label: string; title: string; onClick: () => void; icon?: ReactNode; text?: string }> = [
    { label: 'zoom-in', title: 'Zoom in', onClick: () => map.zoomIn(), text: '+' },
    { label: 'zoom-out', title: 'Zoom out', onClick: () => map.zoomOut(), text: '−' },
    { label: 'fit-projects', title: 'Fit visible projects', onClick: fitProjects, icon: <Maximize2 className="h-4 w-4" /> },
    { label: 'india-view', title: 'Show all of India', onClick: showIndia, icon: <Globe className="h-4 w-4" /> },
  ];

  return createPortal(
    <div className="absolute right-3 top-3 z-[1000] flex flex-col overflow-hidden rounded-xl border border-gray-200 bg-white/95 shadow-lg backdrop-blur-sm">
      {buttons.map((button, index) => (
        <span key={button.label} className="contents">
          {index > 0 && <div className="h-px bg-gray-200" />}
          <button
            type="button"
            title={button.title}
            aria-label={button.title}
            onClick={button.onClick}
            className="flex h-10 w-10 items-center justify-center text-gray-600 transition-colors hover:bg-brand-subtle hover:text-brand-primary"
          >
            {button.icon ?? <span className="text-lg leading-none font-semibold">{button.text}</span>}
          </button>
        </span>
      ))}
    </div>,
    map.getContainer(),
  );
}

const DELAY_BAND_COLORS: Record<DelayBand, { fill: string; label: string; swatch: string }> = {
  severe: { fill: '#B91C1C', label: 'Very high', swatch: 'bg-[#B91C1C]' },
  high: { fill: '#EA580C', label: 'High', swatch: 'bg-[#EA580C]' },
  moderate: { fill: '#EAB308', label: 'Medium', swatch: 'bg-[#EAB308]' },
  contained: { fill: '#22C55E', label: 'Low', swatch: 'bg-[#22C55E]' },
};

const DELAY_BAND_ORDER: DelayBand[] = ['severe', 'high', 'moderate', 'contained'];

function IndiaReferenceLayer({
  stateDelayByName,
  onStateSelect,
}: {
  stateDelayByName?: Map<string, StateDelayPerformance>;
  onStateSelect?: (state: string) => void;
}) {
  return (
    <GeoJsonLayer
      data={indiaStates}
      style={(feature) => {
        const band = stateDelayByName?.get(feature?.properties?.name ?? '')?.band;
        if (!band) {
          return { color: '#94A3B8', weight: 1, opacity: 0.6, fillColor: '#E2E8F0', fillOpacity: 0.6 };
        }
        return { color: '#FFFFFF', weight: 1.5, opacity: 1, fillColor: DELAY_BAND_COLORS[band].fill, fillOpacity: 0.92 };
      }}
      onEachFeature={(feature, layer) => {
        const name = feature.properties?.name;
        if (!name) return;
        const performance = stateDelayByName?.get(name);
        const getElement = () => (layer as unknown as { getElement?: () => HTMLElement }).getElement?.();

        if (performance) {
          layer.bindTooltip(
            `<div style="font-family:var(--font-sans)">
               <p style="margin:0;font-size:12px;font-weight:700;color:#0F172A">${name}</p>
               <p style="margin:4px 0 0;font-size:11px;color:#475569">${performance.averageDelayDays} days average delay</p>
               <p style="margin:2px 0 0;font-size:11px;color:#475569">${performance.projectCount} project${performance.projectCount === 1 ? '' : 's'} recorded</p>
             </div>`,
            { sticky: true, className: 'india-state-tooltip', direction: 'top' },
          );
        } else {
          layer.bindTooltip(name, { sticky: true, className: 'india-state-tooltip', direction: 'top' });
        }

        if (performance) {
          layer.on('mouseover', () => {
            const element = getElement();
            if (element) element.style.filter = 'brightness(1.15) saturate(1.1)';
          });
          layer.on('mouseout', () => {
            const element = getElement();
            if (element) element.style.filter = '';
          });
        }

        if (performance && onStateSelect) {
          layer.on('click', () => onStateSelect(name));
          getElement()?.style.setProperty('cursor', 'pointer');
        }
      }}
    />
  );
}

function PopupContent({ project }: { project: Project }) {
  const navigate = useNavigate();
  const topFactor = buildFactorsForProject(project)[0];

  return (
    <div className="space-y-3" style={{ fontFamily: 'var(--font-sans)' }}>
      <div>
        <p className="text-sm font-bold leading-snug text-gray-900">{project.name}</p>
        <p className="mt-1 text-xs text-gray-500">{project.district}, {project.state}</p>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <RiskBadge risk={project.riskLevel} />
        <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">
          {getSectorLabel(project.sector)}
        </span>
        <span className="rounded-md bg-gray-100 px-2 py-1 text-[10px] font-semibold text-gray-600">
          {project.predictedDelay !== null ? `${project.predictedDelay} days delay` : 'Delay N/A'}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-2 text-[10px]">
        <div className="rounded-md bg-gray-50 px-2 py-1.5">
          <p className="text-gray-400">Land area</p>
          <p className="mt-0.5 font-semibold text-gray-800">{formatHectares(project.landRequired)}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-2 py-1.5">
          <p className="text-gray-400">Acquisition</p>
          <p className="mt-0.5 font-semibold text-gray-800">{formatPercentage(project.acquisitionPercentage)}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-2 py-1.5">
          <p className="text-gray-400">Pending compensation</p>
          <p className="mt-0.5 font-semibold text-gray-800">{formatINR(project.compensationPending)}</p>
        </div>
        <div className="rounded-md bg-gray-50 px-2 py-1.5">
          <p className="text-gray-400">Coordinates</p>
          <p className="mt-0.5 font-semibold text-gray-800">Available</p>
        </div>
      </div>

      {topFactor && (
        <p className="text-[11px] leading-relaxed text-gray-500">
          <span className="font-semibold text-gray-700">Main risk factor:</span> {topFactor.name}
        </p>
      )}

      <button
        type="button"
        onClick={() => navigate(`/projects/${project.id}`)}
        className="flex w-full items-center justify-center rounded-lg bg-brand-primary px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-secondary"
      >
        View Case →
      </button>
    </div>
  );
}

export interface IndiaRiskMapProps {
  projects: Project[];
  heightClass?: string;
  className?: string;
  compact?: boolean;
  showControls?: boolean;
  showStateHotspots?: boolean;
  onProjectSelect?: (project: Project) => void;
  /** When provided, states are shaded by average predicted delay. */
  stateDelayRanking?: StateDelayPerformance[];
  onStateSelect?: (state: string) => void;
}

export function IndiaRiskMap({
  projects,
  heightClass = 'h-[650px]',
  className,
  compact = false,
  showControls = true,
  showStateHotspots = true,
  onProjectSelect,
  stateDelayRanking,
  onStateSelect,
}: IndiaRiskMapProps) {
  const stateDelayByName = useMemo(() => {
    if (!stateDelayRanking) return undefined;
    return new Map(stateDelayRanking.map((row) => [row.state, row]));
  }, [stateDelayRanking]);

  const shadedStateCount = stateDelayByName?.size ?? 0;
  const locatedProjects = useMemo(
    () => projects.filter((project) => project.latitude != null && project.longitude != null),
    [projects],
  );
  const missingCoordinates = projects.length - locatedProjects.length;

  const visibleLevelCounts = useMemo(() => {
    const counts: Partial<Record<RiskLevel, number>> = {};
    for (const project of projects) counts[project.riskLevel] = (counts[project.riskLevel] ?? 0) + 1;
    return counts;
  }, [projects]);

  const stateHotspots = useMemo(() => {
    const byState = new Map<string, { projects: number; elevated: number }>();
    for (const project of projects) {
      const current = byState.get(project.state) ?? { projects: 0, elevated: 0 };
      current.projects += 1;
      if (project.riskLevel === RiskLevel.CRITICAL || project.riskLevel === RiskLevel.HIGH) current.elevated += 1;
      byState.set(project.state, current);
    }
    return [...byState.entries()]
      .map(([state, values]) => ({ state, ...values }))
      .sort((a, b) => b.elevated - a.elevated || b.projects - a.projects)
      .slice(0, 4);
  }, [projects]);

  return (
    <div className={cn('relative isolate w-full overflow-hidden bg-slate-100', heightClass, className)}>
      <MapContainer
        center={INDIA_CENTER}
        zoom={5}
        minZoom={4}
        maxZoom={10}
        zoomControl={false}
        maxBounds={L.latLngBounds([2, 62], [40, 103])}
        maxBoundsViscosity={0.75}
        className="h-full w-full"
        scrollWheelZoom
      >
        <TileLayer
          attribution='State boundaries: <a href="https://github.com/geohacker/india">GeoJSON</a> · Tiles © <a href="https://www.esri.com/">Esri</a>'
          url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Base/MapServer/tile/{z}/{y}/{x}"
        />
        <TileLayer url="https://services.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Light_Gray_Reference/MapServer/tile/{z}/{y}/{x}" />
        <IndiaViewport />
        <MapResizeController />
        <IndiaReferenceLayer stateDelayByName={stateDelayByName} onStateSelect={onStateSelect} />
        {showControls && <MapControls projects={locatedProjects} />}

        {locatedProjects.map((project) => (
          <CircleMarker
            key={project.id}
            center={[project.latitude as number, project.longitude as number]}
            radius={markerRadius(project.riskLevel)}
            pathOptions={{
              color: '#ffffff',
              weight: 2,
              fillColor: riskColorHex[project.riskLevel],
              fillOpacity: 0.96,
            }}
            eventHandlers={onProjectSelect ? { click: () => onProjectSelect(project) } : undefined}
          >
            <Tooltip direction="top" offset={[0, -7]} className="india-project-tooltip">
              {project.name}
            </Tooltip>
            <Popup maxWidth={300} className="risk-popup">
              <PopupContent project={project} />
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {shadedStateCount > 0 && (
        <>
          {/* Compact strip on small screens so the map stays visible. */}
          <div className="absolute inset-x-2 bottom-2 z-[1000] rounded-lg border border-gray-200 bg-white/95 p-2 shadow-lg backdrop-blur-sm sm:hidden">
            <div className="flex items-center justify-between gap-2">
              {DELAY_BAND_ORDER.map((band) => {
                const rows = stateDelayRanking?.filter((row) => row.band === band) ?? [];
                if (rows.length === 0) return null;
                return (
                  <span key={band} className="flex min-w-0 items-center gap-1">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-sm', DELAY_BAND_COLORS[band].swatch)} />
                    <span className="truncate text-[10px] font-semibold text-gray-700 tabular-nums">
                      {rows.length}
                    </span>
                  </span>
                );
              })}
              <span className="shrink-0 text-[10px] font-bold uppercase tracking-wide text-gray-400">
                Avg delay
              </span>
            </div>
          </div>

          <div className="absolute left-4 top-4 z-[1000] hidden w-60 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm sm:block">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">
              State average delay
            </p>
            <div className="mt-2.5 space-y-1.5">
              {DELAY_BAND_ORDER.map((band) => {
                const config = DELAY_BAND_COLORS[band];
                const rows = stateDelayRanking?.filter((row) => row.band === band) ?? [];
                if (rows.length === 0) return null;
                const min = Math.min(...rows.map((row) => row.averageDelayDays));
                const max = Math.max(...rows.map((row) => row.averageDelayDays));
                return (
                  <div key={band} className="flex items-center gap-2">
                    <span className={cn('h-2.5 w-2.5 shrink-0 rounded-full', config.swatch)} />
                    <span className="text-[11px] font-medium text-gray-700">{config.label}</span>
                    <span className="ml-auto text-[10px] text-gray-400 tabular-nums">
                      {min === max ? `${min}d` : `${min}–${max}d`}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {showStateHotspots && !compact && (
        <div className="absolute left-4 top-4 z-[1000] w-64 rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">State concentration</p>
          {stateHotspots.length > 0 ? (
            <div className="mt-3 space-y-2.5">
              {stateHotspots.map((hotspot, index) => (
                <div key={hotspot.state} className="flex items-center gap-2.5">
                  <span className="flex h-6 w-6 items-center justify-center rounded-md bg-brand-subtle text-[10px] font-bold text-brand-primary">{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-gray-800">{hotspot.state}</p>
                    <p className="text-[10px] text-gray-400">{hotspot.projects} projects · {hotspot.elevated} high/critical</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-xs text-gray-500">No projects match the current filters.</p>
          )}
        </div>
      )}

      {shadedStateCount === 0 && (
        <div className="absolute bottom-4 left-4 z-[1000] rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Visible risk markers</p>
          <div className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2">
            {LEGEND_ITEMS.map((item) => (
              <div key={item.level} className="flex items-center gap-2">
                <span className={cn('h-3 w-3 rounded-full border-2 border-white shadow-sm', riskDotClass[item.level])} />
                <span className="text-xs font-medium text-gray-700">{item.label}</span>
                <span className="ml-auto text-xs font-bold tabular-nums text-gray-900">{visibleLevelCounts[item.level] ?? 0}</span>
              </div>
            ))}
          </div>
          {missingCoordinates > 0 && (
            <p className="mt-3 max-w-56 border-t border-gray-100 pt-2 text-[10px] leading-4 text-gray-400">
              {missingCoordinates} project{missingCoordinates === 1 ? '' : 's'} without coordinates {missingCoordinates === 1 ? 'is' : 'are'} not plotted.
            </p>
          )}
        </div>
      )}

      {!compact && (
        <div className="absolute bottom-4 right-4 z-[1000] hidden max-w-[230px] rounded-xl border border-gray-200 bg-white/95 p-4 shadow-lg backdrop-blur-sm sm:block">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-gray-400">Map guide</p>
          <ul className="mt-2.5 space-y-2 text-[11px] leading-4 text-gray-500">
            <li><span className="font-semibold text-gray-700">Dark outline:</span> India and state boundaries</li>
            <li><span className="font-semibold text-gray-700">Colored circles:</span> project risk severity</li>
            <li><span className="font-semibold text-gray-700">Click a marker:</span> open the case record</li>
          </ul>
        </div>
      )}
    </div>
  );
}
