import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, FileImage } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface PropertyFloorPlanButtonProps {
  propertyId: number;
}

export function PropertyFloorPlanButton({ propertyId }: PropertyFloorPlanButtonProps) {
  const [open, setOpen] = useState(false);

  const { data: planUrl, isLoading } = useQuery({
    queryKey: ["property-floor-plan", propertyId],
    queryFn: async () => {
      // 1. Get property data
      const { data: prop } = await (supabase as any)
        .from("propiedades")
        .select("id_edificio_modelo, numero_piso, numero_propiedad")
        .eq("id", propertyId)
        .single();

      if (!prop?.id_edificio_modelo) return null;

      const numeroPiso = prop.numero_piso;

      // 2. Get edificio_modelo with modelo fallback
      const { data: emData } = await (supabase as any)
        .from("edificios_modelos")
        .select("id, id_edificio, id_modelo, modelos!edificios_modelos_id_modelo_fkey(plano_arquitectonico)")
        .eq("id", prop.id_edificio_modelo)
        .single();

      const planoArquitectonico = emData?.modelos?.plano_arquitectonico || null;

      // 3. Extract unit number (strip floor prefix)
      const rawPropertyNumber = (prop.numero_propiedad || "").toString().trim();
      const propertyDigits = rawPropertyNumber.replace(/\D/g, "");
      const floorDigits = (numeroPiso?.toString() || "").replace(/\D/g, "");

      const extractedDeptoDigits =
        floorDigits && propertyDigits.startsWith(floorDigits) && propertyDigits.length > floorDigits.length
          ? propertyDigits.slice(floorDigits.length)
          : propertyDigits;

      const numeroDepaRaw = extractedDeptoDigits || rawPropertyNumber;
      const numeroDepa = numeroDepaRaw.length === 1 ? numeroDepaRaw.padStart(2, "0") : numeroDepaRaw;

      // 4. Query modelos_planos_arquitectonicos by edificio_modelo + nivel
      let planoArqUrl: string | null = planoArquitectonico;
      const emId = emData?.id;
      if (emId && numeroPiso && numeroDepa) {
        const { data: planosArq } = await (supabase as any)
          .from("modelos_planos_arquitectonicos")
          .select("imagen_url, departamentos")
          .eq("id_edificio_modelo", emId)
          .eq("nivel", numeroPiso)
          .eq("activo", true);

        if (planosArq && planosArq.length > 0) {
          const normalizeForMatch = (v: string) => v.replace(/^0+/, "") || "0";
          const depaMatch = (planosArq as any[]).find((p: any) => {
            const depts: string[] = Array.isArray(p.departamentos) ? p.departamentos : [];
            return depts.some(d => d === numeroDepa || normalizeForMatch(d) === normalizeForMatch(numeroDepa));
          });
          if (depaMatch) {
            planoArqUrl = depaMatch.imagen_url || planoArqUrl;
          }
        }
      }

      if (planoArqUrl) return planoArqUrl;

      // 5. Fallback: edificios_niveles_planos
      if (!emData?.id_edificio) return null;

      const { data: planoEdificio } = await (supabase as any)
        .from("edificios_niveles_planos")
        .select("imagen_url")
        .eq("id_edificio", emData.id_edificio)
        .eq("nivel", numeroPiso || "1")
        .eq("activo", true)
        .limit(1)
        .maybeSingle();

      return planoEdificio?.imagen_url || null;
    },
    enabled: propertyId > 0,
    staleTime: 300_000,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!planUrl) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center justify-center gap-2 rounded-xl border border-border/60 bg-muted/30 py-3 text-sm font-medium text-foreground hover:bg-muted/60 transition-colors"
      >
        <FileImage className="h-4 w-4 text-muted-foreground" />
        Planta
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg p-0 overflow-hidden">
          <DialogHeader className="p-4 pb-0">
            <DialogTitle className="text-base">Plano de Planta</DialogTitle>
          </DialogHeader>
          <div className="p-4 pt-2">
            <img src={planUrl} alt="Plano de planta" className="w-full object-contain rounded-lg" />
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
