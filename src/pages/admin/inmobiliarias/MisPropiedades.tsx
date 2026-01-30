import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, FileSpreadsheet, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useExportToExcel } from "@/hooks/useExportToExcel";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const ITEMS_PER_PAGE = 50;

export default function MisPropiedades() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { canExport, canGenerateOffer } = usePagePermissions('/admin/inmobiliarias/mis-propiedades');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { profile } = useAuth();

  // Get the projects the user has access to
  const { data: projectIds = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['user-project-access', profile?.email],
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

  // Fetch properties using direct query since RPC has different signature
  const { data: propiedades = [], isLoading: loadingProps } = useQuery({
    queryKey: ['mis-propiedades', projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];

      const { data, error } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_departamento,
          precio_lista,
          area_total,
          activo,
          clabe_stp_tmp_apartado,
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
              nombre,
              numero_recamaras,
              numero_completo_banos
            )
          ),
          estatus_disponibilidad (
            id,
            nombre
          ),
          persona_dueno:personas!propiedades_id_persona_dueno_fkey (
            id,
            nombre_legal
          ),
          cuentas_cobranza (
            id,
            precio_final,
            clabe_stp,
            pagos (
              id,
              monto,
              activo
            )
          ),
          ofertas (count),
          ofertas_productos (count),
          estacionamientos (count),
          bodegas (count)
        `)
        .eq('activo', true)
        .in('edificios_modelos.edificios.proyectos.id', projectIds)
        .order('numero_departamento', { ascending: true });

      if (error) throw error;

      return (data || []).map((p: any) => {
        const cuentaCobranza = p.cuentas_cobranza?.[0];
        const totalPagado = cuentaCobranza?.pagos
          ?.filter((pago: any) => pago.activo)
          .reduce((sum: number, pago: any) => sum + (pago.monto || 0), 0) || 0;

        return {
          id: p.id,
          proyecto_nombre: p.edificios_modelos?.edificios?.proyectos?.nombre,
          edificio_nombre: p.edificios_modelos?.edificios?.nombre,
          modelo_nombre: p.edificios_modelos?.modelos?.nombre,
          numero_departamento: p.numero_departamento,
          area_total: p.area_total,
          recamaras: p.edificios_modelos?.modelos?.numero_recamaras,
          banos: p.edificios_modelos?.modelos?.numero_completo_banos,
          precio_lista: p.precio_lista,
          estatus_disponibilidad_nombre: p.estatus_disponibilidad?.nombre,
          propietario_nombre: p.persona_dueno?.nombre_legal,
          cuenta_cobranza_id: cuentaCobranza?.id,
          clabe_stp: cuentaCobranza?.clabe_stp || p.clabe_stp_tmp_apartado,
          precio_final: cuentaCobranza?.precio_final,
          total_pagado: totalPagado,
          num_ofertas: p.ofertas?.[0]?.count || 0,
          num_ofertas_productos: p.ofertas_productos?.[0]?.count || 0,
          num_estacionamientos: p.estacionamientos?.[0]?.count || 0,
          num_bodegas: p.bodegas?.[0]?.count || 0,
        };
      });
    },
    enabled: projectIds.length > 0,
  });

  const filteredPropiedades = useMemo(() => {
    if (!searchTerm) return propiedades;
    const term = searchTerm.toLowerCase();
    return propiedades.filter((p: any) =>
      p.proyecto_nombre?.toLowerCase().includes(term) ||
      p.edificio_nombre?.toLowerCase().includes(term) ||
      p.modelo_nombre?.toLowerCase().includes(term) ||
      p.numero_departamento?.toLowerCase().includes(term) ||
      p.propietario_nombre?.toLowerCase().includes(term) ||
      p.clabe_stp?.includes(term)
    );
  }, [propiedades, searchTerm]);

  const totalPages = Math.ceil(filteredPropiedades.length / ITEMS_PER_PAGE);
  const paginatedProps = filteredPropiedades.slice(
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

  const getStatusColor = (status: string) => {
    switch (status?.toLowerCase()) {
      case 'disponible': return 'bg-green-100 text-green-800';
      case 'vendida': return 'bg-blue-100 text-blue-800';
      case 'apartada': return 'bg-yellow-100 text-yellow-800';
      case 'bloqueada': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const handleExport = async () => {
    const exportData = filteredPropiedades.map((p: any) => ({
      'Proyecto': p.proyecto_nombre,
      'Propietario': p.propietario_nombre || '-',
      'Edificio': p.edificio_nombre,
      'Modelo': p.modelo_nombre,
      'No. Departamento': p.numero_departamento,
      'Área (m²)': p.area_total || '-',
      'Configuración': `${p.recamaras || 0}R/${p.banos || 0}B`,
      'Precio Lista': p.precio_lista || 0,
      'Estacionamientos': p.num_estacionamientos || 0,
      'Bodegas': p.num_bodegas || 0,
      'Ofertas Comerciales': p.num_ofertas || 0,
      'Ofertas Productos': p.num_ofertas_productos || 0,
      'Estatus': p.estatus_disponibilidad_nombre,
      'Cuenta Cobranza': p.cuenta_cobranza_id ? 'Sí' : 'No',
      'CLABE': p.clabe_stp || '-',
      'Precio Final': p.precio_final || 0,
      'Pagado': p.total_pagado || 0,
      'Restante': (p.precio_final || 0) - (p.total_pagado || 0),
    }));

    await exportToExcel({ data: exportData, filename: 'Mis_Propiedades' });
  };

  const isLoading = loadingProjects || loadingProps;

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
          <h1 className="text-3xl font-bold tracking-tight">Mis Propiedades</h1>
          <p className="text-muted-foreground">
            Propiedades de los proyectos a los que tienes acceso
          </p>
        </div>
        {canExport && (
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={isExporting || filteredPropiedades.length === 0}
          >
            <FileSpreadsheet className="mr-2 h-4 w-4" />
            {isExporting ? 'Exportando...' : 'Exportar'}
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Propiedades ({filteredPropiedades.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Buscar por proyecto, edificio, modelo, departamento..."
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
                  <TableHead>Propietario</TableHead>
                  <TableHead>Edificio</TableHead>
                  <TableHead>Modelo</TableHead>
                  <TableHead>No. Depto</TableHead>
                  <TableHead>Área</TableHead>
                  <TableHead>Config.</TableHead>
                  <TableHead>Precio Lista</TableHead>
                  <TableHead>Est.</TableHead>
                  <TableHead>Bod.</TableHead>
                  <TableHead>Of. Com.</TableHead>
                  <TableHead>Of. Prod.</TableHead>
                  <TableHead>Estatus</TableHead>
                  <TableHead>Cta. Cob.</TableHead>
                  <TableHead>CLABE</TableHead>
                  <TableHead>Precio Final</TableHead>
                  <TableHead>Pagado</TableHead>
                  <TableHead>Restante</TableHead>
                  {canGenerateOffer && <TableHead>Acciones</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedProps.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={canGenerateOffer ? 19 : 18} className="text-center py-8 text-muted-foreground">
                      No se encontraron propiedades
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedProps.map((p: any) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.proyecto_nombre}</TableCell>
                      <TableCell>{p.propietario_nombre || '-'}</TableCell>
                      <TableCell>{p.edificio_nombre}</TableCell>
                      <TableCell>{p.modelo_nombre}</TableCell>
                      <TableCell>{p.numero_departamento}</TableCell>
                      <TableCell>{p.area_total ? `${p.area_total} m²` : '-'}</TableCell>
                      <TableCell>{p.recamaras || 0}R/{p.banos || 0}B</TableCell>
                      <TableCell>{formatCurrency(p.precio_lista)}</TableCell>
                      <TableCell>{p.num_estacionamientos || 0}</TableCell>
                      <TableCell>{p.num_bodegas || 0}</TableCell>
                      <TableCell>{p.num_ofertas || 0}</TableCell>
                      <TableCell>{p.num_ofertas_productos || 0}</TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(p.estatus_disponibilidad_nombre)}>
                          {p.estatus_disponibilidad_nombre || '-'}
                        </Badge>
                      </TableCell>
                      <TableCell>{p.cuenta_cobranza_id ? 'Sí' : 'No'}</TableCell>
                      <TableCell className="font-mono text-xs">{p.clabe_stp || '-'}</TableCell>
                      <TableCell>{formatCurrency(p.precio_final)}</TableCell>
                      <TableCell>{formatCurrency(p.total_pagado)}</TableCell>
                      <TableCell>{formatCurrency((p.precio_final || 0) - (p.total_pagado || 0))}</TableCell>
                      {canGenerateOffer && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Generar Oferta"
                            disabled={p.estatus_disponibilidad_nombre?.toLowerCase() !== 'disponible'}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <p className="text-sm text-muted-foreground">
                Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} - {Math.min(currentPage * ITEMS_PER_PAGE, filteredPropiedades.length)} de {filteredPropiedades.length}
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
