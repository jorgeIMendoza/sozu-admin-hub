import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { CheckCircle2, Crosshair, PencilRuler, RefreshCw, Scissors, Trash2, Plus } from "lucide-react";

export type MeshPoint = [number, number];

export interface MeshRegion {
  unit_number: string;
  polygon: MeshPoint[];
  mesh_confirmed?: boolean;
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
}

type DragState = PointDragState | EdgeDragState | RegionDragState;

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
    }))
    .filter((region) => region.unit_number.length > 0 && region.polygon.length >= 3);
};

const getPolygonPoints = (polygon: MeshPoint[]) => polygon.map((point) => `${point[0]},${point[1]}`).join(" ");

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

const midpoint = (a: MeshPoint, b: MeshPoint): MeshPoint => [
  (a[0] + b[0]) / 2,
  (a[1] + b[1]) / 2,
];

const distToSegment = (p: MeshPoint, a: MeshPoint, b: MeshPoint): number => {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
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
        return { ...region, polygon };
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
          ? { ...region, polygon: asRectangularPolygon(region.polygon as MeshPoint[]) }
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
        return { ...region, polygon: poly };
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
        return { ...region, polygon: poly };
      })
    );
  };

  // Add new empty region
  const handleAddRegion = () => {
    const newRegion: MeshRegion = {
      unit_number: `${regions.length + 1}`,
      polygon: [[25, 25], [75, 25], [75, 75], [25, 75]],
      mesh_confirmed: false,
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

  // Build edge lines for selected region with interactive hit areas
  const selectedEdges = useMemo(() => {
    if (!selectedRegion) return [];
    return selectedRegion.polygon.map((pt, i) => {
      const next = selectedRegion.polygon[(i + 1) % selectedRegion.polygon.length];
      return { a: pt, b: next, indexA: i, indexB: (i + 1) % selectedRegion.polygon.length };
    });
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
              Arrastra puntos, aristas o la malla completa. Doble clic en una arista para dividirla. Clic derecho en un punto para eliminarlo.
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
                      return (
                        <g key={`${region.unit_number}-${regionIndex}`}>
                          <polygon
                            points={getPolygonPoints(region.polygon as MeshPoint[])}
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
                              });
                            }}
                            className={isSelected ? "cursor-move transition-opacity" : "cursor-pointer transition-opacity"}
                          />

                          {/* Edge hit areas for selected region — draggable edges + double click to split */}
                          {isSelected &&
                            selectedEdges.map((edge, ei) => {
                              const mx = (edge.a[0] + edge.b[0]) / 2;
                              const my = (edge.a[1] + edge.b[1]) / 2;
                              return (
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
                                  onDoubleClick={(event) => {
                                    event.preventDefault();
                                    event.stopPropagation();
                                    handleSplitEdge(selectedRegionIndex, edge.indexA);
                                  }}
                                />
                              );
                            })}

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

                          {/* Split-edge midpoint indicators for selected region */}
                          {isSelected &&
                            selectedEdges.map((edge, ei) => (
                              <circle
                                key={`mid-${ei}`}
                                cx={(edge.a[0] + edge.b[0]) / 2}
                                cy={(edge.a[1] + edge.b[1]) / 2}
                                r={0.8}
                                fill="hsl(var(--primary) / 0.3)"
                                stroke="hsl(var(--primary) / 0.5)"
                                strokeWidth={0.3}
                                className="cursor-pointer"
                                onClick={(event) => {
                                  event.preventDefault();
                                  event.stopPropagation();
                                  handleSplitEdge(selectedRegionIndex, edge.indexA);
                                }}
                              />
                            ))}
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
                        {region.polygon.length} vértices
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
