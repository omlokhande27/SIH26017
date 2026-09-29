import { useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import type { DelayBand, StateDelayPerformance } from '@/types';
import indiaStatesRaw from '@/assets/india-states.geojson?raw';

interface StateProperties {
  name: string;
  type?: string;
}

type Position = [number, number];

const indiaStates = JSON.parse(indiaStatesRaw) as GeoJSON.FeatureCollection<
  GeoJSON.Geometry,
  StateProperties
>;

/** Longitude/latitude window for India, with a little padding so nothing clips. */
const BOUNDS = { minLon: 66.8, maxLon: 99.2, minLat: 4.8, maxLat: 37.6 };
const VIEW_WIDTH = 620;
const VIEW_HEIGHT = 640;

const BAND_FILL: Record<DelayBand, string> = {
  severe: '#B91C1C',
  high: '#EA580C',
  moderate: '#EAB308',
  contained: '#22C55E',
};

const UNRECORDED_FILL = '#E5E9EF';
const BORDER = '#FFFFFF';

const DELAY_BAND_ORDER: DelayBand[] = ['severe', 'high', 'moderate', 'contained'];

const DELAY_BAND_LABELS: Record<DelayBand, string> = {
  severe: 'Very high',
  high: 'High',
  moderate: 'Medium',
  contained: 'Low',
};

/**
 * Equirectangular projection with a cos(lat) correction so the outline is not
 * visibly stretched. Good enough for a country-scale choropleth and keeps the
 * component dependency-free.
 */
function project(lon: number, lat: number): Position {
  const midLat = ((BOUNDS.minLat + BOUNDS.maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(midLat);

  const usableW = (BOUNDS.maxLon - BOUNDS.minLon) * kx;
  const usableH = BOUNDS.maxLat - BOUNDS.minLat;

  // Fit the tighter of the two axes, then centre the other.
  const scale = Math.min(VIEW_WIDTH / usableW, VIEW_HEIGHT / usableH);
  const offsetX = (VIEW_WIDTH - usableW * scale) / 2;
  const offsetY = (VIEW_HEIGHT - usableH * scale) / 2;

  const x = offsetX + (lon - BOUNDS.minLon) * kx * scale;
  const y = offsetY + (BOUNDS.maxLat - lat) * scale;
  return [Math.round(x * 100) / 100, Math.round(y * 100) / 100];
}

function ringToPath(ring: Position[]): string {
  if (ring.length === 0) return '';
  const projected = ring.map(([lon, lat]) => project(lon, lat));
  const [first, ...rest] = projected;
  return `M${first[0]},${first[1]}L${rest.map(([x, y]) => `${x},${y}`).join('L')}Z`;
}

function polygonToPath(rings: Position[][]): string {
  // Only the outer ring is filled; interior rings stay unfilled so enclaves
  // and islands do not get painted over.
  const [outer, ...holes] = rings;
  if (!outer) return '';
  const path = ringToPath(outer);
  if (holes.length === 0) return path;
  return `${path}${holes.map((hole) => ringToPath(hole)).join('')}`;
}

function geometryToPath(geometry: GeoJSON.Geometry): string {
  if (geometry.type === 'Polygon') {
    return polygonToPath(geometry.coordinates as Position[][]);
  }
  if (geometry.type === 'MultiPolygon') {
    return (geometry.coordinates as Position[][][])
      .map((polygon) => polygonToPath(polygon))
      .join('');
  }
  return '';
}

interface StateShape {
  name: string;
  d: string;
}

const STATE_SHAPES: StateShape[] = indiaStates.features.map((feature) => ({
  name: feature.properties?.name ?? '',
  d: geometryToPath(feature.geometry),
}));

export interface IndiaDelayMapProps {
  rows: StateDelayPerformance[];
  onStateSelect?: (state: string) => void;
  className?: string;
  legend?: ReactNode;
}

/**
 * Static India-only choropleth. No base map and no neighbouring countries, so
 * the dashboard card shows nothing but India shaded by average state delay.
 */
export function IndiaDelayMap({ rows, onStateSelect, className, legend }: IndiaDelayMapProps) {
  const [hovered, setHovered] = useState<string | null>(null);

  const byName = useMemo(
    () => new Map(rows.map((row) => [row.state, row] as const)),
    [rows],
  );

  const active = hovered ? byName.get(hovered) : undefined;

  return (
    <div className={cn('flex h-full flex-col items-center gap-3', className)}>
      <div className="relative flex min-h-0 w-full flex-1 items-center justify-center">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          className="h-full max-h-full w-auto max-w-full"
          role="img"
          aria-label="India shaded by average predicted delay per state"
        >
          {STATE_SHAPES.map((shape) => {
            const row = byName.get(shape.name);
            const fill = row ? BAND_FILL[row.band] : UNRECORDED_FILL;
            const isHovered = hovered === shape.name;
            const isClickable = Boolean(row && onStateSelect);

            return (
              <path
                key={shape.name}
                d={shape.d}
                fill={fill}
                fillRule="evenodd"
                stroke={isHovered ? '#0F172A' : BORDER}
                strokeWidth={isHovered ? 2.5 : 1.2}
                vectorEffect="non-scaling-stroke"
                className={cn(
                  'transition-[stroke,stroke-width] duration-150',
                  isClickable && 'cursor-pointer',
                )}
                onMouseEnter={() => setHovered(shape.name)}
                onMouseLeave={() => setHovered((prev) => (prev === shape.name ? null : prev))}
                onClick={() => {
                  if (row && onStateSelect) onStateSelect(shape.name);
                }}
              >
                <title>
                  {row
                    ? `${shape.name}: ${row.averageDelayDays} days average delay across ${row.projectCount} project${row.projectCount === 1 ? '' : 's'}`
                    : `${shape.name}: no projects recorded`}
                </title>
              </path>
            );
          })}
        </svg>

        {active && (
          <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 whitespace-nowrap rounded-lg border border-gray-200 bg-white px-3 py-2 text-center shadow-lg">
            <p className="text-xs font-bold text-gray-900">{active.state}</p>
            <p className="mt-0.5 text-[11px] text-gray-600">
              {active.averageDelayDays} days average · {DELAY_BAND_LABELS[active.band]}
            </p>
            <p className="text-[10px] text-gray-400">
              {active.projectCount} project{active.projectCount === 1 ? '' : 's'}
            </p>
          </div>
        )}
      </div>

      {legend ?? <DefaultLegend rows={rows} />}
    </div>
  );
}

function DefaultLegend({ rows }: { rows: StateDelayPerformance[] }) {
  return (
    <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      {DELAY_BAND_ORDER.map((band) => {
        const count = rows.filter((row) => row.band === band).length;
        if (count === 0) return null;
        return (
          <li key={band} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: BAND_FILL[band] }}
            />
            <span className="text-[11px] font-medium text-gray-700">
              {DELAY_BAND_LABELS[band]}
            </span>
            <span className="text-[11px] font-bold text-gray-900 tabular-nums">{count}</span>
          </li>
        );
      })}
      <li className="flex items-center gap-1.5">
        <span
          className="h-2.5 w-2.5 rounded-full border border-gray-300"
          style={{ backgroundColor: UNRECORDED_FILL }}
        />
        <span className="text-[11px] text-gray-500">No projects</span>
      </li>
    </ul>
  );
}
