import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Crosshair, PencilRuler, RefreshCw, Trash2, Plus } from "lucide-react";

export type MeshPoint = [number, number];

export interface MeshRegion {
  unit_number: string;
  polygon: MeshPoint[];
  mesh_confirmed?: boolean;
  /** Quadratic bezier control points keyed by edge start index (as string) */
  curves?: Record<string, MeshPoint>;
}

interface FloorMeshEditorDialogProps {
  open: boolean;
  imageUrl: string | null;
  title?: string;
  initialRegions: MeshRegion[];
  onOpenChange: (open: boolean) => void;
  onSave: (regions: MeshRegion[]) => void;
  onRecalculate?: () => void;
  recalculating?: boolean;
}

interface PointDragState {
  mode: "point";
  regionIndex: number;
  pointIndex: number;
}

interface EdgeDragState {
  mode: "edge";
  regionIndex: number;
  pointIndexA: number;
  pointIndexB: number;
  originPointer: MeshPoint;
  originA: MeshPoint;
  originB: MeshPoint;
}

interface RegionDragState {
  mode: "region";
  regionIndex: number;
  originPointer: MeshPoint;
  originPolygon: MeshPoint[];
  originCurves: Record<string, MeshPoint>;
}

interface CurveDragState {
  mode: "curve";
  regionIndex: number;
  edgeKey: string;
}

type DragState = PointDragState | EdgeDragState | RegionDragState | CurveDragState;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const resolveMeshConfirmed = (region: Partial<MeshRegion> & { confirmed?: boolean }) => {
  if (typeof region.mesh_confirmed === "boolean") return region.mesh_confirmed;
  if (typeof region.confirmed === "boolean") return region.confirmed;
  return true;
};

const normalizeRegions = (regions: MeshRegion[]): MeshRegion[] => {
  return regions
    .map((region) => ({
      unit_number: (region.unit_number || "").toString().trim(),
      polygon: (region.polygon || [])
        .map((point) => [
          clamp(Number(point?.[0] ?? 0), 0, 100),
          clamp(Number(point?.[1] ?? 0), 0, 100),
        ] as MeshPoint)
        .filter((point) => Number.isFinite(point[0]) && Number.isFinite(point[1])),
      mesh_confirmed: resolveMeshConfirmed(region),
      curves: region.curves || {},
    }))
    .filter((region) => region.unit_number.length > 0 && region.polygon.length >= 3);
};

const midpoint = (a: MeshPoint, b: MeshPoint): MeshPoint => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

/** Build SVG path `d` attribute supporting optional quadratic bezier curves */
const getPathD = (polygon: MeshPoint[], curves?: Record<string, MeshPoint>): string => {
  if (polygon.length < 3) return "";
  let d = `M ${polygon[0][0]},${polygon[0][1]}`;
  for (let i = 0; i < polygon.length; i++) {
    const nextIdx = (i + 1) % polygon.length;
    const cp = curves?.[String(i)];
    if (cp) {
      d += ` Q ${cp[0]},${cp[1]} ${polygon[nextIdx][0]},${polygon[nextIdx][1]}`;
    } else {
      d += ` L ${polygon[nextIdx][0]},${polygon[nextIdx][1]}`;
    }
  }
  d += " Z";
  return d;
};

const asRectangularPolygon = (polygon: MeshPoint[]): MeshPoint[] => {
  const xs = polygon.map((point) => point[0]);
  const ys = polygon.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
  ];
};

/** Shift curve keys when a point is inserted or removed */
const shiftCurveKeys = (
  curves: Record<string, MeshPoint>,
  fromIndex: number,
  delta: number
): Record<string, MeshPoint> => {
  const result: Record<string, MeshPoint> = {};
  for (const [key, value] of Object.entries(curves)) {
    const idx = Number(key);
    if (idx >= fromIndex) {
      result[String(idx + delta)] = value;
    } else {
      result[key] = value;
    }
  }
  return result;
};

export const FloorMeshEditorDialog = ({
  open,
  imageUrl,
  title,
  initialRegions,
  onOpenChange,
  onSave,
  onRecalculate,
  recalculating,
}: FloorMeshEditorDialogProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [regions, setRegions] = useState<MeshRegion[]>([]);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number>(0);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [imageAspect, setImageAspect] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeRegions(initialRegions || []);
    setRegions(normalized);
    setSelectedRegionIndex(0);
    setDragState(null);
    setImageAspect(null);
  }, [open, initialRegions]);

  useEffect(() => {
    if (!open || !imageUrl) return;
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setImageAspect(img.naturalWidth / img.naturalHeight);
      }
    };
    img.src = imageUrl;
  }, [open, imageUrl]);

  const selectedRegion = useMemo(() => regions[selectedRegionIndex] || null, [regions, selectedRegionIndex]);

  const getPointerCoordinates = (clientX: number, clientY: number): MeshPoint | null => {
    if (!svgRef.current) return null;
    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return null;
    return [
      clamp(((clientX - rect.left) / rect.width) * 100, 0, 100),
      clamp(((clientY - rect.top) / rect.height) * 100, 0, 100),
    ];
  };

  const updatePointPosition = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState) return;
    const pointer = getPointerCoordinates(event.clientX, event.clientY);
    if (!pointer) return;

    if (dragState.mode === "point") {
      setRegions((prev) =>
        prev.map((region, ri) => {
          if (ri !== dragState.regionIndex) return region;
          const polygon = region.polygon.map((pt, pi) =>
            pi === dragState.pointIndex ? (pointer as MeshPoint) : pt
          );
          return { ...region, polygon };
        })
      );
      return;
    }

    if (dragState.mode === "curve") {
      setRegions((prev) =>
        prev.map((region, ri) => {
          if (ri !== dragState.regionIndex) return region;
          const curves = { ...(region.curves || {}), [dragState.edgeKey]: pointer };
          return { ...region, curves };
        })
      );
      return;
    }

    if (dragState.mode === "edge") {
      const [cx, cy] = pointer;
      const dx = cx - dragState.originPointer[0];
      const dy = cy - dragState.originPointer[1];
      setRegions((prev) =>
        prev.map((region, ri) => {
          if (ri !== dragState.regionIndex) return region;
          const polygon = region.polygon.map((pt, pi) => {
            if (pi === dragState.pointIndexA) {
              return [clamp(dragState.originA[0] + dx, 0, 100), clamp(dragState.originA[1] + dy, 0, 100)] as MeshPoint;
            }
            if (pi === dragState.pointIndexB) {
              return [clamp(dragState.originB[0] + dx, 0, 100), clamp(dragState.originB[1] + dy, 0, 100)] as MeshPoint;
            }
            return pt;
          });
          return { ...region, polygon };
        })
      );
      return;
    }

    // region drag
    const [currentX, currentY] = pointer;
    const [originX, originY] = dragState.originPointer;
    const deltaX = currentX - originX;
    const deltaY = currentY - originY;
    setRegions((prev) =>
      prev.map((region, ri) => {
        if (ri !== dragState.regionIndex) return region;
        const polygon = dragState.originPolygon.map(([x, y]) => [
          clamp(x + deltaX, 0, 100),
          clamp(y + deltaY, 0, 100),
        ] as MeshPoint);
        // Also move curve control points
        const curves: Record<string, MeshPoint> = {};
        for (const [key, cp] of Object.entries(dragState.originCurves)) {
          curves[key] = [clamp(cp[0] + deltaX, 0, 100), clamp(cp[1] + deltaY, 0, 100)];
        }
        return { ...region, polygon, curves };
      })
    );
  };

  const updateRegionUnit = (index: number, unit: string) => {
    setRegions((prev) => prev.map((region, i) => (i === index ? { ...region, unit_number: unit } : region)));
  };

  const handleRectangularizeSelected = () => {
    if (!selectedRegion) return;
    setRegions((prev) =>
      prev.map((region, index) =>
        index === selectedRegionIndex
          ? { ...region, polygon: asRectangularPolygon(region.polygon as MeshPoint[]), curves: {} }
          : region
      )
    );
  };

  const handleToggleSelectedConfirmation = () => {
    if (!selectedRegion) return;
    setRegions((prev) =>
      prev.map((region, index) =>
        index === selectedRegionIndex
          ? { ...region, mesh_confirmed: !resolveMeshConfirmed(region) }
          : region
      )
    );
  };

  // Split an edge by inserting a midpoint
  const handleSplitEdge = (regionIndex: number, edgeStartIndex: number) => {
    setRegions((prev) =>
      prev.map((region, ri) => {
        if (ri !== regionIndex) return region;
        const poly = [...region.polygon];
        const a = poly[edgeStartIndex];
        const b = poly[(edgeStartIndex + 1) % poly.length];
        const mid = midpoint(a, b);
        poly.splice(edgeStartIndex + 1, 0, mid);
        // Update curve keys: remove curve for split edge, shift keys after
        const oldCurves = { ...(region.curves || {}) };
        delete oldCurves[String(edgeStartIndex)];
        const newCurves = shiftCurveKeys(oldCurves, edgeStartIndex + 1, 1);
        return { ...region, polygon: poly, curves: newCurves };
      })
    );
  };

  // Toggle curve on an edge (add control point at midpoint, or remove it)
  const handleToggleCurve = (regionIndex: number, edgeStartIndex: number) => {
    setRegions((prev) =>
      prev.map((region, ri) => {
        if (ri !== regionIndex) return region;
        const curves = { ...(region.curves || {}) };
        const key = String(edgeStartIndex);
        if (curves[key]) {
          // Remove curve
          delete curves[key];
        } else {
          // Add curve control point at midpoint offset perpendicular
          const a = region.polygon[edgeStartIndex];
          const b = region.polygon[(edgeStartIndex + 1) % region.polygon.length];
          const mx = (a[0] + b[0]) / 2;
          const my = (a[1] + b[1]) / 2;
          // Offset perpendicular to the edge
          const dx = b[0] - a[0];
          const dy = b[1] - a[1];
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const offset = Math.min(len * 0.3, 8);
          curves[key] = [clamp(mx + nx * offset, 0, 100), clamp(my + ny * offset, 0, 100)];
        }
        return { ...region, curves };
      })
    );
  };

  // Delete a point (only if polygon has > 3 points)
  const handleDeletePoint = (regionIndex: number, pointIndex: number) => {
    setRegions((prev) =>
      prev.map((region, ri) => {
        if (ri !== regionIndex) return region;
        if (region.polygon.length <= 3) return region;
        const poly = region.polygon.filter((_, pi) => pi !== pointIndex);
        // Remove curves for edges touching this point, then shift
        const oldCurves = { ...(region.curves || {}) };
        const prevEdge = (pointIndex - 1 + region.polygon.length) % region.polygon.length;
        delete oldCurves[String(prevEdge)];
        delete oldCurves[String(pointIndex)];
        // Shift keys after deleted point
        const newCurves: Record<string, MeshPoint> = {};
        for (const [key, value] of Object.entries(oldCurves)) {
          const idx = Number(key);
          if (idx > pointIndex) {
            newCurves[String(idx - 1)] = value;
          } else {
            newCurves[key] = value;
          }
        }
        return { ...region, polygon: poly, curves: newCurves };
      })
    );
  };

  // Add new empty region
  const handleAddRegion = () => {
    const nextNum = regions.length + 1;
    const newRegion: MeshRegion = {
      unit_number: nextNum.toString().padStart(2, "0"),
      polygon: [[25, 25], [75, 25], [75, 75], [25, 75]],
      mesh_confirmed: false,
      curves: {},
    };
    setRegions((prev) => [...prev, newRegion]);
    setSelectedRegionIndex(regions.length);
  };

  // Delete selected region
  const handleDeleteRegion = () => {
    if (regions.length === 0) return;
    setRegions((prev) => prev.filter((_, i) => i !== selectedRegionIndex));
    setSelectedRegionIndex((prev) => Math.max(0, prev - 1));
  };

  const handleSave = () => {
    const normalized = normalizeRegions(regions);
    onSave(normalized);
  };

  // Build edge data for selected region
  const selectedEdges = useMemo(() => {
    if (!selectedRegion) return [];
    return selectedRegion.polygon.map((pt, i) => {
      const next = selectedRegion.polygon[(i + 1) % selectedRegion.polygon.length];
      const hasCurve = !!(selectedRegion.curves || {})[String(i)];
      const cp = (selectedRegion.curves || {})[String(i)] || null;
      return { a: pt, b: next, indexA: i, indexB: (i + 1) % selectedRegion.polygon.length, hasCurve, cp };
    });
  }, [selectedRegion]);

  // Count curves for the selected region
  const curveCount = useMemo(() => {
    if (!selectedRegion?.curves) return 0;
    return Object.keys(selectedRegion.curves).length;
  }, [selectedRegion]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[1100px] max-h-[90vh] p-0 gap-0 overflow-hidden">
        <div className="px-5 py-3 border-b border-border bg-muted/20">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base">
              <PencilRuler className="h-4 w-4 text-primary" />
              {title || "Editor de malla por departamento"}
            </DialogTitle>
          </DialogHeader>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] max-h-[calc(90vh-110px)]">
          <div className="p-4 border-b lg:border-b-0 lg:border-r border-border overflow-auto">
            <p className="text-xs text-muted-foreground mb-3">
              Arrastra puntos, aristas o la malla completa. En cada arista: <strong>+</strong> agrega un vértice, <strong>⌒</strong> curva la arista. Clic derecho en un punto para eliminarlo.
            </p>

            <div className="rounded-lg border border-border bg-muted/10 overflow-hidden">
              {imageUrl ? (
                <div
                  className="relative w-full"
                  style={{ aspectRatio: imageAspect ? `${imageAspect}` : "16 / 9" }}
                >
                  <svg
                    ref={svgRef}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full"
                    style={{ zIndex: 1 }}
                    onPointerMove={updatePointPosition}
                    onPointerUp={() => setDragState(null)}
                    onPointerLeave={() => setDragState(null)}
                  >
                    <image
                      href={imageUrl}
                      x="0"
                      y="0"
                      width="100"
                      height="100"
                      preserveAspectRatio="none"
                      style={{ pointerEvents: "none" }}
                    />

                    {regions.map((region, regionIndex) => {
                      const isSelected = regionIndex === selectedRegionIndex;
                      const pathD = getPathD(region.polygon as MeshPoint[], region.curves);

                      return (
                        <g key={`${region.unit_number}-${regionIndex}`}>
                          {/* Region shape (path supports curves) */}
                          <path
                            d={pathD}
                            fill={isSelected ? "hsl(var(--primary) / 0.22)" : "hsl(var(--muted) / 0.28)"}
                            stroke={isSelected ? "hsl(var(--primary))" : "hsl(var(--border))"}
                            strokeWidth={isSelected ? 0.8 : 0.55}
                            onClick={() => setSelectedRegionIndex(regionIndex)}
                            onPointerDown={(event) => {
                              const pointer = getPointerCoordinates(event.clientX, event.clientY);
                              if (!pointer) return;
                              event.preventDefault();
                              event.stopPropagation();
                              setSelectedRegionIndex(regionIndex);
                              setDragState({
                                mode: "region",
                                regionIndex,
                                originPointer: pointer,
                                originPolygon: region.polygon.map((p) => [p[0], p[1]] as MeshPoint),
                                originCurves: { ...(region.curves || {}) },
                              });
                            }}
                            className={isSelected ? "cursor-move transition-opacity" : "cursor-pointer transition-opacity"}
                          />

                          {/* Edge hit areas for dragging edges */}
                          {isSelected &&
                            selectedEdges.map((edge, ei) => (
                              <line
                                key={`edge-${ei}`}
                                x1={edge.a[0]}
                                y1={edge.a[1]}
                                x2={edge.b[0]}
                                y2={edge.b[1]}
                                stroke="transparent"
                                strokeWidth={2.5}
                                className="cursor-move"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  const pointer = getPointerCoordinates(event.clientX, event.clientY);
                                  if (!pointer) return;
                                  setDragState({
                                    mode: "edge",
                                    regionIndex: selectedRegionIndex,
                                    pointIndexA: edge.indexA,
                                    pointIndexB: edge.indexB,
                                    originPointer: pointer,
                                    originA: [edge.a[0], edge.a[1]],
                                    originB: [edge.b[0], edge.b[1]],
                                  });
                                }}
                              />
                            ))}

                          {/* Vertex handles */}
                          {isSelected &&
                            region.polygon.map((point, pointIndex) => (
                              <circle
                                key={`${region.unit_number}-pt-${pointIndex}`}
                                cx={point[0]}
                                cy={point[1]}
                                r={1.35}
                                fill="hsl(var(--background))"
                                stroke="hsl(var(--primary))"
                                strokeWidth={0.55}
                                className="cursor-move"
                                onPointerDown={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  setSelectedRegionIndex(regionIndex);
                                  setDragState({ mode: "point", regionIndex, pointIndex });
                                }}
                                onContextMenu={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleDeletePoint(regionIndex, pointIndex);
                                }}
                              />
                            ))}

                          {/* Curve control point handles + guide lines */}
                          {isSelected &&
                            selectedEdges
                              .filter((edge) => edge.hasCurve && edge.cp)
                              .map((edge) => {
                                const cp = edge.cp!;
                                return (
                                  <g key={`curve-cp-${edge.indexA}`}>
                                    {/* Guide lines from control point to endpoints */}
                                    <line
                                      x1={edge.a[0]} y1={edge.a[1]}
                                      x2={cp[0]} y2={cp[1]}
                                      stroke="hsl(var(--primary) / 0.3)"
                                      strokeWidth={0.3}
                                      strokeDasharray="1,0.5"
                                      className="pointer-events-none"
                                    />
                                    <line
                                      x1={edge.b[0]} y1={edge.b[1]}
                                      x2={cp[0]} y2={cp[1]}
                                      stroke="hsl(var(--primary) / 0.3)"
                                      strokeWidth={0.3}
                                      strokeDasharray="1,0.5"
                                      className="pointer-events-none"
                                    />
                                    {/* Control point handle (diamond shape) */}
                                    <g
                                      className="cursor-move"
                                      onPointerDown={(event) => {
                                        event.preventDefault();
                                        event.stopPropagation();
                                        setDragState({
                                          mode: "curve",
                                          regionIndex: selectedRegionIndex,
                                          edgeKey: String(edge.indexA),
                                        });
                                      }}
                                    >
                                      <circle
                                        cx={cp[0]} cy={cp[1]}
                                        r={2.5}
                                        fill="transparent"
                                      />
                                      <rect
                                        x={cp[0] - 1}
                                        y={cp[1] - 1}
                                        width={2}
                                        height={2}
                                        transform={`rotate(45 ${cp[0]} ${cp[1]})`}
                                        fill="hsl(var(--primary) / 0.25)"
                                        stroke="hsl(var(--primary))"
                                        strokeWidth={0.35}
                                      />
                                    </g>
                                  </g>
                                );
                              })}

                          {/* Midpoint dual actions: Split (+) and Curve (⌒) */}
                          {isSelected &&
                            selectedEdges.map((edge, ei) => {
                              const mx = (edge.a[0] + edge.b[0]) / 2;
                              const my = (edge.a[1] + edge.b[1]) / 2;
                              // Calculate perpendicular direction for positioning the two buttons
                              const dx = edge.b[0] - edge.a[0];
                              const dy = edge.b[1] - edge.a[1];
                              const len = Math.hypot(dx, dy) || 1;
                              // Along-edge offset for the two buttons
                              const ax = (dx / len) * 1.8;
                              const ay = (dy / len) * 1.8;

                              return (
                                <g key={`mid-actions-${ei}`}>
                                  {/* Split button (add vertex) - offset backward along edge */}
                                  <g
                                    className="cursor-copy"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleSplitEdge(selectedRegionIndex, edge.indexA);
                                    }}
                                  >
                                    <circle
                                      cx={mx - ax} cy={my - ay}
                                      r={2.2}
                                      fill="transparent"
                                    />
                                    <circle
                                      cx={mx - ax} cy={my - ay}
                                      r={1.15}
                                      fill="hsl(var(--background))"
                                      stroke="hsl(var(--primary))"
                                      strokeWidth={0.3}
                                    />
                                    {/* Plus sign */}
                                    <line
                                      x1={mx - ax - 0.55} y1={my - ay}
                                      x2={mx - ax + 0.55} y2={my - ay}
                                      stroke="hsl(var(--primary))"
                                      strokeWidth={0.25}
                                      className="pointer-events-none"
                                    />
                                    <line
                                      x1={mx - ax} y1={my - ay - 0.55}
                                      x2={mx - ax} y2={my - ay + 0.55}
                                      stroke="hsl(var(--primary))"
                                      strokeWidth={0.25}
                                      className="pointer-events-none"
                                    />
                                  </g>

                                  {/* Curve toggle button - offset forward along edge */}
                                  <g
                                    className="cursor-pointer"
                                    onClick={(event) => {
                                      event.preventDefault();
                                      event.stopPropagation();
                                      handleToggleCurve(selectedRegionIndex, edge.indexA);
                                    }}
                                  >
                                    <circle
                                      cx={mx + ax} cy={my + ay}
                                      r={2.2}
                                      fill="transparent"
                                    />
                                    <circle
                                      cx={mx + ax} cy={my + ay}
                                      r={1.15}
                                      fill={edge.hasCurve ? "hsl(var(--primary) / 0.2)" : "hsl(var(--background))"}
                                      stroke={edge.hasCurve ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                                      strokeWidth={0.3}
                                    />
                                    {/* Arc symbol ⌒ */}
                                    <path
                                      d={`M ${mx + ax - 0.5},${my + ay + 0.15} Q ${mx + ax},${my + ay - 0.55} ${mx + ax + 0.5},${my + ay + 0.15}`}
                                      fill="none"
                                      stroke={edge.hasCurve ? "hsl(var(--primary))" : "hsl(var(--muted-foreground))"}
                                      strokeWidth={0.25}
                                      className="pointer-events-none"
                                    />
                                  </g>
                                </g>
                              );
                            })}
                        </g>
                      );
                    })}
                  </svg>
                </div>
              ) : (
                <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">
                  Sin imagen para enmallar.
                </div>
              )}
            </div>
          </div>

          <div className="bg-muted/10 flex flex-col overflow-hidden">
            <div className="p-4 pb-0 flex-shrink-0">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-foreground">Departamentos detectados</p>
                <span className="text-[10px] text-muted-foreground">{regions.length} regiones</span>
              </div>

              <div className="flex flex-col gap-1.5 mb-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={handleRectangularizeSelected}
                  disabled={!selectedRegion}
                >
                  <Crosshair className="h-3.5 w-3.5 mr-1.5" />
                  Rectangularizar seleccionado
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full text-xs"
                  onClick={handleToggleSelectedConfirmation}
                  disabled={!selectedRegion}
                >
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                  {resolveMeshConfirmed(selectedRegion || {})
                    ? "Marcar como pendiente"
                    : "Confirmar malla seleccionada"}
                </Button>
                <div className="flex gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs"
                    onClick={handleAddRegion}
                  >
                    <Plus className="h-3.5 w-3.5 mr-1" />
                    Agregar
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex-1 text-xs text-destructive hover:text-destructive"
                    onClick={handleDeleteRegion}
                    disabled={regions.length === 0}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    Eliminar
                  </Button>
                </div>
                {onRecalculate && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full text-xs"
                    onClick={onRecalculate}
                    disabled={recalculating}
                  >
                    <RefreshCw className={`h-3.5 w-3.5 mr-1.5 ${recalculating ? "animate-spin" : ""}`} />
                    {recalculating ? "Recalculando…" : "Recalcular mallas (IA)"}
                  </Button>
                )}
              </div>
            </div>

            <ScrollArea className="flex-1 min-h-0 px-4 pb-4">
              <div className="space-y-2 pr-1">
                {regions.map((region, index) => {
                  const isSelected = index === selectedRegionIndex;
                  const isConfirmed = resolveMeshConfirmed(region);
                  const regionCurveCount = Object.keys(region.curves || {}).length;
                  return (
                    <button
                      type="button"
                      key={`${region.unit_number}-${index}`}
                      onClick={() => setSelectedRegionIndex(index)}
                      className={`w-full text-left border rounded-md p-2 transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <p className="text-[10px] text-muted-foreground">Unidad</p>
                        <span
                           className={isConfirmed
                             ? "text-[10px] px-1.5 py-0.5 rounded border bg-success/15 text-success border-success/30"
                             : "text-[10px] px-1.5 py-0.5 rounded border border-border bg-muted text-muted-foreground"}
                        >
                          {isConfirmed ? "Confirmada" : "Pendiente"}
                        </span>
                      </div>
                      <Input
                        value={region.unit_number}
                        onChange={(event) => updateRegionUnit(index, event.target.value)}
                        className="h-8 text-xs"
                      />
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {region.polygon.length} vértices{regionCurveCount > 0 ? ` · ${regionCurveCount} curva${regionCurveCount > 1 ? "s" : ""}` : ""}
                      </p>
                    </button>
                  );
                })}
              </div>
            </ScrollArea>
          </div>
        </div>

        <div className="px-5 py-3 border-t border-border bg-muted/20 flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button size="sm" onClick={handleSave} disabled={regions.length === 0}>
            Guardar malla
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
