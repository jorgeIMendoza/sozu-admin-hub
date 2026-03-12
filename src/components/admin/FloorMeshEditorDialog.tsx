import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Crosshair, PencilRuler, RefreshCw } from "lucide-react";

export type MeshPoint = [number, number];

export interface MeshRegion {
  unit_number: string;
  polygon: MeshPoint[];
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

interface DragState {
  regionIndex: number;
  pointIndex: number;
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

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

export const FloorMeshEditorDialog = ({
  open,
  imageUrl,
  title,
  initialRegions,
  onOpenChange,
  onSave,
}: FloorMeshEditorDialogProps) => {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const [regions, setRegions] = useState<MeshRegion[]>([]);
  const [selectedRegionIndex, setSelectedRegionIndex] = useState<number>(0);
  const [dragState, setDragState] = useState<DragState | null>(null);

  useEffect(() => {
    if (!open) return;
    const normalized = normalizeRegions(initialRegions || []);
    setRegions(normalized);
    setSelectedRegionIndex(0);
    setDragState(null);
  }, [open, initialRegions]);

  const selectedRegion = useMemo(() => regions[selectedRegionIndex] || null, [regions, selectedRegionIndex]);

  const updatePointPosition = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragState || !svgRef.current) return;

    const rect = svgRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;

    const x = clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100);
    const y = clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100);

    setRegions((prev) =>
      prev.map((region, regionIndex) => {
        if (regionIndex !== dragState.regionIndex) return region;

        const polygon = region.polygon.map((point, pointIndex) =>
          pointIndex === dragState.pointIndex ? ([x, y] as MeshPoint) : point
        );

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

  const handleSave = () => {
    const normalized = normalizeRegions(regions);
    onSave(normalized);
  };

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

        <div className="grid grid-cols-1 lg:grid-cols-[1fr,280px] min-h-[520px]">
          <div className="p-4 border-b lg:border-b-0 lg:border-r border-border overflow-auto">
            <p className="text-xs text-muted-foreground mb-3">
              Ajusta cada vértice arrastrando los puntos. La malla guardada se usará para iluminar el depto exacto en Detalle Técnico.
            </p>

            <div className="relative rounded-lg border border-border bg-muted/10 overflow-hidden">
              {imageUrl ? (
                <>
                  <img src={imageUrl} alt="Plano para enmallado" className="w-full h-auto block select-none" draggable={false} />
                  <svg
                    ref={svgRef}
                    viewBox="0 0 100 100"
                    preserveAspectRatio="none"
                    className="absolute inset-0 w-full h-full"
                    onPointerMove={updatePointPosition}
                    onPointerUp={() => setDragState(null)}
                    onPointerLeave={() => setDragState(null)}
                  >
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
                            className="cursor-pointer transition-opacity"
                          />

                          {isSelected &&
                            region.polygon.map((point, pointIndex) => (
                              <circle
                                key={`${region.unit_number}-${pointIndex}`}
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
                                  setDragState({ regionIndex, pointIndex });
                                }}
                              />
                            ))}
                        </g>
                      );
                    })}
                  </svg>
                </>
              ) : (
                <div className="h-[360px] flex items-center justify-center text-sm text-muted-foreground">
                  Sin imagen para enmallar.
                </div>
              )}
            </div>
          </div>

          <div className="p-4 bg-muted/10 flex flex-col">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-foreground">Departamentos detectados</p>
              <span className="text-[10px] text-muted-foreground">{regions.length} regiones</span>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="mb-3 text-xs"
              onClick={handleRectangularizeSelected}
              disabled={!selectedRegion}
            >
              <Crosshair className="h-3.5 w-3.5 mr-1.5" />
              Rectangularizar seleccionado
            </Button>

            <ScrollArea className="flex-1 pr-1">
              <div className="space-y-2">
                {regions.map((region, index) => {
                  const isSelected = index === selectedRegionIndex;
                  return (
                    <button
                      type="button"
                      key={`${region.unit_number}-${index}`}
                      onClick={() => setSelectedRegionIndex(index)}
                      className={`w-full text-left border rounded-md p-2 transition-colors ${
                        isSelected ? "border-primary bg-primary/5" : "border-border bg-background"
                      }`}
                    >
                      <p className="text-[10px] text-muted-foreground mb-1">Unidad</p>
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
