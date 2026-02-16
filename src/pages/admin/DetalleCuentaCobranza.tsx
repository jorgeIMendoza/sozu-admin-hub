import { useState, useEffect } from "react";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { usePagePermissions } from "@/hooks/usePagePermissions";
import { useParams, Link } from "react-router-dom";
import { PersonForm } from "@/components/admin/PersonForm";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { N8N_WEBHOOK_BASE_URL, ENVIRONMENT } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ArrowLeft, FileText, DollarSign, CalendarDays, ChevronDown, ChevronUp, Trash2, Plus, AlertTriangle, Eye, CreditCard, ArrowRight, Home, Warehouse, Car, Banknote, Download, HeartHandshake, MessageSquare, CheckCircle, Edit, Loader2, AlertCircle, FileCheck, Upload, Scale, Gavel, X, Save, Info, RefreshCcw, Stamp } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { NewMultaDialog } from "@/components/admin/NewMultaDialog";
import { EditMultaDialog } from "@/components/admin/EditMultaDialog";
import { AddCepDialog } from "@/components/admin/AddCepDialog";
import { AddManualPaymentDialog } from "@/components/admin/AddManualPaymentDialog";
import { EditPaymentDialog } from "@/components/admin/EditPaymentDialog";
import { TransferPaymentDialog } from "@/components/admin/TransferPaymentDialog";
import { formatCuentaCobranzaId, formatOfertaId } from "@/utils/cuentaCobranzaUtils";
import { ReciboPagoService } from "@/services/reciboPagoService";
import { EstadoCuentaEdgeFunctionService } from "@/services/estadoCuentaEdgeFunctionService";
import { EnDemandaDialog } from "@/components/admin/EnDemandaDialog";
import { JuicioTerminadoDialog } from "@/components/admin/JuicioTerminadoDialog";
import { EditCuentaCobranzaDialog } from "@/components/admin/EditCuentaCobranzaDialog";
import { AgenteVendedorDialog, type AgenteVendedorInfo } from "@/components/admin/AgenteVendedorDialog";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";

interface AcuerdoPago {
  id: number;
  orden: number;
  monto: number;
  fecha_pago: string | null;
  pago_completado: boolean;
  concepto: string;
  id_concepto: number;
  aplicaciones: AplicacionPago[];
  multas: Multa[];
}

interface AplicacionPago {
  id: number;
  monto: number;
  fecha_creacion: string;
  es_multa?: boolean;
  pago: {
    id: number;
    fecha_pago: string;
    monto: number;
    metodo_pago: string;
    id_metodos_pago: number;
    clave_rastreo: string | null;
    url_cep: string | null;
    url_recibo: string | null;
    descripcion?: string | null;
  };
}

interface Comprador {
  id_persona?: number;
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
  id_conyuge?: number | null;
}

interface CuentaDetalle {
  id: number;
  clabe_stp: string | null;
  precio_final: number;
  es_aprobado: boolean;
  fecha_compra: string;
  activo: boolean;
  compradores: Comprador[];
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  dueno: string;
  proyecto_id: number;
  oferta_id: number;
  tipo_cuenta: 'Propiedad' | 'Producto' | 'Servicio';
  producto_servicio_nombre?: string;
  producto_servicio_id?: number;
  categoria_producto_nombre?: string;
  estatus_disponibilidad?: string;
  id_estatus_disponibilidad?: number;
  valor_uma?: number;
  id_propiedad?: number;
  collection_id?: number | null;
  metraje?: number;
  precio_por_m2?: number;
  detalles_producto?: {
    nombre?: string;
    ubicacion?: string;
    m2?: number;
    tipo?: string;
  };
  // Campos de cancelación
  monto_cobro_cancelacion?: number | null;
  id_tipo_cancelacion?: number | null;
  url_factura_comision?: string | null;
  es_draft_factura_comision?: boolean | null;
  dueno_facturar?: boolean;
}

interface OfferData {
  id: number;
  id_esquema_pago_seleccionado: number | null;
  id_propiedad: number;
  id_producto?: number | null;
  esquema_nombre?: string;
  es_manual?: boolean;
  clabe_stp_tmp_apartado?: string | null;
  lead_rfc?: string | null;
}

interface AplicacionToDelete {
  id: number;
  monto: number;
  conceptoNombre: string;
}

interface Multa {
  id: number;
  monto: number;
  montoOriginal?: number;
  pagosAplicados?: number;
  estaPagada?: boolean;
  descripcion: string;
  fecha_creacion: string;
  id_acuerdo_pago: number;
  detallesPagos?: {
    id: number;
    monto: number;
    fecha_pago: string;
    metodo_pago: string;
    clave_rastreo: string | null;
  }[];
}

import JSZip from 'jszip';

// Read-only documents view component
function ReadOnlyDocumentsView({ cuentaCobranzaId }: { cuentaCobranzaId: number }) {
  const { toast } = useToast();
  const [isDownloading, setIsDownloading] = useState(false);
  const [viewerDialog, setViewerDialog] = useState<{ isOpen: boolean; url: string; title: string }>({
    isOpen: false,
    url: '',
    title: ''
  });

  // Fetch documents with category info
  const { data: documentos, isLoading } = useQuery({
    queryKey: ["documentos_cuenta_cobranza", cuentaCobranzaId],
    queryFn: async () => {
      const { data: docs, error } = await supabase
        .from('documentos')
        .select(`
          id,
          numero,
          url,
          id_estatus_verificacion,
          fecha_creacion,
          id_persona,
          id_tipo_documento,
          tipos_documento:id_tipo_documento(id, nombre, id_categoria_documento)
        `)
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;
      
      // Construir URLs correctas para los documentos
      const docsWithCorrectedUrls = (docs || []).map(doc => {
        let correctedUrl = doc.url;
        
        // Si la URL contiene path duplicado, corregirlo
        if (correctedUrl && correctedUrl.includes('/documentos/documentos/')) {
          correctedUrl = correctedUrl.replace('/documentos/documentos/', '/documentos/');
        }
        
        // Si la URL no es completa (no empieza con https://), construir la URL pública
        if (correctedUrl && !correctedUrl.startsWith('https://')) {
          const fileName = correctedUrl.startsWith('documentos/') 
            ? correctedUrl.replace('documentos/', '') 
            : correctedUrl;
          
          const { data } = supabase.storage
            .from('documentos')
            .getPublicUrl(fileName);
          
          correctedUrl = data.publicUrl;
        }
        
        return {
          ...doc,
          url: correctedUrl
        };
      });
      
      return docsWithCorrectedUrls;
    }
  });

  // Fetch compradores to get their names
  const { data: compradoresData } = useQuery({
    queryKey: ["compradores_cuenta_cobranza", cuentaCobranzaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compradores')
        .select(`
          id_persona,
          personas!compradores_id_persona_fkey(id, nombre_legal)
        `)
        .eq('id_cuenta_cobranza', cuentaCobranzaId)
        .eq('activo', true);
      
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch delivery document types (categoria 7)
  const { data: tiposDocEntrega } = useQuery({
    queryKey: ["tipos_documento_entrega"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_documento')
        .select('id, nombre')
        .eq('id_categoria_documento', 7)
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    }
  });

  // Separate documents by type
  const clientDocuments = documentos?.filter(doc => doc.id_persona) || [];
  const propertyDocuments = documentos?.filter(doc => !doc.id_persona) || [];
  
  // Get delivery documents (categoria 7) from ALL documents (both property and client)
  // This ensures documents like Factura PDF/XML uploaded with id_persona are also considered
  const allDeliveryDocuments = (documentos || []).filter(
    doc => (doc.tipos_documento as any)?.id_categoria_documento === 7
  );
  
  // Find missing delivery documents by checking all uploaded delivery docs
  const uploadedDeliveryTypeIds = allDeliveryDocuments.map(d => d.id_tipo_documento);
  const missingDeliveryDocs = tiposDocEntrega?.filter(
    tipo => !uploadedDeliveryTypeIds.includes(tipo.id)
  ) || [];

  // Get comprador name by id_persona
  const getCompradorName = (idPersona: number) => {
    const comprador = compradoresData?.find(c => c.id_persona === idPersona);
    return (comprador?.personas as any)?.nombre_legal || 'Comprador desconocido';
  };

  const handleDownloadAll = async () => {
    if (!documentos || documentos.length === 0) {
      toast({
        title: "No hay documentos",
        description: "No hay documentos para descargar",
        variant: "destructive"
      });
      return;
    }

    setIsDownloading(true);
    try {
      const zip = new JSZip();
      
      for (const doc of documentos) {
        try {
          const response = await fetch(doc.url);
          if (!response.ok) {
            console.error(`Error descargando documento ${doc.id}:`, response.statusText);
            continue;
          }
          
          const blob = await response.blob();
          const fileName = `${(doc.tipos_documento as any)?.nombre || 'Documento'}_${doc.numero || doc.id}.pdf`;
          zip.file(fileName, blob);
        } catch (error) {
          console.error(`Error procesando documento ${doc.id}:`, error);
        }
      }

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(zipBlob);
      link.download = `documentos_cuenta_cobranza_${cuentaCobranzaId}.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(link.href);

      toast({
        title: "Descarga completada",
        description: "Los documentos se han descargado en un archivo ZIP"
      });
    } catch (error) {
      console.error('Error al descargar documentos:', error);
      toast({
        title: "Error",
        description: "No se pudieron descargar los documentos",
        variant: "destructive"
      });
    } finally {
      setIsDownloading(false);
    }
  };

  const renderDocumentTable = (docs: typeof documentos, showComprador = false) => {
    if (!docs || docs.length === 0) {
      return (
        <div className="text-center py-4 text-muted-foreground text-sm">
          No hay documentos en esta sección
        </div>
      );
    }

    return (
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Tipo</TableHead>
            {showComprador && <TableHead>Comprador</TableHead>}
            <TableHead>Número</TableHead>
            <TableHead>Fecha</TableHead>
            <TableHead>Verificado</TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {docs.map((doc: any) => (
            <TableRow key={doc.id}>
              <TableCell className="font-medium">
                {doc.tipos_documento?.nombre || 'Sin tipo'}
                {doc.tipos_documento?.id_categoria_documento === 7 && (
                  <Badge variant="outline" className="ml-2 text-xs">Entrega</Badge>
                )}
              </TableCell>
              {showComprador && (
                <TableCell>{getCompradorName(doc.id_persona)}</TableCell>
              )}
              <TableCell>{doc.numero || ''}</TableCell>
              <TableCell>
                {new Date(doc.fecha_creacion).toLocaleDateString('es-MX')}
              </TableCell>
              <TableCell>
                <Badge variant={doc.id_estatus_verificacion === 2 ? "default" : doc.id_estatus_verificacion === 3 ? "destructive" : "secondary"}>
                  {doc.id_estatus_verificacion === 2 ? "Validado" : doc.id_estatus_verificacion === 3 ? "Rechazado" : doc.id_estatus_verificacion === 4 ? "Expirado" : "Pendiente"}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setViewerDialog({
                      isOpen: true,
                      url: doc.url,
                      title: doc.tipos_documento?.nombre || 'Documento'
                    });
                  }}
                  title="Ver documento"
                >
                  <Eye className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    );
  };

  if (isLoading) {
    return (
      <Card>
        <CardContent className="py-8">
          <div className="text-center text-muted-foreground">Cargando documentos...</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Client Documents Section */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-5 w-5" />
            Documentos del Cliente
          </CardTitle>
        </CardHeader>
        <CardContent>
          {renderDocumentTable(clientDocuments, true)}
        </CardContent>
      </Card>

      {/* Property Documents Section */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <Home className="h-5 w-5" />
              Documentos de la Propiedad
            </CardTitle>
            {documentos && documentos.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadAll}
                disabled={isDownloading}
              >
                <Download className="h-4 w-4 mr-2" />
                {isDownloading ? "Descargando..." : "Descargar todos"}
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderDocumentTable(propertyDocuments)}

          {/* Missing Delivery Documents Warning */}
          {missingDeliveryDocs.length > 0 && (
            <div className="mt-4 p-4 rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                <div>
                  <p className="font-medium text-amber-800 dark:text-amber-200">
                    Documentos de entrega faltantes ({missingDeliveryDocs.length})
                  </p>
                  <ul className="mt-2 space-y-1 text-sm text-amber-700 dark:text-amber-300">
                    {missingDeliveryDocs.map(tipo => (
                      <li key={tipo.id} className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                        {tipo.nombre}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Document Viewer Dialog */}
      <Dialog open={viewerDialog.isOpen} onOpenChange={(open) => setViewerDialog({ ...viewerDialog, isOpen: open })}>
        <DialogContent className="max-w-4xl h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 py-3 border-b shrink-0">
            <DialogTitle>{viewerDialog.title}</DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-hidden">
            <iframe
              src={`${viewerDialog.url}#page=1&view=FitH`}
              className="w-full h-full border-0"
              title={viewerDialog.title}
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function DetalleCuentaCobranza() {
  const { id } = useParams<{ id: string }>();
  const cuentaId = parseInt(id || '0');
  const [openAcuerdos, setOpenAcuerdos] = useState<{ [key: number]: boolean }>({});
  const [compradoresOpen, setCompradoresOpen] = useState(false);
  const [deleteDialog, setDeleteDialog] = useState<{ 
    isOpen: boolean; 
    aplicacion: AplicacionToDelete | null;
    warningMessage?: string;
  }>({
    isOpen: false,
    aplicacion: null,
    warningMessage: ""
  });
  const [multaDialog, setMultaDialog] = useState<{ 
    isOpen: boolean; 
    acuerdoId: number | null;
    acuerdoMonto: number;
    existingMultas: Array<{ monto: number }>;
  }>({
    isOpen: false,
    acuerdoId: null,
    acuerdoMonto: 0,
    existingMultas: []
  });
  const [deleteMultaDialog, setDeleteMultaDialog] = useState<{ 
    isOpen: boolean; 
    multa: Multa | null 
  }>({
    isOpen: false,
    multa: null
  });
  const [editMultaDialog, setEditMultaDialog] = useState<{ 
    isOpen: boolean; 
    multa: Multa | null 
  }>({
    isOpen: false,
    multa: null
  });
  const [multaPaymentDetails, setMultaPaymentDetails] = useState<{
    isOpen: boolean;
    multa: Multa | null;
  }>({
    isOpen: false,
    multa: null
  });
  const [cepDialog, setCepDialog] = useState<{
    isOpen: boolean;
    paymentId: number | null;
  }>({
    isOpen: false,
    paymentId: null
  });
  const [manualPaymentDialog, setManualPaymentDialog] = useState(false);
  const [editPaymentDialog, setEditPaymentDialog] = useState<{
    isOpen: boolean;
    paymentId: number | null;
  }>({
    isOpen: false,
    paymentId: null
  });
  const [transferDialog, setTransferDialog] = useState<{
    isOpen: boolean;
  }>({
    isOpen: false
  });
  const [downloadingRecibo, setDownloadingRecibo] = useState<number | null>(null);
  const [uploadingEvidence, setUploadingEvidence] = useState<number | null>(null);
  const [enDemandaDialog, setEnDemandaDialog] = useState(false);
  const [juicioTerminadoDialog, setJuicioTerminadoDialog] = useState(false);
  const [editCuentaDialog, setEditCuentaDialog] = useState(false);
  const [agenteVendedorDialog, setAgenteVendedorDialog] = useState(false);
  const [isGeneratingEstadoCuenta, setIsGeneratingEstadoCuenta] = useState(false);
  const [downloadingOferta, setDownloadingOferta] = useState(false);
  // Comprador edit modal states
  const [editingComprador, setEditingComprador] = useState<any>(null);
  const [isCompradorDialogOpen, setIsCompradorDialogOpen] = useState(false);
  const [isRecalculatingAplicaciones, setIsRecalculatingAplicaciones] = useState(false);
  // Estado para edición de clave_rastreo
  const [editingClaveRastreo, setEditingClaveRastreo] = useState<{ [pagoId: number]: string }>({});
  const [savingClaveRastreo, setSavingClaveRastreo] = useState<number | null>(null);
  // Estado para ajuste de montos de pagos
  const [montoAdjustments, setMontoAdjustments] = useState<{ 
    pagoId: number; 
    originalMonto: number; 
    newMonto: number; 
  } | null>(null);
  // Estado para ajuste de montos de aplicaciones
  const [aplicacionMontoEdit, setAplicacionMontoEdit] = useState<{ [aplicacionId: number]: number }>({});
  const [originalAplicacionMontos, setOriginalAplicacionMontos] = useState<{ [aplicacionId: number]: number }>({});
  const [newPaymentRows, setNewPaymentRows] = useState<Array<{
    id: string;
    fecha_pago: string;
    monto: number;
    id_metodos_pago: number;
    clave_rastreo: string;
  }>>([]);
  const [isConfirmingAdjustment, setIsConfirmingAdjustment] = useState(false);
  const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);
  // Factura comisión Sozu states
  const [generarFacturaLoading, setGenerarFacturaLoading] = useState(false);
  const [timbrarFacturaDialog, setTimbrarFacturaDialog] = useState(false);
  const [timbrarFacturaLoading, setTimbrarFacturaLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { canUpdate, canDelete, isSuperAdmin } = usePagePermissions('/admin/cuentas-cobranza');
  const { canGenerateOffer: canGenerateOfferPropiedades } = usePagePermissions('/admin/propiedades');
  const { registrarCreacion, registrarActualizacion, registrarSubidaDocumento } = useActivityLogger();


  const { data: cuentaDetalle, isLoading: cuentaLoading } = useQuery({
    queryKey: ["cuenta_detalle", cuentaId],
    queryFn: async () => {
      // Get cuenta cobranza with related data (including cancelled ones)
      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          clabe_stp,
          precio_final,
          es_aprobado,
          fecha_compra,
          id_oferta,
          activo,
          valor_uma,
          collection_id,
          monto_cobro_cancelacion,
          id_tipo_cancelacion,
          url_factura_comision,
          es_draft_factura_comision
        `)
        .eq('id', cuentaId)
        .maybeSingle();

      if (cuentaError) throw cuentaError;
      if (!cuenta) throw new Error('Cuenta de cobranza no encontrada');

      // Get oferta and related data
      const { data: oferta } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_esquema_pago_seleccionado,
          id_producto,
          propiedades!ofertas_id_propiedad_fkey(
            id,
            numero_propiedad,
            m2_interiores,
            m2_exteriores,
            id_entidad_relacionada_dueno,
            id_edificio_modelo,
            id_estatus_disponibilidad
          ),
          productos_servicios!ofertas_id_producto_fkey(
            id,
            nombre,
            id_categoria,
            categorias_producto!productos_servicios_id_categoria_fkey(
              nombre
            )
          )
        `)
        .eq('id', cuenta.id_oferta)
        .maybeSingle();

      // Get compradores with spouse information
      const { data: compradores } = await supabase
        .from('compradores')
        .select(`
          id_persona,
          porcentaje_copropiedad,
          personas!compradores_id_persona_fkey(id, nombre_legal, rfc, id_conyuge)
        `)
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);

      // Get project and building info
      const [entidadResult, edificioModeloResult, duenoResult, estatusResult] = await Promise.all([
        supabase
          .from('entidades_relacionadas')
          .select(`
            id_proyecto,
            facturar,
            proyectos!entidades_relacionadas_id_proyecto_fkey(nombre)
          `)
          .eq('id', oferta?.propiedades?.id_entidad_relacionada_dueno)
          .maybeSingle(),
        supabase
          .from('edificios_modelos')
          .select(`
            edificios!edificios_modelos_id_edificio_fkey(nombre),
            modelos!edificios_modelos_id_modelo_fkey(nombre)
          `)
          .eq('id', oferta?.propiedades?.id_edificio_modelo)
          .maybeSingle(),
        supabase
          .from('entidades_relacionadas')
          .select(`
            personas!entidades_relacionadas_id_persona_fkey(nombre_legal)
          `)
          .eq('id', oferta?.propiedades?.id_entidad_relacionada_dueno)
          .maybeSingle(),
        oferta?.propiedades?.id_estatus_disponibilidad 
          ? supabase
              .from('estatus_disponibilidad')
              .select('nombre')
              .eq('id', oferta.propiedades.id_estatus_disponibilidad)
              .maybeSingle()
          : Promise.resolve({ data: null })
      ]);

      // Determine account type
      let tipoCuenta: 'Propiedad' | 'Producto' | 'Servicio' = 'Propiedad';
      let productoServicioNombre: string | undefined;
      let productoServicioId: number | undefined;
      let categoriaProductoNombre: string | undefined;
      let detallesProducto: { nombre?: string; ubicacion?: string; m2?: number; tipo?: string } | undefined;
      
      if (oferta?.id_producto && oferta?.productos_servicios) {
        productoServicioId = oferta.productos_servicios.id;
        productoServicioNombre = oferta.productos_servicios.nombre;
        categoriaProductoNombre = oferta.productos_servicios.categorias_producto?.nombre;
        const categoriaNombre = categoriaProductoNombre?.toLowerCase();
        tipoCuenta = categoriaNombre === 'servicios' ? 'Servicio' : 'Producto';

        // Get specific details for estacionamientos or bodegas
        if (categoriaProductoNombre?.toLowerCase() === 'estacionamientos') {
          const { data: estacionamiento } = await supabase
            .from('estacionamientos')
            .select(`
              nombre,
              ubicacion,
              m2,
              tipos_estacionamiento:id_tipo(nombre)
            `)
            .eq('id_producto', productoServicioId)
            .eq('activo', true)
            .maybeSingle();

          if (estacionamiento) {
            detallesProducto = {
              nombre: estacionamiento.nombre,
              ubicacion: estacionamiento.ubicacion || undefined,
              m2: estacionamiento.m2 ? Number(estacionamiento.m2) : undefined,
              tipo: estacionamiento.tipos_estacionamiento?.nombre
            };
          }
        } else if (categoriaProductoNombre?.toLowerCase() === 'bodegas') {
          const { data: bodega } = await supabase
            .from('bodegas')
            .select('nombre, ubicacion, m2')
            .eq('id_producto', productoServicioId)
            .eq('activo', true)
            .maybeSingle();

          if (bodega) {
            detallesProducto = {
              nombre: bodega.nombre,
              ubicacion: bodega.ubicacion || undefined,
              m2: bodega.m2 ? Number(bodega.m2) : undefined
            };
          }
        }
      }

      // Calculate metraje and precio_por_m2 for property accounts
      const m2Interiores = oferta?.propiedades?.m2_interiores ? Number(oferta.propiedades.m2_interiores) : 0;
      const m2Exteriores = oferta?.propiedades?.m2_exteriores ? Number(oferta.propiedades.m2_exteriores) : 0;
      const metraje = tipoCuenta === 'Propiedad' ? m2Interiores + m2Exteriores : undefined;
      const precio_por_m2 = tipoCuenta === 'Propiedad' && metraje && metraje > 0 ? (cuenta.precio_final || 0) / metraje : undefined;

      const detalle: CuentaDetalle = {
        id: cuenta.id,
        clabe_stp: cuenta.clabe_stp,
        precio_final: cuenta.precio_final || 0,
        es_aprobado: cuenta.es_aprobado,
        fecha_compra: cuenta.fecha_compra,
        activo: cuenta.activo,
        compradores: compradores?.map(c => ({
          id_persona: c.personas?.id,
          nombre_legal: c.personas?.nombre_legal || '',
          rfc: c.personas?.rfc || null,
          porcentaje_copropiedad: c.porcentaje_copropiedad || 0,
          id_conyuge: c.personas?.id_conyuge
        })).filter(c => c.nombre_legal) || [],
        proyecto: entidadResult.data?.proyectos?.nombre || 'Sin proyecto',
        edificio: edificioModeloResult.data?.edificios?.nombre || 'Sin edificio',
        numero_propiedad: oferta?.propiedades?.numero_propiedad || 'Sin número',
        modelo: edificioModeloResult.data?.modelos?.nombre || 'Sin modelo',
        dueno: duenoResult.data?.personas?.nombre_legal || 'Sin dueño',
        proyecto_id: entidadResult.data?.id_proyecto || 0,
        oferta_id: cuenta.id_oferta,
        tipo_cuenta: tipoCuenta,
        producto_servicio_nombre: productoServicioNombre,
        producto_servicio_id: productoServicioId,
        categoria_producto_nombre: categoriaProductoNombre,
        estatus_disponibilidad: estatusResult.data?.nombre || undefined,
        id_estatus_disponibilidad: oferta?.propiedades?.id_estatus_disponibilidad || undefined,
        valor_uma: cuenta.valor_uma || undefined,
        collection_id: cuenta.collection_id,
        id_propiedad: oferta?.propiedades?.id || undefined,
        metraje,
        precio_por_m2,
        detalles_producto: detallesProducto,
        monto_cobro_cancelacion: cuenta.monto_cobro_cancelacion || undefined,
        id_tipo_cancelacion: cuenta.id_tipo_cancelacion || undefined,
        url_factura_comision: cuenta.url_factura_comision,
        es_draft_factura_comision: cuenta.es_draft_factura_comision,
        dueno_facturar: (entidadResult.data as any)?.facturar_comision_sozu || false,
      };

      return detalle;
    },
    enabled: !!cuentaId,
    staleTime: 30000, // 30 segundos - evita refetch automático al abrir modal
  });

  // Fetch offer data with payment scheme info
  const { data: offerData } = useQuery({
    queryKey: ["offer_data", cuentaDetalle?.oferta_id],
    queryFn: async () => {
      if (!cuentaDetalle?.oferta_id) return null;

      const { data: offer, error } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_esquema_pago_seleccionado,
          id_propiedad,
          id_producto,
          id_persona_lead,
          esquemas_pago!ofertas_id_esquema_pago_seleccionado_fkey(
            nombre,
            es_manual
          ),
          propiedades!ofertas_id_propiedad_fkey(
            clabe_stp_tmp_apartado
          ),
          personas!ofertas_id_persona_lead_fkey(
            rfc,
            curp
          )
        `)
        .eq('id', cuentaDetalle.oferta_id)
        .maybeSingle();

      if (error) throw error;
      if (!offer) return null;

      return {
        id: offer.id,
        id_esquema_pago_seleccionado: offer.id_esquema_pago_seleccionado,
        id_propiedad: offer.id_propiedad,
        id_producto: offer.id_producto,
        esquema_nombre: offer.esquemas_pago?.nombre || null,
        es_manual: offer.esquemas_pago?.es_manual || false,
        clabe_stp_tmp_apartado: offer.propiedades?.clabe_stp_tmp_apartado || null,
        lead_rfc: offer.personas?.rfc || offer.personas?.curp || null
      } as OfferData;
    },
    enabled: !!cuentaDetalle?.oferta_id,
  });

  // Fetch available payment schemes for the project
  const { data: availableSchemes } = useQuery({
    queryKey: ["payment_schemes", cuentaDetalle?.proyecto_id],
    queryFn: async () => {
      if (!cuentaDetalle?.proyecto_id) return [];

      const { data: schemes, error } = await supabase
        .from('esquemas_pago')
        .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
        .eq('id_proyecto', cuentaDetalle.proyecto_id)
        .eq('es_manual', false)
        .eq('activo', true)
        .order('nombre');

      if (error) throw error;
      return schemes || [];
    },
    enabled: !!cuentaDetalle?.proyecto_id,
  });

  // Fetch original payment scheme details
  const { data: originalScheme } = useQuery({
    queryKey: ["original_scheme", offerData?.id_esquema_pago_seleccionado],
    queryFn: async () => {
      if (!offerData?.id_esquema_pago_seleccionado) return null;

      const { data: scheme, error } = await supabase
        .from('esquemas_pago')
        .select('id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades')
        .eq('id', offerData.id_esquema_pago_seleccionado)
        .maybeSingle();

      if (error) throw error;
      return scheme;
    },
    enabled: !!offerData?.id_esquema_pago_seleccionado,
  });

  // Fetch agente vendedor (seller agent) information
  const { data: agenteVendedor } = useQuery({
    queryKey: ["agente_vendedor", cuentaDetalle?.oferta_id],
    queryFn: async (): Promise<AgenteVendedorInfo | null> => {
      if (!cuentaDetalle?.oferta_id) return null;

      // Get email_creador from oferta
      const { data: oferta, error: ofertaError } = await supabase
        .from('ofertas')
        .select('email_creador')
        .eq('id', cuentaDetalle.oferta_id)
        .maybeSingle();

      if (ofertaError || !oferta?.email_creador) return null;

      const emailCreador = oferta.email_creador;

      // Get user info by email with role
      const { data: usuario, error: userError } = await supabase
        .from('usuarios')
        .select(`
          nombre,
          email,
          telefono,
          rol_id,
          id_persona,
          roles!usuarios_rol_id_fkey(nombre)
        `)
        .eq('email', emailCreador)
        .maybeSingle();

      if (userError || !usuario) {
        // Return minimal info if user not found
        return {
          nombre: emailCreador,
          email: emailCreador,
          telefono: null,
          tipoAgente: emailCreador.includes('@sozu.com') ? 'interno' : 'otro',
          organizacion: emailCreador.includes('@sozu.com') ? 'Sozu' : 'Grupo Investimento',
          rolNombre: undefined
        };
      }

      const rolNombre = (usuario.roles as any)?.nombre || '';
      
      // Determine agent type and organization
      let tipoAgente: 'interno' | 'inmobiliario' | 'otro' = 'otro';
      let organizacion: string | null = null;

      // Check if user is an internal agent (Agente Interno / Agente Sozu)
      if (rolNombre.toLowerCase().includes('agente') && rolNombre.toLowerCase().includes('interno')) {
        tipoAgente = 'interno';
        organizacion = 'Sozu';
      }
      // Check if user is a real estate agent (Agente Inmobiliario)
      else if (rolNombre.toLowerCase().includes('agente') && rolNombre.toLowerCase().includes('inmobiliario')) {
        tipoAgente = 'inmobiliario';
        
        // Get the inmobiliaria from entidades_relacionadas via id_persona_duena_lead
        if (usuario.id_persona) {
          const { data: agenteEntidad } = await supabase
            .from('entidades_relacionadas')
            .select('id_persona_duena_lead')
            .eq('id_persona', usuario.id_persona)
            .eq('id_tipo_entidad', 19) // tipo agente
            .eq('activo', true)
            .maybeSingle();

          if (agenteEntidad?.id_persona_duena_lead) {
            const { data: inmobiliaria } = await supabase
              .from('personas')
              .select('nombre_legal')
              .eq('id', agenteEntidad.id_persona_duena_lead)
              .maybeSingle();

            organizacion = inmobiliaria?.nombre_legal || null;
          }
        }
      }
      // For other roles (super admin, inmobiliaria, etc.)
      else {
        if (usuario.email.includes('@sozu.com')) {
          organizacion = 'Sozu';
        } else {
          organizacion = 'Grupo Investimento';
        }
      }

      return {
        nombre: usuario.nombre || emailCreador,
        email: usuario.email,
        telefono: usuario.telefono || null,
        tipoAgente,
        organizacion,
        rolNombre
      };
    },
    enabled: !!cuentaDetalle?.oferta_id,
  });

  // Handle payment scheme selection
  const handlePaymentSchemeSelection = async (schemeId: number) => {
    if (!cuentaDetalle || !offerData) return;

    try {
      // 1. Obtener el esquema seleccionado para acceder a porcentaje_descuento_aumento
      const { data: esquema, error: esquemaError } = await supabase
        .from('esquemas_pago')
        .select('porcentaje_descuento_aumento')
        .eq('id', schemeId)
        .single();

      if (esquemaError) throw esquemaError;

      // 2. Determinar precio_lista (propiedad o producto)
      let precioLista = 0;
      if (offerData.id_propiedad) {
        const { data: propiedad, error: propError } = await supabase
          .from('propiedades')
          .select('precio_lista')
          .eq('id', offerData.id_propiedad)
          .single();
        
        if (propError) throw propError;
        precioLista = Number(propiedad?.precio_lista || 0);
      } else if (offerData.id_producto) {
        const { data: producto, error: prodError } = await supabase
          .from('productos_servicios')
          .select('precio_lista')
          .eq('id', offerData.id_producto)
          .single();
        
        if (prodError) throw prodError;
        precioLista = Number(producto?.precio_lista || 0);
      }

      // 3. Calcular precio_final
      const porcentajeAjuste = Number(esquema?.porcentaje_descuento_aumento || 0);
      const precioFinal = precioLista * (1 + porcentajeAjuste / 100);

      // 4. Actualizar precio_final en cuenta_cobranza
      if (precioFinal > 0) {
        const { error: updatePrecioError } = await supabase
          .from('cuentas_cobranza')
          .update({ 
            precio_final: precioFinal,
            fecha_actualizacion: new Date().toISOString()
          })
          .eq('id', cuentaDetalle.id);

        if (updatePrecioError) {
          console.error('Error updating precio_final:', updatePrecioError);
          throw updatePrecioError;
        }
      }

      // 5. Actualizar el esquema en la oferta
      const { error: updateError } = await supabase
        .from('ofertas')
        .update({ id_esquema_pago_seleccionado: schemeId })
        .eq('id', offerData.id);

      if (updateError) throw updateError;

      toast({
        title: "Éxito",
        description: "Esquema de pago actualizado correctamente",
      });

      // Make webhook call to generate agreement
      try {
        const webhookResponse = await fetch(`${N8N_WEBHOOK_BASE_URL}/aplicaPago`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            siguiente_accion: "genera_acuerdo_para_cuenta_cobranza",
            id_oferta: offerData.id,
            id_propiedad: offerData.id_propiedad,
            id: cuentaDetalle.id,
            clabe_stp: cuentaDetalle.clabe_stp || '',
            rfc_curp_ordenante: offerData.lead_rfc || '',
            environment: ENVIRONMENT
          }),
        });

        if (webhookResponse.ok) {
          // Registrar en log de actividad
          await registrarCreacion(
            'acuerdos_pago',
            {
              id_cuenta_cobranza: cuentaDetalle.id,
              id_oferta: offerData.id,
              id_propiedad: offerData.id_propiedad,
              id_esquema_pago: schemeId,
              precio_final: precioFinal,
              precio_lista: precioLista,
              porcentaje_ajuste: porcentajeAjuste
            },
            'generar_acuerdo_pago_desde_cuenta'
          );

          toast({
            title: "Acuerdo generado",
            description: "Se ha generado el acuerdo de pago para la cuenta de cobranza",
          });
        } else {
          console.error('Webhook response not ok:', webhookResponse.status);
          await registrarCreacion(
            'acuerdos_pago',
            {
              id_cuenta_cobranza: cuentaDetalle.id,
              id_oferta: offerData.id,
              webhook_status: webhookResponse.status
            },
            'generar_acuerdo_pago_desde_cuenta',
            'error',
            `Webhook respondió con status ${webhookResponse.status}`
          );
        }
      } catch (webhookError) {
        console.error('Error calling webhook:', webhookError);
        await registrarCreacion(
          'acuerdos_pago',
          {
            id_cuenta_cobranza: cuentaDetalle.id,
            id_oferta: offerData?.id
          },
          'generar_acuerdo_pago_desde_cuenta',
          'error',
          `Error en webhook: ${webhookError instanceof Error ? webhookError.message : 'Error desconocido'}`
        );
      }

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ["offer_data", cuentaDetalle.oferta_id] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });

    } catch (error) {
      console.error('Error updating payment scheme:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar el esquema de pago",
        variant: "destructive",
      });
    }
  };

  const { data: acuerdosPago, isLoading: acuerdosLoading } = useQuery({
    queryKey: ["acuerdos_pago", cuentaId],
    queryFn: async () => {
      // Get acuerdos de pago
      const { data: acuerdos, error: acuerdosError } = await supabase
        .from('acuerdos_pago')
        .select(`
          id,
          orden,
          monto,
          fecha_pago,
          pago_completado,
          id_concepto
        `)
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true)
        .order('orden') as { data: any[] | null, error: any };

      if (acuerdosError) throw acuerdosError;

      if (!acuerdos || acuerdos.length === 0) return [];

      // Get conceptos de pago
      const conceptoIds = acuerdos.map(a => a.id_concepto);
      const { data: conceptos } = await supabase
        .from('conceptos_pago')
        .select('id, nombre')
        .in('id', conceptoIds);

      // Get aplicaciones de pago and multas for each acuerdo
      const acuerdoIds = acuerdos.map(a => a.id);
      const [aplicacionesResult, multasResult] = await Promise.all([
        supabase
          .from('aplicaciones_pago')
          .select(`
            id,
            monto,
            fecha_creacion,
            id_acuerdo_pago,
            id_pago,
            es_multa
          `)
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true) as any,
        supabase
          .from('multas')
          .select(`
            id,
            monto,
            descripcion,
            fecha_creacion,
            id_acuerdo_pago
          `)
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true)
      ]);

      const aplicaciones = aplicacionesResult.data;
      const multas = multasResult.data;

      // Get pagos information
      const pagoIds = aplicaciones?.map(a => a.id_pago).filter(Boolean) || [];
      let pagos: any[] = [];
      let metodosPago: any[] = [];
      
      if (pagoIds.length > 0) {
        const [pagosResult, metodosResult] = await Promise.all([
        supabase
          .from('pagos')
          .select('id, fecha_pago, monto, clave_rastreo, id_metodos_pago, url_cep, url_recibo, descripcion')
          .in('id', pagoIds),
          supabase
            .from('metodos_pago')
            .select('id, nombre')
        ]);
        
        pagos = pagosResult.data || [];
        metodosPago = metodosResult.data || [];
      }

      // Transform data
      const acuerdosConAplicaciones: AcuerdoPago[] = acuerdos.map(acuerdo => {
        const concepto = conceptos?.find(c => c.id === acuerdo.id_concepto);
        const acuerdoAplicaciones = aplicaciones?.filter(a => a.id_acuerdo_pago === acuerdo.id) || [];
        const acuerdoMultas = multas?.filter(m => m.id_acuerdo_pago === acuerdo.id) || [];
        
        // Apply penalty payments sequentially - pay penalties one by one
        const pagosPenalidad = acuerdoAplicaciones.filter(a => a.es_multa) || [];
        const totalPagosPenalidad = pagosPenalidad.reduce((sum, app) => sum + (app?.monto || 0), 0);
        
        // Sort penalties by creation date to determine payment order
        const multasOrdenadas = [...acuerdoMultas].sort((a, b) => 
          new Date(a.fecha_creacion).getTime() - new Date(b.fecha_creacion).getTime()
        );
        
        // Apply payments sequentially to penalties
        let pagosRestantes = totalPagosPenalidad;
        let pagosPenalidadRestantes = [...pagosPenalidad]; // Copy to track remaining payments
        
        const multasConEstado = multasOrdenadas.map(multa => {
          let pagosAplicados = 0;
          const detallesPagos: { id: number; monto: number; fecha_pago: string; metodo_pago: string; clave_rastreo: string | null; }[] = [];
          let montoPendienteMulta = multa.monto;
          
          // Apply payments to this penalty
          while (montoPendienteMulta > 0 && pagosPenalidadRestantes.length > 0) {
            const aplicacionPago = pagosPenalidadRestantes[0];
            const pago = pagos.find(p => p.id === aplicacionPago.id_pago);
            const metodoPago = metodosPago.find(m => m.id === pago?.id_metodos_pago);
            
            const montoAAplicar = Math.min(montoPendienteMulta, aplicacionPago.monto);
            
            if (montoAAplicar > 0) {
              pagosAplicados += montoAAplicar;
              montoPendienteMulta -= montoAAplicar;
              
              // Add payment detail
              detallesPagos.push({
                id: pago?.id || 0,
                monto: montoAAplicar,
                fecha_pago: pago?.fecha_pago || '',
                metodo_pago: metodoPago?.nombre || 'Sin método',
                clave_rastreo: pago?.clave_rastreo || null
              });
              
              // Reduce the remaining amount in the payment application
              aplicacionPago.monto -= montoAAplicar;
              
              // If this payment application is fully used, remove it
              if (aplicacionPago.monto <= 0) {
                pagosPenalidadRestantes.shift();
              }
            }
          }
          
          return {
            id: multa.id,
            monto: multa.monto,
            montoOriginal: multa.monto,
            descripcion: multa.descripcion,
            fecha_creacion: multa.fecha_creacion,
            id_acuerdo_pago: multa.id_acuerdo_pago,
            pagosAplicados,
            saldoPendiente: multa.monto - pagosAplicados,
            estaPagada: pagosAplicados >= multa.monto,
            detallesPagos
          };
        });
        
        // Calculate normal payments (exclude penalty payments)
        const pagosNormales = acuerdoAplicaciones.filter(a => !a.es_multa) || [];
        const totalAplicado = pagosNormales.reduce((sum, app) => sum + (app?.monto || 0), 0);
        
        return {
          id: acuerdo.id,
          orden: acuerdo.orden,
          monto: acuerdo.monto,
          fecha_pago: acuerdo.fecha_pago,
          pago_completado: acuerdo.pago_completado,
          concepto: concepto?.nombre || 'Sin concepto',
          id_concepto: acuerdo.id_concepto,
          aplicaciones: pagosNormales.map(a => {
            const pago = pagos.find(p => p.id === a.id_pago);
            const metodoPago = metodosPago.find(m => m.id === pago?.id_metodos_pago);
            
            return {
              id: a.id,
              monto: a.monto,
              fecha_creacion: a.fecha_creacion,
              es_multa: a.es_multa,
               pago: {
                 id: pago?.id || 0,
                 fecha_pago: pago?.fecha_pago || '',
                 monto: pago?.monto || 0,
                 metodo_pago: metodoPago?.nombre || 'Sin método',
                 id_metodos_pago: pago?.id_metodos_pago || 0,
                 clave_rastreo: pago?.clave_rastreo,
                 url_cep: pago?.url_cep || null,
                 url_recibo: pago?.url_recibo || null,
                 descripcion: pago?.descripcion || null
               }
            };
          }).sort((a, b) => new Date(a.pago.fecha_pago).getTime() - new Date(b.pago.fecha_pago).getTime()),
          multas: multasConEstado.map(m => ({
            id: m.id,
            monto: m.saldoPendiente, // Show pending balance
            montoOriginal: m.monto,
            pagosAplicados: m.pagosAplicados,
            estaPagada: m.estaPagada,
            descripcion: m.descripcion,
            fecha_creacion: m.fecha_creacion,
            id_acuerdo_pago: m.id_acuerdo_pago,
            detallesPagos: m.detallesPagos
          }))
        };
      });

      // Update database for penalties that are now fully paid
      const multasParaActualizar: { id: number; es_pagada: boolean }[] = [];
      acuerdosConAplicaciones.forEach(acuerdo => {
        acuerdo.multas.forEach(multa => {
          if (multa.estaPagada) {
            multasParaActualizar.push({
              id: multa.id,
              es_pagada: true
            });
          }
        });
      });

      // Call mutation to update payment status if there are penalties to update
      if (multasParaActualizar.length > 0) {
        updateMultaPagadaMutation.mutate(multasParaActualizar);
      }

      return acuerdosConAplicaciones;
    },
    enabled: !!cuentaId,
    staleTime: 30000, // 30 segundos - evita refetch automático al abrir modal
  });

  // Query to get all pagos for this cuenta
  const { data: pagos } = useQuery({
    queryKey: ["pagos_cuenta", cuentaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pagos')
        .select(`
          id,
          fecha_pago,
          monto,
          clave_rastreo,
          id_metodos_pago,
          descripcion,
          url_recibo,
          url_cep,
          metodos_pago!pagos_id_metodos_pago_fkey(nombre)
        `)
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true)
        .order('fecha_pago', { ascending: true });

      if (error) throw error;
      return data;
    },
    enabled: !!cuentaId,
    staleTime: 30000, // 30 segundos - evita refetch automático al abrir modal
  });

  // Query to get aplicaciones_pago for all pagos - independiente de la query de pagos para evitar race conditions
  const { data: aplicacionesPorPago, isLoading: aplicacionesPorPagoLoading } = useQuery({
    queryKey: ["aplicaciones_por_pago", cuentaId],
    queryFn: async () => {
      // Obtener pagos directamente dentro de la query para evitar dependencia
      const { data: pagosData, error: pagosError } = await supabase
        .from('pagos')
        .select('id')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);

      if (pagosError) throw pagosError;
      if (!pagosData || pagosData.length === 0) return [];

      const pagoIds = pagosData.map(p => p.id);
      const { data, error } = await supabase
        .from('aplicaciones_pago')
        .select(`
          id,
          monto,
          id_pago,
          id_acuerdo_pago,
          es_multa,
          acuerdos_pago!aplicaciones_pago_id_acuerdo_pago_fkey(
            fecha_pago,
            orden,
            conceptos_pago!acuerdos_pago_id_concepto_fkey(nombre)
          )
        `)
        .in('id_pago', pagoIds)
        .eq('activo', true);

      if (error) throw error;
      return data;
    },
    enabled: !!cuentaId,
    staleTime: 30000, // 30 segundos - evita refetch automático al abrir modal
  });

  // Query for cash payments limit calculation (only for properties)
  const { data: cashPaymentsData } = useQuery({
    queryKey: ["cash_payments", cuentaId, cuentaDetalle?.id_propiedad],
    queryFn: async () => {
      if (!cuentaDetalle || cuentaDetalle.tipo_cuenta !== 'Propiedad' || !cuentaDetalle.id_propiedad) {
        return null;
      }

      // Get bodegas not included
      const { data: bodegas } = await supabase
        .from('bodegas')
        .select('id, id_producto, es_incluido')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('es_incluido', false)
        .eq('activo', true);

      // Get estacionamientos not included
      const { data: estacionamientos } = await supabase
        .from('estacionamientos')
        .select('id, id_producto, es_incluido')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('es_incluido', false)
        .eq('activo', true);

      // Get acuerdo IDs for this cuenta first
      const { data: acuerdosDeEstaCuenta } = await supabase
        .from('acuerdos_pago')
        .select('id')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);

      const acuerdoIds = acuerdosDeEstaCuenta?.map(a => a.id) || [];

      // Get aplicaciones only for this cuenta's acuerdos
      const { data: aplicacionesDeEstaCuenta } = acuerdoIds.length > 0 
        ? await supabase
            .from('aplicaciones_pago')
            .select('id_pago, monto')
            .in('id_acuerdo_pago', acuerdoIds)
            .eq('activo', true)
        : { data: [] };

      // Get cash payments for property - sum from aplicaciones_pago to avoid duplicates
      let pagosPropiedadEfectivo = 0;
      
      if (aplicacionesDeEstaCuenta && aplicacionesDeEstaCuenta.length > 0) {
        const pagoIds = aplicacionesDeEstaCuenta.map(a => a.id_pago).filter(Boolean);
        
        if (pagoIds.length > 0) {
          // Get the payment methods for these payments
          const { data: pagosData } = await supabase
            .from('pagos')
            .select('id, id_metodos_pago')
            .in('id', pagoIds)
            .eq('id_metodos_pago', 1) // Efectivo only
            .eq('activo', true);

          // Get the IDs of cash payments
          const pagoEfectivoIds = pagosData?.map(p => p.id) || [];
          
          // Sum only the application amounts for cash payments
          pagosPropiedadEfectivo = aplicacionesDeEstaCuenta
            .filter(app => pagoEfectivoIds.includes(app.id_pago))
            .reduce((sum, app) => sum + (app.monto || 0), 0);
        }
      }

      // Get cash payments for bodegas (not included)
      let pagosBodegasEfectivo = 0;
      if (bodegas && bodegas.length > 0) {
        const bodegaProductIds = bodegas.map(b => b.id_producto).filter(Boolean);
        
        if (bodegaProductIds.length > 0) {
          // Get ofertas for these products
          const { data: ofertasBodegas } = await supabase
            .from('ofertas')
            .select('id')
            .in('id_producto', bodegaProductIds)
            .eq('activo', true);

          if (ofertasBodegas && ofertasBodegas.length > 0) {
            const ofertaBodegaIds = ofertasBodegas.map(o => o.id);
            
            // Get cuentas_cobranza for these ofertas
            const { data: cuentasBodegas } = await supabase
              .from('cuentas_cobranza')
              .select('id')
              .in('id_oferta', ofertaBodegaIds)
              .eq('activo', true);

            if (cuentasBodegas && cuentasBodegas.length > 0) {
              const cuentaBodegaIds = cuentasBodegas.map(c => c.id);
              
              // Get acuerdo IDs for these bodegas cuentas
              const { data: acuerdosBodegas } = await supabase
                .from('acuerdos_pago')
                .select('id')
                .in('id_cuenta_cobranza', cuentaBodegaIds)
                .eq('activo', true);

              const acuerdoBodegaIds = acuerdosBodegas?.map(a => a.id) || [];

              // Get aplicaciones only for these acuerdos
              const { data: aplicacionesBodegasDeEstaCuenta } = acuerdoBodegaIds.length > 0
                ? await supabase
                    .from('aplicaciones_pago')
                    .select('id_pago, monto')
                    .in('id_acuerdo_pago', acuerdoBodegaIds)
                    .eq('activo', true)
                : { data: [] };

              if (aplicacionesBodegasDeEstaCuenta && aplicacionesBodegasDeEstaCuenta.length > 0) {
                const pagoBodegaIds = aplicacionesBodegasDeEstaCuenta.map(a => a.id_pago).filter(Boolean);
                
                // Get the payment methods for these payments
                const { data: pagosBodegasData } = await supabase
                  .from('pagos')
                  .select('id, id_metodos_pago')
                  .in('id', pagoBodegaIds)
                  .eq('id_metodos_pago', 1) // Efectivo only
                  .eq('activo', true);

                // Get the IDs of cash payments
                const pagoBodegaEfectivoIds = pagosBodegasData?.map(p => p.id) || [];
                
                // Sum only the application amounts for cash payments
                pagosBodegasEfectivo = aplicacionesBodegasDeEstaCuenta
                  .filter(app => pagoBodegaEfectivoIds.includes(app.id_pago))
                  .reduce((sum, app) => sum + (app.monto || 0), 0);
              }
            }
          }
        }
      }

      // Get cash payments for estacionamientos (not included)
      let pagosEstacionamientosEfectivo = 0;
      if (estacionamientos && estacionamientos.length > 0) {
        const estacionamientoProductIds = estacionamientos.map(e => e.id_producto).filter(Boolean);
        
        if (estacionamientoProductIds.length > 0) {
          const { data: ofertasEstacionamientos } = await supabase
            .from('ofertas')
            .select('id')
            .in('id_producto', estacionamientoProductIds)
            .eq('activo', true);

          if (ofertasEstacionamientos && ofertasEstacionamientos.length > 0) {
            const ofertaEstacionamientoIds = ofertasEstacionamientos.map(o => o.id);
            
            const { data: cuentasEstacionamientos } = await supabase
              .from('cuentas_cobranza')
              .select('id')
              .in('id_oferta', ofertaEstacionamientoIds)
              .eq('activo', true);

            if (cuentasEstacionamientos && cuentasEstacionamientos.length > 0) {
              const cuentaEstacionamientoIds = cuentasEstacionamientos.map(c => c.id);
              
              // Get acuerdo IDs for these estacionamientos cuentas
              const { data: acuerdosEstacionamientos } = await supabase
                .from('acuerdos_pago')
                .select('id')
                .in('id_cuenta_cobranza', cuentaEstacionamientoIds)
                .eq('activo', true);

              const acuerdoEstacionamientoIds = acuerdosEstacionamientos?.map(a => a.id) || [];

              // Get aplicaciones only for these acuerdos
              const { data: aplicacionesEstacionamientosDeEstaCuenta } = acuerdoEstacionamientoIds.length > 0
                ? await supabase
                    .from('aplicaciones_pago')
                    .select('id_pago, monto')
                    .in('id_acuerdo_pago', acuerdoEstacionamientoIds)
                    .eq('activo', true)
                : { data: [] };

              if (aplicacionesEstacionamientosDeEstaCuenta && aplicacionesEstacionamientosDeEstaCuenta.length > 0) {
                const pagoEstacionamientoIds = aplicacionesEstacionamientosDeEstaCuenta.map(a => a.id_pago).filter(Boolean);
                
                // Get the payment methods for these payments
                const { data: pagosEstacionamientosData } = await supabase
                  .from('pagos')
                  .select('id, id_metodos_pago')
                  .in('id', pagoEstacionamientoIds)
                  .eq('id_metodos_pago', 1) // Efectivo only
                  .eq('activo', true);

                // Get the IDs of cash payments
                const pagoEstacionamientoEfectivoIds = pagosEstacionamientosData?.map(p => p.id) || [];
                
                // Sum only the application amounts for cash payments
                pagosEstacionamientosEfectivo = aplicacionesEstacionamientosDeEstaCuenta
                  .filter(app => pagoEstacionamientoEfectivoIds.includes(app.id_pago))
                  .reduce((sum, app) => sum + (app.monto || 0), 0);
              }
            }
          }
        }
      }

      const valorUma = cuentaDetalle.valor_uma || 0;
      const limiteEfectivo = valorUma * 8025;
      const pagadoEfectivo = pagosPropiedadEfectivo + pagosBodegasEfectivo + pagosEstacionamientosEfectivo;
      const restanteEfectivo = limiteEfectivo - pagadoEfectivo;

      // Return bodegas and estacionamientos for escrituracion value calculation
      return {
        limiteEfectivo,
        pagadoEfectivo,
        restanteEfectivo,
        pagosPropiedadEfectivo,
        pagosBodegasEfectivo,
        pagosEstacionamientosEfectivo,
        tieneEstacionamientos: estacionamientos && estacionamientos.length > 0,
        tieneBodegas: bodegas && bodegas.length > 0,
        bodegaProductIds: bodegas?.map(b => b.id_producto).filter(Boolean) || [],
        estacionamientoProductIds: estacionamientos?.map(e => e.id_producto).filter(Boolean) || []
      };
    },
    enabled: !!cuentaId && !!cuentaDetalle,
  });

  // Query for escrituracion value calculation (only for properties)
  const { data: escrituracionData } = useQuery({
    queryKey: ["escrituracion_value", cuentaId, cuentaDetalle?.id_propiedad],
    queryFn: async () => {
      if (!cuentaDetalle || cuentaDetalle.tipo_cuenta !== 'Propiedad' || !cuentaDetalle.id_propiedad) {
        return null;
      }

      const precioPropiedad = cuentaDetalle.precio_final || 0;
      let totalEscrituracion = precioPropiedad;
      let precioBodegas = 0;
      let precioEstacionamientos = 0;

      // Get bodegas not included (es_incluido = false)
      const { data: bodegas } = await supabase
        .from('bodegas')
        .select('id, id_producto')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('activo', true)
        .eq('es_incluido', false);

      // Get bodegas included (es_incluido = true)
      const { data: bodegasIncluidas } = await supabase
        .from('bodegas')
        .select('id')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('activo', true)
        .eq('es_incluido', true);

      // Get estacionamientos not included (es_incluido = false)
      const { data: estacionamientos } = await supabase
        .from('estacionamientos')
        .select('id, id_producto')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('activo', true)
        .eq('es_incluido', false);

      // Get estacionamientos included (es_incluido = true)
      const { data: estacionamientosIncluidos } = await supabase
        .from('estacionamientos')
        .select('id')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('activo', true)
        .eq('es_incluido', true);

      // Get precio_final for bodegas
      if (bodegas && bodegas.length > 0) {
        const bodegaProductIds = bodegas.map(b => b.id_producto).filter(Boolean);
        
        if (bodegaProductIds.length > 0) {
          const { data: ofertasBodegas } = await supabase
            .from('ofertas')
            .select('id')
            .in('id_producto', bodegaProductIds)
            .eq('activo', true);

          if (ofertasBodegas && ofertasBodegas.length > 0) {
            const ofertaBodegaIds = ofertasBodegas.map(o => o.id);
            
            const { data: cuentasBodegas } = await supabase
              .from('cuentas_cobranza')
              .select('precio_final')
              .in('id_oferta', ofertaBodegaIds)
              .eq('activo', true);

            if (cuentasBodegas && cuentasBodegas.length > 0) {
              precioBodegas = cuentasBodegas.reduce((sum, c) => sum + (c.precio_final || 0), 0);
              totalEscrituracion += precioBodegas;
            }
          }
        }
      }

      // Get precio_final for estacionamientos
      if (estacionamientos && estacionamientos.length > 0) {
        const estacionamientoProductIds = estacionamientos.map(e => e.id_producto).filter(Boolean);
        
        if (estacionamientoProductIds.length > 0) {
          const { data: ofertasEstacionamientos } = await supabase
            .from('ofertas')
            .select('id')
            .in('id_producto', estacionamientoProductIds)
            .eq('activo', true);

          if (ofertasEstacionamientos && ofertasEstacionamientos.length > 0) {
            const ofertaEstacionamientoIds = ofertasEstacionamientos.map(o => o.id);
            
            const { data: cuentasEstacionamientos } = await supabase
              .from('cuentas_cobranza')
              .select('precio_final')
              .in('id_oferta', ofertaEstacionamientoIds)
              .eq('activo', true);

            if (cuentasEstacionamientos && cuentasEstacionamientos.length > 0) {
              precioEstacionamientos = cuentasEstacionamientos.reduce((sum, c) => sum + (c.precio_final || 0), 0);
              totalEscrituracion += precioEstacionamientos;
            }
          }
        }
      }

      return {
        totalEscrituracion,
        precioPropiedad,
        precioBodegas,
        precioEstacionamientos,
        tieneBodegas: (bodegas?.length || 0) > 0,
        tieneEstacionamientos: (estacionamientos?.length || 0) > 0,
        tieneBodegasIncluidas: (bodegasIncluidas?.length || 0) > 0,
        tieneEstacionamientosIncluidos: (estacionamientosIncluidos?.length || 0) > 0
      };
    },
    enabled: !!cuentaDetalle && cuentaDetalle.tipo_cuenta === 'Propiedad' && !!cuentaDetalle.id_propiedad,
  });

  // Check if there are payments with "Cesión de derechos" method (ID 8)
  const pagosConCesion = acuerdosPago?.flatMap(acuerdo => 
    (acuerdo.aplicaciones || []).filter(app => app.pago.id_metodos_pago === 8)
  ) || [];
  
  console.log('DEBUG - Acuerdos de pago:', acuerdosPago);
  console.log('DEBUG - Pagos con cesión:', pagosConCesion);
  console.log('DEBUG - Payment methods in applications:', acuerdosPago?.flatMap(acuerdo => 
    (acuerdo.aplicaciones || []).map(app => ({ id: app.pago.id, metodo: app.pago.id_metodos_pago }))
  ));
  
  const hayCesionDerechos = pagosConCesion.length > 0;

  // Calculate current payment plan details from acuerdos
  const currentPaymentPlan = acuerdosPago ? (() => {
    const apartado = acuerdosPago.find(a => a.concepto?.toLowerCase() === 'apartado');
    const enganche = acuerdosPago.find(a => a.concepto?.toLowerCase() === 'enganche');  
    const parcialidades = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'parcialidad');
    const contraentrega = acuerdosPago.find(a => a.concepto?.toLowerCase() === 'pago a contra entrega');
    
    // Also check for "Cesión de derechos" as a concepto
    const cesionDerechos = acuerdosPago.find(a => a.concepto?.toLowerCase() === 'cesión de derechos');
    
    // Check for "Pago especial" as a concepto
    const pagosEspeciales = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'pago especial');
    
    // Update hayCesionDerechos to include both cases: as payment method OR as concepto
    const hayCesionDerechosConcepto = !!cesionDerechos;
    const hayCesionDerechosActual = hayCesionDerechos || hayCesionDerechosConcepto;
    
    // Check if there are special payments
    const hayPagosEspeciales = pagosEspeciales.length > 0;

    if (!cuentaDetalle?.precio_final) return null;

    // Calculate total payments by "Cesión de derechos" method
    const totalCesion = pagosConCesion.reduce((sum, app) => sum + app.monto, 0);
    
    // Add cesión de derechos amount if it exists as a concepto
    const totalCesionConcepto = cesionDerechos?.monto || 0;
    const totalCesionFinal = totalCesion + totalCesionConcepto;
    
    // Calculate total special payments
    const totalPagosEspeciales = pagosEspeciales.reduce((sum, p) => sum + p.monto, 0);
    
    console.log('DEBUG - Total cesión (method):', totalCesion);
    console.log('DEBUG - Total cesión (concepto):', totalCesionConcepto);
    console.log('DEBUG - Total cesión final:', totalCesionFinal);
    console.log('DEBUG - Hay cesión de derechos:', hayCesionDerechosActual);
    console.log('DEBUG - Total pagos especiales:', totalPagosEspeciales);
    console.log('DEBUG - Hay pagos especiales:', hayPagosEspeciales);
    
    // If there's "Cesión de derechos", use it instead of traditional "Enganche"
    const totalEnganche = hayCesionDerechosActual ? totalCesionFinal : (apartado?.monto || 0) + (enganche?.monto || 0);
    const totalParcialidades = parcialidades.reduce((sum, p) => sum + p.monto, 0);
    const totalContraentrega = contraentrega?.monto || 0;

    // Count total payments: parcialidades + special payments
    const totalPagosCount = parcialidades.length + pagosEspeciales.length;

    const result = {
      porcentaje_enganche: Number(((totalEnganche / cuentaDetalle.precio_final) * 100).toFixed(1)),
      porcentaje_mensualidades: Number(((totalParcialidades / cuentaDetalle.precio_final) * 100).toFixed(1)),
      porcentaje_entrega: Number(((totalContraentrega / cuentaDetalle.precio_final) * 100).toFixed(1)),
      porcentaje_pagos_especiales: Number(((totalPagosEspeciales / cuentaDetalle.precio_final) * 100).toFixed(1)),
      numero_mensualidades: parcialidades.length,
      numero_pagos_especiales: pagosEspeciales.length,
      total_pagos_count: totalPagosCount,
      hayCesionDerechos: hayCesionDerechosActual,
      hayPagosEspeciales: hayPagosEspeciales
    };
    
    console.log('DEBUG - Current payment plan:', result);
    
    return result;
  })() : null;

  // Calculate actual amounts from acuerdos de pago
  const actualAmounts = acuerdosPago ? (() => {
    const apartados = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'apartado');
    const enganches = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'enganche');
    const parcialidades = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'parcialidad');
    const contraentrega = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'pago a contra entrega');
    
    // Also get cesión de derechos as concepto
    const cesionDerechos = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'cesión de derechos');
    
    // Get pagos especiales
    const pagosEspeciales = acuerdosPago.filter(a => a.concepto?.toLowerCase() === 'pago especial');

    // Calculate total payments by "Cesión de derechos" method
    const totalCesion = pagosConCesion.reduce((sum, app) => sum + app.monto, 0);
    
    // Add cesión de derechos amount if it exists as a concepto
    const totalCesionConcepto = cesionDerechos.reduce((sum, a) => sum + a.monto, 0);
    const totalCesionFinal = totalCesion + totalCesionConcepto;
    
    // Calculate total special payments
    const totalPagosEspeciales = pagosEspeciales.reduce((sum, a) => sum + a.monto, 0);
    
    // Update to use the combined hayCesionDerechos logic
    const hayCesionDerechosActual = hayCesionDerechos || cesionDerechos.length > 0;
    
    // If there's "Cesión de derechos", use it instead of traditional "Enganche"
    const totalEnganche = hayCesionDerechosActual ? totalCesionFinal : [...apartados, ...enganches].reduce((sum, a) => sum + a.monto, 0);
    const totalMensualidades = parcialidades.reduce((sum, a) => sum + a.monto, 0);
    const totalEntrega = contraentrega.reduce((sum, a) => sum + a.monto, 0);

    return {
      enganche: totalEnganche,
      mensualidades: totalMensualidades,
      entrega: totalEntrega,
      cesion: totalCesionFinal,
      pagosEspeciales: totalPagosEspeciales
    };
  })() : null;

  // Check if payment plan has been modified by comparing with actual database records
  const isPaymentPlanModified = originalScheme && currentPaymentPlan ? (
    Math.abs(originalScheme.porcentaje_enganche - currentPaymentPlan.porcentaje_enganche) > 0.01 ||
    Math.abs(originalScheme.porcentaje_mensualidades - currentPaymentPlan.porcentaje_mensualidades) > 0.01 ||
    Math.abs(originalScheme.porcentaje_entrega - currentPaymentPlan.porcentaje_entrega) > 0.01 ||
    originalScheme.numero_mensualidades !== currentPaymentPlan.numero_mensualidades
  ) : false;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN'
    }).format(amount);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Sin fecha';
    try {
      const [year, month, day] = dateString.split('-').map(Number);
      const localDate = new Date(year, month - 1, day);
      if (isNaN(localDate.getTime())) return 'Fecha inválida';
      return format(localDate, 'dd/MM/yyyy', { locale: es });
    } catch (error) {
      return 'Fecha inválida';
    }
  };

  const handleDownloadOferta = async () => {
    if (!cuentaDetalle?.oferta_id) return;
    setDownloadingOferta(true);
    try {
      const { ofertaPdfStorageService } = await import('@/services/ofertaPdfStorageService');
      const offerId = cuentaDetalle.oferta_id;

      const existingUrl = await ofertaPdfStorageService.getExistingUrl(offerId);

      if (existingUrl) {
        const validation = await ofertaPdfStorageService.validateOfferDataAndInvalidateIfNeeded(offerId);
        if (!validation.wasInvalidated) {
          const filename = existingUrl.split('/').pop() || `oferta-${offerId}.pdf`;
          await ofertaPdfStorageService.downloadFromUrl(existingUrl, filename);
          toast({ title: "PDF descargado", description: "La oferta se ha descargado exitosamente" });
          return;
        }
        toast({ title: "Regenerando PDF", description: "Los datos han cambiado, regenerando..." });
      } else {
        toast({ title: "Generando PDF", description: "Preparando la descarga del PDF de la oferta..." });
      }

      const { generateOfferPDF } = await import('@/services/htmlToPdfService');
      const isProduct = cuentaDetalle.tipo_cuenta !== 'Propiedad';

      if (isProduct && cuentaDetalle.producto_servicio_id) {
        await generateOfferPDF({
          propertyId: cuentaDetalle.id_propiedad || 0,
          offerId,
          propertyNumber: cuentaDetalle.producto_servicio_nombre || '',
          leadName: cuentaDetalle.compradores[0]?.nombre_legal || 'Sin comprador',
          leadEmail: '',
          leadPhone: '',
          creatorEmail: 'admin@system.com',
          isProductOffer: true,
          productId: cuentaDetalle.producto_servicio_id
        });
      } else if (cuentaDetalle.id_propiedad) {
        await generateOfferPDF({
          propertyId: cuentaDetalle.id_propiedad,
          offerId,
          propertyNumber: cuentaDetalle.numero_propiedad,
          leadName: cuentaDetalle.compradores[0]?.nombre_legal || 'Sin comprador',
          leadEmail: '',
          leadPhone: '',
          creatorEmail: 'admin@system.com'
        });
      } else {
        toast({ title: "Error", description: "La oferta no tiene propiedad ni producto asociado", variant: "destructive" });
        return;
      }
      toast({ title: "PDF Generado", description: "La oferta se ha generado y descargado exitosamente" });
    } catch (error) {
      console.error('Error downloading offer:', error);
      toast({ title: "Error", description: `No se pudo descargar la oferta: ${error instanceof Error ? error.message : 'Error desconocido'}`, variant: "destructive" });
    } finally {
      setDownloadingOferta(false);
    }
  };

  const toggleAcuerdo = (acuerdoId: number) => {
    setOpenAcuerdos(prev => ({
      ...prev,
      [acuerdoId]: !prev[acuerdoId]
    }));
  };

  // Conceptos de cancelación (7 = Pago por cancelación, 9 = Devolución de pago)
  const CONCEPTOS_CANCELACION = [7, 9];
  
  // Total pagado basado en PAGOS REALES (suma de pagos.monto) - usado para saldo pendiente
  const totalPagadoReal = pagos?.reduce((sum, pago) => sum + Number(pago.monto || 0), 0) || 0;
  
  // Total pagado basado en APLICACIONES (para compatibilidad con lógica de acuerdos individuales)
  const totalPagadoAplicaciones = acuerdosPago?.reduce((sum, acuerdo) => {
    if (CONCEPTOS_CANCELACION.includes(acuerdo.id_concepto)) return sum;
    return sum + (acuerdo.aplicaciones || []).reduce((appSum, app) => appSum + (app?.monto || 0), 0);
  }, 0) || 0;
  
  // Para compatibilidad: usar totalPagadoAplicaciones donde se necesite la lógica anterior
  const totalPagado = totalPagadoAplicaciones;

  // Calcular total de multas pendientes (solo las que no están completamente pagadas)
  const totalMultasPendientes = acuerdosPago?.reduce((sum, acuerdo) => {
    return sum + (acuerdo.multas || []).reduce((multaSum, multa) => {
      // Solo sumar el monto pendiente de cada multa (monto - pagosAplicados)
      const pendiente = multa.monto - (multa.pagosAplicados || 0);
      return multaSum + Math.max(0, pendiente);
    }, 0);
  }, 0) || 0;

  // Calculate total from acuerdos_pago (sum of monto) - EXCLUYENDO conceptos de cancelación
  const totalAcuerdos = acuerdosPago?.reduce((sum, acuerdo) => {
    // Excluir conceptos 7 y 9 del cálculo
    if (CONCEPTOS_CANCELACION.includes(acuerdo.id_concepto)) return sum;
    return sum + (acuerdo.monto || 0);
  }, 0) || 0;
  
  // Calcular montos de cancelación
  const montoPagoCancelacion = acuerdosPago?.find(a => a.id_concepto === 7)?.monto || 0;
  const montoDevolucionCliente = acuerdosPago?.find(a => a.id_concepto === 9)?.monto || 0;
  
  // Create a map from acuerdo_pago.id to parcialidad sequential number
  const parcialidadMap: Record<number, number> = {};
  if (acuerdosPago) {
    let parcialidadCount = 0;
    acuerdosPago.forEach(acuerdo => {
      if (acuerdo.concepto?.toLowerCase().includes('parcialidad')) {
        parcialidadCount++;
        parcialidadMap[acuerdo.id] = parcialidadCount;
      }
    });
  }
  
  // Calculate discrepancy between precio_final and sum of acuerdos
  const discrepanciaAcuerdos = (cuentaDetalle?.precio_final || 0) - totalAcuerdos;
  const hayDiscrepancia = acuerdosPago && acuerdosPago.length > 0 && Math.abs(discrepanciaAcuerdos) > 0.01;

  // Calcular diferencia real y detectar sobrepagos - AHORA USANDO PAGOS REALES
  const diferenciaReal = (cuentaDetalle?.precio_final || 0) - totalPagadoReal;
  const haySobrepago = diferenciaReal < -0.01; // Tolerancia para errores de punto flotante
  const montoSobrepago = haySobrepago ? Math.abs(diferenciaReal) : 0;
  const totalPendiente = Math.max(0, diferenciaReal);

  // Detectar discrepancia entre pagos reales y aplicaciones (para mostrar botón recalcular)
  // Solo calcular cuando TODAS las queries relacionadas estén completamente cargadas para evitar falsos positivos
  const isLoadingPaymentData = !pagos || aplicacionesPorPagoLoading || acuerdosLoading || !acuerdosPago;
  const totalAplicaciones = aplicacionesPorPago?.reduce((sum, app) => sum + (app.monto || 0), 0) || 0;
  const discrepanciaPagosVsAplicaciones = totalPagadoReal - totalAplicaciones;
  const hayDiscrepanciaAplicaciones = !isLoadingPaymentData && pagos && pagos.length > 0 && Math.abs(discrepanciaPagosVsAplicaciones) > 0.01;

  // Calculate pending balance breakdown (only for properties)
  const pendingBalanceBreakdown = cuentaDetalle?.tipo_cuenta === 'Propiedad' && acuerdosPago ? (() => {
    // Find contraentrega (pago a contra entrega) acuerdos
    const contraentregaAcuerdos = acuerdosPago.filter(a => 
      a.concepto?.toLowerCase() === 'pago a contra entrega'
    );
    
    // Find non-contraentrega acuerdos
    const noContraentregaAcuerdos = acuerdosPago.filter(a => 
      a.concepto?.toLowerCase() !== 'pago a contra entrega'
    );
    
    // Calculate total contraentrega amount and paid amount (excluding fines)
    const totalContraentrega = contraentregaAcuerdos.reduce((sum, a) => sum + a.monto, 0);
    const pagadoContraentrega = contraentregaAcuerdos.reduce((sum, acuerdo) => 
      sum + (acuerdo.aplicaciones || [])
        .filter(app => !app.es_multa)
        .reduce((appSum, app) => appSum + (app?.monto || 0), 0), 0
    );
    const pendienteContraentrega = Math.max(0, totalContraentrega - pagadoContraentrega);

    // Calculate total "durante obra" pending amount for incomplete acuerdos only
    const totalDuranteObra = noContraentregaAcuerdos
      .filter(a => !a.pago_completado)
      .reduce((sum, acuerdo) => {
        const montoAcuerdo = Number(acuerdo.monto);
        const aplicado = (acuerdo.aplicaciones || [])
          .filter(app => !app.es_multa)
          .reduce((appSum, app) => appSum + Number(app?.monto || 0), 0);
        const pendiente = montoAcuerdo - aplicado;
        return sum + pendiente;
      }, 0);
    
    // Calculate total paid amount for all durante obra acuerdos (excluding fines)
    const pagadoDuranteObra = noContraentregaAcuerdos.reduce((sum, acuerdo) => 
      sum + (acuerdo.aplicaciones || [])
        .filter(app => !app.es_multa)
        .reduce((appSum, app) => appSum + (app?.monto || 0), 0), 0
    );
    
    // Calculate total pending fines for durante obra acuerdos
    const totalMultasPendientesDuranteObra = noContraentregaAcuerdos.reduce((sum, acuerdo) => {
      const multasAcuerdo = (acuerdo.multas || []).reduce((multaSum, multa) => 
        multaSum + multa.monto, 0
      );
      return sum + multasAcuerdo;
    }, 0);
    
    // Total pending durante obra = pending acuerdos + pending fines
    const pendienteDuranteObra = Math.max(0, totalDuranteObra + totalMultasPendientesDuranteObra);

    // Count remaining partial payments (parcialidades not completed)
    const parcialidadesRestantes = acuerdosPago.filter(a => 
      a.concepto?.toLowerCase() === 'parcialidad' && !a.pago_completado
    ).length;

    // Debug info
    console.log('Durante Obra Calculation:', {
      totalDuranteObra,
      pagadoDuranteObra,
      totalMultasPendientesDuranteObra,
      pendienteDuranteObra,
      noContraentregaAcuerdos: noContraentregaAcuerdos.map(a => ({
        id: a.id,
        concepto: a.concepto,
        monto: a.monto,
        completado: a.pago_completado,
        pagado: (a.aplicaciones || []).filter(app => !app.es_multa).reduce((s, app) => s + app.monto, 0),
        multasPendientes: (a.multas || []).reduce((s, m) => s + m.monto, 0)
      }))
    });

    return {
      duranteObra: pendienteDuranteObra,
      aLaEntrega: pendienteContraentrega,
      parcialidadesRestantes,
      debug: {
        totalDuranteObra,
        pagadoDuranteObra,
        totalMultasPendientesDuranteObra
      }
    };
  })() : null;

  // Find last payment and check if it's STP
  const pagosAplicados = acuerdosPago?.flatMap(acuerdo => 
    (acuerdo.aplicaciones || []).filter(app => !app.es_multa)
  ) || [];
  
  // Get the most recent payment (regardless of method)
  const ultimoPago = pagosAplicados
    .sort((a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime())[0]?.pago || null;
  
  // Check if the last payment is STP (method ID = 6)
  const ultimoPagoEsSTP = ultimoPago?.id_metodos_pago === 6;
  
  // Only set ultimoPagoSTP if the most recent payment is STP
  const ultimoPagoSTP = ultimoPagoEsSTP ? ultimoPago : null;

  // Mutation to update comprador
  const updateCompradorMutation = useMutation({
    mutationFn: async (data: any) => {
      const { error } = await supabase
        .from('personas')
        .update({
          nombre_legal: data.nombre_legal,
          email: data.email,
          telefono: data.telefono,
          clave_pais_telefono: data.clave_pais_telefono,
          rfc: data.rfc,
          curp: data.curp,
          fecha_nacimiento: data.fecha_nacimiento,
          nacionalidad: data.nacionalidad,
          estado_civil: data.estado_civil,
          genero: data.genero,
          regimen_fiscal: data.regimen_fiscal,
          uso_cfdi: data.uso_cfdi,
          direccion_fiscal: data.direccion_fiscal,
          codigo_postal: data.codigo_postal,
          colonia: data.colonia,
          municipio: data.municipio,
          estado: data.estado,
          pais: data.pais,
        })
        .eq('id', data.id);
      if (error) throw error;
    },
    onSuccess: (_data, variables) => {
      toast({ title: "Comprador actualizado correctamente" });
      setIsCompradorDialogOpen(false);
      setEditingComprador(null);
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
      registrarActualizacion(
        'comprador',
        { id: variables.id, nombre_legal: editingComprador?.nombre_legal },
        { id: variables.id, nombre_legal: variables.nombre_legal, curp: variables.curp, rfc: variables.rfc, email: variables.email },
        'actualizar_comprador_cuenta_cobranza'
      );
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    }
  });

  // Handle RFC click to open comprador edit dialog
  const handleRfcClick = async (idPersona: number) => {
    const { data, error } = await supabase
      .from('personas')
      .select('*')
      .eq('id', idPersona)
      .single();
    
    if (!error && data) {
      setEditingComprador(data);
      setIsCompradorDialogOpen(true);
    } else {
      toast({ title: "Error", description: "No se pudo cargar la información del comprador", variant: "destructive" });
    }
  };

  // Mutation to delete payment application (physical deletion)
  const deletePaymentMutation = useMutation({
    mutationFn: async (aplicacionId: number) => {
      // Get the application to find its payment
      const { data: aplicacion, error: aplicacionError } = await supabase
        .from('aplicaciones_pago')
        .select('id_pago, id_acuerdo_pago, monto')
        .eq('id', aplicacionId)
        .single();

      if (aplicacionError) throw aplicacionError;
      if (!aplicacion) throw new Error("Aplicación no encontrada");

      // Get the payment with clave_rastreo for STP cleanup
      const { data: pago, error: pagoError } = await supabase
        .from('pagos')
        .select('id_metodos_pago, clave_rastreo')
        .eq('id', aplicacion.id_pago)
        .single();

      if (pagoError) throw pagoError;
      if (!pago) throw new Error("Pago no encontrado");

      // Get all applications for this payment to update related acuerdos
      const { data: todasAplicaciones, error: aplicacionesError } = await supabase
        .from('aplicaciones_pago')
        .select('id, id_acuerdo_pago')
        .eq('id_pago', aplicacion.id_pago);

      if (aplicacionesError) throw aplicacionesError;

      // 1. PHYSICALLY DELETE all applications for this payment
      const { error: deleteAplicacionesError } = await supabase
        .from('aplicaciones_pago')
        .delete()
        .eq('id_pago', aplicacion.id_pago);

      if (deleteAplicacionesError) throw deleteAplicacionesError;

      // 2. PHYSICALLY DELETE the payment
      const { error: deletePagoError } = await supabase
        .from('pagos')
        .delete()
        .eq('id', aplicacion.id_pago);

      if (deletePagoError) throw deletePagoError;

      // 3. If it was an STP payment, clean up related records
      if (pago.clave_rastreo) {
        // 3a. Delete the tabla_datos_cep record (allows regeneration on reload)
        await supabase
          .from('tabla_datos_cep')
          .delete()
          .eq('claverastreo', pago.clave_rastreo);

        // 3b. Mark pagos_stp_raw as not applied (allows reprocessing)
        await supabase
          .from('pagos_stp_raw')
          .update({ es_pago_aplicado: false })
          .eq('claverastreo', pago.clave_rastreo);
      }

      // 4. Mark all affected payment agreements as incomplete
      if (todasAplicaciones && todasAplicaciones.length > 0) {
        const acuerdosIds = [...new Set(todasAplicaciones.map(a => a.id_acuerdo_pago))];
        
        const { error: acuerdosError } = await supabase
          .from('acuerdos_pago')
          .update({ pago_completado: false })
          .in('id', acuerdosIds);

        if (acuerdosError) throw acuerdosError;
      }
    },
    onSuccess: async () => {
      toast({
        title: "Pago eliminado",
        description: "El pago ha sido eliminado. Recalculando aplicaciones...",
      });

      // Call edge function proxy to redistribute remaining payments (avoids CORS issues)
      try {
        await supabase.functions.invoke('recalcular-aplicaciones', {
          body: { id_cuenta_cobranza: cuentaId }
        });
      } catch (webhookError) {
        console.error('Error calling recalcular-aplicaciones:', webhookError);
      }

      // Invalidate queries after a short delay to allow webhook to complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaId] });
      }, 2000);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar el pago",
        variant: "destructive",
      });
    },
  });

  const handleDeletePayment = async (aplicacion: AplicacionToDelete) => {
    // Check if payment method is STP
    const acuerdo = acuerdosPago?.find(a => 
      (a.aplicaciones || []).some(app => app.id === aplicacion.id)
    );
    const aplicacionData = acuerdo?.aplicaciones?.find(app => app.id === aplicacion.id);
    
    // STP payments can now be deleted

    // Get the number of applications for this payment
    if (aplicacionData) {
      const { data: todasAplicaciones } = await supabase
        .from('aplicaciones_pago')
        .select('id')
        .eq('id_pago', aplicacionData.pago.id)
        .eq('activo', true);
      
      const numAplicaciones = todasAplicaciones?.length || 0;
      let warningMessage = "";
      
      if (numAplicaciones > 1) {
        warningMessage = `Este pago tiene ${numAplicaciones} aplicaciones. Al eliminarlo, se eliminarán todas sus aplicaciones y los acuerdos de pago relacionados quedarán como Pendientes.`;
      }
      
      setDeleteDialog({ isOpen: true, aplicacion, warningMessage });
    } else {
      setDeleteDialog({ isOpen: true, aplicacion, warningMessage: "" });
    }
  };

  const confirmDeletePayment = () => {
    if (deleteDialog.aplicacion) {
      deletePaymentMutation.mutate(deleteDialog.aplicacion.id);
    }
    setDeleteDialog({ isOpen: false, aplicacion: null, warningMessage: "" });
  };

  const handleEditPayment = async (aplicacionId: number) => {
    // Get payment ID from application
    const acuerdo = acuerdosPago?.find(a => 
      (a.aplicaciones || []).some(app => app.id === aplicacionId)
    );
    const aplicacion = acuerdo?.aplicaciones?.find(app => app.id === aplicacionId);
    
    if (aplicacion) {
      setEditPaymentDialog({
        isOpen: true,
        paymentId: aplicacion.pago.id
      });
    }
  };

  const handleDownloadRecibo = async (pagoId: number) => {
    try {
      setDownloadingRecibo(pagoId);
      const reciboService = new ReciboPagoService();
      await reciboService.generateRecibo({ pagoId });
      
      toast({
        title: "Recibo generado",
        description: "El recibo se ha descargado correctamente",
      });
    } catch (error) {
      console.error("Error generating recibo:", error);
      toast({
        title: "Error",
        description: "No se pudo generar el recibo",
        variant: "destructive",
      });
    } finally {
      setDownloadingRecibo(null);
    }
  };

  

  const handleUploadEvidence = async (pagoId: number, file: File) => {
    try {
      setUploadingEvidence(pagoId);

      // Upload to supabase storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${pagoId}_${Date.now()}.${fileExt}`;
      const filePath = `evidencias_pago/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('documentos')
        .getPublicUrl(filePath);

      // Update pago with url_recibo
      const { error: updateError } = await supabase
        .from('pagos')
        .update({ url_recibo: publicUrl })
        .eq('id', pagoId);

      if (updateError) throw updateError;

      // Log success
      await registrarSubidaDocumento({
        tipo: 'evidencia_pago_cobranza',
        id_pago: pagoId,
        id_cuenta_cobranza: cuentaId,
        nombre_archivo: file.name,
        url: publicUrl
      });

      toast({
        title: "Evidencia subida",
        description: "La evidencia de pago se ha guardado correctamente",
      });

      // Refresh queries
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaId] });
    } catch (error) {
      console.error("Error uploading evidence:", error);
      
      // Log error
      await registrarSubidaDocumento(
        { tipo: 'evidencia_pago_cobranza', id_pago: pagoId, id_cuenta_cobranza: cuentaId, nombre_archivo: file.name },
        'error',
        error instanceof Error ? error.message : 'Error desconocido'
      );

      toast({
        title: "Error",
        description: "No se pudo subir la evidencia de pago",
        variant: "destructive",
      });
    } finally {
      setUploadingEvidence(null);
    }
  };

  // Función para guardar clave_rastreo
  const handleSaveClaveRastreo = async (pagoId: number) => {
    const claveRastreo = editingClaveRastreo[pagoId]?.trim();
    if (!claveRastreo) return;

    // Get old value for logging
    const oldClaveRastreo = acuerdosPago?.flatMap(a => a.aplicaciones || [])
      .find(app => app.pago?.id === pagoId)?.pago?.clave_rastreo || null;

    setSavingClaveRastreo(pagoId);
    try {
      const { error } = await supabase
        .from('pagos')
        .update({ clave_rastreo: claveRastreo })
        .eq('id', pagoId);

      if (error) throw error;

      // Log success
      await registrarActualizacion(
        'pago',
        { id: pagoId, clave_rastreo: oldClaveRastreo },
        { id: pagoId, clave_rastreo: claveRastreo, id_cuenta_cobranza: cuentaId },
        'guardar_clave_rastreo'
      );

      toast({
        title: "Clave guardada",
        description: "La clave de rastreo se ha guardado correctamente",
      });

      // Limpiar el estado de edición
      setEditingClaveRastreo(prev => {
        const newState = { ...prev };
        delete newState[pagoId];
        return newState;
      });

      // Refrescar queries
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
    } catch (error) {
      console.error("Error saving clave_rastreo:", error);
      
      // Log error
      await registrarActualizacion(
        'pago',
        { id: pagoId, clave_rastreo: oldClaveRastreo },
        { id: pagoId, clave_rastreo: claveRastreo },
        'guardar_clave_rastreo',
        'error',
        error instanceof Error ? error.message : 'Error desconocido'
      );

      toast({
        title: "Error",
        description: "No se pudo guardar la clave de rastreo",
        variant: "destructive",
      });
    } finally {
      setSavingClaveRastreo(null);
    }
  };

  // Funciones para ajuste de monto
  const handleStartMontoEdit = (pagoId: number, currentMonto: number) => {
    setMontoAdjustments({
      pagoId,
      originalMonto: currentMonto,
      newMonto: currentMonto
    });
    setNewPaymentRows([]);
    setIsConfirmingAdjustment(false);
  };

  const handleCancelMontoEdit = () => {
    setMontoAdjustments(null);
    setNewPaymentRows([]);
    setIsConfirmingAdjustment(false);
  };

  const handleAddNewPaymentRow = () => {
    setNewPaymentRows(prev => [...prev, {
      id: `new-${Date.now()}`,
      fecha_pago: new Date().toISOString().split('T')[0],
      monto: 0,
      id_metodos_pago: 2, // Transferencia bancaria por defecto
      clave_rastreo: ''
    }]);
  };

  const handleRemoveNewPaymentRow = (id: string) => {
    setNewPaymentRows(prev => prev.filter(row => row.id !== id));
  };

  const handleConfirmAdjustments = async () => {
    if (!montoAdjustments) return;

    setIsSavingAdjustment(true);
    try {
      // 1. Actualizar el monto del pago existente
      const { error: updateError } = await supabase
        .from('pagos')
        .update({ monto: montoAdjustments.newMonto })
        .eq('id', montoAdjustments.pagoId);

      if (updateError) throw updateError;

      // 2. Insertar nuevos pagos si los hay
      if (newPaymentRows.length > 0) {
        const newPayments = newPaymentRows.filter(row => row.monto > 0).map(row => ({
          id_cuenta_cobranza: cuentaId,
          fecha_pago: row.fecha_pago,
          monto: row.monto,
          id_metodos_pago: row.id_metodos_pago,
          clave_rastreo: row.clave_rastreo || null,
          activo: true
        }));

        if (newPayments.length > 0) {
          const { error: insertError } = await supabase
            .from('pagos')
            .insert(newPayments);

          if (insertError) throw insertError;
        }
      }

      // 3. Llamar al webhook para recalcular aplicaciones
      try {
        await fetch(`${N8N_WEBHOOK_BASE_URL}/ajustaAplicacionesPagoCuentaEspecifica`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_cuenta_cobranza: cuentaId })
        });
      } catch (webhookError) {
        console.error('Error calling adjustment webhook:', webhookError);
      }

      toast({
        title: "Ajustes guardados",
        description: "Los ajustes se han aplicado y las aplicaciones de pago se están recalculando",
      });

      // Limpiar estados
      setMontoAdjustments(null);
      setNewPaymentRows([]);
      setIsConfirmingAdjustment(false);

      // Refrescar queries
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaId] });
    } catch (error) {
      console.error("Error saving adjustments:", error);
      toast({
        title: "Error",
        description: "No se pudieron guardar los ajustes",
        variant: "destructive",
      });
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  // Función para confirmar ajustes de aplicaciones
  const handleConfirmAplicacionAdjustments = async () => {
    if (Object.keys(aplicacionMontoEdit).length === 0 && newPaymentRows.length === 0) return;

    setIsSavingAdjustment(true);
    try {
      // 1. Actualizar los montos de los PAGOS editados (keys con formato pago_${id})
      for (const [key, newMonto] of Object.entries(aplicacionMontoEdit)) {
        if (key.startsWith('pago_')) {
          const pagoId = parseInt(key.replace('pago_', ''));
          const { error: updateError } = await supabase
            .from('pagos')
            .update({ monto: newMonto })
            .eq('id', pagoId);

          if (updateError) throw updateError;
        }
      }

      // 2. Insertar nuevos pagos si los hay
      if (newPaymentRows.length > 0) {
        const newPayments = newPaymentRows.filter(row => row.monto > 0).map(row => ({
          id_cuenta_cobranza: cuentaId,
          fecha_pago: row.fecha_pago,
          monto: row.monto,
          id_metodos_pago: row.id_metodos_pago,
          clave_rastreo: row.clave_rastreo || null,
          activo: true
        }));

        if (newPayments.length > 0) {
          const { error: insertError } = await supabase
            .from('pagos')
            .insert(newPayments);

          if (insertError) throw insertError;
        }
      }

      // 3. Llamar al webhook para recalcular aplicaciones
      try {
        await fetch(`${N8N_WEBHOOK_BASE_URL}/ajustaAplicacionesPagoCuentaEspecifica`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id_cuenta_cobranza: cuentaId })
        });
      } catch (webhookError) {
        console.error('Error calling adjustment webhook:', webhookError);
      }

      toast({
        title: "Ajustes guardados",
        description: "Los ajustes se han aplicado y las aplicaciones de pago se están recalculando",
      });

      // Limpiar estados
      setAplicacionMontoEdit({});
      setOriginalAplicacionMontos({});
      setNewPaymentRows([]);

      // Refrescar queries
      queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaId] });
    } catch (error) {
      console.error("Error saving application adjustments:", error);
      toast({
        title: "Error",
        description: "No se pudieron guardar los ajustes",
        variant: "destructive",
      });
    } finally {
      setIsSavingAdjustment(false);
    }
  };

  // Multa functions
  const handleNewMulta = (acuerdoId: number) => {
    const acuerdo = acuerdosPago?.find(a => a.id === acuerdoId);
    const existingMultas = acuerdo?.multas || [];
    setMultaDialog({
      isOpen: true,
      acuerdoId,
      acuerdoMonto: acuerdo?.monto || 0,
      existingMultas: existingMultas.map(m => ({ monto: m.monto }))
    });
  };

  const handleDeleteMulta = (multa: Multa) => {
    setDeleteMultaDialog({
      isOpen: true,
      multa
    });
  };

  // Mutation to update multa payment status
  const updateMultaPagadaMutation = useMutation({
    mutationFn: async (multasToUpdate: { id: number; es_pagada: boolean }[]) => {
      if (multasToUpdate.length === 0) return;
      
      // Update each multa individually
      const updates = multasToUpdate.map(multa => 
        supabase
          .from('multas')
          .update({ es_pagada: multa.es_pagada } as any)
          .eq('id', multa.id)
      );
      
      const results = await Promise.all(updates);
      
      // Check for errors
      const errors = results.filter(result => result.error);
      if (errors.length > 0) {
        throw errors[0].error;
      }
    },
    onError: (error) => {
      console.error('Error al actualizar estado de multas:', error);
    }
  });

  // Mutation to delete multa
  const deleteMultaMutation = useMutation({
    mutationFn: async (multaId: number) => {
      // First check if there are active payment applications for this multa
      const multaToDelete = deleteMultaDialog.multa;
      
      if (!multaToDelete) {
        throw new Error("No multa selected");
      }
      
      // Check if the multa has payments applied (either from frontend calculation or DB)
      const pagosAplicados = multaToDelete.pagosAplicados || 0;
      
      if (pagosAplicados > 0 || multaToDelete.estaPagada) {
        throw new Error("No se puede eliminar una multa que ya tiene pagos aplicados");
      }
      
      // Additional check: verify directly in DB that there are no payment applications
      const { data: aplicaciones, error: checkError } = await supabase
        .from('aplicaciones_pago')
        .select('id, monto')
        .eq('es_multa', true)
        .eq('activo', true);
      
      if (checkError) {
        console.error('Error checking payment applications:', checkError);
      }
      
      // Also check the es_pagada field directly from DB
      const { data: multaData, error: multaError } = await supabase
        .from('multas')
        .select('es_pagada')
        .eq('id', multaId)
        .single();
      
      if (multaError) {
        console.error('Error checking multa status:', multaError);
      }
      
      if (multaData?.es_pagada) {
        throw new Error("No se puede eliminar una multa que está marcada como pagada en la base de datos");
      }
      
      const { error } = await supabase
        .from('multas')
        .delete()
        .eq('id', multaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Multa eliminada",
        description: "La multa ha sido eliminada exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la multa",
        variant: "destructive",
      });
    },
  });

  const confirmDeleteMulta = () => {
    if (deleteMultaDialog.multa) {
      deleteMultaMutation.mutate(deleteMultaDialog.multa.id);
    }
    setDeleteMultaDialog({ isOpen: false, multa: null });
  };

  if (cuentaLoading || acuerdosLoading) {
    return <div className="text-center py-8">Cargando detalle de cuenta...</div>;
  }

  if (!cuentaDetalle) {
    return <div className="text-center py-8 text-muted-foreground">Cuenta no encontrada</div>;
  }

  const esCuentaCancelada = !cuentaDetalle?.activo;
  
  // Check if property status is "Entregado" (id=8) - makes everything read-only
  const isReadOnly = cuentaDetalle?.id_estatus_disponibilidad === 8;
  
  // Check if property is "En demanda" (id=11) - also makes account read-only
  const isEnDemanda = cuentaDetalle?.tipo_cuenta === 'Propiedad' && cuentaDetalle?.id_estatus_disponibilidad === 11;

  const handleGenerarFacturaSozu = async () => {
    setGenerarFacturaLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('generar-factura-comision-sozu', {
        body: { id_cuenta_cobranza: cuentaId, environment: ENVIRONMENT }
      });
      if (error) throw error;
      if (data?.not_applicable) {
        toast({ title: "No aplica", description: data.message });
      } else if (data?.already_exists) {
        toast({ title: "Ya existe", description: data.message });
      } else {
        toast({ title: "Factura generada", description: "Factura draft de comisión generada exitosamente" });
      }
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
    } catch (err) {
      console.error("Error generando factura:", err);
      toast({ title: "Error", description: "No se pudo generar la factura", variant: "destructive" });
    } finally {
      setGenerarFacturaLoading(false);
    }
  };

  const handleTimbrarFacturaSozu = async () => {
    if (!cuentaDetalle?.url_factura_comision) return;
    setTimbrarFacturaLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('timbrar-factura-comision-sozu', {
        body: { id_cuenta_cobranza: cuentaId, environment: ENVIRONMENT }
      });
      if (error) throw error;
      toast({ title: "Factura timbrada", description: "La factura se ha timbrado exitosamente" });
      queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
    } catch (err) {
      console.error("Error timbrando factura:", err);
      toast({ title: "Error", description: "No se pudo timbrar la factura", variant: "destructive" });
    } finally {
      setTimbrarFacturaLoading(false);
      setTimbrarFacturaDialog(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Diagonal "CANCELADA" stamp for cancelled accounts */}
      {esCuentaCancelada && (
        <div className="fixed inset-0 pointer-events-none z-40 flex items-center justify-center">
          <div className="absolute transform rotate-45 bg-red-600 text-white px-12 py-3 text-5xl font-bold opacity-20 select-none shadow-lg">
            CANCELADA
          </div>
        </div>
      )}
      
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/cuentas-cobranza">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold">
                Detalle Cuenta de Cobranza {formatCuentaCobranzaId(cuentaDetalle.id, cuentaDetalle.tipo_cuenta)}
              </h1>
              <Badge 
                variant={
                  cuentaDetalle.tipo_cuenta === 'Propiedad' ? 'default' :
                  cuentaDetalle.tipo_cuenta === 'Producto' ? 'secondary' :
                  'outline'
                }
              >
                {cuentaDetalle.tipo_cuenta}
              </Badge>
              {cuentaDetalle.collection_id && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger>
                      <Badge variant="outline" className="text-xs">
                        {cuentaDetalle.collection_id}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p className="text-sm">Cuenta anterior: {cuentaDetalle.collection_id}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Badge Factura Comisión Sozu - solo si el dueño requiere facturación */}
              {cuentaDetalle.dueno_facturar && (() => {
                if (cuentaDetalle.url_factura_comision) {
                  return cuentaDetalle.es_draft_factura_comision 
                    ? <Badge className="bg-yellow-500 hover:bg-yellow-600 text-white">Fact. Comisión: Draft</Badge>
                    : <Badge className="bg-green-600 hover:bg-green-700 text-white">Fact. Comisión: Timbrada</Badge>;
                }
                return <Badge variant="outline" className="text-muted-foreground">Fact. Comisión: No generada</Badge>;
              })()}
            </div>
            <p className="text-muted-foreground">
              Información detallada de pagos y acuerdos
              {cuentaDetalle.producto_servicio_nombre && ` - ${cuentaDetalle.producto_servicio_nombre}`}
            </p>
          </div>
        </div>
        
        {/* Mostrar badge grande cuando está cancelada, ocultar botones */}
        {esCuentaCancelada ? (
          <div className="flex items-center">
            <Badge variant="destructive" className="text-lg px-6 py-2 font-bold">
              <X className="h-5 w-5 mr-2" />
              CUENTA CANCELADA
            </Badge>
          </div>
        ) : (
          <div className="flex flex-col items-start gap-3">
            {/* Grupo de acciones de pago - solo visible con permiso de actualización */}
            {(canUpdate || isSuperAdmin) && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-border/50">
              <Button 
                onClick={() => setTransferDialog({ isOpen: true })}
                disabled={!ultimoPagoSTP || isReadOnly || isEnDemanda}
                variant="ghost"
                size="sm"
                className="h-9"
              >
                <ArrowRight className="h-4 w-4 mr-2" />
                Transferir
              </Button>
              
              <div className="h-5 w-px bg-border" />
              
              <Button 
                onClick={() => setManualPaymentDialog(true)}
                disabled={totalPagado >= (cuentaDetalle?.precio_final || 0) || isReadOnly || isEnDemanda}
                size="sm"
                className="h-9 bg-primary hover:bg-primary/90 text-primary-foreground"
              >
                <CreditCard className="h-4 w-4 mr-2" />
                Agregar Pago
              </Button>
            </div>
            )}

            {/* Grupo de acciones Factura Comisión Sozu - solo si el dueño requiere facturación */}
            {(canUpdate || isSuperAdmin) && cuentaDetalle?.dueno_facturar && (
            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-border/50">
              {!cuentaDetalle?.url_factura_comision ? (
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-9"
                  onClick={handleGenerarFacturaSozu}
                  disabled={generarFacturaLoading || cuentaDetalle?.id_estatus_disponibilidad !== 5}
                >
                  {generarFacturaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
                  Generar Fact. Comisión
                </Button>
              ) : cuentaDetalle?.es_draft_factura_comision ? (
                <>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9"
                    onClick={handleGenerarFacturaSozu}
                    disabled={generarFacturaLoading}
                  >
                    {generarFacturaLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <RefreshCcw className="h-4 w-4 mr-2" />}
                    Regenerar
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9"
                    onClick={() => setTimbrarFacturaDialog(true)}
                  >
                    <Stamp className="h-4 w-4 mr-2" />
                    Timbrar Fact. Comisión
                  </Button>
                </>
              ) : (
                cuentaDetalle?.url_factura_comision && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-9"
                    onClick={() => window.open(cuentaDetalle.url_factura_comision!, '_blank')}
                  >
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Fact. Comisión
                  </Button>
                )
              )}
            </div>
            )}

            <div className="flex items-center gap-2 p-2 bg-muted/50 rounded-lg border border-border/50">
              <Button 
                onClick={async () => {
                  if (!id) return;
                  try {
                    setIsGeneratingEstadoCuenta(true);
                    const service = new EstadoCuentaEdgeFunctionService();
                    await service.generateEstadoCuenta({
                      id_cuenta: parseInt(id)
                    });
                    toast({
                      title: "Estado de cuenta generado",
                      description: "El PDF se ha descargado exitosamente."
                    });
                  } catch (error) {
                    console.error("Error generating estado de cuenta:", error);
                    toast({
                      title: "Error",
                      description: "No se pudo generar el estado de cuenta.",
                      variant: "destructive"
                    });
                  } finally {
                    setIsGeneratingEstadoCuenta(false);
                  }
                }}
                variant="ghost"
                size="sm"
                className="h-9"
                disabled={isGeneratingEstadoCuenta}
              >
                {isGeneratingEstadoCuenta ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <FileText className="h-4 w-4 mr-2" />
                )}
                Estado de Cuenta
              </Button>
              
              {(canUpdate || isSuperAdmin) && (
              <>
                <div className="h-5 w-px bg-border" />
                <Button 
                  onClick={() => setEditCuentaDialog(true)}
                  variant="ghost"
                  size="sm"
                  className="h-9"
                >
                  <Edit className="h-4 w-4 mr-2" />
                  Editar Cuenta
                </Button>
              </>
              )}
              
              {/* Botón Poner en Demanda */}
              {(canUpdate || isSuperAdmin) && cuentaDetalle.tipo_cuenta === 'Propiedad' && 
               cuentaDetalle.id_estatus_disponibilidad !== 11 && 
               totalPagado < (cuentaDetalle?.precio_final || 0) && (
                <>
                  <div className="h-5 w-px bg-border" />
                  <Button
                    onClick={() => setEnDemandaDialog(true)}
                    variant="ghost"
                    size="sm"
                    className="h-9 text-amber-600 hover:text-amber-700 hover:bg-amber-50"
                  >
                    <Scale className="h-4 w-4 mr-2" />
                    Poner en demanda
                  </Button>
                </>
              )}
              
              {/* Botón Juicio Terminado */}
              {(canUpdate || isSuperAdmin) && cuentaDetalle.tipo_cuenta === 'Propiedad' && 
               cuentaDetalle.id_estatus_disponibilidad === 11 && (
                <>
                  <div className="h-5 w-px bg-border" />
                  <Button 
                    onClick={() => setJuicioTerminadoDialog(true)}
                    size="sm"
                    className="h-9 bg-green-600 hover:bg-green-700 text-white"
                  >
                    <Gavel className="h-4 w-4 mr-2" />
                    Juicio Terminado
                  </Button>
                </>
              )}
              
              {/* Botón Recalcular Aplicaciones - Solo visible cuando hay discrepancia */}
              {(canUpdate || isSuperAdmin) && !esCuentaCancelada && !isEnDemanda && hayDiscrepanciaAplicaciones && (
                <>
                  <div className="h-5 w-px bg-border" />
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          onClick={async () => {
                            setIsRecalculatingAplicaciones(true);
                            try {
                              // Use edge function proxy to avoid CORS issues with external n8n webhook
                              const { data, error } = await supabase.functions.invoke('recalcular-aplicaciones', {
                                body: { id_cuenta_cobranza: cuentaId }
                              });
                              
                              if (error) {
                                throw error;
                              }
                              
                              // Log activity
                              await registrarActualizacion(
                                'aplicaciones_pago',
                                null,
                                {
                                  id_cuenta_cobranza: cuentaId,
                                  accion: 'recalcular_aplicaciones',
                                  proyecto: cuentaDetalle?.proyecto,
                                  propiedad: cuentaDetalle?.numero_propiedad,
                                  discrepancia: discrepanciaPagosVsAplicaciones
                                },
                                'recalcular_aplicaciones_pago',
                                'exito'
                              );
                              
                              toast({
                                title: "Recálculo completado",
                                description: "Las aplicaciones de pago se han redistribuido correctamente.",
                              });
                              
                              // Refresh after delay to allow function to complete
                              setTimeout(() => {
                                queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
                                queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaId] });
                                queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaId] });
                                setIsRecalculatingAplicaciones(false);
                              }, 2000);
                            } catch (error) {
                              console.error('Error recalculating:', error);
                              
                              // Log error activity
                              await registrarActualizacion(
                                'aplicaciones_pago',
                                null,
                                {
                                  id_cuenta_cobranza: cuentaId,
                                  accion: 'recalcular_aplicaciones'
                                },
                                'recalcular_aplicaciones_pago',
                                'error',
                                error instanceof Error ? error.message : 'Error desconocido'
                              );
                              
                              toast({
                                title: "Error",
                                description: "No se pudo iniciar el recálculo. Intenta de nuevo.",
                                variant: "destructive",
                              });
                              setIsRecalculatingAplicaciones(false);
                            }
                          }}
                          variant="ghost"
                          size="sm"
                          className="h-9 text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:text-amber-300 dark:hover:bg-amber-950/50"
                          disabled={isRecalculatingAplicaciones}
                        >
                          {isRecalculatingAplicaciones ? (
                            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                          ) : (
                            <RefreshCcw className="h-4 w-4 mr-2" />
                          )}
                          Recalcular
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Discrepancia detectada: {formatCurrency(Math.abs(discrepanciaPagosVsAplicaciones))}</p>
                        <p className="text-xs text-muted-foreground">Pagos: {formatCurrency(totalPagadoReal)} | Aplicaciones: {formatCurrency(totalAplicaciones)}</p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Alert for discrepancy */}
      {hayDiscrepancia && (
        <div className="p-4 bg-red-50 dark:bg-red-950/30 rounded-lg border border-red-200 dark:border-red-800 flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-red-700 dark:text-red-300">Discrepancia detectada</p>
            <p className="text-sm text-red-600 dark:text-red-400 mt-1">
              El precio final ({formatCurrency(cuentaDetalle.precio_final)}) no coincide con la suma de los acuerdos de pago ({formatCurrency(totalAcuerdos)}).
            </p>
            <p className="text-sm font-medium text-red-700 dark:text-red-300 mt-1">
              Diferencia: {formatCurrency(discrepanciaAcuerdos)}
              {discrepanciaAcuerdos > 0 ? ' (acuerdos faltantes)' : ' (acuerdos exceden precio)'}
            </p>
          </div>
        </div>
      )}

      {/* Alert for En Demanda status */}
      {cuentaDetalle.tipo_cuenta === 'Propiedad' && cuentaDetalle.id_estatus_disponibilidad === 11 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <Scale className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold text-amber-700 dark:text-amber-300">Propiedad En Demanda - Solo Lectura</p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              Esta cuenta está bloqueada debido a un proceso legal en curso. <strong>Todos los campos son de solo lectura</strong> y no se pueden realizar modificaciones hasta que el juicio termine.
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-1">
              No se permite: agregar pagos manuales, editar/eliminar pagos, agregar/eliminar multas, transferir sobrepagos, ni cambiar el esquema de pago.
            </p>
            <p className="text-sm text-amber-600 dark:text-amber-400 mt-2 font-medium">
              Use el botón "Juicio Terminado" para finalizar el proceso y liberar la propiedad.
            </p>
          </div>
        </div>
      )}

      {/* Información general de la cuenta */}
      <div className={`grid gap-4 md:grid-cols-2 lg:grid-cols-4 ${esCuentaCancelada ? 'opacity-60' : ''}`}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Precio Final</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(cuentaDetalle.precio_final)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
            <DollarSign className="h-4 w-4 text-success" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-success">{formatCurrency(totalPagado)}</div>
            {cuentaDetalle.precio_final > 0 && (
              <p className="text-xs text-muted-foreground">
                {((totalPagado / (cuentaDetalle.precio_final || 1)) * 100).toFixed(1)}% del total
              </p>
            )}
          </CardContent>
        </Card>

        {/* Cards para cuentas canceladas */}
        {esCuentaCancelada ? (
          <>
            {/* Card Pago por cancelación */}
            <Card className="border-red-200 bg-red-50/50 dark:bg-red-950/20 dark:border-red-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-red-700 dark:text-red-400">Pago por cancelación</CardTitle>
                <Banknote className="h-4 w-4 text-red-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {formatCurrency(montoPagoCancelacion)}
                </div>
                <p className="text-xs text-red-600/70 dark:text-red-400/70 mt-1">
                  Cobro aplicado por cancelación
                </p>
              </CardContent>
            </Card>

            {/* Card Devolución al cliente */}
            <Card className="border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 dark:border-amber-800">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-amber-700 dark:text-amber-400">Devolución al cliente</CardTitle>
                <ArrowRight className="h-4 w-4 text-amber-500" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                  {formatCurrency(montoDevolucionCliente)}
                </div>
                <p className="text-xs text-amber-600/70 dark:text-amber-400/70 mt-1">
                  Monto a devolver al comprador
                </p>
              </CardContent>
            </Card>
          </>
        ) : (
          <>
            {/* Cards normales para cuentas activas */}
            {cuentaDetalle.precio_final > 0 && (
              <Card className={haySobrepago ? "border-orange-500" : ""}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">
                    {haySobrepago ? "Sobrepago detectado" : "Saldo Pendiente"}
                  </CardTitle>
                  {haySobrepago ? (
                    <AlertTriangle className="h-4 w-4 text-orange-500" />
                  ) : (
                    <DollarSign className="h-4 w-4 text-warning" />
                  )}
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${haySobrepago ? "text-orange-500" : "text-warning"}`}>
                    {formatCurrency(haySobrepago ? montoSobrepago : totalPendiente)}
                  </div>
                  
                  {haySobrepago ? (
                    <>
                      <p className="text-xs text-muted-foreground mt-1">
                        Hay un excedente de pagos
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full"
                        onClick={() => setTransferDialog({ isOpen: true })}
                        disabled={!ultimoPagoSTP || !cuentaDetalle.activo || isReadOnly || isEnDemanda}
                      >
                        <ArrowRight className="h-4 w-4 mr-2" />
                        Transferir sobrepago
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-muted-foreground">
                          {((totalPendiente / (cuentaDetalle.precio_final || 1)) * 100).toFixed(1)}% restante
                        </p>
                        {totalPendiente === 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Cuenta completamente pagada</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                      </div>
                      
                      {/* Breakdown for property accounts only */}
                      {pendingBalanceBreakdown && (
                        <div className="mt-3 pt-3 border-t space-y-2">
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Durante obra:</span>
                            <span className="font-medium">{formatCurrency(pendingBalanceBreakdown.duranteObra)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">A la entrega:</span>
                            <span className="font-medium">{formatCurrency(pendingBalanceBreakdown.aLaEntrega)}</span>
                          </div>
                          <div className="flex justify-between items-center text-xs">
                            <span className="text-muted-foreground">Parcialidades restantes:</span>
                            <span className="font-medium">{pendingBalanceBreakdown.parcialidadesRestantes}</span>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </CardContent>
              </Card>
            )}

            {/* Cash payments card for property accounts only */}
            {cuentaDetalle.tipo_cuenta === 'Propiedad' && cashPaymentsData && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">Pago en efectivo</CardTitle>
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Home className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Propiedad: {formatCurrency(cashPaymentsData.pagosPropiedadEfectivo)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {cashPaymentsData.tieneEstacionamientos && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Car className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Estacionamiento: {formatCurrency(cashPaymentsData.pagosEstacionamientosEfectivo)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {cashPaymentsData.tieneBodegas && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Warehouse className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Bodega: {formatCurrency(cashPaymentsData.pagosBodegasEfectivo)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                  <DollarSign className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Límite:</span>
                    <span className="font-medium">{formatCurrency(cashPaymentsData.limiteEfectivo)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Pagado:</span>
                    <span className="font-medium">{formatCurrency(cashPaymentsData.pagadoEfectivo)}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-muted-foreground">Aún permitido:</span>
                    <span className="font-medium">{formatCurrency(cashPaymentsData.restanteEfectivo)}</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Escrituracion value card for property accounts only */}
            {cuentaDetalle.tipo_cuenta === 'Propiedad' && escrituracionData && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <div className="flex items-center gap-2">
                    <CardTitle className="text-sm font-medium">Valor de escrituración</CardTitle>
                    <div className="flex items-center gap-1">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Home className="h-4 w-4 text-muted-foreground" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>Propiedad: {formatCurrency(escrituracionData.precioPropiedad)}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                      {escrituracionData.tieneEstacionamientos && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Car className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Estacionamiento: {formatCurrency(escrituracionData.precioEstacionamientos)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {escrituracionData.tieneEstacionamientosIncluidos && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Car className="h-4 w-4 text-green-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Estacionamiento: Incluido</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {escrituracionData.tieneBodegas && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Warehouse className="h-4 w-4 text-muted-foreground" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Bodega: {formatCurrency(escrituracionData.precioBodegas)}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      {escrituracionData.tieneBodegasIncluidas && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger>
                              <Warehouse className="h-4 w-4 text-green-500" />
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Bodega: Incluido</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  </div>
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-purple-600">{formatCurrency(escrituracionData.totalEscrituracion)}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Suma de precio final de propiedad, bodegas y estacionamientos
                  </p>
                </CardContent>
              </Card>
            )}
          </>
        )}
      </div>

      {/* Información de la propiedad o producto/servicio */}
      <Card className={esCuentaCancelada ? 'opacity-60' : ''}>
        <CardHeader>
          <CardTitle>
            {cuentaDetalle.tipo_cuenta === 'Propiedad' ? 'Información de la Propiedad' : `Información del ${cuentaDetalle.tipo_cuenta}`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Proyecto</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.proyecto}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Modelo</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.modelo}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Edificio</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.edificio}</p>
            </div>
            <div>
              <label className="text-sm font-medium">No. Propiedad</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.numero_propiedad}</p>
            </div>
            {cuentaDetalle.oferta_id && (
            <div>
              <label className="text-sm font-medium">Oferta</label>
              <div>
                <Button
                  variant="link"
                  className="p-0 h-auto text-sm"
                  disabled={downloadingOferta}
                  onClick={handleDownloadOferta}
                >
                  {downloadingOferta ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-1" />
                  )}
                  {cuentaDetalle.tipo_cuenta === 'Propiedad'
                    ? `O-${String(cuentaDetalle.oferta_id).padStart(6, '0')}`
                    : `OP-${String(cuentaDetalle.oferta_id).padStart(6, '0')}`}
                </Button>
              </div>
            </div>
            )}
            
            {cuentaDetalle.tipo_cuenta === 'Propiedad' ? (
              <>
                {cuentaDetalle.metraje !== undefined && cuentaDetalle.metraje > 0 && (
                  <div>
                    <label className="text-sm font-medium">Metraje</label>
                    <p className="text-sm text-muted-foreground">{cuentaDetalle.metraje.toFixed(2)} m²</p>
                  </div>
                )}
                {cuentaDetalle.precio_por_m2 !== undefined && cuentaDetalle.precio_por_m2 > 0 && (
                  <div>
                    <label className="text-sm font-medium">Precio por m²</label>
                    <p className="text-sm text-muted-foreground">{formatCurrency(cuentaDetalle.precio_por_m2)}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">Dueño</label>
                  <p className="text-sm text-muted-foreground">{cuentaDetalle.dueno}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">CLABE STP</label>
                  <p className="text-sm text-muted-foreground">{cuentaDetalle.clabe_stp || 'No asignada'}</p>
                </div>
                {cuentaDetalle.estatus_disponibilidad && (
                  <div>
                    <label className="text-sm font-medium">Estatus</label>
                    <p className="text-sm text-muted-foreground">{cuentaDetalle.estatus_disponibilidad}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">Fecha Compra</label>
                  <p className="text-sm text-muted-foreground">{formatDate(cuentaDetalle.fecha_compra)}</p>
                </div>
                {agenteVendedor && (
                  <div>
                    <label className="text-sm font-medium">Agente Vendedor</label>
                    <button 
                      onClick={() => setAgenteVendedorDialog(true)}
                      className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer"
                    >
                      <span>{agenteVendedor.nombre}</span>
                      {agenteVendedor.tipoAgente === 'interno' && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">Sozu</Badge>
                      )}
                      {agenteVendedor.tipoAgente === 'inmobiliario' && agenteVendedor.organizacion && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-purple-50 text-purple-600 border-purple-200">{agenteVendedor.organizacion}</Badge>
                      )}
                      {agenteVendedor.tipoAgente === 'otro' && agenteVendedor.organizacion && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-gray-50 text-gray-600 border-gray-200">{agenteVendedor.organizacion}</Badge>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">Categoría</label>
                  <p className="text-sm text-muted-foreground">
                    {cuentaDetalle.categoria_producto_nombre || 
                     (cuentaDetalle.tipo_cuenta === 'Producto' ? 'Productos' : 'Servicios')}
                  </p>
                </div>
                {cuentaDetalle.detalles_producto?.nombre && (
                  <div>
                    <label className="text-sm font-medium">Nombre</label>
                    <p className="text-sm text-muted-foreground">{cuentaDetalle.detalles_producto.nombre}</p>
                  </div>
                )}
                {cuentaDetalle.detalles_producto?.tipo && (
                  <div>
                    <label className="text-sm font-medium">Tipo</label>
                    <p className="text-sm text-muted-foreground">{cuentaDetalle.detalles_producto.tipo}</p>
                  </div>
                )}
                {cuentaDetalle.detalles_producto?.ubicacion && (
                  <div>
                    <label className="text-sm font-medium">Ubicación</label>
                    <p className="text-sm text-muted-foreground">{cuentaDetalle.detalles_producto.ubicacion}</p>
                  </div>
                )}
                {cuentaDetalle.detalles_producto?.m2 && (
                  <div>
                    <label className="text-sm font-medium">Metraje (m²)</label>
                    <p className="text-sm text-muted-foreground">{cuentaDetalle.detalles_producto.m2.toFixed(2)} m²</p>
                  </div>
                )}
                {!cuentaDetalle.detalles_producto?.nombre && (
                  <div>
                    <label className="text-sm font-medium">
                      Nombre {cuentaDetalle.tipo_cuenta === 'Producto' ? 'Producto' : 'Servicio'}
                    </label>
                    <p className="text-sm text-muted-foreground">{cuentaDetalle.producto_servicio_nombre}</p>
                  </div>
                )}
                <div>
                  <label className="text-sm font-medium">CLABE STP</label>
                  <p className="text-sm text-muted-foreground">{cuentaDetalle.clabe_stp || 'No asignada'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha Compra</label>
                  <p className="text-sm text-muted-foreground">{formatDate(cuentaDetalle.fecha_compra)}</p>
                </div>
                {agenteVendedor && (
                  <div>
                    <label className="text-sm font-medium">Agente Vendedor</label>
                    <button 
                      onClick={() => setAgenteVendedorDialog(true)}
                      className="flex items-center gap-2 text-sm text-primary hover:underline cursor-pointer"
                    >
                      <span>{agenteVendedor.nombre}</span>
                      {agenteVendedor.tipoAgente === 'interno' && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-blue-50 text-blue-600 border-blue-200">Sozu</Badge>
                      )}
                      {agenteVendedor.tipoAgente === 'inmobiliario' && agenteVendedor.organizacion && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-purple-50 text-purple-600 border-purple-200">{agenteVendedor.organizacion}</Badge>
                      )}
                      {agenteVendedor.tipoAgente === 'otro' && agenteVendedor.organizacion && (
                        <Badge variant="outline" className="text-[10px] px-1 py-0 bg-gray-50 text-gray-600 border-gray-200">{agenteVendedor.organizacion}</Badge>
                      )}
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
          
          {cuentaDetalle?.compradores && cuentaDetalle.compradores.length > 0 && (
            <div className="mt-4">
              <Collapsible open={compradoresOpen} onOpenChange={setCompradoresOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between p-3 h-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Compradores ({cuentaDetalle.compradores.length})</span>
                      {cuentaDetalle.compradores.length >= 2 && 
                       cuentaDetalle.compradores.some((comprador) => {
                         const spouseId = comprador.id_conyuge;
                         return spouseId && cuentaDetalle.compradores.some(c => c.id_persona === spouseId);
                       }) && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="inline-flex">
                                <HeartHandshake className="h-5 w-5 text-pink-500" />
                              </span>
                            </TooltipTrigger>
                            <TooltipContent>
                              <p>Hay compradores conyuges</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                    {compradoresOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                
                <CollapsibleContent className="mt-2 space-y-3">
                  {cuentaDetalle.compradores.map((comprador, index) => {
                    // Check if this comprador has a spouse in the list
                    const hasSpouse = comprador.id_conyuge != null;
                    const spouseName = hasSpouse ? cuentaDetalle.compradores.find(c => c.id_persona === comprador.id_conyuge)?.nombre_legal : null;
                    
                    return (
                      <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{comprador.nombre_legal}</span>
                            {hasSpouse && spouseName && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="inline-flex">
                                      <HeartHandshake className="h-4 w-4 text-pink-500 cursor-help" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <p className="font-medium">Cónyuge: {spouseName}</p>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {comprador.rfc && comprador.id_persona && (
                            <Badge 
                              variant="outline" 
                              className="text-xs cursor-pointer hover:bg-primary/10 text-primary"
                              onClick={() => handleRfcClick(comprador.id_persona!)}
                            >
                              {comprador.rfc}
                            </Badge>
                          )}
                          {comprador.rfc && !comprador.id_persona && (
                            <Badge variant="outline" className="text-xs">{comprador.rfc}</Badge>
                          )}
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-semibold">
                            {comprador.porcentaje_copropiedad.toFixed(2)}%
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {(cuentaDetalle?.compradores?.length || 0) === 1 ? 'Propiedad' : 'Copropiedad'}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  
                  {/* Total verification */}
                  <div className="flex justify-between items-center pt-2 border-t">
                    <span className="text-sm font-medium">Total:</span>
                    <span className="font-bold">
                      {(cuentaDetalle?.compradores || []).reduce((sum, c) => sum + c.porcentaje_copropiedad, 0).toFixed(2)}%
                    </span>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acuerdos y Pagos section */}
      <Card className={esCuentaCancelada ? 'opacity-60' : ''}>
        <CardHeader>
          <CardTitle>Acuerdos, Pagos y Documentos</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="acuerdos-aplicaciones" className="w-full">
            <TabsList className={cuentaDetalle?.tipo_cuenta === 'Propiedad' ? 'grid w-full grid-cols-3' : 'grid w-full grid-cols-2'}>
              <TabsTrigger value="acuerdos-aplicaciones">Acuerdos de Pago y Aplicaciones</TabsTrigger>
              <TabsTrigger value="pagos-aplicados">Pagos Aplicados</TabsTrigger>
              {cuentaDetalle?.tipo_cuenta === 'Propiedad' && (
                <TabsTrigger value="documentos">Documentos</TabsTrigger>
              )}
            </TabsList>

            <TabsContent value="acuerdos-aplicaciones" className="mt-6">
              {/* Payment scheme selection and agreement details */}
              <div className="space-y-6">
                {/* Summary Cards for Acuerdos */}
                {acuerdosPago && acuerdosPago.length > 0 && (
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <FileText className="h-5 w-5 text-primary" />
                          <div>
                            <p className="text-xs text-muted-foreground">Total Acuerdos</p>
                            <p className="text-xl font-bold">{acuerdosPago.length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <CheckCircle className="h-5 w-5 text-green-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Completados</p>
                            <p className="text-xl font-bold">{acuerdosPago.filter(a => a.pago_completado).length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <CreditCard className="h-5 w-5 text-amber-500" />
                          <div>
                            <p className="text-xs text-muted-foreground">Parciales</p>
                            <p className="text-xl font-bold">{acuerdosPago.filter(a => !a.pago_completado && (a.aplicaciones || []).filter(app => !app.es_multa).reduce((sum, app) => sum + app.monto, 0) > 0).length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="p-4">
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-5 w-5 text-muted-foreground" />
                          <div>
                            <p className="text-xs text-muted-foreground">Sin Pago</p>
                            <p className="text-xl font-bold">{acuerdosPago.filter(a => !a.pago_completado && (a.aplicaciones || []).filter(app => !app.es_multa).reduce((sum, app) => sum + app.monto, 0) === 0).length}</p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                )}

                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold">Acuerdos de Pago y Aplicaciones</h3>
                  {/* Payment scheme selection when no scheme is selected */}
                  {offerData && !offerData.id_esquema_pago_seleccionado && availableSchemes && availableSchemes.length > 0 && !esCuentaCancelada && !isReadOnly && !isEnDemanda && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-muted-foreground">Plan de pagos:</span>
                      <Select onValueChange={(value) => handlePaymentSchemeSelection(parseInt(value))}>
                        <SelectTrigger className="w-48">
                          <SelectValue placeholder="Seleccionar esquema de pago" />
                        </SelectTrigger>
                        <SelectContent>
                          {availableSchemes.map((scheme) => (
                            <SelectItem key={scheme.id} value={scheme.id.toString()}>
                              {scheme.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {/* Show selected scheme when one is selected */}
                  {offerData && offerData.id_esquema_pago_seleccionado && (
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-muted-foreground">Plan de pagos:</span>
                      <Badge 
                        variant={isPaymentPlanModified ? "outline" : "secondary"}
                        className={isPaymentPlanModified ? "bg-green-100 dark:bg-green-900/30 border-green-500 text-green-700 dark:text-green-300" : ""}
                      >
                        {formatOfertaId(offerData.id)} - {offerData.esquema_nombre}
                        {isPaymentPlanModified && " modificado"}
                      </Badge>
                    </div>
                  )}
                </div>

                {/* Payment Plan Details Section */}
                {originalScheme && (
            <div className="mb-6">
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="text-lg font-semibold">Plan de pagos</h3>
                
                {cuentaDetalle?.id_estatus_disponibilidad === 10 ? (
                  // Mostrar solo badge "Asignado" cuando el estatus es Asignado (id=10)
                  <div className="flex items-center justify-center py-8">
                    <Badge className="text-xl px-8 py-3 bg-gradient-to-r from-violet-500 to-purple-600 dark:from-violet-600 dark:to-purple-700 text-white border-0 shadow-lg font-semibold flex items-center gap-2">
                      <FileCheck className="h-5 w-5" />
                      Asignado
                    </Badge>
                  </div>
                ) : !isPaymentPlanModified ? (
                  // Original unchanged plan - show percentages AND amounts
                  <>
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nombre del Plan</label>
                      <p className="text-sm font-semibold">{originalScheme.nombre}</p>
                    </div>
                    {originalScheme.porcentaje_enganche > 0 && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Enganche</label>
                        <p className="text-sm font-semibold">
                          {originalScheme.porcentaje_enganche.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_enganche / 100))}
                        </p>
                      </div>
                    )}
                    {originalScheme.porcentaje_mensualidades > 0 && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Mensualidades</label>
                        <p className="text-sm font-semibold">
                          {originalScheme.numero_mensualidades} pagos de {originalScheme.porcentaje_mensualidades.toFixed(1)}%
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_mensualidades / 100))}
                        </p>
                      </div>
                    )}
                    {originalScheme.porcentaje_entrega > 0 && (
                      <div>
                        <label className="text-sm font-medium text-muted-foreground">Entrega</label>
                        <p className="text-sm font-semibold">{originalScheme.porcentaje_entrega.toFixed(1)}%</p>
                        <p className="text-xs text-muted-foreground">
                          {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_entrega / 100))}
                        </p>
                      </div>
                    )}
                  </div>
                  {acuerdosPago && acuerdosPago.length > 0 && (
                    <Badge variant="secondary" className="text-xs">
                      {Math.max(...acuerdosPago.map(a => a.orden))} pagos
                    </Badge>
                  )}
                  </>
                ) : (
                  // Modified plan - show both original (disabled) and current
                  <div className="space-y-4">
                    {/* Original Plan - Disabled */}
                    <div className="opacity-50 pointer-events-none border rounded p-3 bg-muted/20">
                       <label className="text-xs text-muted-foreground mb-2 block">
                         Plan Original
                         {originalScheme && (
                           <Badge variant="secondary" className="ml-2 text-xs">
                             {(() => {
                               let count = 0;
                               // Count Enganche if exists
                               if (originalScheme.porcentaje_enganche > 0) count += 1;
                               // Count Mensualidades
                               count += originalScheme.numero_mensualidades || 0;
                               // Count Entrega if exists
                               if (originalScheme.porcentaje_entrega > 0) count += 1;
                               return count;
                             })()} pagos
                           </Badge>
                         )}
                       </label>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Nombre del Plan</label>
                          <p className="text-sm">{originalScheme.nombre}</p>
                        </div>
                        {originalScheme.porcentaje_enganche > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Enganche</label>
                            <p className="text-sm">{originalScheme.porcentaje_enganche.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_enganche / 100))}
                            </p>
                          </div>
                        )}
                        {originalScheme.porcentaje_mensualidades > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Mensualidades</label>
                            <p className="text-sm">
                              {originalScheme.numero_mensualidades} pagos de {originalScheme.porcentaje_mensualidades.toFixed(1)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_mensualidades / 100))}
                            </p>
                          </div>
                        )}
                        {originalScheme.porcentaje_entrega > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Entrega</label>
                            <p className="text-sm">{originalScheme.porcentaje_entrega.toFixed(1)}%</p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_entrega / 100))}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Modified Plan - Active */}
                    <div className="border-2 border-primary rounded p-3">
                      <label className="text-xs text-primary font-semibold mb-2 block">
                        Plan Modificado
                        {currentPaymentPlan && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {(() => {
                              let count = 0;
                              // Count Enganche/Cesión if exists
                              if (currentPaymentPlan.porcentaje_enganche > 0) count += 1;
                              // Count Mensualidades
                              count += currentPaymentPlan.numero_mensualidades || 0;
                              // Count Pagos Especiales
                              count += currentPaymentPlan.numero_pagos_especiales || 0;
                              // Count Entrega if exists
                              if (currentPaymentPlan.porcentaje_entrega > 0) count += 1;
                              return count;
                            })()} pagos
                          </Badge>
                        )}
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Nombre del Plan</label>
                          <p className="text-sm font-semibold">{originalScheme.nombre} modificado</p>
                        </div>
                        {((currentPaymentPlan?.porcentaje_enganche ?? 0) > 0 || (currentPaymentPlan?.hayCesionDerechos && (actualAmounts?.cesion ?? 0) > 0)) && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">
                              {currentPaymentPlan?.hayCesionDerechos ? 'Cesión de derechos' : 'Enganche'}
                            </label>
                            <p className="text-sm font-semibold">
                              {currentPaymentPlan?.hayCesionDerechos ? 
                                ((actualAmounts?.cesion ?? 0) / (cuentaDetalle?.precio_final || 1) * 100).toFixed(1) :
                                currentPaymentPlan?.porcentaje_enganche?.toFixed(1)
                              }%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(currentPaymentPlan?.hayCesionDerechos ? (actualAmounts?.cesion ?? 0) : (actualAmounts?.enganche ?? 0))}
                            </p>
                          </div>
                        )}
                        {(currentPaymentPlan?.numero_mensualidades ?? 0) > 0 && (currentPaymentPlan?.porcentaje_mensualidades ?? 0) > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Mensualidades</label>
                            <p className="text-sm font-semibold">
                              {currentPaymentPlan?.numero_mensualidades} pagos de {currentPaymentPlan?.porcentaje_mensualidades?.toFixed(1)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(actualAmounts?.mensualidades ?? 0)}
                            </p>
                          </div>
                        )}
                        {currentPaymentPlan?.hayPagosEspeciales && (currentPaymentPlan?.numero_pagos_especiales ?? 0) > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Pagos Especiales</label>
                            <p className="text-sm font-semibold">
                              {currentPaymentPlan?.numero_pagos_especiales} pagos de {currentPaymentPlan?.porcentaje_pagos_especiales?.toFixed(1)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(actualAmounts?.pagosEspeciales ?? 0)}
                            </p>
                          </div>
                        )}
                        {(currentPaymentPlan?.porcentaje_entrega ?? 0) > 0 && (
                          <div>
                            <label className="text-sm font-medium text-muted-foreground">Entrega</label>
                            <p className="text-sm font-semibold">
                              {currentPaymentPlan?.porcentaje_entrega?.toFixed(1)}%
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatCurrency(actualAmounts?.entrega ?? 0)}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Solo mostrar conceptos de pago si NO es propiedad Asignada */}
          {cuentaDetalle?.id_estatus_disponibilidad !== 10 && (
            <>
              {acuerdosPago && acuerdosPago.length > 0 ? (
                <div className="space-y-2">
                  {acuerdosPago.map((acuerdo, index) => {
                const totalAplicado = (acuerdo.aplicaciones || [])
                  .filter(app => !app.es_multa)
                  .reduce((sum, app) => sum + app.monto, 0);
                const isOpen = openAcuerdos[acuerdo.id];
                
                const parcialidadNumber = acuerdosPago
                  .slice(0, index + 1)
                  .filter(a => a.concepto?.toLowerCase().includes('parcialidad')).length;
                
                const conceptoDisplay = acuerdo.concepto?.toLowerCase().includes('parcialidad') 
                  ? `Parcialidad #${parcialidadNumber}`
                  : acuerdo.concepto;

                // Calculate percentage based on total price
                const porcentaje = cuentaDetalle?.precio_final 
                  ? ((acuerdo.monto / cuentaDetalle.precio_final) * 100).toFixed(2)
                  : '0.00';
                
                // Check if has cash payments (id_metodos_pago = 1), excluding fines
                const tienePagosEfectivo = (acuerdo.aplicaciones || []).some(
                  app => !app.es_multa && app.pago.id_metodos_pago === 1
                );
                
                // Check if has any fines (multas)
                const tieneMultas = acuerdo.multas && acuerdo.multas.length > 0;
                
                // Check if this is a cancellation concept (7 = Pago por cancelación, 9 = Devolución)
                const esConceptoCancelacion = [7, 9].includes(acuerdo.id_concepto);
                
                // For cancellation concepts, render non-collapsible row with different style
                if (esConceptoCancelacion) {
                  // Concepto 7 = Pago por cancelación (rojo), Concepto 9 = Devolución (amarillo)
                  const esPagoCancelacion = acuerdo.id_concepto === 7;
                  
                  const bgColor = esPagoCancelacion 
                    ? "bg-red-50 dark:bg-red-950/20 border-red-200 dark:border-red-800"
                    : "bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800";
                  const circleColor = esPagoCancelacion 
                    ? "bg-red-500" 
                    : "bg-amber-500";
                  const textColor = esPagoCancelacion 
                    ? "text-red-700 dark:text-red-300" 
                    : "text-amber-700 dark:text-amber-300";
                  const subTextColor = esPagoCancelacion 
                    ? "text-red-600 dark:text-red-400" 
                    : "text-amber-600 dark:text-amber-400";
                  const badgeColor = esPagoCancelacion 
                    ? "bg-red-500 hover:bg-red-500" 
                    : "bg-amber-500 hover:bg-amber-500";
                  
                  return (
                    <div key={acuerdo.id} className={`border rounded-lg ${bgColor}`}>
                      <div className="w-full p-3 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className="flex items-center gap-3">
                            <div className={`flex-shrink-0 w-6 h-6 ${circleColor} text-white rounded-full flex items-center justify-center text-xs font-semibold`}>
                              {acuerdo.orden}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`text-sm font-medium ${textColor}`}>{conceptoDisplay}</span>
                            </div>
                          </div>
                          <span className={`text-xs ${subTextColor}`}>
                            {porcentaje}% - Sin fecha
                          </span>
                          <Badge className={`text-xs ${badgeColor} text-white`}>
                            Pagado
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={`text-sm font-medium ${textColor}`}>
                            {formatCurrency(acuerdo.monto)}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                }
                
                return (
                  <Collapsible key={acuerdo.id} open={isOpen} onOpenChange={() => toggleAcuerdo(acuerdo.id)}>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger asChild>
                        <div className="w-full p-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer">
                          <div className="flex items-center gap-4">
                            <div className="flex items-center gap-3">
                              <div className="flex-shrink-0 w-6 h-6 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-semibold">
                                {acuerdo.orden}
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium">{conceptoDisplay}</span>
                                {tienePagosEfectivo && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <Banknote className="h-4 w-4 text-green-600" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Incluye pago(s) en efectivo</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                                {tieneMultas && (
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <AlertCircle className="h-4 w-4 text-destructive" />
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p>Tiene multa(s) asociada(s)</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                )}
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {(acuerdo.aplicaciones || []).length} aplicación(es)
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {porcentaje}% - {acuerdo.fecha_pago ? formatDate(acuerdo.fecha_pago) : 'Sin fecha'}
                            </span>
                            <Badge variant={acuerdo.pago_completado ? "default" : "secondary"} className="text-xs">
                              {acuerdo.pago_completado ? "Pagado" : totalAplicado > 0 ? "Parcial" : "Pendiente"}
                            </Badge>
                          </div>
                           <div className="flex items-center gap-2">
                            <span className="text-sm text-muted-foreground">
                              Pagado: {formatCurrency(totalAplicado)} de {formatCurrency(acuerdo.monto)}
                            </span>
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-3 pb-3">
                          {(acuerdo.aplicaciones || []).length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                   <TableHead className="text-xs">Fecha Pago</TableHead>
                                   <TableHead className="text-xs">Método</TableHead>
                                   <TableHead className="text-xs">Clave Rastreo</TableHead>
                                   <TableHead className="text-xs">Monto Aplicado</TableHead>
                                   <TableHead className="text-xs">Evidencia</TableHead>
                                   <TableHead className="text-xs">Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {(acuerdo.aplicaciones || []).map((aplicacion, index) => {
                                  const isStpPayment = aplicacion.pago.metodo_pago?.toLowerCase().includes('stp');
                                  const isStpPaymentForEdit = isStpPayment; // Keep for edit button logic
                                  
                                  return (
                                    <TableRow key={aplicacion.id}>
                                      <TableCell className="text-xs">{formatDate(aplicacion.pago.fecha_pago)}</TableCell>
                                      <TableCell className="text-xs">{aplicacion.pago.metodo_pago}</TableCell>
                                      <TableCell className="text-xs">
                                        {aplicacion.pago.clave_rastreo ? (
                                          <Badge variant="outline">{aplicacion.pago.clave_rastreo}</Badge>
                                        ) : (
                                          <span className="text-muted-foreground">N/A</span>
                                        )}
                                      </TableCell>
                                       <TableCell className="font-medium text-xs">
                                         {formatCurrency(aplicacion.monto)}
                                       </TableCell>
                                       <TableCell>
                                         {(aplicacion.pago.url_cep || aplicacion.pago.url_recibo) ? (
                                           <TooltipProvider>
                                             <Tooltip>
                                               <TooltipTrigger asChild>
                                                 <Button
                                                   variant="outline"
                                                   size="icon"
                                                   className="h-6 w-6"
                                                   onClick={() => {
                                                     const evidenceUrl = aplicacion.pago.url_cep || aplicacion.pago.url_recibo;
                                                     if (evidenceUrl) {
                                                       window.open(evidenceUrl, '_blank');
                                                     }
                                                   }}
                                                 >
                                                   <Eye className="h-3 w-3" />
                                                 </Button>
                                               </TooltipTrigger>
                                               <TooltipContent>
                                                 <p>Ver evidencia</p>
                                               </TooltipContent>
                                             </Tooltip>
                                           </TooltipProvider>
                                         ) : (
                                           <span className="text-muted-foreground text-xs">N/A</span>
                                         )}
                                       </TableCell>
                                         <TableCell>
                                          <TooltipProvider>
                                            <div className="flex gap-2">
                                              {/* Description Button - Show if payment has a description */}
                                              {aplicacion.pago.descripcion && (
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="outline"
                                                      size="icon"
                                                      className="h-6 w-6"
                                                      onClick={() => {
                                                        toast({
                                                          title: "Descripción del pago",
                                                          description: aplicacion.pago.descripcion || "",
                                                        });
                                                      }}
                                                    >
                                                      <MessageSquare className="h-3 w-3" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>Ver descripción</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              )}
                                              
                                              {/* CEP Button - Only for STP and STP-manual payments, requires update permission */}
                                              {(aplicacion.pago.id_metodos_pago === 6 || aplicacion.pago.id_metodos_pago === 7) && (canUpdate || isSuperAdmin) && (
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="outline"
                                                      size="icon"
                                                      className="h-6 w-6"
                                                      onClick={() => {
                                                          setCepDialog({
                                                            isOpen: true,
                                                            paymentId: aplicacion.pago.id
                                                          });
                                                        }}
                                                       disabled={esCuentaCancelada || isReadOnly || isEnDemanda}
                                                    >
                                                      <FileText className="h-3 w-3" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>Agregar CEP</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              )}
                                              
                                              {/* Download Receipt Button - Always show for all payment types */}
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    className="h-6 w-6"
                                                    onClick={() => handleDownloadRecibo(aplicacion.pago.id)}
                                                    disabled={downloadingRecibo === aplicacion.pago.id}
                                                  >
                                                    {downloadingRecibo === aplicacion.pago.id ? (
                                                      <Loader2 className="h-3 w-3 animate-spin" />
                                                    ) : (
                                                      <Download className="h-3 w-3" />
                                                    )}
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>Descargar Recibo</p>
                                                </TooltipContent>
                                              </Tooltip>
                                              
                                              {/* Edit Button - Only for non-STP payments and incomplete agreements */}
                                              {!isStpPaymentForEdit && !acuerdo.pago_completado && (
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="outline"
                                                      size="icon"
                                                      className="h-6 w-6"
                                                      onClick={() => handleEditPayment(aplicacion.id)}
                                                      disabled={esCuentaCancelada || isReadOnly || isEnDemanda}
                                                    >
                                                      <Edit className="h-4 w-4" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>Editar Pago</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              )}
                                              
                                              {/* Delete Button - requires delete permission */}
                                              {(canDelete || isSuperAdmin) && (
                                                <Tooltip>
                                                  <TooltipTrigger asChild>
                                                    <Button
                                                      variant="destructive"
                                                      size="icon"
                                                      className="h-6 w-6"
                                                      onClick={() => handleDeletePayment({
                                                        id: aplicacion.id,
                                                        monto: aplicacion.monto,
                                                        conceptoNombre: conceptoDisplay
                                                      })}
                                                      disabled={deletePaymentMutation.isPending || esCuentaCancelada || isReadOnly || isEnDemanda}
                                                    >
                                                      <Trash2 className="h-3 w-3" />
                                                    </Button>
                                                  </TooltipTrigger>
                                                  <TooltipContent>
                                                    <p>Eliminar Pago</p>
                                                  </TooltipContent>
                                                </Tooltip>
                                              )}
                                            </div>
                                          </TooltipProvider>
                                        </TableCell>
                                    </TableRow>
                                  );
                                })}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">
                              No hay pagos aplicados a este acuerdo
                            </div>
                          )}

                          {/* Multas Section */}
                          <div className="mt-6 pt-4 border-t">
                            <div className="flex justify-between items-center mb-4">
                              <h5 className="font-semibold flex items-center gap-2">
                                <AlertTriangle className="h-4 w-4 text-warning" />
                                Multas
                              </h5>
                              {!acuerdo.pago_completado && !esCuentaCancelada && !isReadOnly && !isEnDemanda && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleNewMulta(acuerdo.id)}
                                >
                                  <Plus className="h-4 w-4 mr-1" />
                                  Agregar Multa
                                </Button>
                              )}
                            </div>

                            {acuerdo.multas && acuerdo.multas.length > 0 ? (
                              <div className="space-y-2">
                                {acuerdo.multas.map((multa) => (
                                  <div key={multa.id} className="flex items-center justify-between p-3 border border-warning/20 rounded-lg bg-warning/5">
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2 mb-1">
                                        <span className="font-medium text-warning">
                                          {formatCurrency(multa.montoOriginal || multa.monto)}
                                        </span>
                                        {multa.pagosAplicados > 0 && (
                                          <Popover>
                                            <PopoverTrigger asChild>
                                              <Badge 
                                                variant="secondary" 
                                                className="text-xs cursor-pointer hover:bg-secondary/80 transition-colors"
                                              >
                                                Pagado: {formatCurrency(multa.pagosAplicados)}
                                              </Badge>
                                            </PopoverTrigger>
                                            <PopoverContent className="w-80">
                                              <div className="space-y-3">
                                                <h4 className="font-medium text-sm">Detalle de Pagos Aplicados</h4>
                                                <div className="space-y-2">
                                                  {multa.detallesPagos?.map((detalle, index) => (
                                                    <div key={`${detalle.id}-${index}`} className="flex justify-between items-start p-2 border rounded-sm bg-muted/30">
                                                      <div className="space-y-1">
                                                        <div className="text-sm font-medium">
                                                          {formatCurrency(detalle.monto)}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                          {detalle.metodo_pago} | {formatDate(detalle.fecha_pago)}
                                                        </div>
                                                        {detalle.clave_rastreo && (
                                                          <div className="text-xs text-muted-foreground font-mono">
                                                            Clave: {detalle.clave_rastreo}
                                                          </div>
                                                        )}
                                                      </div>
                                                    </div>
                                                  ))}
                                                </div>
                                                <div className="text-xs text-muted-foreground border-t pt-2">
                                                  Total aplicado: {formatCurrency(multa.pagosAplicados)}
                                                </div>
                                              </div>
                                            </PopoverContent>
                                          </Popover>
                                        )}
                                        {multa.estaPagada ? (
                                          <Badge variant="default" className="text-xs bg-green-500">
                                            Pagada
                                          </Badge>
                                        ) : multa.monto > 0 ? (
                                          <Badge variant="destructive" className="text-xs">
                                            Pendiente: {formatCurrency(multa.monto)}
                                          </Badge>
                                        ) : null}
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {multa.descripcion}
                                      </p>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                      <TooltipProvider>
                                        {/* Edit Button - only show if multa has payments but is not fully paid */}
                                        {(multa.pagosAplicados ?? 0) > 0 && !multa.estaPagada && !esCuentaCancelada && !isReadOnly && !isEnDemanda && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="icon"
                                                onClick={() => setEditMultaDialog({ isOpen: true, multa })}
                                              >
                                                <Edit className="h-4 w-4" />
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Editar Multa</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        )}
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="destructive"
                                              size="icon"
                                              onClick={() => setDeleteMultaDialog({ isOpen: true, multa })}
                                              disabled={deleteMultaMutation.isPending || (multa.pagosAplicados ?? 0) > 0 || multa.estaPagada || esCuentaCancelada || isReadOnly || isEnDemanda}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                           <TooltipContent>
                                             <p>{isEnDemanda ? "Propiedad en demanda - cuenta bloqueada" : isReadOnly ? "Propiedad entregada - no se pueden eliminar multas" : esCuentaCancelada ? "Cuenta cancelada - no se pueden eliminar multas" : (multa.pagosAplicados ?? 0) > 0 ? "No se pueden eliminar multas con pagos aplicados" : multa.estaPagada ? "No se pueden eliminar multas pagadas" : "Eliminar Multa"}</p>
                                           </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>
                                ))}
                                {/* Total de multas */}
                                <div className="flex justify-end p-3 border-t border-warning/30 bg-warning/10 rounded-lg mt-3">
                                  <div className="text-right space-y-1">
                                    <div className="text-sm font-semibold text-warning">
                                      Total Multas: {formatCurrency(
                                        acuerdo.multas.reduce((sum, m) => sum + (m.montoOriginal || m.monto), 0)
                                      )}
                                    </div>
                                    {acuerdo.multas.some(m => m.pagosAplicados > 0) && (
                                      <>
                                        <div className="text-xs text-muted-foreground">
                                          Total Pagado: {formatCurrency(
                                            acuerdo.multas.reduce((sum, m) => sum + (m.pagosAplicados || 0), 0)
                                          )}
                                        </div>
                                        <div className="text-xs font-medium text-warning">
                                          Total Pendiente: {formatCurrency(
                                            acuerdo.multas.reduce((sum, m) => sum + m.monto, 0)
                                          )}
                                        </div>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground">
                                No hay multas aplicadas a este acuerdo
                              </div>
                            )}
                          </div>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>
                );
              })}
                </div>
              ) : (
                <div className="text-center py-8 text-muted-foreground">
                  No hay acuerdos de pago registrados
                </div>
              )}
            </>
          )}
              </div>
            </TabsContent>

            <TabsContent value="pagos-aplicados" className="mt-6">
                  {/* Summary Cards for Pagos */}
                  {pagos && pagos.length > 0 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-5 w-5 text-primary" />
                            <div>
                              <p className="text-xs text-muted-foreground">Total Pagos</p>
                              <p className="text-xl font-bold">{pagos.length}</p>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="p-4">
                          <div className="flex items-center gap-2">
                            <Banknote className="h-5 w-5 text-green-500" />
                            <div>
                              <p className="text-xs text-muted-foreground">Monto Total</p>
                              <p className="text-lg font-bold">{formatCurrency(pagos.reduce((sum, p) => sum + (p.monto || 0), 0))}</p>
                              {/* Desglose Propiedad vs Multas */}
                              {aplicacionesPorPago && aplicacionesPorPago.length > 0 && (() => {
                                const montoPropiedad = aplicacionesPorPago
                                  .filter(a => !a.es_multa)
                                  .reduce((sum, a) => sum + (a.monto || 0), 0);
                                const montoMultas = aplicacionesPorPago
                                  .filter(a => a.es_multa)
                                  .reduce((sum, a) => sum + (a.monto || 0), 0);
                                return (
                                  <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
                                    <p>Propiedad: {formatCurrency(montoPropiedad)}</p>
                                    {montoMultas > 0 && (
                                      <p className="text-warning">Multas: {formatCurrency(montoMultas)}</p>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                      {/* Payment methods breakdown */}
                      {(() => {
                        const metodosCount = pagos.reduce((acc, p) => {
                          const metodo = p.metodos_pago?.nombre || 'Otro';
                          acc[metodo] = (acc[metodo] || 0) + 1;
                          return acc;
                        }, {} as Record<string, number>);
                        const topMetodos = Object.entries(metodosCount).sort((a, b) => b[1] - a[1]).slice(0, 2);
                        return topMetodos.map(([metodo, count], idx) => (
                          <Card key={metodo}>
                            <CardContent className="p-4">
                              <div className="flex items-center gap-2">
                                <CreditCard className={`h-5 w-5 ${idx === 0 ? 'text-blue-500' : 'text-purple-500'}`} />
                                <div>
                                  <p className="text-xs text-muted-foreground">{metodo}</p>
                                  <p className="text-xl font-bold">{count}</p>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ));
                      })()}
                    </div>
                  )}
                  {/* Pagos Aplicados Section */}
                  {pagos && pagos.length > 0 ? (
                    <div className="space-y-2">
                      {pagos.map((pago) => {
                        const aplicacionesDelPago = aplicacionesPorPago?.filter(a => a.id_pago === pago.id) || [];
                        const isPagoOpen = openAcuerdos[pago.id];
                        // IDs de métodos que permiten editar clave_rastreo: Transferencia bancaria (5), STP (6), STP-manual (7)
                        // Permitir edición si clave_rastreo es null, undefined, o cadena vacía
                        // Solo usuarios con permiso de actualizar o Super Admin pueden editar
                        const canEditClaveRastreo = (canUpdate || isSuperAdmin) && [5, 6, 7].includes(pago.id_metodos_pago) && (!pago.clave_rastreo || pago.clave_rastreo.trim() === '');
                        return (
                          <Collapsible 
                            key={pago.id} 
                            open={isPagoOpen} 
                            onOpenChange={() => toggleAcuerdo(pago.id)}
                          >
                            <div className="border rounded-lg">
                              <CollapsibleTrigger asChild>
                                <div className="w-full p-3 flex items-center justify-between hover:bg-muted/50 cursor-pointer">
                                  <div className="flex items-center gap-4">
                                    <div className="flex items-center gap-3">
                                      <DollarSign className="h-5 w-5 text-success" />
                                      <div className="flex flex-col">
                                        <span className="text-sm font-medium flex items-center gap-2">
                                          Pago de {(canUpdate || isSuperAdmin) && !esCuentaCancelada && !isReadOnly && !isEnDemanda ? (
                                            aplicacionMontoEdit[`pago_${pago.id}`] !== undefined ? (
                                              <span className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                <Input
                                                  type="number"
                                                  step="0.01"
                                                  className="h-6 w-28 text-xs"
                                                  value={aplicacionMontoEdit[`pago_${pago.id}`]}
                                                  onChange={(e) => {
                                                    const newValue = parseFloat(e.target.value) || 0;
                                                    setAplicacionMontoEdit(prev => ({ ...prev, [`pago_${pago.id}`]: newValue }));
                                                  }}
                                                  onClick={(e) => e.stopPropagation()}
                                                />
                                                <Button
                                                  size="sm"
                                                  variant="ghost"
                                                  className="h-6 w-6 p-0"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    setAplicacionMontoEdit(prev => {
                                                      const newState = { ...prev };
                                                      delete newState[`pago_${pago.id}`];
                                                      return newState;
                                                    });
                                                    setOriginalAplicacionMontos(prev => {
                                                      const newState = { ...prev };
                                                      delete newState[`pago_${pago.id}`];
                                                      return newState;
                                                    });
                                                  }}
                                                >
                                                  <X className="h-3 w-3" />
                                                </Button>
                                              </span>
                                            ) : (
                                              <span 
                                                className="cursor-pointer hover:underline"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setAplicacionMontoEdit(prev => ({ ...prev, [`pago_${pago.id}`]: pago.monto }));
                                                  setOriginalAplicacionMontos(prev => ({ ...prev, [`pago_${pago.id}`]: pago.monto }));
                                                }}
                                              >
                                                {formatCurrency(pago.monto)}
                                              </span>
                                            )
                                          ) : formatCurrency(pago.monto)}
                                        </span>
                                        <span className="text-xs text-muted-foreground">
                                          {pago.metodos_pago?.nombre} - {formatDate(pago.fecha_pago)}
                                        </span>
                                      </div>
                                    </div>
                                    {/* Clave rastreo: editable o mostrar */}
                                    {canEditClaveRastreo && !esCuentaCancelada && !isReadOnly && !isEnDemanda ? (
                                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                        <Input
                                          className="h-7 w-40 text-xs"
                                          placeholder="Ingrese clave rastreo"
                                          value={editingClaveRastreo[pago.id] ?? ''}
                                          onChange={(e) => setEditingClaveRastreo(prev => ({ ...prev, [pago.id]: e.target.value }))}
                                          onKeyDown={(e) => {
                                            if (e.key === 'Enter') {
                                              handleSaveClaveRastreo(pago.id);
                                            }
                                          }}
                                          disabled={savingClaveRastreo === pago.id}
                                        />
                                        {savingClaveRastreo === pago.id && (
                                          <Loader2 className="h-3 w-3 animate-spin" />
                                        )}
                                      </div>
                                    ) : pago.clave_rastreo ? (
                                      <Badge variant="outline" className="text-xs">
                                        {pago.clave_rastreo}
                                      </Badge>
                                    ) : null}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <Badge variant="secondary" className="text-xs">
                                      {aplicacionesDelPago.length} {aplicacionesDelPago.length === 1 ? 'aplicación' : 'aplicaciones'}
                                    </Badge>
                                    {!esCuentaCancelada && !isReadOnly && !isEnDemanda && (
                                      <>
                                        {(pago.url_cep || pago.url_recibo) && (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="ghost"
                                                  size="sm"
                                                  className="h-8 w-8 p-0"
                                                  onClick={(e) => {
                                                    e.stopPropagation();
                                                    window.open(pago.url_cep || pago.url_recibo || '', '_blank');
                                                  }}
                                                >
                                                  <Eye className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Ver evidencia de pago</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                        {/* Upload evidence button - requires update permission */}
                                        {(canUpdate || isSuperAdmin) && (
                                          <TooltipProvider>
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <label htmlFor={`evidence-upload-${pago.id}`}>
                                                  <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="h-8 w-8 p-0"
                                                    asChild
                                                    disabled={uploadingEvidence === pago.id}
                                                  >
                                                    <span>
                                                      {uploadingEvidence === pago.id ? (
                                                        <Loader2 className="h-4 w-4 animate-spin" />
                                                      ) : (
                                                        <Upload className="h-4 w-4" />
                                                      )}
                                                    </span>
                                                  </Button>
                                                  <input
                                                    id={`evidence-upload-${pago.id}`}
                                                    type="file"
                                                    className="hidden"
                                                    accept=".pdf,.jpg,.jpeg,.png"
                                                    onChange={(e) => {
                                                      const file = e.target.files?.[0];
                                                      if (file) {
                                                        e.stopPropagation();
                                                        handleUploadEvidence(pago.id, file);
                                                      }
                                                      e.target.value = '';
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                  />
                                                </label>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>{pago.url_recibo ? "Actualizar evidencia" : "Subir evidencia de pago"}</p>
                                              </TooltipContent>
                                            </Tooltip>
                                          </TooltipProvider>
                                        )}
                                      </>
                                    )}
                                    {isPagoOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                  </div>
                                </div>
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent>
                                <div className="px-3 pb-3">
                                  {aplicacionesDelPago.length > 0 ? (
                                    <Table>
                                      <TableHeader>
                                        <TableRow>
                                          <TableHead className="text-xs">Concepto</TableHead>
                                          <TableHead className="text-xs">Fecha Acuerdo</TableHead>
                                          <TableHead className="text-xs">Monto Aplicado</TableHead>
                                        </TableRow>
                                      </TableHeader>
                                      <TableBody>
                                        {aplicacionesDelPago.map((aplicacion) => {
                                          const concepto = aplicacion.acuerdos_pago?.conceptos_pago?.nombre || 'Sin concepto';
                                          const acuerdoId = aplicacion.id_acuerdo_pago;
                                          const parcialidadNumber = acuerdoId ? parcialidadMap[acuerdoId] : null;
                                          const esMulta = aplicacion.es_multa;
                                          
                                          // Find multa description if es_multa is true
                                          const multaInfo = esMulta && acuerdosPago 
                                            ? acuerdosPago
                                                .flatMap(a => a.multas || [])
                                                .find(m => m.id_acuerdo_pago === acuerdoId)
                                            : null;
                                          
                                          const conceptoDisplay = esMulta 
                                            ? 'Multa' 
                                            : (concepto.toLowerCase() === 'parcialidad' && parcialidadNumber 
                                              ? `Parcialidad ${parcialidadNumber}` 
                                              : concepto);
                                          
                                          return (
                                            <TableRow key={aplicacion.id} className={esMulta ? 'bg-warning/10' : ''}>
                                              <TableCell className="text-xs">
                                                {esMulta ? (
                                                  <Popover>
                                                    <PopoverTrigger asChild>
                                                      <span className="text-warning font-medium cursor-pointer hover:underline flex items-center gap-1">
                                                        <AlertTriangle className="h-3 w-3" />
                                                        {conceptoDisplay}
                                                        <Info className="h-3 w-3 opacity-60" />
                                                      </span>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-80">
                                                      <div className="space-y-2">
                                                        <h4 className="font-medium text-sm flex items-center gap-2">
                                                          <AlertTriangle className="h-4 w-4 text-warning" />
                                                          Detalle de Multa
                                                        </h4>
                                                        <div className="text-sm">
                                                          <p className="font-medium">Monto: {formatCurrency(aplicacion.monto)}</p>
                                                          {multaInfo && (
                                                            <>
                                                              <p className="text-muted-foreground mt-2">
                                                                <span className="font-medium">Descripción:</span>
                                                              </p>
                                                              <p className="text-sm mt-1 whitespace-pre-wrap">
                                                                {multaInfo.descripcion || 'Sin descripción'}
                                                              </p>
                                                            </>
                                                          )}
                                                        </div>
                                                      </div>
                                                    </PopoverContent>
                                                  </Popover>
                                                ) : (
                                                  <span>{conceptoDisplay}</span>
                                                )}
                                              </TableCell>
                                              <TableCell className="text-xs">
                                                {aplicacion.acuerdos_pago?.fecha_pago 
                                                  ? formatDate(aplicacion.acuerdos_pago.fecha_pago)
                                                  : 'Sin fecha'}
                                              </TableCell>
                                              <TableCell className={`font-medium text-xs ${esMulta ? 'text-warning' : ''}`}>
                                                {formatCurrency(aplicacion.monto)}
                                              </TableCell>
                                            </TableRow>
                                          );
                                        })}
                                      </TableBody>
                                    </Table>
                                  ) : (
                                    <div className="text-center py-4 text-muted-foreground">
                                      No hay aplicaciones para este pago
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No hay pagos registrados
                    </div>
                  )}
                  {/* Panel de confirmación de ajustes */}
                  {Object.keys(aplicacionMontoEdit).length > 0 && (
                    <div className="mt-4 p-4 border-2 border-amber-500 rounded-lg bg-amber-50 dark:bg-amber-950/20">
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="h-5 w-5 text-amber-600" />
                        <span className="font-semibold text-amber-700 dark:text-amber-500">Ajustes pendientes de confirmar</span>
                      </div>
                      
                      <div className="text-sm text-muted-foreground mb-4">
                        <p className="mb-2">⚠️ Al confirmar estos ajustes, se recalcularán todas las aplicaciones de pago de esta cuenta. Esta acción no se puede deshacer.</p>
                        <div className="bg-background p-2 rounded text-xs">
                          <p className="font-medium mb-1">Cambios pendientes:</p>
                          <ul className="list-disc list-inside space-y-1">
                            {Object.entries(aplicacionMontoEdit).map(([key, newMonto]) => {
                              const originalMonto = originalAplicacionMontos[key] || 0;
                              const diff = newMonto - originalMonto;
                              const displayId = key.startsWith('pago_') ? key.replace('pago_', '') : key;
                              return (
                                <li key={key}>
                                  Pago #{displayId}: {formatCurrency(originalMonto)} → {formatCurrency(newMonto)} 
                                  <span className={diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : ''}>
                                    {diff > 0 ? ` (+${formatCurrency(diff)})` : diff < 0 ? ` (${formatCurrency(diff)})` : ''}
                                  </span>
                                </li>
                              );
                            })}
                            {newPaymentRows.length > 0 && newPaymentRows.map(row => (
                              <li key={row.id} className="text-green-600">
                                Nuevo pago: {formatCurrency(row.monto)} - {formatDate(row.fecha_pago)}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>

                      {/* Botón para agregar nuevos pagos si el ajuste reduce el monto */}
                      {Object.entries(aplicacionMontoEdit).some(([key, newMonto]) => {
                        const original = originalAplicacionMontos[key] || 0;
                        return newMonto < original;
                      }) && (
                        <div className="mb-4">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleAddNewPaymentRow}
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Agregar pago adicional
                          </Button>
                          
                          {newPaymentRows.length > 0 && (
                            <div className="mt-2 space-y-2">
                              {newPaymentRows.map((row) => (
                                <div key={row.id} className="flex items-center gap-2 p-2 bg-background rounded">
                                  <Input
                                    type="date"
                                    className="h-8 w-36 text-xs"
                                    value={row.fecha_pago}
                                    onChange={(e) => {
                                      setNewPaymentRows(prev => prev.map(r => 
                                        r.id === row.id ? { ...r, fecha_pago: e.target.value } : r
                                      ));
                                    }}
                                  />
                                  <Input
                                    type="number"
                                    step="0.01"
                                    placeholder="Monto"
                                    className="h-8 w-28 text-xs"
                                    value={row.monto || ''}
                                    onChange={(e) => {
                                      setNewPaymentRows(prev => prev.map(r => 
                                        r.id === row.id ? { ...r, monto: parseFloat(e.target.value) || 0 } : r
                                      ));
                                    }}
                                  />
                                  <Select
                                    value={row.id_metodos_pago.toString()}
                                    onValueChange={(value) => {
                                      setNewPaymentRows(prev => prev.map(r => 
                                        r.id === row.id ? { ...r, id_metodos_pago: parseInt(value) } : r
                                      ));
                                    }}
                                  >
                                    <SelectTrigger className="h-8 w-32 text-xs">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="1">Efectivo</SelectItem>
                                      <SelectItem value="2">Cheque</SelectItem>
                                      <SelectItem value="5">Transferencia</SelectItem>
                                      <SelectItem value="7">STP-manual</SelectItem>
                                    </SelectContent>
                                  </Select>
                                  <Input
                                    placeholder="Clave rastreo"
                                    className="h-8 w-28 text-xs"
                                    value={row.clave_rastreo}
                                    onChange={(e) => {
                                      setNewPaymentRows(prev => prev.map(r => 
                                        r.id === row.id ? { ...r, clave_rastreo: e.target.value } : r
                                      ));
                                    }}
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-8 w-8 p-0"
                                    onClick={() => handleRemoveNewPaymentRow(row.id)}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          onClick={() => {
                            setAplicacionMontoEdit({});
                            setOriginalAplicacionMontos({});
                            setNewPaymentRows([]);
                          }}
                          disabled={isSavingAdjustment}
                        >
                          Cancelar
                        </Button>
                        <Button
                          className="bg-amber-600 hover:bg-amber-700"
                          onClick={handleConfirmAplicacionAdjustments}
                          disabled={isSavingAdjustment}
                        >
                          {isSavingAdjustment ? (
                            <>
                              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                              Guardando...
                            </>
                          ) : (
                            'Confirmar Ajustes'
                          )}
                        </Button>
                      </div>
                    </div>
                  )}
                </TabsContent>

                {/* Documentos Tab - only available for properties */}
                {cuentaDetalle?.tipo_cuenta === 'Propiedad' && cuentaDetalle?.id && (
                  <TabsContent value="documentos" className="mt-6">
                    <ReadOnlyDocumentsView cuentaCobranzaId={cuentaDetalle.id} />
                  </TabsContent>
                )}
              </Tabs>
            </CardContent>
          </Card>

      <DeleteConfirmationDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => setDeleteDialog({ 
          isOpen: open, 
          aplicacion: open ? deleteDialog.aplicacion : null,
          warningMessage: open ? deleteDialog.warningMessage : ""
        })}
        onConfirm={confirmDeletePayment}
        title="Eliminar Pago y sus Aplicaciones"
        description={
          deleteDialog.aplicacion
            ? `Al eliminar esta aplicación de pago de ${formatCurrency(deleteDialog.aplicacion.monto)} para el concepto "${deleteDialog.aplicacion.conceptoNombre}", se eliminará el pago completo y todas sus aplicaciones asociadas. Esta acción no se puede deshacer.`
            : ""
        }
        warningMessage={deleteDialog.warningMessage}
        isLoading={deletePaymentMutation.isPending}
      />

      <DeleteConfirmationDialog
        open={deleteMultaDialog.isOpen}
        onOpenChange={(open) => setDeleteMultaDialog({ isOpen: open, multa: open ? deleteMultaDialog.multa : null })}
        onConfirm={confirmDeleteMulta}
        title="Eliminar Multa"
        description={
          deleteMultaDialog.multa
            ? `¿Está seguro de que desea eliminar la multa de ${formatCurrency(deleteMultaDialog.multa.monto)}? Esta acción no se puede deshacer.`
            : ""
        }
        isLoading={deleteMultaMutation.isPending}
      />

      <NewMultaDialog
        open={multaDialog.isOpen}
        onOpenChange={(open) => setMultaDialog({ 
          isOpen: open, 
          acuerdoId: open ? multaDialog.acuerdoId : null,
          acuerdoMonto: open ? multaDialog.acuerdoMonto : 0,
          existingMultas: open ? multaDialog.existingMultas : []
        })}
        acuerdoId={multaDialog.acuerdoId || 0}
        cuentaId={cuentaId}
        acuerdoMonto={multaDialog.acuerdoMonto}
        existingMultas={multaDialog.existingMultas}
      />

      <AddCepDialog
        open={cepDialog.isOpen}
        onClose={() => setCepDialog({ isOpen: false, paymentId: null })}
        paymentId={cepDialog.paymentId || 0}
        cuentaCobranzaId={cuentaId}
      />

      <AddManualPaymentDialog
        isOpen={manualPaymentDialog}
        onClose={() => setManualPaymentDialog(false)}
        cuentaCobranzaId={cuentaId}
        cuentaCobranzaLabel={formatCuentaCobranzaId(cuentaId, cuentaDetalle?.tipo_cuenta)}
        tipoCuenta={cuentaDetalle?.tipo_cuenta}
        precioFinal={cuentaDetalle?.precio_final || 0}
        montoPagado={totalPagado}
        totalMultasPendientes={totalMultasPendientes}
      />

      <EditPaymentDialog
        isOpen={editPaymentDialog.isOpen}
        onClose={() => setEditPaymentDialog({ isOpen: false, paymentId: null })}
        paymentId={editPaymentDialog.paymentId}
        cuentaCobranzaId={cuentaId}
      />

      <TransferPaymentDialog
        isOpen={transferDialog.isOpen}
        onClose={() => setTransferDialog({ isOpen: false })}
        cuentaOrigenId={cuentaId}
        ultimoPagoSTP={ultimoPagoSTP ? {
          id: ultimoPagoSTP.id,
          clave_rastreo: ultimoPagoSTP.clave_rastreo || '',
          monto: ultimoPagoSTP.monto
        } : null}
      />

      <EnDemandaDialog
        isOpen={enDemandaDialog}
        onClose={() => setEnDemandaDialog(false)}
        cuentaCobranzaId={cuentaId}
        propiedadId={cuentaDetalle?.id_propiedad}
      />

      <JuicioTerminadoDialog
        isOpen={juicioTerminadoDialog}
        onClose={() => setJuicioTerminadoDialog(false)}
        cuentaCobranzaId={cuentaId}
        propiedadId={cuentaDetalle?.id_propiedad}
        totalPagado={totalPagado}
      />

      {editCuentaDialog && cuentaDetalle && (
        <EditCuentaCobranzaDialog
          cuenta={{ id: cuentaId, precio_final: cuentaDetalle.precio_final }}
          onClose={() => setEditCuentaDialog(false)}
          onUpdate={() => {
            queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaId] });
            queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
            queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaId] });
            queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaId] });
          }}
        />
      )}

      <AgenteVendedorDialog
        isOpen={agenteVendedorDialog}
        onClose={() => setAgenteVendedorDialog(false)}
        agente={agenteVendedor || null}
        ofertaId={cuentaDetalle?.oferta_id}
        canEdit={canGenerateOfferPropiedades || isSuperAdmin}
      />

      <EditMultaDialog
        open={editMultaDialog.isOpen}
        onOpenChange={(open) => setEditMultaDialog({ isOpen: open, multa: open ? editMultaDialog.multa : null })}
        multa={editMultaDialog.multa}
        cuentaId={cuentaId}
      />

      {/* Comprador Edit Dialog */}
      <Dialog open={isCompradorDialogOpen} onOpenChange={setIsCompradorDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Comprador</DialogTitle>
          </DialogHeader>
          {editingComprador && (
            <PersonForm
              initialData={{
                ...editingComprador,
                representativeId: editingComprador?.id_entidad_relacionada_rep_leg
              }}
              onSubmit={(data) => updateCompradorMutation.mutate({ ...data, id: editingComprador.id })}
              isLoading={updateCompradorMutation.isPending}
              onCancel={() => {
                setIsCompradorDialogOpen(false);
                setEditingComprador(null);
              }}
              entityType="comprador"
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Dialog de confirmación para timbrar factura comisión Sozu */}
      <Dialog open={timbrarFacturaDialog} onOpenChange={setTimbrarFacturaDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Confirmar Timbrado</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            ¿Estás seguro de que deseas timbrar esta factura de comisión? Esta acción no se puede deshacer.
          </p>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setTimbrarFacturaDialog(false)} disabled={timbrarFacturaLoading}>
              Cancelar
            </Button>
            <Button onClick={handleTimbrarFacturaSozu} disabled={timbrarFacturaLoading}>
              {timbrarFacturaLoading ? <><Loader2 className="h-4 w-4 animate-spin mr-2" /> Timbrando...</> : <><Stamp className="h-4 w-4 mr-2" /> Timbrar</>}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}