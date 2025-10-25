import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FileText, Loader2, ExternalLink, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { CompradoresConDocumentosDialog } from "@/components/admin/CompradoresConDocumentosDialog";
import { ValidarPlaceholdersDialog } from "@/components/admin/ValidarPlaceholdersDialog";

interface Contrato {
  cuenta_id: number;
  proyecto: string;
  proyecto_id: number;
  edificio: string;
  modelo: string;
  numero_propiedad: string;
  dueno: string;
  precio_final: number;
  contrato_draft: string | null;
  propiedad_id: number;
  oferta_id: number;
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
  });

  const [validandoCuentaId, setValidandoCuentaId] = useState<number | null>(null);

  const [validacionDialogData, setValidacionDialogData] = useState<{
    validation: any;
    compradores: any[];
    tipo_persona: string;
    template_name: string;
    cuenta_id: number;
  } | null>(null);

  // Fetch contratos pendientes
  const { data: contratos = [], isLoading } = useQuery({
    queryKey: ['contratos-pendientes'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('execute_safe_query', {
        query_text: `
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
            per_dueno.nombre_legal as dueno
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
                AND NOT EXISTS (
                  SELECT 1 FROM documentos doc2
                  WHERE doc2.id_persona = comp.id_persona
                    AND doc2.es_verificado = true
                    AND doc2.activo = true
                )
            )
            AND EXISTS (
              SELECT 1 FROM compradores comp2
              WHERE comp2.id_cuenta_cobranza = cc.id
                AND comp2.activo = true
            )
          ORDER BY proy.nombre, p.numero_propiedad
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
          .eq('es_verificado', true)
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
    mutationFn: async (cuentaId: number) => {
      const { data, error } = await supabase.functions.invoke('generar-contrato', {
        body: { id_cuenta_cobranza: cuentaId },
      });

      if (error) throw error;
      if (!data.success) throw new Error(data.error || 'Error desconocido');

      return data;
    },
    onSuccess: (data) => {
      const warnings = [];
      
      if (data.warnings?.missing_placeholders?.length > 0) {
        warnings.push(`🔴 ${data.warnings.missing_placeholders.length} placeholders faltantes (resaltados en ROJO)`);
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
      
      // Toast simple y corto
      const validation = data.validation;
      
      toast({
        title: validation.tiene_problemas ? "⚠️ Problemas detectados" : "✅ Todo listo",
        description: validation.tiene_problemas 
          ? `${validation.total_faltantes} faltantes, ${validation.total_vacios} vacíos. Revisa el diálogo.`
          : `Todos los ${validation.total_disponibles} placeholders están listos.`,
        duration: 2000,
      });
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
    if (filters.edificio && !c.edificio.toLowerCase().includes(filters.edificio.toLowerCase())) return false;
    if (filters.modelo && !c.modelo.toLowerCase().includes(filters.modelo.toLowerCase())) return false;
    if (filters.numero_propiedad && !c.numero_propiedad.toLowerCase().includes(filters.numero_propiedad.toLowerCase())) return false;
    if (filters.dueno && !c.dueno.toLowerCase().includes(filters.dueno.toLowerCase())) return false;
    if (filters.cuenta_cobranza && !formatCuentaCobranzaId(c.cuenta_id, 'Propiedad').toLowerCase().includes(filters.cuenta_cobranza.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Contratos
          </CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
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
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Edificio</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Dueño</TableHead>
                    <TableHead className="text-right">Precio Final</TableHead>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Compradores</TableHead>
                    <TableHead>Contrato</TableHead>
                    <TableHead className="text-right">Acción</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contratosFiltrados.map((contrato) => (
                    <TableRow key={contrato.cuenta_id}>
                      <TableCell>{contrato.proyecto}</TableCell>
                      <TableCell>{contrato.edificio}</TableCell>
                      <TableCell>{contrato.modelo}</TableCell>
                      <TableCell>{contrato.numero_propiedad}</TableCell>
                      <TableCell>{contrato.dueno}</TableCell>
                      <TableCell className="text-right">
                        {contrato.precio_final?.toLocaleString('es-MX', {
                          style: 'currency',
                          currency: 'MXN',
                        })}
                      </TableCell>
                      <TableCell className="font-mono text-sm">
                        {formatCuentaCobranzaId(contrato.cuenta_id, 'Propiedad')}
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {validacionDialogData && (
        <ValidarPlaceholdersDialog
          open={!!validacionDialogData}
          onOpenChange={(open) => !open && setValidacionDialogData(null)}
          validacion={validacionDialogData.validation}
          compradores={validacionDialogData.compradores}
          tipoPersona={validacionDialogData.tipo_persona}
          templateName={validacionDialogData.template_name}
          onGenerarContrato={() => validacionDialogData.cuenta_id && generarContratoMutation.mutate(validacionDialogData.cuenta_id)}
          isGenerating={generarContratoMutation.isPending}
        />
      )}
    </div>
  );
}
