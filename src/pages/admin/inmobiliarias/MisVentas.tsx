import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

const ITEMS_PER_PAGE = 50;

type Venta = {
  id: number;
  proyecto_nombre: string;
  edificio_nombre: string;
  modelo_nombre: string;
  numero_departamento: string;
  comprador_nombre: string;
  fecha_compra: string;
  precio_final: number;
  total_pagado: number;
  clabe_stp: string;
};

export default function MisVentas() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { canExport } = usePagePermissions('/admin/inmobiliarias/mis-ventas');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { profile } = useAuth();

  // Get the projects the user has access to
  const { data: projectIds = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['user-project-access-ventas', profile?.email],
    queryFn: async () => {
      if (!profile?.email) return [];

      const { data, error } = await (supabase as any)
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('email', profile.email)
        .eq('activo', true);

      if (error) throw error;
      return (data || []).map((p: any) => p.proyecto_id);
    },
    enabled: !!profile?.email,
  });

  // Fetch sales (cuentas_cobranza with tipo = propiedad)
  const { data: ventas = [], isLoading: loadingVentas } = useQuery({
    queryKey: ['mis-ventas', projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];

      // First get property IDs for the projects
      const { data: propiedadesData, error: propError } = await (supabase as any)
        .from('propiedades')
        .select(`
          id,
          numero_departamento,
          edificios_modelos!inner (
            id,
            edificios!inner (
              id,
              nombre,
              proyectos!inner (
                id,
                nombre
              )
            ),
            modelos!inner (
              id,
              nombre
            )
          )
        `)
        .in('edificios_modelos.edificios.proyectos.id', projectIds);

      if (propError) throw propError;

      const propiedadIds = (propiedadesData || []).map((p: any) => p.id);
      if (propiedadIds.length === 0) return [];

      // Now fetch cuentas_cobranza for these properties
      const { data, error } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          fecha_compra,
          precio_final,
          clabe_stp,
          id_propiedad,
          compradores:personas!cuentas_cobranza_id_comprador_fkey (
            id,
            nombre_legal
          ),
          pagos (
            id,
            monto,
            activo
          )
        `)
        .eq('activo', true)
        .eq('tipo', 'propiedad')
        .in('id_propiedad', propiedadIds)
        .order('fecha_compra', { ascending: false });

      if (error) throw error;

      // Map property info
      const propiedadesMap = (propiedadesData || []).reduce((acc: any, p: any) => {
        acc[p.id] = {
          numero_departamento: p.numero_departamento,
          proyecto_nombre: p.edificios_modelos?.edificios?.proyectos?.nombre,
          edificio_nombre: p.edificios_modelos?.edificios?.nombre,
          modelo_nombre: p.edificios_modelos?.modelos?.nombre,
        };
        return acc;
      }, {});

      return (data || []).map((item: any) => {
        const totalPagado = (item.pagos || [])
          .filter((p: any) => p.activo)
          .reduce((sum: number, p: any) => sum + (p.monto || 0), 0);

        const propInfo = propiedadesMap[item.id_propiedad] || {};

        return {
          id: item.id,
          proyecto_nombre: propInfo.proyecto_nombre || '-',
          edificio_nombre: propInfo.edificio_nombre || '-',
          modelo_nombre: propInfo.modelo_nombre || '-',
          numero_departamento: propInfo.numero_departamento || '-',
          comprador_nombre: item.compradores?.nombre_legal || '-',
          fecha_compra: item.fecha_compra,
          precio_final: item.precio_final || 0,
          total_pagado: totalPagado,
          clabe_stp: item.clabe_stp || '-',
        };
      }) as Venta[];
    },
    enabled: projectIds.length > 0,
  });

  const filteredVentas = useMemo(() => {
    if (!searchTerm) return ventas;
    const term = searchTerm.toLowerCase();
    return ventas.filter((v: Venta) =>
      v.proyecto_nombre?.toLowerCase().includes(term) ||
      v.edificio_nombre?.toLowerCase().includes(term) ||
      v.modelo_nombre?.toLowerCase().includes(term) ||
      v.numero_departamento?.toLowerCase().includes(term) ||
      v.comprador_nombre?.toLowerCase().includes(term) ||
      v.clabe_stp?.includes(term)
    );
  }, [ventas, searchTerm]);

  const totalPages = Math.ceil(filteredVentas.length / ITEMS_PER_PAGE);
  const paginatedVentas = filteredVentas.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  );

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) return '-';
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      return format(new Date(dateStr), 'dd/MM/yyyy', { locale: es });
    } catch {
      return dateStr;
    }
  };

  const handleExport = async () => {
    const exportData = filteredVentas.map((v: Venta) => ({
      'Proyecto': v.proyecto_nombre,
      'Edificio': v.edificio_nombre,
      'Modelo': v.modelo_nombre,
      'No. Departamento': v.numero_departamento,
      'Comprador': v.comprador_nombre,
      'Fecha Compra': formatDate(v.fecha_compra),
      'Precio Final': v.precio_final,
      'Pagado': v.total_pagado,
      'Restante': v.precio_final - v.total_pagado,
      'CLABE': v.clabe_stp,
    }));

    await exportToExcel({ data: exportData, filename: 'Mis_Ventas' });
  };

  // Calculate totals
  const totals = useMemo(() => {
    return filteredVentas.reduce((acc, v) => ({
      precioFinal: acc.precioFinal + (v.precio_final || 0),
      pagado: acc.pagado + (v.total_pagado || 0),
    }), { precioFinal: 0, pagado: 0 });
  }, [filteredVentas]);

  const isLoading = loadingProjects || loadingVentas;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Mis Ventas</h1>
          <p className="text-muted-foreground">
            Ventas realizadas en los proyectos a los que tienes acceso
          </p>
        </div>
        {canExport && (
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || filteredVentas.length === 0}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {isExporting ? 'Exportando...' : 'Exportar'}
          </Button>
        )}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{filteredVentas.length}</div>
            <p className="text-sm text-muted-foreground">Total Ventas</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold">{formatCurrency(totals.precioFinal)}</div>
            <p className="text-sm text-muted-foreground">Valor Total</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totals.pagado)}</div>
            <p className="text-sm text-muted-foreground">Total Cobrado</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(totals.precioFinal - totals.pagado)}</div>
            <p className="text-sm text-muted-foreground">Por Cobrar</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Ventas ({filteredVentas.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por proyecto, comprador, departamento..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="pl-10"
              />
            </div>
          </div>

          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Proyecto</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>No. Depto</TableHead>
                  <TableHead>Comprador</TableHead>
                  <TableHead>Fecha Compra</TableHead>
                  <TableHead>Precio Final</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Restante</TableHead>
                  <TableHead>CLABE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedVentas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                      No se encontraron ventas
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedVentas.map((v: Venta) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.proyecto_nombre}</TableCell>
                      <TableCell>{v.edificio_nombre}</TableCell>
                      <TableCell>{v.modelo_nombre}</TableCell>
                      <TableCell>{v.numero_departamento}</TableCell>
                      <TableCell>{v.comprador_nombre}</TableCell>
                      <TableCell>{formatDate(v.fecha_compra)}</TableCell>
                      <TableCell>{formatCurrency(v.precio_final)}</TableCell>
                      <TableCell className="text-green-600">{formatCurrency(v.total_pagado)}</TableCell>
                      <TableCell className="text-orange-600">{formatCurrency(v.precio_final - v.total_pagado)}</TableCell>
                      <TableCell className="font-mono text-xs">{v.clabe_stp}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredVentas.length)} de {filteredVentas.length}
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                >
                  Anterior
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
