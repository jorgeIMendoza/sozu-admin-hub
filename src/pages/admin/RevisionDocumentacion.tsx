import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FileText, Upload, Users, CheckCircle, XCircle, Loader2, Download, Eye, FileDown, FileEdit } from "lucide-react";
import { CompradoresConDocumentosDialog } from "@/components/admin/CompradoresConDocumentosDialog";
import SubirProyectoEscrituraDialog from "@/components/admin/SubirProyectoEscrituraDialog";
import ActualizarTemplateDialog from "@/components/admin/ActualizarTemplateDialog";
import { useToast } from "@/hooks/use-toast";

interface CuentaEscrituracion {
  cuenta_id: number;
  proyecto: string;
  proyecto_id: number;
  edificio: string;
  modelo: string;
  numero_propiedad: string;
  dueno: string;
  precio_final: number;
  propiedad_id: number;
  oferta_id: number;
  tiene_proyecto_escritura: boolean;
}

export default function RevisionDocumentacion() {
  const { toast } = useToast();
  const [selectedNotarioId, setSelectedNotarioId] = useState<number | null>(null);
  const [filtroProyecto, setFiltroProyecto] = useState<string>("");
  const [filtroEdificio, setFiltroEdificio] = useState<string>("");
  const [filtroModelo, setFiltroModelo] = useState<string>("");
  const [filtroPropiedad, setFiltroPropiedad] = useState<string>("");
  const [filtroDueno, setFiltroDueno] = useState<string>("");
  const [filtroCuenta, setFiltroCuenta] = useState<string>("");

  const [selectedCuentaId, setSelectedCuentaId] = useState<number | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showUpdateTemplateDialog, setShowUpdateTemplateDialog] = useState(false);
  const [generatingCuentaId, setGeneratingCuentaId] = useState<number | null>(null);

  // Query para obtener notarios activos
  const { data: notarios = [] } = useQuery({
    queryKey: ['notarios-activos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notarios')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Obtener notario seleccionado
  const notarioSeleccionado = notarios.find(n => n.id === selectedNotarioId);

  // Función para obtener compradores con documentos
  const fetchCompradores = async (cuentaId: number) => {
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

  // Query para obtener cuentas en escrituración
  const { data: cuentas, isLoading, refetch } = useQuery({
    queryKey: ['cuentas-escrituracion', selectedNotarioId, filtroProyecto, filtroEdificio, filtroModelo, filtroPropiedad, filtroDueno, filtroCuenta],
    queryFn: async () => {
      if (!selectedNotarioId) return [];
      console.log('Ejecutando query de cuentas en escrituración...');
      
      let query = supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          precio_final,
          id_notario,
          ofertas!fk_cuentas_cobranza_oferta!inner (
            id,
            propiedades!ofertas_id_propiedad_fkey!inner (
              id,
              numero_propiedad,
              id_estatus_disponibilidad,
              edificios_modelos!fk_propiedades_edificio_modelo!inner (
                modelos!edificios_modelos_id_modelo_fkey!inner (
                  nombre
                ),
                edificios!edificios_modelos_id_edificio_fkey!inner (
                  nombre,
                  proyectos!edificios_id_proyecto_fkey!inner (
                    id,
                    nombre
                  )
                )
              ),
              id_entidad_relacionada_dueno
            )
          )
        `)
        .eq('activo', true)
        .eq('ofertas.activo', true)
        .eq('ofertas.propiedades.activo', true)
        .eq('ofertas.propiedades.id_estatus_disponibilidad', 7) // Solo Escrituración
        .eq('id_notario', selectedNotarioId);

      // Aplicar filtros
      if (filtroPropiedad) {
        query = query.ilike('ofertas.propiedades.numero_propiedad', `%${filtroPropiedad}%`);
      }
      if (filtroCuenta) {
        query = query.eq('id', parseInt(filtroCuenta));
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching cuentas:', error);
        throw error;
      }

      if (!data) return [];

      // Procesar resultados para obtener datos adicionales
      const cuentasConDetalles = await Promise.all(
        data.map(async (cuenta: any) => {
          const propiedad = cuenta.ofertas.propiedades;
          const edificioModelo = propiedad.edificios_modelos;
          const edificio = edificioModelo.edificios;
          const proyecto = edificio.proyectos;
          const modelo = edificioModelo.modelos;

          // Obtener información del dueño
          const { data: entidadDueno } = await supabase
            .from('entidades_relacionadas')
            .select('personas!entidades_relacionadas_id_persona_fkey(nombre_legal)')
            .eq('id', propiedad.id_entidad_relacionada_dueno)
            .single();

          // Verificar si tiene proyecto de escritura (id_tipo_documento = 29)
          const { data: docEscritura } = await supabase
            .from('documentos')
            .select('id')
            .eq('id_cuenta_cobranza', cuenta.id)
            .eq('id_tipo_documento', 29)
            .eq('activo', true)
            .maybeSingle();

          return {
            cuenta_id: cuenta.id,
            proyecto: proyecto.nombre,
            proyecto_id: proyecto.id,
            edificio: edificio.nombre,
            modelo: modelo.nombre,
            numero_propiedad: propiedad.numero_propiedad,
            dueno: entidadDueno?.personas?.nombre_legal || 'N/A',
            precio_final: cuenta.precio_final,
            propiedad_id: propiedad.id,
            oferta_id: cuenta.ofertas.id,
            tiene_proyecto_escritura: !!docEscritura,
          } as CuentaEscrituracion;
        })
      );

      // Aplicar filtros adicionales
      let cuentasFiltradas = cuentasConDetalles;

      if (filtroProyecto) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.proyecto.toLowerCase().includes(filtroProyecto.toLowerCase())
        );
      }
      if (filtroEdificio) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.edificio.toLowerCase().includes(filtroEdificio.toLowerCase())
        );
      }
      if (filtroModelo) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.modelo.toLowerCase().includes(filtroModelo.toLowerCase())
        );
      }
      if (filtroDueno) {
        cuentasFiltradas = cuentasFiltradas.filter(c => 
          c.dueno.toLowerCase().includes(filtroDueno.toLowerCase())
        );
      }

      return cuentasFiltradas;
    },
    enabled: !!selectedNotarioId,
  });

  const handleVerTemplate = () => {
    if (notarioSeleccionado?.url_template_proyecto_contrato) {
      const { data } = supabase.storage
        .from('templates_proyecto_escritura')
        .getPublicUrl(notarioSeleccionado.url_template_proyecto_contrato);
      window.open(data.publicUrl, '_blank');
    }
  };

  const handleSubirProyecto = (cuentaId: number) => {
    setSelectedCuentaId(cuentaId);
    setShowUploadDialog(true);
  };

  const limpiarFiltros = () => {
    setFiltroProyecto("");
    setFiltroEdificio("");
    setFiltroModelo("");
    setFiltroPropiedad("");
    setFiltroDueno("");
    setFiltroCuenta("");
  };

  // Mutation para generar draft
  const generarDraftMutation = useMutation({
    mutationFn: async (cuentaId: number) => {
      setGeneratingCuentaId(cuentaId);
      const { data, error } = await supabase.functions.invoke('generar-draft-proyecto-escritura', {
        body: { id_cuenta_cobranza: cuentaId }
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Error al generar draft');
      
      return data;
    },
    onSuccess: (data) => {
      setGeneratingCuentaId(null);
      toast({
        title: "Draft generado",
        description: "El documento se está descargando...",
      });

      // Decodificar el contenido base64
      const binaryString = atob(data.content);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }

      // Descargar automáticamente (detectar tipo según extensión)
      const extension = data.fileName.split('.').pop()?.toLowerCase();
      const mimeType = extension === 'doc' ? 'application/msword' : 
                       extension === 'docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' :
                       'application/rtf';
      const blob = new Blob([bytes], { type: mimeType });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.fileName;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    },
    onError: (error: any) => {
      setGeneratingCuentaId(null);
      toast({
        variant: "destructive",
        title: "Error",
        description: error.message || "No se pudo generar el draft",
      });
    },
  });

  const handleGenerarDraft = (cuentaId: number) => {
    generarDraftMutation.mutate(cuentaId);
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <Card>
        <CardHeader className="space-y-4">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-6 w-6" />
            Revisión de Documentación - Escrituración
          </CardTitle>
          
          {/* Selector de Notario */}
          <div className="space-y-2">
            <Label>Seleccionar Notario</Label>
            <div className="flex gap-4 items-start">
              <Select
                value={selectedNotarioId?.toString() || ""}
                onValueChange={(value) => setSelectedNotarioId(parseInt(value))}
              >
                <SelectTrigger className="w-full max-w-md">
                  <SelectValue placeholder="Selecciona un notario..." />
                </SelectTrigger>
                <SelectContent>
                  {notarios.map((notario) => (
                    <SelectItem key={notario.id} value={notario.id.toString()}>
                      {notario.nombre} - {notario.notaria}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {notarioSeleccionado?.genera_proyecto_escritura && (
                <div className="flex gap-2">
                  {notarioSeleccionado?.url_template_proyecto_contrato && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleVerTemplate}
                      className="whitespace-nowrap"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Template
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setShowUpdateTemplateDialog(true)}
                    className="whitespace-nowrap"
                  >
                    <FileEdit className="h-4 w-4 mr-2" />
                    Actualizar Template
                  </Button>
                </div>
              )}
            </div>
            
            {notarioSeleccionado && (
              <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                <span className="font-medium">{notarioSeleccionado.nombre}</span>
                <span>•</span>
                <span>{notarioSeleccionado.notaria}</span>
                {notarioSeleccionado.genera_proyecto_escritura && (
                  <>
                    <span>•</span>
                    <Badge variant="secondary" className="text-xs">
                      Genera Proyecto Escritura
                    </Badge>
                  </>
                )}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {!selectedNotarioId ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Selecciona un notario para ver las cuentas en escrituración</p>
            </div>
          ) : (
            <>
              {/* Filtros */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="text-sm font-medium">Proyecto</label>
              <Input
                placeholder="Filtrar por proyecto..."
                value={filtroProyecto}
                onChange={(e) => setFiltroProyecto(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Edificio</label>
              <Input
                placeholder="Filtrar por edificio..."
                value={filtroEdificio}
                onChange={(e) => setFiltroEdificio(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Modelo</label>
              <Input
                placeholder="Filtrar por modelo..."
                value={filtroModelo}
                onChange={(e) => setFiltroModelo(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Propiedad</label>
              <Input
                placeholder="Filtrar por número..."
                value={filtroPropiedad}
                onChange={(e) => setFiltroPropiedad(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Dueño</label>
              <Input
                placeholder="Filtrar por dueño..."
                value={filtroDueno}
                onChange={(e) => setFiltroDueno(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Cuenta ID</label>
              <Input
                placeholder="ID de cuenta..."
                value={filtroCuenta}
                onChange={(e) => setFiltroCuenta(e.target.value)}
                type="number"
              />
            </div>
          </div>

          <div className="flex justify-between items-center">
            <Button variant="outline" onClick={limpiarFiltros} size="sm">
              Limpiar Filtros
            </Button>
            <Badge variant="secondary">
              {cuentas?.length || 0} cuenta(s) en escrituración
            </Badge>
          </div>

          {/* Tabla */}
          <div className="border rounded-lg">
            {isLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : !cuentas || cuentas.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No hay cuentas en estatus de Escrituración</p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Cuenta</TableHead>
                    <TableHead>Proyecto</TableHead>
                    <TableHead>Edificio</TableHead>
                    <TableHead>Modelo</TableHead>
                    <TableHead>Propiedad</TableHead>
                    <TableHead>Dueño</TableHead>
                    <TableHead className="text-right">Precio Final</TableHead>
                    <TableHead className="text-center">Proyecto Escritura</TableHead>
                    <TableHead className="text-center">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cuentas.map((cuenta) => (
                    <TableRow key={cuenta.cuenta_id}>
                      <TableCell className="font-medium">{cuenta.cuenta_id}</TableCell>
                      <TableCell>{cuenta.proyecto}</TableCell>
                      <TableCell>{cuenta.edificio}</TableCell>
                      <TableCell>{cuenta.modelo}</TableCell>
                      <TableCell>{cuenta.numero_propiedad}</TableCell>
                      <TableCell>{cuenta.dueno}</TableCell>
                      <TableCell className="text-right">
                        ${cuenta.precio_final.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-2">
                          {cuenta.tiene_proyecto_escritura ? (
                            <>
                              <CheckCircle className="h-5 w-5 text-green-600" />
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  try {
                                    const { data } = await supabase
                                      .from('documentos')
                                      .select('url')
                                      .eq('id_cuenta_cobranza', cuenta.cuenta_id)
                                      .eq('id_tipo_documento', 29)
                                      .eq('activo', true)
                                      .maybeSingle();
                                    
                                    if (data?.url) {
                                      const filePath = data.url.replace('/proyectos_escritura/', '');
                                      const { data: signedUrlData, error } = await supabase.storage
                                        .from('proyectos_escritura')
                                        .createSignedUrl(filePath, 3600); // URL válida por 1 hora
                                      
                                      if (error) {
                                        toast({
                                          title: "Error",
                                          description: "Error al obtener el documento",
                                          variant: "destructive"
                                        });
                                        console.error(error);
                                        return;
                                      }
                                      
                                      if (signedUrlData?.signedUrl) {
                                        window.open(signedUrlData.signedUrl, '_blank');
                                      }
                                    }
                                  } catch (error) {
                                    console.error('Error:', error);
                                    toast({
                                      title: "Error",
                                      description: "Error al abrir el documento",
                                      variant: "destructive"
                                    });
                                  }
                                }}
                              >
                                <Eye className="h-4 w-4" />
                                Ver
                              </Button>
                            </>
                          ) : (
                            <XCircle className="h-5 w-5 text-gray-400" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2 justify-center">
                          <CompradoresConDocumentosDialog
                            cuentaCobranzaId={cuenta.cuenta_id}
                            fetchCompradores={fetchCompradores}
                          />
                          {notarioSeleccionado?.genera_proyecto_escritura && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleGenerarDraft(cuenta.cuenta_id)}
                              disabled={generatingCuentaId === cuenta.cuenta_id}
                            >
                              {generatingCuentaId === cuenta.cuenta_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <FileDown className="h-4 w-4" />
                              )}
                              Generar Draft
                            </Button>
                          )}
                          <Button
                            size="sm"
                            onClick={() => handleSubirProyecto(cuenta.cuenta_id)}
                          >
                            <Upload className="h-4 w-4" />
                            {cuenta.tiene_proyecto_escritura ? 'Actualizar' : 'Subir Proyecto'}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      {selectedCuentaId && (
        <SubirProyectoEscrituraDialog
            open={showUploadDialog}
            onOpenChange={setShowUploadDialog}
            cuentaCobranzaId={selectedCuentaId}
          onSuccess={() => refetch()}
        />
      )}

      <ActualizarTemplateDialog
        open={showUpdateTemplateDialog}
        onOpenChange={setShowUpdateTemplateDialog}
        notarioId={selectedNotarioId || 0}
        notarioNombre={notarioSeleccionado?.nombre || ""}
        currentTemplateUrl={notarioSeleccionado?.url_template_proyecto_contrato}
      />
    </div>
  );
}
