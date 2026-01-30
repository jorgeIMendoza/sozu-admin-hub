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
import { InmobiliariaHeader } from "@/components/admin/InmobiliariaHeader";

const ITEMS_PER_PAGE = 50;

export default function MisPropiedades() {
  const [searchTerm, setSearchTerm] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedInmobiliariaId, setSelectedInmobiliariaId] = useState<number | null>(null);
  const { canExport, canGenerateOffer } = usePagePermissions('/admin/inmobiliarias/mis-propiedades');
  const { exportToExcel, isExporting } = useExportToExcel();
  const { profile } = useAuth();

  // Get the projects the inmobiliaria has access to
  const { data: projectIds = [], isLoading: loadingProjects } = useQuery({
    queryKey: ['inmobiliaria-project-access', selectedInmobiliariaId],
    queryFn: async () => {
      if (!selectedInmobiliariaId) return [];

      // Get the email associated with the inmobiliaria persona
      const { data: personaData } = await supabase
        .from('personas')
        .select('email')
        .eq('id', selectedInmobiliariaId)
        .single();

      if (!personaData?.email) return [];

      // Query proyectos_acceso using email directly (usuario_id stores email, not UUID)
      const { data, error } = await supabase
        .from('proyectos_acceso')
        .select('proyecto_id')
        .eq('usuario_id', personaData.email)
        .eq('activo', true);

      if (error) throw error;
      return (data || []).map((p: any) => p.proyecto_id);
    },
    enabled: !!selectedInmobiliariaId,
  });

  // Fetch properties using direct query since RPC has different signature
  const { data: propiedades = [], isLoading: loadingProps } = useQuery({
    queryKey: ['mis-propiedades', projectIds],
    queryFn: async () => {
      if (projectIds.length === 0) return [];

      // Step 1: Get edificios that belong to the projects
      const { data: edificiosData } = await supabase
        .from('edificios')
        .select('id')
        .in('id_proyecto', projectIds);

      const edificioIds = (edificiosData || []).map((e: any) => e.id);
      if (edificioIds.length === 0) return [];

      // Step 2: Get edificios_modelos for those edificios
      const { data: edificiosModelosData } = await supabase
        .from('edificios_modelos')
        .select('id')
        .in('id_edificio', edificioIds);

      const edificioModeloIds = (edificiosModelosData || []).map((em: any) => em.id);
      if (edificioModeloIds.length === 0) return [];

      // Step 3: Get propiedades for those edificios_modelos - simplified query without problematic FK hints
      const { data, error } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          precio_lista,
          m2_interiores,
          m2_exteriores,
          activo,
          clabe_stp_tmp_apartado,
          id_edificio_modelo,
          id_estatus_disponibilidad,
          id_entidad_relacionada_dueno
        `)
        .eq('activo', true)
        .in('id_edificio_modelo', edificioModeloIds)
        .order('numero_propiedad', { ascending: true });

      if (error) {
        console.error('Error fetching propiedades:', error);
        throw error;
      }

      // Step 3.1: Get edificios_modelos data
      const { data: edificiosModelosDetails } = await supabase
        .from('edificios_modelos')
        .select('id, id_edificio, id_modelo')
        .in('id', edificioModeloIds);

      const edificiosModelosMap = new Map((edificiosModelosDetails || []).map((em: any) => [em.id, em]));

      // Step 3.2: Get estatus_disponibilidad
      const estatusIds = [...new Set((data || []).map((p: any) => p.id_estatus_disponibilidad).filter(Boolean))];
      const { data: estatusData } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .in('id', estatusIds);

      const estatusMap = new Map((estatusData || []).map((e: any) => [e.id, e]));

      // Step 3.3: Get entidades_relacionadas and personas for owners
      const entidadIds = [...new Set((data || []).map((p: any) => p.id_entidad_relacionada_dueno).filter(Boolean))];
      let personasMap = new Map();
      if (entidadIds.length > 0) {
        const { data: entidadesData } = await supabase
          .from('entidades_relacionadas')
          .select('id, id_persona')
          .in('id', entidadIds);

        const personaIds = [...new Set((entidadesData || []).map((e: any) => e.id_persona).filter(Boolean))];
        if (personaIds.length > 0) {
          const { data: personasData } = await supabase
            .from('personas')
            .select('id, nombre_legal')
            .in('id', personaIds);

          const personasDataMap = new Map((personasData || []).map((p: any) => [p.id, p]));
          // Map entidad_id -> persona
          for (const ent of (entidadesData || [])) {
            personasMap.set(ent.id, personasDataMap.get(ent.id_persona));
          }
        }
      }

      // Step 3.4: Get cuentas_cobranza with pagos
      const propIds = (data || []).map((p: any) => p.id);
      
      // First get ofertas for these properties
      const { data: ofertasData } = await supabase
        .from('ofertas')
        .select('id, id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true);

      const ofertaIds = (ofertasData || []).map((o: any) => o.id);
      
      let cuentasMap = new Map();
      if (ofertaIds.length > 0) {
        const { data: cuentasData } = await supabase
          .from('cuentas_cobranza')
          .select('id, id_oferta, precio_final, clabe_stp')
          .in('id_oferta', ofertaIds)
          .eq('activo', true);

        // Get pagos for cuentas
        const cuentaIds = (cuentasData || []).map((c: any) => c.id);
        let pagosMap = new Map();
        if (cuentaIds.length > 0) {
          const { data: pagosData } = await supabase
            .from('pagos')
            .select('id, id_cuenta_cobranza, monto, activo')
            .in('id_cuenta_cobranza', cuentaIds)
            .eq('activo', true);

          for (const pago of (pagosData || [])) {
            if (!pagosMap.has(pago.id_cuenta_cobranza)) {
              pagosMap.set(pago.id_cuenta_cobranza, []);
            }
            pagosMap.get(pago.id_cuenta_cobranza).push(pago);
          }
        }

        // Build cuenta with pagos, mapped by propiedad_id via oferta
        const ofertaPropMap = new Map((ofertasData || []).map((o: any) => [o.id, o.id_propiedad]));
        for (const cuenta of (cuentasData || [])) {
          const propId = ofertaPropMap.get(cuenta.id_oferta);
          if (propId) {
            cuentasMap.set(propId, {
              ...cuenta,
              pagos: pagosMap.get(cuenta.id) || []
            });
          }
        }
      }

      // Step 3.5: Get counts for ofertas, estacionamientos, bodegas
      const { data: ofertasCountData } = await supabase
        .from('ofertas')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true)
        .is('id_producto', null);

      const ofertasCountMap = new Map();
      for (const o of (ofertasCountData || [])) {
        ofertasCountMap.set(o.id_propiedad, (ofertasCountMap.get(o.id_propiedad) || 0) + 1);
      }

      const { data: ofertasProdCountData } = await supabase
        .from('ofertas')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true)
        .not('id_producto', 'is', null);

      const ofertasProdCountMap = new Map();
      for (const o of (ofertasProdCountData || [])) {
        ofertasProdCountMap.set(o.id_propiedad, (ofertasProdCountMap.get(o.id_propiedad) || 0) + 1);
      }

      const { data: estCountData } = await supabase
        .from('estacionamientos')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true);

      const estCountMap = new Map();
      for (const e of (estCountData || [])) {
        estCountMap.set(e.id_propiedad, (estCountMap.get(e.id_propiedad) || 0) + 1);
      }

      const { data: bodCountData } = await supabase
        .from('bodegas')
        .select('id_propiedad')
        .in('id_propiedad', propIds)
        .eq('activo', true);

      const bodCountMap = new Map();
      for (const b of (bodCountData || [])) {
        bodCountMap.set(b.id_propiedad, (bodCountMap.get(b.id_propiedad) || 0) + 1);
      }

      // Step 4: Get additional data for edificios and modelos separately
      const edificioIdsForDetails = [...new Set(
        (data || []).map((p: any) => edificiosModelosMap.get(p.id_edificio_modelo)?.id_edificio).filter(Boolean)
      )];
      const { data: edificiosDetails } = await supabase
        .from('edificios')
        .select('id, nombre, id_proyecto')
        .in('id', edificioIdsForDetails);

      // Fetch proyectos info  
      const proyectoIdsForDetails = [...new Set((edificiosDetails || []).map((e: any) => e.id_proyecto).filter(Boolean))];
      const { data: proyectosDetails } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .in('id', proyectoIdsForDetails);

      // Fetch modelos info
      const modeloIdsForDetails = [...new Set(
        (data || []).map((p: any) => edificiosModelosMap.get(p.id_edificio_modelo)?.id_modelo).filter(Boolean)
      )];
      const { data: modelosDetails } = await supabase
        .from('modelos')
        .select('id, nombre, numero_recamaras, numero_completo_banos')
        .in('id', modeloIdsForDetails);

      // Create lookup maps
      const edificiosMap = new Map((edificiosDetails || []).map((e: any) => [e.id, e]));
      const proyectosMap = new Map((proyectosDetails || []).map((p: any) => [p.id, p]));
      const modelosMap = new Map((modelosDetails || []).map((m: any) => [m.id, m]));

      return (data || []).map((p: any) => {
        const edModelo = edificiosModelosMap.get(p.id_edificio_modelo);
        const cuentaCobranza = cuentasMap.get(p.id);
        const totalPagado = cuentaCobranza?.pagos
          ?.reduce((sum: number, pago: any) => sum + (pago.monto || 0), 0) || 0;

        const areaTotal = (Number(p.m2_interiores) || 0) + (Number(p.m2_exteriores) || 0);

        // Get edificio and proyecto from lookups
        const edificioId = edModelo?.id_edificio;
        const modeloId = edModelo?.id_modelo;
        const edificio = edificiosMap.get(edificioId);
        const proyecto = edificio ? proyectosMap.get(edificio.id_proyecto) : null;
        const modelo = modelosMap.get(modeloId);
        const estatus = estatusMap.get(p.id_estatus_disponibilidad);
        const propietarioPersona = personasMap.get(p.id_entidad_relacionada_dueno);

        return {
          id: p.id,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          modelo_nombre: modelo?.nombre,
          numero_departamento: p.numero_propiedad,
          area_total: areaTotal > 0 ? areaTotal : null,
          recamaras: modelo?.numero_recamaras,
          banos: modelo?.numero_completo_banos,
          precio_lista: p.precio_lista,
          estatus_disponibilidad_nombre: estatus?.nombre,
          propietario_nombre: propietarioPersona?.nombre_legal,
          cuenta_cobranza_id: cuentaCobranza?.id,
          clabe_stp: cuentaCobranza?.clabe_stp || p.clabe_stp_tmp_apartado,
          precio_final: cuentaCobranza?.precio_final,
          total_pagado: totalPagado,
          num_ofertas: ofertasCountMap.get(p.id) || 0,
          num_ofertas_productos: ofertasProdCountMap.get(p.id) || 0,
          num_estacionamientos: estCountMap.get(p.id) || 0,
          num_bodegas: bodCountMap.get(p.id) || 0,
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

  if (isLoading && !selectedInmobiliariaId) {
    return (
      <div className="space-y-6">
        <InmobiliariaHeader
          selectedInmobiliariaId={selectedInmobiliariaId}
          onInmobiliariaChange={setSelectedInmobiliariaId}
        />
        <div className="flex items-center justify-center min-h-[400px]">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <InmobiliariaHeader
        selectedInmobiliariaId={selectedInmobiliariaId}
        onInmobiliariaChange={setSelectedInmobiliariaId}
      />

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
