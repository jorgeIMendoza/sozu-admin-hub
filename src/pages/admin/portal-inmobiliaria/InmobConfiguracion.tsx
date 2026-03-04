import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useInmobiliariaPersonaId } from "@/hooks/useInmobiliariaPersonaId";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCtaTracker } from "@/hooks/useCtaTracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Settings, Building2, CreditCard, User } from "lucide-react";

export default function InmobConfiguracion() {
  const { registrarVista } = useActivityLogger();
  const { track } = useCtaTracker();
  const { profile } = useAuth();
  const { personaId } = useInmobiliariaPersonaId();

  useEffect(() => {
    registrarVista("/admin/portal-inmobiliaria/configuracion");
    track({ page: "inmob_configuracion", elementId: "page_view", elementType: "page" });
  }, []);

  // Fetch persona (fiscal) data
  const { data: persona } = useQuery({
    queryKey: ["inmob-config-persona", personaId],
    queryFn: async () => {
      if (!personaId) return null;
      const { data } = await supabase
        .from("personas")
        .select("*")
        .eq("id", personaId)
        .single() as any;
      return data;
    },
    enabled: !!personaId,
  });

  // Fetch bank accounts
  const { data: cuentas = [] } = useQuery({
    queryKey: ["inmob-config-cuentas", personaId],
    queryFn: async () => {
      if (!personaId) return [];
      const { data } = await supabase
        .from("cuentas_bancarias")
        .select("*, bancos(nombre)")
        .eq("id_persona", personaId)
        .eq("activo", true) as any;
      return data || [];
    },
    enabled: !!personaId,
  });

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Configuración</h1>

      {/* Fiscal data */}
      <Card className="sozu-card">
        <CardHeader className="flex flex-row items-center gap-2">
          <Building2 className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Datos Fiscales</CardTitle>
        </CardHeader>
        <CardContent>
          {persona ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              {[
                { label: "Razón Social", value: persona.nombre_legal },
                { label: "Nombre Comercial", value: persona.nombre_comercial },
                { label: "RFC", value: persona.rfc },
                { label: "Régimen Fiscal", value: persona.regimen_fiscal },
                { label: "Código Postal", value: persona.codigo_postal },
                { label: "Teléfono", value: persona.telefono },
                { label: "Email", value: persona.email },
                { label: "CURP", value: persona.curp },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-muted-foreground text-xs">{f.label}</p>
                  <p className="font-medium text-foreground">{f.value || "—"}</p>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Cargando datos fiscales...</p>
          )}
        </CardContent>
      </Card>

      {/* Bank accounts */}
      <Card className="sozu-card">
        <CardHeader className="flex flex-row items-center gap-2">
          <CreditCard className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Cuentas Bancarias</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {cuentas.length === 0 ? (
            <p className="text-muted-foreground p-6 text-center">No se encontraron cuentas bancarias.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="sozu-table-header">
                    <TableHead>Banco</TableHead>
                    <TableHead>CLABE</TableHead>
                    <TableHead>Titular</TableHead>
                    <TableHead>Estatus</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuentas.map((c: any) => (
                    <TableRow key={c.id}>
                      <TableCell>{c.bancos?.nombre || "—"}</TableCell>
                      <TableCell className="font-mono text-xs">{c.clabe || "—"}</TableCell>
                      <TableCell>{c.titular || "—"}</TableCell>
                      <TableCell>
                        <Badge variant={c.activo ? "default" : "secondary"}>
                          {c.activo ? "Activa" : "Inactiva"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* User info */}
      <Card className="sozu-card">
        <CardHeader className="flex flex-row items-center gap-2">
          <User className="h-5 w-5 text-muted-foreground" />
          <CardTitle className="text-base">Cuenta de Usuario</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Email</p>
              <p className="font-medium text-foreground">{profile?.email || "—"}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Rol</p>
              <p className="font-medium text-foreground">{profile?.rol_nombre || "—"}</p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
