import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem, PaginationLink, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { CompradoresConDocumentosDialog } from "@/components/admin/CompradoresConDocumentosDialog";
import { ValidarPlaceholdersDialog } from "@/components/admin/ValidarPlaceholdersDialog";
import { SubirContratoFirmadoDialog } from "@/components/admin/SubirContratoFirmadoDialog";

interface Contrato {
  cuenta_id: number;
  proyecto: string;
  proyecto_id: number;
  edificio: string | null;
  modelo: string | null;
  numero_propiedad: string | null;
  dueno: string;
  precio_final: number;
  contrato_draft: string | null;
  propiedad_id: number | null;
  oferta_id: number;
  tipo: 'Propiedad' | 'Producto';
  producto_nombre: string | null;
  producto_id: number | null;
}

interface Comprador {
  id_persona: number;
  nombre_legal: string;
  rfc: string | null;
  curp: string | null;
  tipo_persona: 'PF' | 'PM';
  porcentaje_copropiedad: number;
  email: string | null;
  telefono: string | null;
  documentos: Documento[];
}

interface Documento {
  id: number;
  tipo: string;
  url: string;
  fecha: string;
}

export default function Contratos() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [filters, setFilters] = useState({
    proyecto: "",
    edificio: "",
    modelo: "",
    numero_propiedad: "",
    dueno: "",
    cuenta_cobranza: "",
    tipo: "",
  });

  // Paginación
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const [validandoCuentaId, setValidandoCuentaId] = useState<number | null>(null);

  const [validacionDialogData, setValidacionDialogData] = useState<{
    validacion: any;
    compradores: any[];
    tipo_persona: string;
    template_name: string;
    cuenta_id: number;
  } | null>(null);

  const [subirContratoDialogOpen, setSubirContratoDialogOpen] = useState(false);
  const [cuentaParaSubirContrato, setCuentaParaSubirContrato] = useState<number | null>(null);

  // Reset page when filters change
  useEffect(() => {
    setCurrentPage(1);
  }, [filters]);

  // Fetch contratos pendientes (propiedades y productos)
  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ['contratos-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: `
          -- Query para PROPIEDADES
          SELECT DISTINCT
            cc.id as cuenta_id,
            cc.precio_final,
            cc.contrato_draft,
            o.id as oferta_id,
            p.id as propiedad_id,
            p.numero_propiedad,
            ed.nombre as edificio,
            m.nombre as modelo,
            proy.id as proyecto_id,
            proy.nombre as proyecto,
            per_dueno.nombre_legal as dueno,
            'Propiedad' as tipo,
            NULL::text as producto_nombre,
            NULL::integer as producto_id
          FROM cuentas_cobranza cc
          JOIN ofertas o ON cc.id_oferta = o.id
          JOIN propiedades p ON o.id_propiedad = p.id
          JOIN estatus_disponibilidad est ON p.id_estatus_disponibilidad = est.id
          JOIN edificios_modelos em ON p.id_edificio_modelo = em.id
          JOIN edificios ed ON em.id_edificio = ed.id
          JOIN modelos m ON em.id_modelo = m.id
          JOIN entidades_relacionadas er_dueno ON p.id_entidad_relacionada_dueno = er_dueno.id
          JOIN proyectos proy ON er_dueno.id_proyecto = proy.id
          JOIN personas per_dueno ON er_dueno.id_persona = per_dueno.id
          WHERE cc.activo = true
            AND o.activo = true
            AND p.activo = true
            AND o.id_propiedad IS NOT NULL
            AND est.id IN (4, 5)
            AND NOT EXISTS (
              SELECT 1 FROM documentos doc
              WHERE doc.id_cuenta_cobranza = cc.id
                AND doc.id_tipo_documento = 18
                AND doc.activo = true
            )
            AND NOT EXISTS (
              SELECT 1 FROM compradores comp
              WHERE comp.id_cuenta_cobranza = cc.id
                AND comp.activo = true
                AND comp.id_persona IS NOT NULL
                AND (
                  EXISTS (
                    SELECT 1 FROM documentos doc_no_verificado
                    WHERE doc_no_verificado.id_persona = comp.id_persona
                      AND doc_no_verificado.id_estatus_verificacion != 2
                      AND doc_no_verificado.activo = true
                      AND doc_no_verificado.id_cuenta_cobranza IS NULL
                  )
                  OR NOT EXISTS (
                    SELECT 1 FROM documentos doc_verificado
                    WHERE doc_verificado.id_persona = comp.id_persona
                      AND doc_verificado.id_estatus_verificacion = 2
                      AND doc_verificado.activo = true
                      AND doc_verificado.id_cuenta_cobranza IS NULL
                  )
                )
            )
            AND EXISTS (
              SELECT 1 FROM compradores comp2
              WHERE comp2.id_cuenta_cobranza = cc.id
                AND comp2.activo = true
            )

          UNION ALL

          -- Query para PRODUCTOS
          SELECT DISTINCT
            cc.id as cuenta_id,
            cc.precio_final,
            cc.contrato_draft,
            o.id as oferta_id,
            NULL::integer as propiedad_id,
            NULL::text as numero_propiedad,
            NULL::text as edificio,
            NULL::text as modelo,
            proy.id as proyecto_id,
            proy.nombre as proyecto,
            per_dueno.nombre_legal as dueno,
            'Producto' as tipo,
            ps.nombre as producto_nombre,
            ps.id as producto_id
          FROM cuentas_cobranza cc
          JOIN ofertas o ON cc.id_oferta = o.id
          JOIN productos_servicios ps ON o.id_producto = ps.id
          JOIN entidades_relacionadas er_dueno ON ps.id_entidad_relacionada_dueno = er_dueno.id
          JOIN proyectos proy ON er_dueno.id_proyecto = proy.id
          JOIN personas per_dueno ON er_dueno.id_persona = per_dueno.id
          WHERE cc.activo = true
            AND o.activo = true
            AND o.id_producto IS NOT NULL
            AND NOT EXISTS (
              SELECT 1 FROM documentos doc
              WHERE doc.id_cuenta_cobranza = cc.id
                AND doc.id_tipo_documento = 18
                AND doc.activo = true
            )
            AND NOT EXISTS (
              SELECT 1 FROM compradores comp
              WHERE comp.id_cuenta_cobranza = cc.id
                AND comp.activo = true
                AND comp.id_persona IS NOT NULL
                AND (
                  EXISTS (
                    SELECT 1 FROM documentos doc_no_verificado
                    WHERE doc_no_verificado.id_persona = comp.id_persona
                      AND doc_no_verificado.id_estatus_verificacion != 2
                      AND doc_no_verificado.activo = true
                      AND doc_no_verificado.id_cuenta_cobranza IS NULL
                  )
                  OR NOT EXISTS (
                    SELECT 1 FROM documentos doc_verificado
                    WHERE doc_verificado.id_persona = comp.id_persona
                      AND doc_verificado.id_estatus_verificacion = 2
                      AND doc_verificado.activo = true
                      AND doc_verificado.id_cuenta_cobranza IS NULL
                  )
                )
            )
            AND EXISTS (
              SELECT 1 FROM compradores comp2
              WHERE comp2.id_cuenta_cobranza = cc.id
                AND comp2.activo = true
            )

          ORDER BY proyecto, numero_propiedad NULLS LAST, producto_nombre NULLS LAST
        `,
        max_rows: 1000
      });

      if (error) throw error;
      
      // Parse JSONB response
      if (Array.isArray(data)) {
        return data as unknown as Contrato[];
      }
      return [];
    },
  });

  // Fetch compradores con documentos
  const fetchCompradores = async (cuentaId: number): Promise<Comprador[]> => {
    const { data, error } = await supabase
      .from('compradores')
      .select(`
        id_persona,
        porcentaje_copropiedad,
        personas!compradores_id_persona_fkey(
          nombre_legal,
          rfc,
          curp,
          tipo_persona,
          email,
          telefono
        )
      `)
      .eq('id_cuenta_cobranza', cuentaId)
      .eq('activo', true);

    if (error) throw error;

    const compradoresConDocs = await Promise.all(
      (data || []).map(async (c: any) => {
        const { data: docs } = await supabase
          .from('documentos')
          .select(`
            id,
            url,
            fecha_creacion,
            tipos_documento!inner(nombre)
          `)
          .eq('id_persona', c.id_persona)
          .is('id_cuenta_cobranza', null)
          .eq('id_estatus_verificacion', 2) // 2 = Validado
          .eq('activo', true);

        return {
          id_persona: c.id_persona,
          nombre_legal: c.personas.nombre_legal,
          rfc: c.personas.rfc,
          curp: c.personas.curp,
          tipo_persona: c.personas.tipo_persona,
          porcentaje_copropiedad: c.porcentaje_copropiedad,
          email: c.personas.email,
          telefono: c.personas.telefono,
          documentos: (docs || []).map((d: any) => ({
            id: d.id,
            tipo: d.tipos_documento.nombre,
            url: d.url,
            fecha: d.fecha_creacion,
          })),
        };
      })
    );

    return compradoresConDocs;
  };

  // Generar contrato mutation
  const generarContratoMutation = useMutation({
    mutationFn: async ({ cuentaId, marcarVacios }: { cuentaId: number; marcarVacios: boolean }) => {
      const { data, error } = await supabase.functions.invoke('generar-contrato', {
        body: { id_cuenta_cobranza: cuentaId, marcar_vacios: marcarVacios },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Error desconocido');

      return data;
    },
    onSuccess: (data) => {
      const warnings = [];
      
      if (data.warnings?.missing_placeholders?.length > 0) {
        warnings.push(`🟠 ${data.warnings.missing_placeholders.length} placeholders Por Solicitar (resaltados en NARANJA)`);
      }
      if (data.warnings?.empty_placeholders?.length > 0) {
        warnings.push(`🟡 ${data.warnings.empty_placeholders.length} placeholders vacíos (resaltados en AMARILLO)`);
      }

      const hasWarnings = warnings.length > 0;
      
      if (hasWarnings) {
        toast({
          title: "⚠️ Contrato generado con advertencias",
          description: (
            <div className="space-y-2">
              <p className="font-medium">
                👥 {data.warnings?.total_compradores || 0} comprador(es) procesados
              </p>
              <div className="space-y-1">
                {warnings.map((w, i) => (
                  <p key={i} className="text-sm">{w}</p>
                ))}
              </div>
              <p className="text-sm mt-2">
                📄 Los campos problemáticos están resaltados en el documento.
              </p>
              {data.document_url && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2 w-full"
                  onClick={() => window.open(data.document_url, '_blank')}
                >
                  Abrir Documento
                </Button>
              )}
            </div>
          ),
          duration: 15000,
        });
      } else {
        toast({
          title: "✅ Contrato generado exitosamente",
          description: (
            <div className="space-y-2">
              <p>El contrato se generó correctamente.</p>
              <p className="text-sm">
                👥 Se procesaron {data.warnings?.total_compradores || 0} comprador(es).
              </p>
              {data.document_url && (
                <Button 
                  size="sm" 
                  variant="outline" 
                  className="mt-2 w-full"
                  onClick={() => window.open(data.document_url, '_blank')}
                >
                  Abrir Documento
                </Button>
              )}
            </div>
          ),
          duration: 5000,
        });
      }

      queryClient.invalidateQueries({ queryKey: ['contratos-pendientes'] });
    },
    onError: (error: any) => {
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo generar el contrato.",
        variant: "destructive",
        duration: 7000,
      });
    },
  });

  // Validar placeholders mutation
  const validarPlaceholdersMutation = useMutation({
    mutationFn: async (cuentaId: number) => {
      setValidandoCuentaId(cuentaId);
      const { data, error } = await supabase.functions.invoke('validar-placeholders-contrato', {
        body: { id_cuenta_cobranza: cuentaId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Error desconocido');

      return { ...data, cuenta_id: cuentaId };
    },
    onSuccess: (data) => {
      setValidandoCuentaId(null);
      setValidacionDialogData(data);
      
      // Toast simple y corto - use 'validacion' not 'validation'
      const validation = data.validacion;
      
      if (validation) {
        toast({
          title: validation.tiene_problemas ? "⚠️ Problemas detectados" : "✅ Todo listo",
          description: validation.tiene_problemas 
            ? `${validation.total_faltantes} por solicitar, ${validation.total_vacios} vacíos. Revisa el diálogo.`
            : `Todos los ${validation.total_disponibles} placeholders están listos.`,
          duration: 2000,
        });
      }
    },
    onError: (error: any) => {
      setValidandoCuentaId(null);
      toast({
        title: "❌ Error",
        description: error.message || "No se pudo validar los placeholders.",
        variant: "destructive",
        duration: 5000,
      });
    },
  });

  // Filtrar contratos
  const contratosFiltrados = contratos.filter((c) => {
    if (filters.proyecto && !c.proyecto.toLowerCase().includes(filters.proyecto.toLowerCase())) return false;
    if (filters.edificio && c.edificio && !c.edificio.toLowerCase().includes(filters.edificio.toLowerCase())) return false;
    if (filters.modelo && c.modelo && !c.modelo.toLowerCase().includes(filters.modelo.toLowerCase())) return false;
    if (filters.numero_propiedad && c.numero_propiedad && !c.numero_propiedad.toLowerCase().includes(filters.numero_propiedad.toLowerCase())) return false;
    if (filters.dueno && !c.dueno.toLowerCase().includes(filters.dueno.toLowerCase())) return false;
    if (filters.tipo && c.tipo !== filters.tipo) return false;
    
    // Usar nomenclatura dinámica según el tipo
    const formattedId = formatCuentaCobranzaId(c.cuenta_id, c.tipo);
    if (filters.cuenta_cobranza && !formattedId.toLowerCase().includes(filters.cuenta_cobranza.toLowerCase())) return false;
    
    return true;
  });

  // Calcular paginación
  const totalPages = Math.ceil(contratosFiltrados.length / itemsPerPage);
  const paginatedContratos = contratosFiltrados.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Helper function to generate pagination items with ellipsis
  const getPaginationItems = (current: number, total: number) => {
    const items: (number | 'ellipsis')[] = [];
    const maxVisible = 7;
    
    if (total <= maxVisible) {
      return Array.from({ length: total }, (_, i) => i + 1);
    }
    
    items.push(1);
    
    let rangeStart = Math.max(2, current - 1);
    let rangeEnd = Math.min(total - 1, current + 1);
    
    if (current <= 3) {
      rangeEnd = Math.min(4, total - 1);
    }
    if (current >= total - 2) {
      rangeStart = Math.max(total - 3, 2);
    }
    
    if (rangeStart > 2) {
      items.push('ellipsis');
    }
    
    for (let i = rangeStart; i <= rangeEnd; i++) {
      items.push(i);
    }
    
    if (rangeEnd < total - 1) {
      items.push('ellipsis');
    }
    
    if (total > 1) {
      items.push(total);
    }
    
    return items;
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Contratos
            </CardTitle>
            <span className="text-sm text-muted-foreground">
              {contratosFiltrados.length === contratos.length 
                ? `${contratos.length} registro${contratos.length !== 1 ? 's' : ''}`
                : `${contratosFiltrados.length} de ${contratos.length} registro${contratos.length !== 1 ? 's' : ''}`
              }
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Select
              value={filters.tipo || "all"}
              onValueChange={(value) => setFilters({ ...filters, tipo: value === "all" ? "" : value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Filtrar por tipo..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los tipos</SelectItem>
                <SelectItem value="Propiedad">Propiedad</SelectItem>
                <SelectItem value="Producto">Producto</SelectItem>
              </SelectContent>
            </Select>
            <Input
              placeholder="Filtrar por proyecto..."
              value={filters.proyecto}
              onChange={(e) => setFilters({ ...filters, proyecto: e.target.value })}
            />
            <Input
              placeholder="Filtrar por edificio..."
              value={filters.edificio}
              onChange={(e) => setFilters({ ...filters, edificio: e.target.value })}
            />
            <Input
              placeholder="Filtrar por modelo..."
              value={filters.modelo}
              onChange={(e) => setFilters({ ...filters, modelo: e.target.value })}
            />
            <Input
              placeholder="Filtrar por # propiedad..."
              value={filters.numero_propiedad}
              onChange={(e) => setFilters({ ...filters, numero_propiedad: e.target.value })}
            />
            <Input
              placeholder="Filtrar por dueño..."
              value={filters.dueno}
              onChange={(e) => setFilters({ ...filters, dueno: e.target.value })}
            />
            <Input
              placeholder="Filtrar por cuenta..."
              value={filters.cuenta_cobranza}
              onChange={(e) => setFilters({ ...filters, cuenta_cobranza: e.target.value })}
            />
          </div>

          {/* Tabla */}
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : contratosFiltrados.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No hay contratos pendientes
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Edificio</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Producto</TableHead>
                    <TableHead>Dueño</TableHead>
                    <TableHead className="text-right">Precio Final</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Compradores</TableHead>
                    <TableHead>Contrato Draft</TableHead>
                    <TableHead className="text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedContratos.map((contrato) => (
                    <TableRow key={contrato.cuenta_id}>
                      <TableCell>
                        <Badge variant={contrato.tipo === 'Propiedad' ? 'default' : 'secondary'}>
                          {contrato.tipo}
                        </Badge>
                      </TableCell>
                      <TableCell>{contrato.proyecto}</TableCell>
                      <TableCell>{contrato.edificio || '-'}</TableCell>
                      <TableCell>{contrato.modelo || '-'}</TableCell>
                      <TableCell>{contrato.numero_propiedad || '-'}</TableCell>
                      <TableCell>{contrato.producto_nombre || '-'}</TableCell>
                      <TableCell>{contrato.dueno}</TableCell>
                      <TableCell className="text-right">
                        {contrato.precio_final?.toLocaleString('es-MX', {
                          style: 'currency',
                          currency: 'MXN',
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatCuentaCobranzaId(contrato.cuenta_id, contrato.tipo)}
                      </TableCell>
                      <TableCell>
                        <CompradoresConDocumentosDialog
                          cuentaCobranzaId={contrato.cuenta_id}
                          fetchCompradores={fetchCompradores}
                        />
                      </TableCell>
                      <TableCell>
                        {contrato.contrato_draft ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => window.open(contrato.contrato_draft!, '_blank')}
                          >
                            <ExternalLink className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => validarPlaceholdersMutation.mutate(contrato.cuenta_id)}
                            disabled={validandoCuentaId === contrato.cuenta_id}
                          >
                            {validandoCuentaId === contrato.cuenta_id ? (
                              <>
                                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                Validando...
                              </>
                            ) : (
                              <>
                                <FileText className="h-4 w-4 mr-1" />
                                Validar
                              </>
                            )}
                          </Button>
                          
                          {contrato.contrato_draft && (
                            <Button
                              variant="default"
                              size="sm"
                              onClick={() => {
                                setCuentaParaSubirContrato(contrato.cuenta_id);
                                setSubirContratoDialogOpen(true);
                              }}
                            >
                              <CheckCircle2 className="h-4 w-4 mr-1" />
                              Subir Firmado
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="mt-4">
                  <Pagination>
                    <PaginationContent>
                      <PaginationItem>
                        <PaginationPrevious 
                          onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                          className={currentPage === 1 ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                      {getPaginationItems(currentPage, totalPages).map((item, index) => (
                        item === 'ellipsis' ? (
                          <PaginationItem key={`ellipsis-${index}`}>
                            <PaginationEllipsis />
                          </PaginationItem>
                        ) : (
                          <PaginationItem key={item}>
                            <PaginationLink
                              onClick={() => setCurrentPage(item as number)}
                              isActive={currentPage === item}
                              className="cursor-pointer"
                            >
                              {item}
                            </PaginationLink>
                          </PaginationItem>
                        )
                      ))}
                      <PaginationItem>
                        <PaginationNext 
                          onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                          className={currentPage === totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"}
                        />
                      </PaginationItem>
                    </PaginationContent>
                  </Pagination>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Overlay de generación de contrato */}
      {generarContratoMutation.isPending && (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center">
          <div className="bg-card border rounded-lg shadow-lg p-8 flex flex-col items-center gap-4 animate-scale-in">
            <Loader2 className="h-12 w-12 animate-spin text-primary" />
            <div className="text-center">
              <p className="text-lg font-semibold">Generando contrato...</p>
              <p className="text-sm text-muted-foreground mt-1">
                Esto puede tomar unos segundos
              </p>
            </div>
          </div>
        </div>
      )}

      {validacionDialogData && (
        <ValidarPlaceholdersDialog
          open={!!validacionDialogData}
          onOpenChange={(open) => !open && setValidacionDialogData(null)}
          validacion={validacionDialogData.validacion}
          compradores={validacionDialogData.compradores}
          tipoPersona={validacionDialogData.tipo_persona}
          templateName={validacionDialogData.template_name}
          onGenerarContrato={(options) => validacionDialogData.cuenta_id && generarContratoMutation.mutate({ cuentaId: validacionDialogData.cuenta_id, marcarVacios: options.marcarVacios })}
          isGenerating={generarContratoMutation.isPending}
        />
      )}

      {cuentaParaSubirContrato && (
        <SubirContratoFirmadoDialog
          open={subirContratoDialogOpen}
          onOpenChange={setSubirContratoDialogOpen}
          cuentaCobranzaId={cuentaParaSubirContrato}
          onSuccess={() => {
            queryClient.invalidateQueries({ queryKey: ['contratos-pendientes'] });
            setCuentaParaSubirContrato(null);
          }}
        />
      )}
    </div>
  );
}
