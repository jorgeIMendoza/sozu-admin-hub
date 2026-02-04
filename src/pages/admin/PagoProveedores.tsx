import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Search, X, RefreshCw, Download, ChevronLeft, ChevronRight } from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useExportToExcel } from '@/hooks/useExportToExcel';
import { usePagePermissions } from '@/hooks/usePagePermissions';

const PAGE_SIZE = 50;

interface PagoProveedor {
  id: number;
  claverastreo: string;
  monto: number;
  cuenta_beneficiario: string;
  nombre_ordenante: string | null;
  nombre_beneficiario: string | null;
  empresa: string | null;
  fecha_operacion: string | null;
  concepto_pago: string | null;
}

interface ProveedorCuenta {
  cuenta_stp_comisiones: string;
  personas: {
    nombre_legal: string | null;
  } | null;
}

export default function PagoProveedores() {
  const [currentPage, setCurrentPage] = useState(1);
  const [filters, setFilters] = useState({
    search: '',
    fechaDesde: '',
    fechaHasta: '',
    beneficiario: ''
  });
  
  const { exportToExcel, isExporting } = useExportToExcel();
  const { canExport } = usePagePermissions('/admin/pago-proveedores');

  // Query para obtener CLABEs de proveedores
  const { data: proveedorCuentas = [] } = useQuery({
    queryKey: ['proveedor-cuentas-stp'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('cuenta_stp_comisiones, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
        .eq('id_tipo_entidad', 8)
        .not('cuenta_stp_comisiones', 'is', null);
      if (error) throw error;
      return (data || []) as ProveedorCuenta[];
    }
  });

  // Query principal con paginacion (sin limite de 1000)
  const { data: pagosData, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['pagos-proveedores', filters, currentPage, proveedorCuentas],
    queryFn: async () => {
      if (proveedorCuentas.length === 0) return { data: [], count: 0 };
      
      const cuentas = proveedorCuentas.map(p => p.cuenta_stp_comisiones);
      
      // Obtener count total
      let countQuery = supabase
        .from('pagos_stp_raw')
        .select('*', { count: 'exact', head: true })
        .eq('es_pago_aplicado', true)
        .in('cuenta_beneficiario', cuentas);
      
      // Aplicar filtros al count
      if (filters.fechaDesde) {
        countQuery = countQuery.gte('fecha_operacion', filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        countQuery = countQuery.lte('fecha_operacion', filters.fechaHasta);
      }
      if (filters.beneficiario) {
        countQuery = countQuery.ilike('cuenta_beneficiario', `%${filters.beneficiario}%`);
      }
      if (filters.search) {
        countQuery = countQuery.ilike('claverastreo', `%${filters.search}%`);
      }
      
      const { count } = await countQuery;
      
      // Obtener datos paginados
      const from = (currentPage - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      
      let dataQuery = supabase
        .from('pagos_stp_raw')
        .select('id, claverastreo, monto, cuenta_beneficiario, nombre_ordenante, nombre_beneficiario, empresa, fecha_operacion, concepto_pago')
        .eq('es_pago_aplicado', true)
        .in('cuenta_beneficiario', cuentas)
        .order('fecha_operacion', { ascending: false })
        .range(from, to);
      
      // Aplicar mismos filtros
      if (filters.fechaDesde) {
        dataQuery = dataQuery.gte('fecha_operacion', filters.fechaDesde);
      }
      if (filters.fechaHasta) {
        dataQuery = dataQuery.lte('fecha_operacion', filters.fechaHasta);
      }
      if (filters.beneficiario) {
        dataQuery = dataQuery.ilike('cuenta_beneficiario', `%${filters.beneficiario}%`);
      }
      if (filters.search) {
        dataQuery = dataQuery.ilike('claverastreo', `%${filters.search}%`);
      }
      
      const { data, error } = await dataQuery;
      if (error) throw error;
      
      return { data: data as PagoProveedor[], count: count || 0 };
    },
    enabled: proveedorCuentas.length > 0
  });

  // Funcion para exportar (sin limite - obtiene TODOS los registros)
  const handleExport = async () => {
    if (proveedorCuentas.length === 0) return;
    
    const cuentas = proveedorCuentas.map(p => p.cuenta_stp_comisiones);
    
    // Para exportar todos los registros, necesitamos hacer múltiples queries si hay más de 1000
    const allData: Record<string, unknown>[] = [];
    const batchSize = 1000;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      let query = supabase
        .from('pagos_stp_raw')
        .select('claverastreo, monto, cuenta_beneficiario, nombre_ordenante, nombre_beneficiario, empresa, fecha_operacion, concepto_pago')
        .eq('es_pago_aplicado', true)
        .in('cuenta_beneficiario', cuentas)
        .order('fecha_operacion', { ascending: false })
        .range(offset, offset + batchSize - 1);
      
      // Aplicar filtros
      if (filters.fechaDesde) query = query.gte('fecha_operacion', filters.fechaDesde);
      if (filters.fechaHasta) query = query.lte('fecha_operacion', filters.fechaHasta);
      if (filters.beneficiario) query = query.ilike('cuenta_beneficiario', `%${filters.beneficiario}%`);
      if (filters.search) query = query.ilike('claverastreo', `%${filters.search}%`);
      
      const { data, error } = await query;
      if (error) break;
      
      if (data && data.length > 0) {
        allData.push(...(data as Record<string, unknown>[]));
        offset += batchSize;
        hasMore = data.length === batchSize;
      } else {
        hasMore = false;
      }
    }
    
    await exportToExcel({
      data: allData,
      filename: 'pagos_proveedores',
      columnas_visibles: [
        { key: 'claverastreo', label: 'Clave Rastreo' },
        { key: 'monto', label: 'Monto' },
        { key: 'cuenta_beneficiario', label: 'Cuenta Beneficiario' },
        { key: 'nombre_ordenante', label: 'Nombre Ordenante' },
        { key: 'nombre_beneficiario', label: 'Nombre Beneficiario' },
        { key: 'empresa', label: 'Empresa' },
        { key: 'fecha_operacion', label: 'Fecha Operacion' },
        { key: 'concepto_pago', label: 'Concepto' },
      ]
    });
  };

  const clearFilters = () => {
    setFilters({
      search: '',
      fechaDesde: '',
      fechaHasta: '',
      beneficiario: ''
    });
    setCurrentPage(1);
  };

  const totalPages = Math.ceil((pagosData?.count || 0) / PAGE_SIZE);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return '-';
    try {
      // Parse date components directly to avoid timezone issues
      const [year, month, day] = dateString.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      return format(localDate, 'dd/MM/yyyy', { locale: es });
    } catch {
      return dateString;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pago Proveedores</h1>
          <p className="text-muted-foreground">
            Listado de pagos realizados a proveedores
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={() => refetch()}
            disabled={isFetching}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isFetching ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
          {canExport && (
            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleExport}
              disabled={isExporting || !pagosData?.data?.length}
            >
              <Download className="h-4 w-4 mr-2" />
              {isExporting ? 'Exportando...' : 'Exportar Excel'}
            </Button>
          )}
        </div>
      </div>

      {/* Filtros */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Search className="h-5 w-5" />
            Filtros
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="space-y-2">
              <Label htmlFor="search">Clave de Rastreo</Label>
              <Input
                id="search"
                placeholder="Buscar clave de rastreo..."
                value={filters.search}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, search: e.target.value }));
                  setCurrentPage(1);
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="beneficiario">Cuenta Beneficiario</Label>
              <Input
                id="beneficiario"
                placeholder="Buscar cuenta beneficiario..."
                value={filters.beneficiario}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, beneficiario: e.target.value }));
                  setCurrentPage(1);
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fechaDesde">Fecha desde</Label>
              <Input
                id="fechaDesde"
                type="date"
                value={filters.fechaDesde}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, fechaDesde: e.target.value }));
                  setCurrentPage(1);
                }}
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="fechaHasta">Fecha hasta</Label>
              <Input
                id="fechaHasta"
                type="date"
                value={filters.fechaHasta}
                onChange={(e) => {
                  setFilters(prev => ({ ...prev, fechaHasta: e.target.value }));
                  setCurrentPage(1);
                }}
              />
            </div>
          </div>
          
          {(filters.search || filters.fechaDesde || filters.fechaHasta || filters.beneficiario) && (
            <div className="mt-4 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 mr-2" />
                Limpiar filtros
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Tabla */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">
              Pagos ({pagosData?.count || 0} registros)
            </CardTitle>
            {totalPages > 1 && (
              <Badge variant="outline">
                Página {currentPage} de {totalPages}
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : pagosData?.data?.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No se encontraron pagos con los filtros seleccionados
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Clave Rastreo</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                      <TableHead>Cuenta Beneficiario</TableHead>
                      <TableHead>Nombre Ordenante</TableHead>
                      <TableHead>Nombre Beneficiario</TableHead>
                      <TableHead>Empresa</TableHead>
                      <TableHead>Fecha Operación</TableHead>
                      <TableHead>Concepto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pagosData?.data?.map((pago) => (
                      <TableRow key={pago.id}>
                        <TableCell className="font-mono text-xs">
                          {pago.claverastreo}
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          {formatCurrency(pago.monto)}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {pago.cuenta_beneficiario}
                        </TableCell>
                        <TableCell>{pago.nombre_ordenante || '-'}</TableCell>
                        <TableCell>{pago.nombre_beneficiario || '-'}</TableCell>
                        <TableCell>
                          {pago.empresa ? (
                            <Badge variant="secondary">{pago.empresa}</Badge>
                          ) : '-'}
                        </TableCell>
                        <TableCell>{formatDate(pago.fecha_operacion)}</TableCell>
                        <TableCell className="max-w-[200px] truncate" title={pago.concepto_pago || ''}>
                          {pago.concepto_pago || '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 pt-4 border-t">
                  <div className="text-sm text-muted-foreground">
                    Mostrando {((currentPage - 1) * PAGE_SIZE) + 1} - {Math.min(currentPage * PAGE_SIZE, pagosData?.count || 0)} de {pagosData?.count || 0}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                      disabled={currentPage === 1}
                    >
                      <ChevronLeft className="h-4 w-4" />
                      Anterior
                    </Button>
                    <div className="flex items-center gap-1">
                      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                        let pageNum: number;
                        if (totalPages <= 5) {
                          pageNum = i + 1;
                        } else if (currentPage <= 3) {
                          pageNum = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNum = totalPages - 4 + i;
                        } else {
                          pageNum = currentPage - 2 + i;
                        }
                        
                        return (
                          <Button
                            key={pageNum}
                            variant={currentPage === pageNum ? "default" : "outline"}
                            size="sm"
                            className="w-8 h-8 p-0"
                            onClick={() => setCurrentPage(pageNum)}
                          >
                            {pageNum}
                          </Button>
                        );
                      })}
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                      disabled={currentPage === totalPages}
                    >
                      Siguiente
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
