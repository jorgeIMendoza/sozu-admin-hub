import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { FileText, Plus, Loader2, ArrowLeft, Info, Fingerprint, ShieldOff } from "lucide-react";
import { NuevaCartaAcuerdoDialog } from "@/components/admin/NuevaCartaAcuerdoDialog";
import { CartaAcuerdoDetalle } from "@/components/admin/CartaAcuerdoDetalle";

export default function CartaAcuerdos() {
  const [selectedCartaId, setSelectedCartaId] = useState<string | null>(null);
  const [nuevaOpen, setNuevaOpen] = useState(false);

  // Fetch all cartas
  const { data: cartas = [], isLoading } = useQuery({
    queryKey: ["cartas-acuerdo"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("cartas_acuerdo")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Fetch firma counts per carta
  const { data: firmaCounts = {} } = useQuery({
    queryKey: ["cartas-acuerdo-firma-counts"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("firmas_digitales")
        .select("carta_acuerdo_id")
        .eq("tipo_documento", "carta_acuerdos")
        .not("carta_acuerdo_id", "is", null);
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data || []).forEach((f: any) => {
        counts[f.carta_acuerdo_id] = (counts[f.carta_acuerdo_id] || 0) + 1;
      });
      return counts;
    },
  });

  if (selectedCartaId) {
    const carta = cartas.find((c: any) => c.id === selectedCartaId);
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={() => setSelectedCartaId(null)} className="gap-1">
          <ArrowLeft className="h-4 w-4" />
          Volver a Cartas de Acuerdo
        </Button>
        <CartaAcuerdoDetalle cartaId={selectedCartaId} cartaNombre={carta?.nombre || ""} />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Cartas de Acuerdo
        </CardTitle>
        <Button onClick={() => setNuevaOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          Nueva Carta
        </Button>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-3 p-4 rounded-lg border bg-muted/50">
        <ShieldOff className="h-5 w-5 text-muted-foreground mt-0.5 shrink-0" />
        <div>
          <p className="text-sm font-medium">Aviso sobre validez legal</p>
          <p className="text-xs text-muted-foreground mt-1">
            Las cartas de acuerdo son documentos informativos que no requieren una robusta validez legal.
            Se utilizan para formalizar compromisos comerciales entre las partes.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : cartas.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No hay cartas de acuerdo configuradas. Crea una nueva para comenzar.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {cartas.map((carta: any) => {
            const count = firmaCounts[carta.id] || 0;
            return (
              <Card
                key={carta.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedCartaId(carta.id)}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{carta.nombre}</CardTitle>
                    <Badge variant={carta.activo ? "default" : "secondary"}>
                      {carta.activo ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                  {carta.descripcion && (
                    <CardDescription className="text-xs">{carta.descripcion}</CardDescription>
                  )}
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <FileText className="h-3 w-3" />
                      {count} firma{count !== 1 ? "s" : ""}
                    </div>
                    <div className="flex items-center gap-1">
                      {carta.requiere_validacion_biometrica ? (
                        <>
                          <Fingerprint className="h-3 w-3" />
                          Biométrica
                        </>
                      ) : (
                        <>
                          <Info className="h-3 w-3" />
                          Simple
                        </>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <NuevaCartaAcuerdoDialog open={nuevaOpen} onOpenChange={setNuevaOpen} />
    </div>
  );
}
