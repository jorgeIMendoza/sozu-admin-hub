import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, X, RefreshCw, Eye, Copy, Check } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import { PdfViewerDialog } from "@/components/admin/PdfViewerDialog";

interface PagoSTP {
  id: number;
  claverastreo: string;
  fecha_operacion: string | null;
  monto: number;
  cuenta_beneficiario: string;
  cuenta_ordenante: string | null;
  nombre_ordenante: string | null;
  rfc_curp_ordenante: string | null;
  es_pago_aplicado: boolean;
  razon_rechazo: string | null;
  fecha_creacion: string;
  id_tipo_pago: number;
  tipo_pago_nombre?: string;
  tipo_real?: string; // Determined by cuenta_cobranza -> oferta relationship
  evidencia_url?: string | null;
}

const TIPOS_PAGO: Record<number, string> = {
  1: "Propiedades",
  2: "Productos/Servicios",
  3: "Mantenimientos",
  4: "Rentas",
  5: "Comisiones",
};

export default function RastreoPagosSTP() {
  const { toast } = useToast();
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [evidenciaUrl, setEvidenciaUrl] = useState<string | null>(null);
  const [filters, setFilters] = useState({
    claveRastreo: "",
    clabeStp: "",
    tipo: "all",
    rfc: "",
    nombreOrdenante: "",
    estatus: "all",
    fechaDesde: "",
    fechaHasta: "",
    tipoFecha: "fecha_creacion" as "fecha_creacion" | "fecha_operacion",
  });

  const { data: pagos, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pagos-stp-raw", filters],
    queryFn: async () => {
      let query = supabase
        .from("pagos_stp_raw")
        .select("id, claverastreo, fecha_operacion, monto, cuenta_beneficiario, cuenta_ordenante, nombre_ordenante, rfc_curp_ordenante, es_pago_aplicado, razon_rechazo, fecha_creacion, id_tipo_pago")
        .order("fecha_creacion", { ascending: false })
        .limit(50);

      if (filters.claveRastreo) {
        query = query.ilike("claverastreo", `%${filters.claveRastreo}%`);
      }
      if (filters.clabeStp) {
        query = query.ilike("cuenta_beneficiario", `%${filters.clabeStp}%`);
      }
      if (filters.tipo !== "all") {
        query = query.eq("id_tipo_pago", parseInt(filters.tipo));
      }
      if (filters.rfc) {
        query = query.ilike("rfc_curp_ordenante", `%${filters.rfc}%`);
      }
      if (filters.nombreOrdenante) {
        query = query.ilike("nombre_ordenante", `%${filters.nombreOrdenante}%`);
      }
      if (filters.estatus !== "all") {
        query = query.eq("es_pago_aplicado", filters.estatus === "aplicado");
      }
      const campoFecha = filters.tipoFecha;
      if (campoFecha === "fecha_operacion") {
        const desdeCompacta = filters.fechaDesde.replace(/-/g, "");
        const hastaCompacta = filters.fechaHasta.replace(/-/g, "");
        const condicionesFechaOperacion: string[] = [];

        const buildRange = (desde: string, hasta: string) => {
          const parts: string[] = [];
          if (filters.fechaDesde) parts.push(`fecha_operacion.gte.${desde}`);
          if (filters.fechaHasta) parts.push(`fecha_operacion.lte.${hasta}`);
          return parts.length > 1 ? `and(${parts.join(",")})` : parts[0];
        };

        if (filters.fechaDesde || filters.fechaHasta) {
          condicionesFechaOperacion.push(buildRange(desdeCompacta, hastaCompacta));
          condicionesFechaOperacion.push(buildRange(filters.fechaDesde, filters.fechaHasta));
          query = query.or(condicionesFechaOperacion.filter(Boolean).join(","));
        }
      } else {
        if (filters.fechaDesde) {
          query = query.gte(campoFecha, filters.fechaDesde);
        }
        if (filters.fechaHasta) {
          query = query.lte(campoFecha, `${filters.fechaHasta}T23:59:59`);
        }
      }

      const { data, error } = await query;

      if (error) throw error;
      
      // Get unique CLABEs to determine real payment type from cuentas_cobranza
      const clabes = [...new Set((data || []).map(p => p.cuenta_beneficiario))];
      
      // Query cuentas_cobranza to get oferta info for each CLABE
      const { data: cuentasData } = await supabase
        .from("cuentas_cobranza")
        .select(`
          clabe_stp,
          ofertas!fk_ccob_oferta (
            id_propiedad,
            id_producto
          )
        `)
        .in("clabe_stp", clabes)
        .eq("activo", true);
      
      // Create a map of CLABE -> type
      const clabeTypeMap: Record<string, string> = {};
      if (cuentasData) {
        for (const cuenta of cuentasData) {
          if (cuenta.clabe_stp) {
            const oferta = cuenta.ofertas as { id_propiedad: number | null; id_producto: number | null } | null;
            if (oferta?.id_propiedad && !oferta?.id_producto) {
              clabeTypeMap[cuenta.clabe_stp] = "Propiedades";
            } else if (oferta?.id_producto) {
              clabeTypeMap[cuenta.clabe_stp] = "Productos/Servicios";
            }
          }
        }
      }
      
      // Enrich pagos with real type
      // Fetch evidence URLs (url_cep / url_recibo) from pagos by clave_rastreo
      const claveRastreos = [...new Set((data || []).map((p) => p.claverastreo).filter(Boolean))];
      const evidenciaMap: Record<string, string | null> = {};
      if (claveRastreos.length > 0) {
        const { data: pagosData } = await supabase
          .from("pagos")
          .select("clave_rastreo, url_cep, url_recibo")
          .in("clave_rastreo", claveRastreos);
        if (pagosData) {
          for (const p of pagosData) {
            if (!p.clave_rastreo) continue;
            if (evidenciaMap[p.clave_rastreo]) continue; // keep first match
            const url = (p.url_cep && p.url_cep.trim()) || (p.url_recibo && p.url_recibo.trim()) || null;
            evidenciaMap[p.clave_rastreo] = url;
          }
        }
      }

      return (data || []).map((pago) => ({
        ...pago,
        tipo_real: clabeTypeMap[pago.cuenta_beneficiario] || TIPOS_PAGO[pago.id_tipo_pago] || `Tipo ${pago.id_tipo_pago}`,
        evidencia_url: evidenciaMap[pago.claverastreo] ?? null,
      })) as PagoSTP[];
    },
    refetchInterval: 15000, // Auto-refresh cada 15 segundos
    refetchOnWindowFocus: true, // Refrescar al regresar a la pestaña
    refetchOnMount: "always",
  });

  const handleClearFilters = () => {
    setFilters({
      claveRastreo: "",
      clabeStp: "",
      tipo: "all",
      rfc: "",
      nombreOrdenante: "",
      estatus: "all",
      fechaDesde: "",
      fechaHasta: "",
      tipoFecha: "fecha_creacion",
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);
  };

  const formatDate = (dateString: string | null, includeTime: boolean = true) => {
    if (!dateString) return "-";
    try {
      const date = parseISO(dateString);
      return format(date, includeTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy", { locale: es });
    } catch {
      return dateString;
    }
  };

  const handleCopy = async (text: string, fieldId: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(fieldId);
      toast({
        title: "Copiado",
        description: "El valor se copió al portapapeles",
      });
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      toast({
        title: "Error",
        description: "No se pudo copiar al portapapeles",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Rastreo de Pagos STP</h1>
          <p className="text-muted-foreground">
            Consulta los últimos 50 pagos recibidos vía STP
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="claveRastreo">Clave de Rastreo</Label>
              <Input
                id="claveRastreo"
                placeholder="Buscar por clave..."
                value={filters.claveRastreo}
                onChange={(e) => setFilters({ ...filters, claveRastreo: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clabeStp">CLABE STP</Label>
              <Input
                id="clabeStp"
                placeholder="Buscar por CLABE..."
                value={filters.clabeStp}
                onChange={(e) => setFilters({ ...filters, clabeStp: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipo">Tipo de Pago</Label>
              <Select
                value={filters.tipo}
                onValueChange={(value) => setFilters({ ...filters, tipo: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(TIPOS_PAGO).map(([id, nombre]) => (
                    <SelectItem key={id} value={id}>{nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="estatus">Estatus</Label>
              <Select
                value={filters.estatus}
                onValueChange={(value) => setFilters({ ...filters, estatus: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="aplicado">Aplicado</SelectItem>
                  <SelectItem value="rechazado">Rechazado</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="rfc">RFC Ordenante</Label>
              <Input
                id="rfc"
                placeholder="Buscar por RFC..."
                value={filters.rfc}
                onChange={(e) => setFilters({ ...filters, rfc: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="nombreOrdenante">Nombre Ordenante</Label>
              <Input
                id="nombreOrdenante"
                placeholder="Buscar por nombre..."
                value={filters.nombreOrdenante}
                onChange={(e) => setFilters({ ...filters, nombreOrdenante: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="tipoFecha">Filtrar fechas por</Label>
              <Select
                value={filters.tipoFecha}
                onValueChange={(value: "fecha_creacion" | "fecha_operacion") =>
                  setFilters({ ...filters, tipoFecha: value })
                }
              >
                <SelectTrigger id="tipoFecha">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fecha_creacion">Fecha de pago</SelectItem>
                  <SelectItem value="fecha_operacion">Fecha de operación</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaDesde">
                Desde ({filters.tipoFecha === "fecha_operacion" ? "Fecha de operación" : "Fecha de pago"})
              </Label>
              <Input
                id="fechaDesde"
                type="date"
                value={filters.fechaDesde}
                onChange={(e) => setFilters({ ...filters, fechaDesde: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaHasta">
                Hasta ({filters.tipoFecha === "fecha_operacion" ? "Fecha de operación" : "Fecha de pago"})
              </Label>
              <Input
                id="fechaHasta"
                type="date"
                value={filters.fechaHasta}
                onChange={(e) => setFilters({ ...filters, fechaHasta: e.target.value })}
              />
            </div>
          </div>

          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={handleClearFilters}>
              <X className="h-4 w-4 mr-2" />
              Limpiar filtros
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Clave Rastreo</TableHead>
                  <TableHead>Fecha Operación</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>CLABE STP</TableHead>
                  <TableHead>Cuenta Ordenante</TableHead>
                  <TableHead>Nombre Ordenante</TableHead>
                  <TableHead>RFC Ordenante</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Razón Rechazo</TableHead>
                  <TableHead>Fecha Creación</TableHead>
                  <TableHead>Tipo de Pago</TableHead>
                  <TableHead>Evidencia</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="ml-2">Cargando...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : pagos?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={12} className="text-center py-8 text-muted-foreground">
                      No se encontraron pagos con los filtros aplicados
                    </TableCell>
                  </TableRow>
                ) : (
                  pagos?.map((pago) => (
                    <TableRow key={pago.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{pago.claverastreo}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleCopy(pago.claverastreo, `clave-${pago.id}`)}
                          >
                            {copiedField === `clave-${pago.id}` ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>{formatDate(pago.fecha_operacion, false)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(pago.monto)}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <span className="font-mono text-xs">{pago.cuenta_beneficiario}</span>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => handleCopy(pago.cuenta_beneficiario, `clabe-${pago.id}`)}
                          >
                            {copiedField === `clabe-${pago.id}` ? (
                              <Check className="h-3 w-3 text-green-600" />
                            ) : (
                              <Copy className="h-3 w-3 text-muted-foreground" />
                            )}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {pago.cuenta_ordenante ? (
                          <div className="flex items-center gap-1">
                            <span className="font-mono text-xs">{pago.cuenta_ordenante}</span>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-6 w-6 shrink-0"
                              onClick={() => handleCopy(pago.cuenta_ordenante!, `cuenta-ord-${pago.id}`)}
                            >
                              {copiedField === `cuenta-ord-${pago.id}` ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Copy className="h-3 w-3 text-muted-foreground" />
                              )}
                            </Button>
                          </div>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[150px] truncate" title={pago.nombre_ordenante || "-"}>
                        {pago.nombre_ordenante || "-"}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {pago.rfc_curp_ordenante || "-"}
                      </TableCell>
                      <TableCell>
                        {pago.es_pago_aplicado ? (
                          <Badge variant="default" className="bg-green-600 hover:bg-green-700">
                            Aplicado
                          </Badge>
                        ) : (
                          <Badge variant="destructive">
                            Rechazado
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {pago.razon_rechazo ? (
                          <Dialog>
                            <DialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <Eye className="h-4 w-4 text-destructive" />
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Razón del Rechazo</DialogTitle>
                              </DialogHeader>
                              <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                                {pago.razon_rechazo}
                              </p>
                            </DialogContent>
                          </Dialog>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell>{formatDate(pago.fecha_creacion)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {pago.tipo_real || TIPOS_PAGO[pago.id_tipo_pago] || `Tipo ${pago.id_tipo_pago}`}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {pago.evidencia_url ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setEvidenciaUrl(pago.evidencia_url!)}
                            title="Ver evidencia"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">Aún sin CEP</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {pagos && pagos.length >= 50 && (
        <p className="text-sm text-muted-foreground text-center">
          Mostrando los últimos 50 registros. Usa los filtros para refinar tu búsqueda.
        </p>
      )}

      <PdfViewerDialog
        open={!!evidenciaUrl}
        onOpenChange={(open) => !open && setEvidenciaUrl(null)}
        url={evidenciaUrl || ""}
        title="Evidencia de Pago"
      />
    </div>
  );
}
