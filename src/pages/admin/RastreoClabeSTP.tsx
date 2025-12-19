import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, CreditCard, AlertTriangle, AlertCircle, CheckCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

const ALLOWED_EMAIL = 'jorge.mendoza@sozu.com';

interface ClabeStats {
  cuenta_madre: string;
  persona_nombre: string;
  proyecto_nombre: string;
  clabes_asignadas: number;
  ultima_secuencial: string;
  porcentaje_uso: number;
}

export default function RastreoClabeSTP() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Redirect if not authorized
  useEffect(() => {
    if (profile?.email && profile.email !== ALLOWED_EMAIL) {
      navigate("/admin/access-denied");
    }
  }, [profile?.email, navigate]);

  const { data: clabeStats, isLoading, refetch, isRefetching } = useQuery({
    queryKey: ["clabe-stats"],
    queryFn: async () => {
      // Get all entidades_relacionadas with cuenta_madre_stp
      const { data: entidades, error: entidadesError } = await supabase
        .from("entidades_relacionadas")
        .select(`
          id,
          cuenta_madre_stp,
          id_proyecto,
          personas!entidades_relacionadas_id_persona_fkey(nombre_legal),
          proyectos!entidades_relacionadas_id_proyecto_fkey(nombre)
        `)
        .not("cuenta_madre_stp", "is", null)
        .eq("activo", true);

      if (entidadesError) throw entidadesError;

      // Group by cuenta_madre_stp
      const cuentaMadreMap = new Map<string, {
        persona_nombre: string;
        proyecto_nombre: string;
        id_er: number;
      }>();

      entidades?.forEach((er: any) => {
        if (er.cuenta_madre_stp && !cuentaMadreMap.has(er.cuenta_madre_stp)) {
          cuentaMadreMap.set(er.cuenta_madre_stp, {
            persona_nombre: er.personas?.nombre_legal || "Sin nombre",
            proyecto_nombre: er.proyectos?.nombre || "Sin proyecto",
            id_er: er.id
          });
        }
      });

      // For each cuenta_madre, count CLABEs and find última secuencial
      const stats: ClabeStats[] = [];

      for (const [cuentaMadre, info] of cuentaMadreMap) {
        // Count all CLABEs for this cuenta_madre
        const prefix = `6461802874${cuentaMadre}`;

        // Get all CLABEs that start with this prefix
        const { data: propiedadesClabes } = await supabase
          .from("propiedades")
          .select("clabe_stp_tmp_apartado")
          .like("clabe_stp_tmp_apartado", `${prefix}%`)
          .not("clabe_stp_tmp_apartado", "like", "%_TMP");

        const { data: cuentasClabes } = await supabase
          .from("cuentas_cobranza")
          .select("clabe_stp")
          .like("clabe_stp", `${prefix}%`)
          .not("clabe_stp", "like", "%_TMP");

        const { data: ofertasClabes } = await supabase
          .from("ofertas")
          .select("clabe_stp_tmp_producto")
          .like("clabe_stp_tmp_producto", `${prefix}%`)
          .not("clabe_stp_tmp_producto", "like", "%_TMP");

        // Combine all CLABEs
        const allClabes = new Set<string>();
        
        propiedadesClabes?.forEach((p: any) => {
          if (p.clabe_stp_tmp_apartado) allClabes.add(p.clabe_stp_tmp_apartado);
        });
        cuentasClabes?.forEach((c: any) => {
          if (c.clabe_stp) allClabes.add(c.clabe_stp);
        });
        ofertasClabes?.forEach((o: any) => {
          if (o.clabe_stp_tmp_producto) allClabes.add(o.clabe_stp_tmp_producto);
        });

        const clabesArray = Array.from(allClabes);
        const clabesAsignadas = clabesArray.length;

        // Find última secuencial (highest 3-digit counter)
        let ultimaSecuencial = "";
        let maxCounter = 0;

        clabesArray.forEach(clabe => {
          // Extract the 3-digit counter (positions 15-17, before the last digit)
          if (clabe.length === 18) {
            const counter = parseInt(clabe.substring(14, 17), 10);
            if (counter > maxCounter) {
              maxCounter = counter;
              ultimaSecuencial = clabe;
            }
          }
        });

        const porcentajeUso = (clabesAsignadas / 999) * 100;

        stats.push({
          cuenta_madre: cuentaMadre,
          persona_nombre: info.persona_nombre,
          proyecto_nombre: info.proyecto_nombre,
          clabes_asignadas: clabesAsignadas,
          ultima_secuencial: ultimaSecuencial,
          porcentaje_uso: porcentajeUso
        });
      }

      // Sort by porcentaje_uso descending
      return stats.sort((a, b) => b.porcentaje_uso - a.porcentaje_uso);
    },
    enabled: profile?.email === ALLOWED_EMAIL
  });

  const getStatusBadge = (porcentaje: number) => {
    if (porcentaje >= 95) {
      return (
        <Badge variant="destructive" className="gap-1">
          <AlertCircle className="h-3 w-3" />
          Crítico
        </Badge>
      );
    } else if (porcentaje >= 80) {
      return (
        <Badge variant="outline" className="gap-1 border-amber-500 text-amber-500">
          <AlertTriangle className="h-3 w-3" />
          Advertencia
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="gap-1 border-green-500 text-green-500">
        <CheckCircle className="h-3 w-3" />
        Normal
      </Badge>
    );
  };

  const getProgressColor = (porcentaje: number) => {
    if (porcentaje >= 95) return "bg-destructive";
    if (porcentaje >= 80) return "bg-amber-500";
    return "bg-green-500";
  };

  if (profile?.email !== ALLOWED_EMAIL) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6" />
            Rastreo CLABEs STP
          </h1>
          <p className="text-muted-foreground">
            Monitoreo de uso de cuentas madre y asignación de CLABEs
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isRefetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isRefetching ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Estado de Cuentas Madre</CardTitle>
          <CardDescription>
            Cada cuenta madre puede tener hasta 999 CLABEs asignadas (001-999)
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center space-x-4">
                  <Skeleton className="h-12 w-full" />
                </div>
              ))}
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Cuenta Madre</TableHead>
                  <TableHead>Persona/Empresa</TableHead>
                  <TableHead>Proyecto</TableHead>
                  <TableHead className="text-center">CLABEs Asignadas</TableHead>
                  <TableHead>Última Secuencial</TableHead>
                  <TableHead className="w-[150px]">% Uso</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {clabeStats?.map((stat) => (
                  <TableRow key={stat.cuenta_madre}>
                    <TableCell className="font-mono font-semibold">
                      {stat.cuenta_madre}
                    </TableCell>
                    <TableCell>{stat.persona_nombre}</TableCell>
                    <TableCell>{stat.proyecto_nombre}</TableCell>
                    <TableCell className="text-center font-medium">
                      {stat.clabes_asignadas} / 999
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {stat.ultima_secuencial || "-"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary">
                          <div 
                            className={`h-full transition-all ${
                              stat.porcentaje_uso >= 95 ? "bg-destructive" :
                              stat.porcentaje_uso >= 80 ? "bg-amber-500" : "bg-green-500"
                            }`}
                            style={{ width: `${Math.min(stat.porcentaje_uso, 100)}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-12">
                          {stat.porcentaje_uso.toFixed(1)}%
                        </span>
                      </div>
                    </TableCell>
                    <TableCell>
                      {getStatusBadge(stat.porcentaje_uso)}
                    </TableCell>
                  </TableRow>
                ))}
                {clabeStats?.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                      No se encontraron cuentas madre configuradas
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
