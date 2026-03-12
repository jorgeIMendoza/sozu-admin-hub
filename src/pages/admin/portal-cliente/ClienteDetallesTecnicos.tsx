import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, MapPin, Loader2 } from "lucide-react";
import { useClientePropiedadDetalle } from "@/hooks/useClientePropiedadDetalle";

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
              <p className="text-sm font-semibold text-foreground">Nivel {prop.unidad?.charAt(0) || "—"}</p>
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
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="grid grid-cols-4 gap-1 text-[9px] text-muted-foreground">
              <div className="col-start-3 col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">12</span>
                <br />72.74 m²
              </div>
              <div className="col-start-4 col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">11</span>
                <br />77.54 m²
              </div>
              <div className="col-start-3 col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">13</span>
                <br />72.74 m²
              </div>
              <div className="col-start-4 col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">10</span>
                <br />77.12 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">3</span>
                <br />82.95 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">2</span>
                <br />82.01 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">1</span>
                <br />107.81 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">9</span>
                <br />77.13 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">4</span>
                <br />70.64 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">5</span>
                <br />73.96 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">6</span>
                <br />73.38 m²
              </div>
              <div className="col-span-1 border border-border rounded p-2 text-center bg-card">
                <span className="font-bold text-foreground text-xs">7</span>
                <br />40.51 m²
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            <span className="font-semibold text-foreground">D{prop.unidad}</span> PLANO DE REFERENCIA
          </p>
        </TechCard>

        {/* 3. Plano arquitectónico */}
        <TechCard title="Plano arquitectónico">
          <div className="flex flex-col items-center justify-center min-h-[200px]">
            <div className="border-2 border-dashed border-border rounded-xl p-8 w-full flex flex-col items-center justify-center gap-3">
              <MapPin className="w-10 h-10 text-muted-foreground/40" />
              <p className="text-xs font-semibold text-foreground uppercase tracking-wide text-center">
                Plano arquitectónico del modelo
              </p>
            </div>
          </div>
        </TechCard>
      </div>
    </div>
  );
};

export default ClienteDetallesTecnicos;
