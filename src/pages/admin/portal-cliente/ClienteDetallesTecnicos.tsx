import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { useClientePropiedadDetalle } from "@/hooks/useClientePropiedadDetalle";
import { useRef, useEffect, useState } from "react";

const TechCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="bg-card rounded-2xl border border-border overflow-hidden">
    <div className="px-4 py-3 border-b border-border">
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
    </div>
    <div className="p-4 bg-muted/20">
      {children}
    </div>
  </div>
);

const FloorPlanCanvas = ({
  imageUrl,
  regiones,
  highlightUnit,
  fullPropertyNumber,
}: {
  imageUrl: string;
  regiones: any[];
  highlightUnit: string;
  fullPropertyNumber?: string;
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const imgRef = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      imgRef.current = img;
      setImageLoaded(true);
    };
    img.src = imageUrl;
  }, [imageUrl]);

  useEffect(() => {
    if (!imageLoaded || !canvasRef.current || !imgRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const img = imgRef.current;
    const containerWidth = containerRef.current.clientWidth;
    const scale = containerWidth / img.width;
    const canvasHeight = img.height * scale;

    canvas.width = containerWidth;
    canvas.height = canvasHeight;

    ctx.drawImage(img, 0, 0, containerWidth, canvasHeight);

    if (regiones && regiones.length > 0 && highlightUnit) {
      const normalizeUnitValue = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return "";
        const withoutLeadingZeros = trimmed.replace(/^0+/, "");
        return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : "0";
      };

      const highlightRaw = highlightUnit.toString().trim();
      const highlightNormalized = normalizeUnitValue(highlightRaw);
      const fullRaw = fullPropertyNumber?.toString().trim() || "";
      const numericSuffix = fullRaw.match(/(\d{1,3})$/)?.[1] || "";
      const numericSuffixNormalized = numericSuffix ? normalizeUnitValue(numericSuffix) : "";

      const scoredRegions = regiones.map((region: any) => {
        const unitRaw = region.unit_number?.toString().trim() || "";
        const unitNormalized = normalizeUnitValue(unitRaw);

        let score = 0;
        if (unitRaw && unitRaw === highlightRaw) score = Math.max(score, 120);
        if (unitNormalized && unitNormalized === highlightNormalized) score = Math.max(score, 110);
        if (numericSuffix && unitRaw === numericSuffix) score = Math.max(score, 100);
        if (numericSuffixNormalized && unitNormalized === numericSuffixNormalized) score = Math.max(score, 95);
        if (fullRaw && unitRaw === fullRaw) score = Math.max(score, 80);

        return { region, score };
      });

      const selected = scoredRegions.sort((a, b) => b.score - a.score)[0];

      if (selected?.score > 0 && selected.region?.polygon?.length >= 3) {
        const points = selected.region.polygon.map((p: number[]) => [
          (p[0] / 100) * containerWidth,
          (p[1] / 100) * canvasHeight,
        ]);

        const xs = points.map((p: number[]) => p[0]);
        const ys = points.map((p: number[]) => p[1]);
        const minX = Math.min(...xs);
        const maxX = Math.max(...xs);
        const minY = Math.min(...ys);
        const maxY = Math.max(...ys);

        const boxWidth = maxX - minX;
        const boxHeight = maxY - minY;

        const paddingX = Math.max(boxWidth * 0.22, containerWidth * 0.012);
        const paddingY = Math.max(boxHeight * 0.35, canvasHeight * 0.02);

        const drawX = Math.max(0, minX - paddingX);
        const drawY = Math.max(0, minY - paddingY);
        const drawWidth = Math.min(containerWidth - drawX, boxWidth + paddingX * 2);
        const drawHeight = Math.min(canvasHeight - drawY, boxHeight + paddingY * 2);

        ctx.fillStyle = "rgba(34, 197, 94, 0.35)";
        ctx.fillRect(drawX, drawY, drawWidth, drawHeight);

        ctx.strokeStyle = "rgba(34, 197, 94, 0.9)";
        ctx.lineWidth = 3;
        ctx.strokeRect(drawX, drawY, drawWidth, drawHeight);
      }
    }
  }, [imageLoaded, regiones, highlightUnit, fullPropertyNumber]);

  return (
    <div ref={containerRef} className="w-full">
      <canvas ref={canvasRef} className="w-full rounded-lg" />
    </div>
  );
};

const ClienteDetallesTecnicos = () => {
  const { cuentaId } = useParams<{ cuentaId: string }>();
  const navigate = useNavigate();
  const { data: prop, isLoading } = useClientePropiedadDetalle(cuentaId ? Number(cuentaId) : null);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!prop) {
    return (
      <div className="max-w-lg mx-auto px-5 pt-6">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
          <ArrowLeft className="w-4 h-4" /> Regresar
        </button>
        <p className="text-muted-foreground">No se encontró la propiedad.</p>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto lg:max-w-2xl pb-24">
      {/* Sticky Header */}
      <div className="sticky top-0 z-30 bg-background border-b border-border px-5 py-3 flex items-center justify-between">
        <button onClick={() => navigate(-1)} className="flex items-center gap-2 text-sm text-foreground font-medium">
          <ArrowLeft className="w-4 h-4" />
          <div>
            <p className="font-semibold text-sm leading-tight">{prop.proyecto}</p>
            <p className="text-xs text-muted-foreground">Unidad {prop.unidad}</p>
          </div>
        </button>
        <span className="text-[11px] font-semibold px-3 py-1 rounded-full bg-[hsl(var(--inmob-green))]/15 text-[hsl(var(--inmob-green))]">
          • Detalles técnicos
        </span>
      </div>

      <div className="mx-5 mt-5 space-y-6">
        <div>
          <h2 className="font-bold text-lg text-foreground">Detalles técnicos</h2>
          <p className="text-xs text-[hsl(var(--inmob-green))] font-medium mt-1">Ficha técnica oficial del inmueble</p>
        </div>

        {/* 1. Detalles del Departamento */}
        <TechCard title="Detalles del departamento">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[11px] text-muted-foreground">Nivel</p>
              <p className="text-sm font-semibold text-foreground">Nivel {prop.numeroPiso || prop.unidad?.charAt(0) || "—"}</p>
            </div>
            <div>
              <p className="text-[11px] text-muted-foreground">Modelo</p>
              <p className="text-sm font-semibold text-foreground">{prop.modelo || prop.edificio || "—"}</p>
            </div>
          </div>
          <div className="mt-3">
            <p className="text-[11px] text-muted-foreground">Área total</p>
            <p className="text-sm font-semibold text-foreground">{prop.m2Total > 0 ? `${prop.m2Total.toFixed(1)} m²` : "—"}</p>
          </div>
        </TechCard>

        {/* 2. Plano de ubicación */}
        <TechCard title="Plano de ubicación">
          <div className="flex flex-col items-center justify-center min-h-[200px]">
            {prop.planoUbicacionUrl ? (
              <>
                <FloorPlanCanvas
                  imageUrl={prop.planoUbicacionUrl}
                  regiones={prop.planoUbicacionRegiones}
                  highlightUnit={prop.numeroDepa}
                  fullPropertyNumber={prop.unidad}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Nivel {prop.numeroPiso} — Depto. <span className="font-semibold text-foreground">{prop.numeroDepa}</span>
                </p>
              </>
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 w-full flex flex-col items-center justify-center gap-3">
                <MapPin className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide text-center">
                  Plano de ubicación no disponible
                </p>
              </div>
            )}
          </div>
        </TechCard>

        {/* 3. Plano arquitectónico */}
        <TechCard title="Plano arquitectónico">
          <div className="flex flex-col items-center justify-center min-h-[200px]">
            {prop.planoArquitectonico ? (
              <img
                src={prop.planoArquitectonico}
                alt="Plano arquitectónico del modelo"
                className="w-full object-contain rounded-lg"
              />
            ) : (
              <div className="border-2 border-dashed border-border rounded-xl p-8 w-full flex flex-col items-center justify-center gap-3">
                <MapPin className="w-10 h-10 text-muted-foreground/40" />
                <p className="text-xs font-semibold text-foreground uppercase tracking-wide text-center">
                  Plano arquitectónico del modelo
                </p>
              </div>
            )}
          </div>
        </TechCard>
      </div>
    </div>
  );
};

export default ClienteDetallesTecnicos;
