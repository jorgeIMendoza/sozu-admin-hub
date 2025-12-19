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
import { Search, X, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface PagoSTP {
  id: number;
  claverastreo: string;
  fecha_operacion: string | null;
  monto: number;
  cuenta_beneficiario: string;
  nombre_ordenante: string | null;
  rfc_curp_ordenante: string | null;
  es_pago_aplicado: boolean;
  razon_rechazo: string | null;
  fecha_creacion: string;
  id_tipo_pago: number;
  tipo_pago_nombre?: string;
}

const TIPOS_PAGO: Record<number, string> = {
  1: "Propiedades",
  2: "Productos/Servicios",
  3: "Mantenimientos",
  4: "Rentas",
  5: "Comisiones",
};

export default function RastreoPagosSTP() {
  const [filters, setFilters] = useState({
    claveRastreo: "",
    clabeStp: "",
    tipo: "all",
    rfc: "",
    nombreOrdenante: "",
    estatus: "all",
    fechaDesde: "",
    fechaHasta: "",
  });

  const { data: pagos, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["pagos-stp-raw", filters],
    queryFn: async () => {
      let query = supabase
        .from("pagos_stp_raw")
        .select("id, claverastreo, fecha_operacion, monto, cuenta_beneficiario, nombre_ordenante, rfc_curp_ordenante, es_pago_aplicado, razon_rechazo, fecha_creacion, id_tipo_pago")
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
      if (filters.fechaDesde) {
        query = query.gte("fecha_creacion", filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        query = query.lte("fecha_creacion", `${filters.fechaHasta}T23:59:59`);
      }

      const { data, error } = await query;

      if (error) throw error;
      return data as PagoSTP[];
    },
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
    });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return "-";
    try {
      return format(new Date(dateString), "dd/MM/yyyy HH:mm", { locale: es });
    } catch {
      return dateString;
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
              <Label htmlFor="fechaDesde">Fecha Desde</Label>
              <Input
                id="fechaDesde"
                type="date"
                value={filters.fechaDesde}
                onChange={(e) => setFilters({ ...filters, fechaDesde: e.target.value })}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="fechaHasta">Fecha Hasta</Label>
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
                  <TableHead>Nombre Ordenante</TableHead>
                  <TableHead>RFC Ordenante</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Razón Rechazo</TableHead>
                  <TableHead>Fecha Creación</TableHead>
                  <TableHead>Tipo de Pago</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <div className="flex items-center justify-center">
                        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary"></div>
                        <span className="ml-2">Cargando...</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : pagos?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No se encontraron pagos con los filtros aplicados
                    </TableCell>
                  </TableRow>
                ) : (
                  pagos?.map((pago) => (
                    <TableRow key={pago.id}>
                      <TableCell className="font-mono text-xs max-w-[150px] truncate" title={pago.claverastreo}>
                        {pago.claverastreo}
                      </TableCell>
                      <TableCell>{formatDate(pago.fecha_operacion)}</TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(pago.monto)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {pago.cuenta_beneficiario}
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
                      <TableCell className="max-w-[150px] truncate text-destructive" title={pago.razon_rechazo || ""}>
                        {pago.razon_rechazo || "-"}
                      </TableCell>
                      <TableCell>{formatDate(pago.fecha_creacion)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {TIPOS_PAGO[pago.id_tipo_pago] || `Tipo ${pago.id_tipo_pago}`}
                        </Badge>
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
    </div>
  );
}
