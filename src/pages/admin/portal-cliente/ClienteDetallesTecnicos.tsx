import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Loader2, Download } from "lucide-react";
import { useClientePropiedadDetalle } from "@/hooks/useClientePropiedadDetalle";
import { useRef, useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

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

const resolveDeptoFromUnidad = (unidad: string, numeroPiso: number | null, fallback: string) => {
  const unidadRaw = (unidad || "").toString().trim();
  const unidadDigits = unidadRaw.replace(/\D/g, "");
  const pisoDigits = (numeroPiso?.toString() || "").replace(/\D/g, "");

  if (unidadDigits.length > 0) {
    if (pisoDigits.length > 0 && unidadDigits.startsWith(pisoDigits) && unidadDigits.length > pisoDigits.length) {
      const extracted = unidadDigits.slice(pisoDigits.length);
      return extracted.length === 1 ? extracted.padStart(2, "0") : extracted;
    }

    const fallbackSuffix = unidadDigits.slice(-2) || unidadDigits;
    return fallbackSuffix.length === 1 ? fallbackSuffix.padStart(2, "0") : fallbackSuffix;
  }

  return (fallback || "").toString().trim();
};

/** Renders a floor plan image on an offscreen canvas with highlighted polygon and returns data URL */
const renderFloorPlanToDataUrl = (
  imageUrl: string,
  regiones: any[],
  highlightUnit: string,
  fullPropertyNumber: string,
  width: number
): Promise<string | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = width / img.width;
      const canvasHeight = img.height * scale;

      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = canvasHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }

      ctx.drawImage(img, 0, 0, width, canvasHeight);

      if (regiones && regiones.length > 0 && (highlightUnit || fullPropertyNumber)) {
        const digitsOnly = (value: string) => value.replace(/\D/g, "");
        const normalizeUnitValue = (value: string) => {
          const trimmed = value.trim();
          if (!trimmed) return "";
          const w = trimmed.replace(/^0+/, "");
          return w.length > 0 ? w : "0";
        };

        const highlightRaw = (highlightUnit || "").toString().trim();
        const highlightDigits = digitsOnly(highlightRaw);
        const fullRaw = (fullPropertyNumber || "").toString().trim();
        const fullDigits = digitsOnly(fullRaw);

        const inferredFromFull = (() => {
          if (!fullDigits) return "";
          if (highlightDigits && fullDigits.endsWith(highlightDigits)) return highlightDigits;
          return fullDigits.slice(-2) || fullDigits;
        })();

        const padTwo = (v: string) => {
          const d = digitsOnly(v);
          return d.length === 1 ? d.padStart(2, "0") : "";
        };

        const exactCandidates = new Set(
          [highlightRaw, highlightDigits, inferredFromFull, fullRaw, fullDigits,
           padTwo(highlightRaw), padTwo(highlightDigits), padTwo(inferredFromFull)]
            .map((v) => v.trim()).filter(Boolean)
        );

        const normalizedCandidates = new Set(
          Array.from(exactCandidates).map((v) => normalizeUnitValue(v)).filter(Boolean)
        );

        const polygonArea = (polygon: number[][]) => {
          if (!polygon || polygon.length < 3) return 0;
          let area = 0;
          for (let i = 0; i < polygon.length; i++) {
            const [x1, y1] = polygon[i];
            const [x2, y2] = polygon[(i + 1) % polygon.length];
            area += x1 * y2 - x2 * y1;
          }
          return Math.abs(area / 2);
        };

        const scoredRegions = regiones.map((region: any) => {
          const unitRaw = (region.unit_number || "").toString().trim();
          const unitDigits = digitsOnly(unitRaw);
          const unitNormalized = normalizeUnitValue(unitRaw);

          let score = 0;
          if (exactCandidates.has(unitRaw)) score = Math.max(score, 300);
          if (unitDigits && exactCandidates.has(unitDigits)) score = Math.max(score, 285);
          if (unitNormalized && normalizedCandidates.has(unitNormalized)) score = Math.max(score, 270);

          return { region, score, area: polygonArea(region.polygon || []) };
        });

        const selected = scoredRegions
          .filter((entry) => entry.score > 0)
          .sort((a, b) => (b.score - a.score) || (b.area - a.area))[0];

        if (selected?.region?.polygon?.length >= 3) {
          const points = selected.region.polygon.map((p: number[]) => [
            (p[0] / 100) * width,
            (p[1] / 100) * canvasHeight,
          ] as [number, number]);

          const curves = selected.region.curves || {};
          const centerX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
          const centerY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
          const expansionFactor = 1.04;

          const expandedPoints = points.map(([x, y]) => [
            centerX + (x - centerX) * expansionFactor,
            centerY + (y - centerY) * expansionFactor,
          ] as [number, number]);

          ctx.beginPath();
          expandedPoints.forEach(([x, y], index) => {
            if (index === 0) ctx.moveTo(x, y);
          });

          for (let i = 0; i < expandedPoints.length; i++) {
            const nextIdx = (i + 1) % expandedPoints.length;
            const curveCP = curves[String(i)];
            if (curveCP) {
              const cpx = centerX + (((curveCP[0] / 100) * width) - centerX) * expansionFactor;
              const cpy = centerY + (((curveCP[1] / 100) * canvasHeight) - centerY) * expansionFactor;
              ctx.quadraticCurveTo(cpx, cpy, expandedPoints[nextIdx][0], expandedPoints[nextIdx][1]);
            } else {
              ctx.lineTo(expandedPoints[nextIdx][0], expandedPoints[nextIdx][1]);
            }
          }
          ctx.closePath();

          ctx.fillStyle = "rgba(34, 197, 94, 0.32)";
          ctx.fill();
          ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
          ctx.lineWidth = 2.5;
          ctx.stroke();
        }
      }

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(null);
    img.src = imageUrl;
  });
};

/** Loads an image and returns its data URL */
const loadImageAsDataUrl = (url: string, maxWidth: number): Promise<{ dataUrl: string; width: number; height: number } | null> => {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const scale = Math.min(1, maxWidth / img.width);
      const w = img.width * scale;
      const h = img.height * scale;
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(img, 0, 0, w, h);
      resolve({ dataUrl: canvas.toDataURL("image/png"), width: w, height: h });
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
};

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

    if (regiones && regiones.length > 0 && (highlightUnit || fullPropertyNumber)) {
      const digitsOnly = (value: string) => value.replace(/\D/g, "");
      const normalizeUnitValue = (value: string) => {
        const trimmed = value.trim();
        if (!trimmed) return "";
        const withoutLeadingZeros = trimmed.replace(/^0+/, "");
        return withoutLeadingZeros.length > 0 ? withoutLeadingZeros : "0";
      };

      const highlightRaw = (highlightUnit || "").toString().trim();
      const highlightDigits = digitsOnly(highlightRaw);
      const fullRaw = (fullPropertyNumber || "").toString().trim();
      const fullDigits = digitsOnly(fullRaw);

      const inferredFromFull = (() => {
        if (!fullDigits) return "";
        if (highlightDigits && fullDigits.endsWith(highlightDigits)) return highlightDigits;
        const suffix = fullDigits.slice(-2) || fullDigits;
        return suffix;
      })();

      const padTwo = (v: string) => {
        const d = digitsOnly(v);
        return d.length === 1 ? d.padStart(2, "0") : "";
      };

      const exactCandidates = new Set(
        [highlightRaw, highlightDigits, inferredFromFull, fullRaw, fullDigits,
         padTwo(highlightRaw), padTwo(highlightDigits), padTwo(inferredFromFull)]
          .map((v) => v.trim())
          .filter(Boolean)
      );

      const normalizedCandidates = new Set(
        Array.from(exactCandidates)
          .map((v) => normalizeUnitValue(v))
          .filter(Boolean)
      );

      const polygonArea = (polygon: number[][]) => {
        if (!polygon || polygon.length < 3) return 0;
        let area = 0;
        for (let i = 0; i < polygon.length; i++) {
          const [x1, y1] = polygon[i];
          const [x2, y2] = polygon[(i + 1) % polygon.length];
          area += x1 * y2 - x2 * y1;
        }
        return Math.abs(area / 2);
      };

      const scoredRegions = regiones.map((region: any) => {
        const unitRaw = (region.unit_number || "").toString().trim();
        const unitDigits = digitsOnly(unitRaw);
        const unitNormalized = normalizeUnitValue(unitRaw);

        let score = 0;
        if (exactCandidates.has(unitRaw)) score = Math.max(score, 300);
        if (unitDigits && exactCandidates.has(unitDigits)) score = Math.max(score, 285);
        if (unitNormalized && normalizedCandidates.has(unitNormalized)) score = Math.max(score, 270);

        return { region, score, area: polygonArea(region.polygon || []) };
      });

      const selected = scoredRegions
        .filter((entry) => entry.score > 0)
        .sort((a, b) => (b.score - a.score) || (b.area - a.area))[0];

      if (selected?.region?.polygon?.length >= 3) {
        const points = selected.region.polygon.map((p: number[]) => [
          (p[0] / 100) * containerWidth,
          (p[1] / 100) * canvasHeight,
        ] as [number, number]);

        const curves = selected.region.curves || {};

        const centerX = points.reduce((sum, point) => sum + point[0], 0) / points.length;
        const centerY = points.reduce((sum, point) => sum + point[1], 0) / points.length;
        const expansionFactor = 1.04;

        const expandedPoints = points.map(([x, y]) => [
          centerX + (x - centerX) * expansionFactor,
          centerY + (y - centerY) * expansionFactor,
        ] as [number, number]);

        ctx.beginPath();
        expandedPoints.forEach(([x, y], index) => {
          if (index === 0) ctx.moveTo(x, y);
        });

        for (let i = 0; i < expandedPoints.length; i++) {
          const nextIdx = (i + 1) % expandedPoints.length;
          const curveCP = curves[String(i)];
          if (curveCP) {
            const cpx = centerX + (((curveCP[0] / 100) * containerWidth) - centerX) * expansionFactor;
            const cpy = centerY + (((curveCP[1] / 100) * canvasHeight) - centerY) * expansionFactor;
            ctx.quadraticCurveTo(cpx, cpy, expandedPoints[nextIdx][0], expandedPoints[nextIdx][1]);
          } else {
            ctx.lineTo(expandedPoints[nextIdx][0], expandedPoints[nextIdx][1]);
          }
        }
        ctx.closePath();

        ctx.fillStyle = "rgba(34, 197, 94, 0.32)";
        ctx.fill();

        ctx.strokeStyle = "rgba(34, 197, 94, 0.95)";
        ctx.lineWidth = 2.5;
        ctx.stroke();
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
  const { toast } = useToast();
  const [generatingPdf, setGeneratingPdf] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    if (!prop) return;
    setGeneratingPdf(true);

    try {
      const resolvedDepto = resolveDeptoFromUnidad(prop.unidad, prop.numeroPiso, prop.numeroDepa);
      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const margin = 15;
      const contentWidth = pageWidth - margin * 2;
      let y = margin;

      // Header
      pdf.setFillColor(34, 45, 50);
      pdf.rect(0, 0, pageWidth, 28, "F");
      pdf.setTextColor(255, 255, 255);
      pdf.setFontSize(16);
      pdf.setFont("helvetica", "bold");
      pdf.text(prop.proyecto, margin, 12);
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.text(`${prop.edificio} — Unidad ${prop.unidad}`, margin, 19);
      pdf.setFontSize(8);
      pdf.text("Ficha Técnica", pageWidth - margin, 12, { align: "right" });
      pdf.text(new Date().toLocaleDateString("es-MX", { year: "numeric", month: "long", day: "numeric" }), pageWidth - margin, 19, { align: "right" });

      y = 36;

      // Details section
      pdf.setTextColor(30, 30, 30);
      pdf.setFontSize(12);
      pdf.setFont("helvetica", "bold");
      pdf.text("Detalles del departamento", margin, y);
      y += 7;

      pdf.setDrawColor(220, 220, 220);
      pdf.line(margin, y, pageWidth - margin, y);
      y += 5;

      pdf.setFontSize(9);
      const m2Total = prop.m2Total > 0 ? `${prop.m2Total.toFixed(2)} m²` : "—";

      const details = [
        ["Nivel", `${prop.numeroPiso || "—"}`],
        ["Departamento", resolvedDepto],
        ["Modelo", prop.modelo || "—"],
        ["Metraje", m2Total],
      ];

      const colWidth = contentWidth / 2;
      details.forEach(([label, value], idx) => {
        const col = idx % 2;
        const x = margin + col * colWidth;
        if (idx > 0 && idx % 2 === 0) y += 10;
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(120, 120, 120);
        pdf.text(label, x, y);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(30, 30, 30);
        pdf.text(value, x, y + 4.5);
      });
      y += 16;

      // Floor plan (plano de ubicación)
      if (prop.planoUbicacionUrl) {
        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(30, 30, 30);
        pdf.text("Plano de ubicación", margin, y);
        y += 3;
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Nivel ${prop.numeroPiso} — Depto. ${resolvedDepto}`, margin, y + 4);
        y += 9;

        const floorPlanDataUrl = await renderFloorPlanToDataUrl(
          prop.planoUbicacionUrl,
          prop.planoUbicacionRegiones,
          resolvedDepto,
          prop.unidad,
          1200
        );

        if (floorPlanDataUrl) {
          const tmpImg = new Image();
          tmpImg.src = floorPlanDataUrl;
          await new Promise<void>((res) => { tmpImg.onload = () => res(); tmpImg.onerror = () => res(); });
          const imgRatio = tmpImg.height / tmpImg.width;
          const imgW = contentWidth;
          const imgH = imgW * imgRatio;

          // Check if image fits on current page
          if (y + imgH > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }

          pdf.addImage(floorPlanDataUrl, "PNG", margin, y, imgW, imgH);
          y += imgH + 8;
        }
      }

      // Architectural plan
      if (prop.planoArquitectonico) {
        // Check if we need a new page
        if (y > pageHeight - 60) {
          pdf.addPage();
          y = margin;
        }

        pdf.setFontSize(12);
        pdf.setFont("helvetica", "bold");
        pdf.setTextColor(30, 30, 30);
        pdf.text("Plano arquitectónico", margin, y);
        y += 3;
        pdf.setFontSize(8);
        pdf.setFont("helvetica", "normal");
        pdf.setTextColor(120, 120, 120);
        pdf.text(`Modelo ${prop.modelo || "—"}`, margin, y + 4);
        y += 9;

        const arqData = await loadImageAsDataUrl(prop.planoArquitectonico, 1200);
        if (arqData) {
          const imgRatio = arqData.height / arqData.width;
          const imgW = contentWidth;
          const imgH = imgW * imgRatio;

          if (y + imgH > pageHeight - margin) {
            pdf.addPage();
            y = margin;
          }

          pdf.addImage(arqData.dataUrl, "PNG", margin, y, imgW, imgH);
          y += imgH + 8;
        }
      }

      // Footer on each page
      const totalPages = pdf.getNumberOfPages();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(7);
        pdf.setTextColor(160, 160, 160);
        pdf.text(
          `${prop.proyecto} — Unidad ${prop.unidad} | Página ${i} de ${totalPages}`,
          pageWidth / 2,
          pageHeight - 8,
          { align: "center" }
        );
      }

      pdf.save(`Ficha_Tecnica_${prop.proyecto}_${prop.unidad}.pdf`);

      toast({ title: "PDF descargado", description: "La ficha técnica se ha descargado correctamente." });
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({ title: "Error", description: "No se pudo generar el PDF.", variant: "destructive" });
    } finally {
      setGeneratingPdf(false);
    }
  }, [prop, toast]);

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

  const resolvedDepto = resolveDeptoFromUnidad(prop.unidad, prop.numeroPiso, prop.numeroDepa);

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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-bold text-lg text-foreground">Detalles técnicos</h2>
            <p className="text-xs text-[hsl(var(--inmob-green))] font-medium mt-1">Ficha técnica oficial del inmueble</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadPdf}
            disabled={generatingPdf}
            className="gap-1.5"
          >
            {generatingPdf ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Download className="h-3.5 w-3.5" />
            )}
            {generatingPdf ? "Generando..." : "Descargar PDF"}
          </Button>
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
            <p className="text-sm font-semibold text-foreground">{prop.m2Total > 0 ? `${prop.m2Total.toFixed(2)} m²` : "—"}</p>
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
                  highlightUnit={resolvedDepto}
                  fullPropertyNumber={prop.unidad}
                />
                <p className="text-xs text-muted-foreground mt-2">
                  Nivel {prop.numeroPiso} — Depto. <span className="font-semibold text-foreground">{resolvedDepto}</span>
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
