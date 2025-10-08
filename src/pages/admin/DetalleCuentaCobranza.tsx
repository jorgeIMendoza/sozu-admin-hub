import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { N8N_WEBHOOK_BASE_URL } from "@/lib/config";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ArrowLeft, FileText, DollarSign, CalendarDays, ChevronDown, ChevronUp, Trash2, Plus, AlertTriangle, Eye, CreditCard, ArrowRight, Home, Warehouse, Car, Banknote, Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { NewMultaDialog } from "@/components/admin/NewMultaDialog";
import { AddCepDialog } from "@/components/admin/AddCepDialog";
import { AddManualPaymentDialog } from "@/components/admin/AddManualPaymentDialog";
import { TransferirEntreComisionesDialog } from "@/components/admin/TransferirEntreComisionesDialog";
import { formatCuentaCobranzaId, formatOfertaId } from "@/utils/cuentaCobranzaUtils";

import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AcuerdoPago {
  id: number;
  orden: number;
  monto: number;
  fecha_pago: string | null;
  pago_completado: boolean;
  concepto: string;
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
  };
}

interface Comprador {
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
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
  estatus_disponibilidad?: string;
  valor_uma?: number;
  id_propiedad?: number;
}

interface OfferData {
  id: number;
  id_esquema_pago_seleccionado: number | null;
  id_propiedad: number;
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

  const { data: documentos, isLoading } = useQuery({
    queryKey: ["documentos_cuenta_cobranza", cuentaCobranzaId],
    queryFn: async () => {
      const { data: docs, error } = await supabase
        .from('documentos')
        .select(`
          id,
          numero,
          url,
          es_verificado,
          fecha_creacion,
          tipos_documento:id_tipo_documento(nombre)
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
          // Remover el prefijo "documentos/" si existe para evitar duplicación
          const fileName = correctedUrl.startsWith('documentos/') 
            ? correctedUrl.replace('documentos/', '') 
            : correctedUrl;
          
          // Construir la URL pública correcta
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
      
      // Descargar cada documento y agregarlo al ZIP
      for (const doc of documentos) {
        try {
          const response = await fetch(doc.url);
          if (!response.ok) {
            console.error(`Error descargando documento ${doc.id}:`, response.statusText);
            continue;
          }
          
          const blob = await response.blob();
          const fileName = `${doc.tipos_documento?.nombre || 'Documento'}_${doc.numero || doc.id}.pdf`;
          zip.file(fileName, blob);
        } catch (error) {
          console.error(`Error procesando documento ${doc.id}:`, error);
        }
      }

      // Generar el archivo ZIP
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      
      // Descargar el ZIP
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Documentos de la propiedad
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
      <CardContent>
        {documentos && documentos.length > 0 ? (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tipo</TableHead>
                <TableHead>Número</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {documentos.map((doc: any) => (
                <TableRow key={doc.id}>
                  <TableCell className="font-medium">
                    {doc.tipos_documento?.nombre || 'Sin tipo'}
                  </TableCell>
                  <TableCell>{doc.numero || 'N/A'}</TableCell>
                  <TableCell>
                    {new Date(doc.fecha_creacion).toLocaleDateString('es-MX')}
                  </TableCell>
                  <TableCell>
                    <Badge variant={doc.es_verificado ? "default" : "secondary"}>
                      {doc.es_verificado ? "Verificado" : "Pendiente"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => window.open(doc.url, '_blank')}
                    >
                      <Eye className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            No hay documentos adjuntos
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function DetalleCuentaCobranza() {
  const { id } = useParams<{ id: string }>();
  const cuentaId = parseInt(id || '0');
  const [openAcuerdos, setOpenAcuerdos] = useState<{ [key: number]: boolean }>({});
  const [deleteDialog, setDeleteDialog] = useState<{ isOpen: boolean; aplicacion: AplicacionToDelete | null }>({
    isOpen: false,
    aplicacion: null
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
  const [transferDialog, setTransferDialog] = useState<{
    isOpen: boolean;
  }>({
    isOpen: false
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
          valor_uma
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

      // Get compradores
      const { data: compradores } = await supabase
        .from('compradores')
        .select(`
          porcentaje_copropiedad,
          personas!compradores_id_persona_fkey(nombre_legal, rfc)
        `)
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);

      // Get project and building info
      const [entidadResult, edificioModeloResult, duenoResult, estatusResult] = await Promise.all([
        supabase
          .from('entidades_relacionadas')
          .select(`
            id_proyecto,
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
      
      if (oferta?.id_producto && oferta?.productos_servicios) {
        productoServicioId = oferta.productos_servicios.id;
        productoServicioNombre = oferta.productos_servicios.nombre;
        const categoriaNombre = oferta.productos_servicios.categorias_producto?.nombre?.toLowerCase();
        tipoCuenta = categoriaNombre === 'servicios' ? 'Servicio' : 'Producto';
      }

      const detalle: CuentaDetalle = {
        id: cuenta.id,
        clabe_stp: cuenta.clabe_stp,
        precio_final: cuenta.precio_final || 0,
        es_aprobado: cuenta.es_aprobado,
        fecha_compra: cuenta.fecha_compra,
        activo: cuenta.activo, // Add activo field to track if account is cancelled
        compradores: compradores?.map(c => ({
          nombre_legal: c.personas?.nombre_legal || '',
          rfc: c.personas?.rfc || null,
          porcentaje_copropiedad: c.porcentaje_copropiedad || 0
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
        estatus_disponibilidad: estatusResult.data?.nombre || undefined,
        valor_uma: cuenta.valor_uma || undefined,
        id_propiedad: oferta?.propiedades?.id || undefined
      };

      return detalle;
    },
    enabled: !!cuentaId,
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

  // Handle payment scheme selection
  const handlePaymentSchemeSelection = async (schemeId: number) => {
    if (!cuentaDetalle || !offerData) return;

    try {
      // Update the offer with the selected payment scheme
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
            rfc_curp_ordenante: offerData.lead_rfc || ''
          }),
        });

        if (webhookResponse.ok) {
          toast({
            title: "Acuerdo generado",
            description: "Se ha generado el acuerdo de pago para la cuenta de cobranza",
          });
        } else {
          console.error('Webhook response not ok:', webhookResponse.status);
        }
      } catch (webhookError) {
        console.error('Error calling webhook:', webhookError);
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
          .select('id, fecha_pago, monto, clave_rastreo, id_metodos_pago, url_cep, url_recibo')
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
            ...multa,
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
                 url_recibo: pago?.url_recibo || null
               }
            };
          }).sort((a, b) => a.pago.id - b.pago.id),
          multas: multasConEstado.map(m => ({
            id: m.id,
            monto: m.saldoPendiente, // Show pending balance
            montoOriginal: m.monto,
            pagosAplicados: m.pagosAplicados,
            estaPagada: m.estaPagada,
            descripcion: m.descripcion,
            fecha_creacion: m.fecha_creacion,
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

      // Get all payment IDs from aplicaciones_pago for this cuenta
      const { data: aplicaciones } = await supabase
        .from('aplicaciones_pago')
        .select(`
          id_pago,
          monto,
          acuerdos_pago!aplicaciones_pago_id_acuerdo_pago_fkey(id_cuenta_cobranza)
        `)
        .eq('activo', true);

      const aplicacionesDeEstaCuenta = aplicaciones?.filter(
        a => a.acuerdos_pago?.id_cuenta_cobranza === cuentaId
      );

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
              
              // Get aplicaciones_pago for these cuentas to avoid duplicates
              const { data: aplicacionesBodegas } = await supabase
                .from('aplicaciones_pago')
                .select(`
                  id_pago,
                  monto,
                  acuerdos_pago!aplicaciones_pago_id_acuerdo_pago_fkey(id_cuenta_cobranza)
                `)
                .eq('activo', true);

              const aplicacionesBodegasDeEstaCuenta = aplicacionesBodegas?.filter(
                a => cuentaBodegaIds.includes(a.acuerdos_pago?.id_cuenta_cobranza)
              );

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
              
              // Get aplicaciones_pago for these cuentas to avoid duplicates
              const { data: aplicacionesEstacionamientos } = await supabase
                .from('aplicaciones_pago')
                .select(`
                  id_pago,
                  monto,
                  acuerdos_pago!aplicaciones_pago_id_acuerdo_pago_fkey(id_cuenta_cobranza)
                `)
                .eq('activo', true);

              const aplicacionesEstacionamientosDeEstaCuenta = aplicacionesEstacionamientos?.filter(
                a => cuentaEstacionamientoIds.includes(a.acuerdos_pago?.id_cuenta_cobranza)
              );

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

      // Get bodegas (all, not just not included)
      const { data: bodegas } = await supabase
        .from('bodegas')
        .select('id, id_producto')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('activo', true);

      // Get estacionamientos (all, not just not included)
      const { data: estacionamientos } = await supabase
        .from('estacionamientos')
        .select('id, id_producto')
        .eq('id_propiedad', cuentaDetalle.id_propiedad)
        .eq('activo', true);

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
        tieneEstacionamientos: (estacionamientos?.length || 0) > 0
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
    
    // Update hayCesionDerechos to include both cases: as payment method OR as concepto
    const hayCesionDerechosConcepto = !!cesionDerechos;
    const hayCesionDerechosActual = hayCesionDerechos || hayCesionDerechosConcepto;

    if (!cuentaDetalle?.precio_final) return null;

    // Calculate total payments by "Cesión de derechos" method
    const totalCesion = pagosConCesion.reduce((sum, app) => sum + app.monto, 0);
    
    // Add cesión de derechos amount if it exists as a concepto
    const totalCesionConcepto = cesionDerechos?.monto || 0;
    const totalCesionFinal = totalCesion + totalCesionConcepto;
    
    console.log('DEBUG - Total cesión (method):', totalCesion);
    console.log('DEBUG - Total cesión (concepto):', totalCesionConcepto);
    console.log('DEBUG - Total cesión final:', totalCesionFinal);
    console.log('DEBUG - Hay cesión de derechos:', hayCesionDerechosActual);
    
    // If there's "Cesión de derechos", use it instead of traditional "Enganche"
    const totalEnganche = hayCesionDerechosActual ? totalCesionFinal : (apartado?.monto || 0) + (enganche?.monto || 0);
    const totalParcialidades = parcialidades.reduce((sum, p) => sum + p.monto, 0);
    const totalContraentrega = contraentrega?.monto || 0;

    const result = {
      porcentaje_enganche: Number(((totalEnganche / cuentaDetalle.precio_final) * 100).toFixed(1)),
      porcentaje_mensualidades: Number(((totalParcialidades / cuentaDetalle.precio_final) * 100).toFixed(1)),
      porcentaje_entrega: Number(((totalContraentrega / cuentaDetalle.precio_final) * 100).toFixed(1)),
      numero_mensualidades: parcialidades.length,
      hayCesionDerechos: hayCesionDerechosActual
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

    // Calculate total payments by "Cesión de derechos" method
    const totalCesion = pagosConCesion.reduce((sum, app) => sum + app.monto, 0);
    
    // Add cesión de derechos amount if it exists as a concepto
    const totalCesionConcepto = cesionDerechos.reduce((sum, a) => sum + a.monto, 0);
    const totalCesionFinal = totalCesion + totalCesionConcepto;
    
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
      cesion: totalCesionFinal
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

  const formatDate = (dateString: string) => {
    return format(new Date(dateString), 'dd/MM/yyyy', { locale: es });
  };

  const toggleAcuerdo = (acuerdoId: number) => {
    setOpenAcuerdos(prev => ({
      ...prev,
      [acuerdoId]: !prev[acuerdoId]
    }));
  };

  const totalPagado = acuerdosPago?.reduce((sum, acuerdo) => 
    sum + (acuerdo.aplicaciones || []).reduce((appSum, app) => appSum + (app?.monto || 0), 0), 0
  ) || 0;

  const totalPendiente = (cuentaDetalle?.precio_final || 0) - totalPagado;

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

  // Mutation to delete payment application
  const deletePaymentMutation = useMutation({
    mutationFn: async (aplicacionId: number) => {
      // First get the application to find its acuerdo_pago and amount
      const { data: aplicacion, error: getError } = await supabase
        .from('aplicaciones_pago')
        .select('id_acuerdo_pago, monto')
        .eq('id', aplicacionId)
        .single();
      
      if (getError) throw getError;

      // Get the last payment agreement (highest orden)
      const { data: lastAcuerdo, error: lastError } = await supabase
        .from('acuerdos_pago')
        .select('id, monto, orden')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true)
        .order('orden', { ascending: false })
        .limit(1)
        .single();

      if (lastError) throw lastError;

      // Delete the application
      const { error: deleteError } = await supabase
        .from('aplicaciones_pago')
        .update({ activo: false })
        .eq('id', aplicacionId);
      
      if (deleteError) throw deleteError;

      // Update the payment agreement to mark as not completed
      const { error: updateError } = await supabase
        .from('acuerdos_pago')
        .update({ pago_completado: false } as any)
        .eq('id', aplicacion.id_acuerdo_pago);
      
      if (updateError) throw updateError;

      // Add the deleted amount to the last payment agreement
      if (lastAcuerdo) {
        const { error: updateLastError } = await supabase
          .from('acuerdos_pago')
          .update({ monto: lastAcuerdo.monto + aplicacion.monto } as any)
          .eq('id', lastAcuerdo.id);
        
        if (updateLastError) throw updateLastError;
      }
    },
    onSuccess: () => {
      toast({
        title: "Pago eliminado",
        description: "La aplicación de pago ha sido eliminada exitosamente",
      });
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la aplicación de pago",
        variant: "destructive",
      });
    },
  });

  const handleDeletePayment = (aplicacion: AplicacionToDelete) => {
    // Check if payment method is STP
    const acuerdo = acuerdosPago?.find(a => 
      (a.aplicaciones || []).some(app => app.id === aplicacion.id)
    );
    const aplicacionData = acuerdo?.aplicaciones?.find(app => app.id === aplicacion.id);
    
    if (aplicacionData?.pago.metodo_pago === 'STP') {
      toast({
        title: "No se puede eliminar",
        description: "No se pueden eliminar pagos realizados por STP",
        variant: "destructive",
      });
      return;
    }
    
    setDeleteDialog({ isOpen: true, aplicacion });
  };

  const confirmDeletePayment = () => {
    if (deleteDialog.aplicacion) {
      deletePaymentMutation.mutate(deleteDialog.aplicacion.id);
    }
    setDeleteDialog({ isOpen: false, aplicacion: null });
  };

  const handleEditPayment = (aplicacionId: number) => {
    // TODO: Implementar edición de pago
    toast({
      title: "Función pendiente",
      description: "La edición de pagos será implementada próximamente",
    });
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
      queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaId] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo eliminar la multa",
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
              {esCuentaCancelada && (
                <Badge variant="destructive">
                  CANCELADA
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              Información detallada de pagos y acuerdos
              {cuentaDetalle.producto_servicio_nombre && ` - ${cuentaDetalle.producto_servicio_nombre}`}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setTransferDialog({ isOpen: true })}
            disabled={!ultimoPagoSTP || esCuentaCancelada}
            variant="outline"
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Transferir entre cuentas
          </Button>
          <Button 
            onClick={() => setManualPaymentDialog(true)}
            disabled={esCuentaCancelada}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Agregar pago manual
          </Button>
        </div>
      </div>

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

        {cuentaDetalle.precio_final > 0 && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Saldo Pendiente</CardTitle>
              <DollarSign className="h-4 w-4 text-warning" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-warning">{formatCurrency(totalPendiente)}</div>
              <p className="text-xs text-muted-foreground">
                {((totalPendiente / (cuentaDetalle.precio_final || 1)) * 100).toFixed(1)}% restante
              </p>
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
                        <p>Propiedad</p>
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
                          <p>Estacionamiento no incluido</p>
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
                          <p>Bodega no incluida</p>
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
            
            {cuentaDetalle.tipo_cuenta === 'Propiedad' ? (
              <>
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
              </>
            ) : (
              <>
                <div>
                  <label className="text-sm font-medium">Categoría</label>
                  <p className="text-sm text-muted-foreground">
                    {cuentaDetalle.tipo_cuenta === 'Producto' ? 'Productos' : 'Servicios'}
                  </p>
                </div>
                <div>
                  <label className="text-sm font-medium">
                    Nombre {cuentaDetalle.tipo_cuenta === 'Producto' ? 'Producto' : 'Servicio'}
                  </label>
                  <p className="text-sm text-muted-foreground">{cuentaDetalle.producto_servicio_nombre}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">CLABE STP</label>
                  <p className="text-sm text-muted-foreground">{cuentaDetalle.clabe_stp || 'No asignada'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Fecha Compra</label>
                  <p className="text-sm text-muted-foreground">{formatDate(cuentaDetalle.fecha_compra)}</p>
                </div>
              </>
            )}
          </div>
          
          {cuentaDetalle?.compradores && cuentaDetalle.compradores.length > 0 && (
            <div className="mt-4">
              <label className="text-sm font-medium">Compradores</label>
              <div className="mt-3 space-y-3">
                {cuentaDetalle.compradores.map((comprador, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="space-y-1">
                      <div className="font-medium">{comprador.nombre_legal}</div>
                      {comprador.rfc && (
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
                ))}
                
                {/* Total verification */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">
                    Total {(cuentaDetalle?.compradores?.length || 0) === 1 ? 'Propiedad' : 'Copropiedad'}:
                  </span>
                  <span className="font-bold">
                    {(cuentaDetalle?.compradores || []).reduce((sum, c) => sum + c.porcentaje_copropiedad, 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Main Content with Tabs */}
      <Tabs defaultValue="acuerdos" className="w-full">
        <TabsList>
          <TabsTrigger value="acuerdos">Acuerdos de Pago</TabsTrigger>
          {cuentaDetalle?.tipo_cuenta === 'Propiedad' && cuentaDetalle?.id && (
            <TabsTrigger value="documentos">Documentos</TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="acuerdos" className="mt-6">
          {/* Acuerdos de pago */}
          <Card className={esCuentaCancelada ? 'opacity-60' : ''}>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Acuerdos de Pago y Aplicaciones</CardTitle>
            {/* Payment scheme selection when no scheme is selected */}
            {offerData && !offerData.id_esquema_pago_seleccionado && availableSchemes && availableSchemes.length > 0 && !esCuentaCancelada && (
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
        </CardHeader>
        <CardContent>
          {/* Payment Plan Details Section */}
          {originalScheme && (
            <div className="mb-6">
              <div className="border rounded-lg p-4 space-y-4">
                <h3 className="text-lg font-semibold">
                  {isPaymentPlanModified ? "Plan de Pagos" : "Plan de pagos"}
                  {!isPaymentPlanModified && acuerdosPago && acuerdosPago.length > 0 && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {Math.max(...acuerdosPago.map(a => a.orden))} pagos
                    </Badge>
                  )}
                </h3>
                
                {!isPaymentPlanModified ? (
                  // Original unchanged plan - show percentages AND amounts
                  <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Nombre del Plan</label>
                      <p className="text-sm font-semibold">{originalScheme.nombre}</p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Enganche</label>
                      <p className="text-sm font-semibold">
                        {originalScheme.porcentaje_enganche.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_enganche / 100))}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Mensualidades</label>
                      <p className="text-sm font-semibold">
                        {originalScheme.numero_mensualidades} pagos de {originalScheme.porcentaje_mensualidades.toFixed(1)}%
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_mensualidades / 100))}
                      </p>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-muted-foreground">Entrega</label>
                      <p className="text-sm font-semibold">{originalScheme.porcentaje_entrega.toFixed(1)}%</p>
                      <p className="text-xs text-muted-foreground">
                        {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_entrega / 100))}
                      </p>
                    </div>
                  </div>
                ) : (
                  // Modified plan - show both original (disabled) and current
                  <div className="space-y-4">
                    {/* Original Plan - Disabled */}
                    <div className="opacity-50 pointer-events-none border rounded p-3 bg-muted/20">
                       <label className="text-xs text-muted-foreground mb-2 block">
                         Plan Original
                         {originalScheme && (
                           <Badge variant="secondary" className="ml-2 text-xs">
                             {originalScheme.numero_mensualidades + 1 + 1 + 1} pagos
                           </Badge>
                         )}
                       </label>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Nombre del Plan</label>
                          <p className="text-sm">{originalScheme.nombre}</p>
                        </div>
                         <div>
                           <label className="text-sm font-medium text-muted-foreground">Enganche</label>
                           <p className="text-sm">{originalScheme.porcentaje_enganche.toFixed(1)}%</p>
                           <p className="text-xs text-muted-foreground">
                             {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_enganche / 100))}
                           </p>
                         </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Mensualidades</label>
                          <p className="text-sm">
                            {originalScheme.numero_mensualidades} pagos de {originalScheme.porcentaje_mensualidades.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_mensualidades / 100))}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Entrega</label>
                          <p className="text-sm">{originalScheme.porcentaje_entrega.toFixed(1)}%</p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency((cuentaDetalle?.precio_final || 0) * (originalScheme.porcentaje_entrega / 100))}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Modified Plan - Active */}
                    <div className="border-2 border-primary rounded p-3">
                      <label className="text-xs text-primary font-semibold mb-2 block">
                        Plan Modificado
                        {currentPaymentPlan && (
                          <Badge variant="secondary" className="ml-2 text-xs">
                            {(currentPaymentPlan.numero_mensualidades || 0) + 1 + 1 + 1} pagos
                          </Badge>
                        )}
                      </label>
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Nombre del Plan</label>
                          <p className="text-sm font-semibold">{originalScheme.nombre} modificado</p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">
                            {currentPaymentPlan?.hayCesionDerechos ? 'Cesión de derechos' : 'Enganche'}
                          </label>
                          <p className="text-sm font-semibold">
                            {currentPaymentPlan?.hayCesionDerechos ? 
                              ((actualAmounts?.cesion || 0) / (cuentaDetalle?.precio_final || 1) * 100).toFixed(1) :
                              currentPaymentPlan?.porcentaje_enganche.toFixed(1)
                            }%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(currentPaymentPlan?.hayCesionDerechos ? (actualAmounts?.cesion || 0) : (actualAmounts?.enganche || 0))}
                          </p>
                        </div>
                        <div>
                          <label className="text-sm font-medium text-muted-foreground">Mensualidades</label>
                          <p className="text-sm font-semibold">
                            {currentPaymentPlan?.numero_mensualidades} pagos de {currentPaymentPlan?.porcentaje_mensualidades.toFixed(1)}%
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {formatCurrency(actualAmounts?.mensualidades || 0)}
                          </p>
                        </div>
                         <div>
                           <label className="text-sm font-medium text-muted-foreground">Entrega</label>
                           <p className="text-sm font-semibold">
                             {currentPaymentPlan?.porcentaje_entrega.toFixed(1)}%
                           </p>
                           <p className="text-xs text-muted-foreground">
                             {formatCurrency(actualAmounts?.entrega || 0)}
                           </p>
                         </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {acuerdosPago && acuerdosPago.length > 0 ? (
            <div className="space-y-2">
              {acuerdosPago.map((acuerdo, index) => {
                const totalAplicado = (acuerdo.aplicaciones || []).reduce((sum, app) => sum + app.monto, 0);
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
                
                // Check if has cash payments (id_metodos_pago = 1)
                const tienePagosEfectivo = (acuerdo.aplicaciones || []).some(
                  app => app.pago.id_metodos_pago === 1
                );
                
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
                              </div>
                            </div>
                            <Badge variant="outline" className="text-xs">
                              {(acuerdo.aplicaciones || []).length} aplicación(es)
                            </Badge>
                            <span className="text-xs text-muted-foreground">
                              {porcentaje}% - {acuerdo.fecha_pago ? formatDate(acuerdo.fecha_pago) : 'Sin fecha'}
                            </span>
                            <Badge variant={acuerdo.pago_completado ? "default" : "secondary"} className="text-xs">
                              {acuerdo.pago_completado ? "Pagado" : "Pendiente"}
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
                                             {/* CEP Button - Only for STP and STP-manual payments */}
                                             {(aplicacion.pago.id_metodos_pago === 6 || aplicacion.pago.id_metodos_pago === 7) && (
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
                                                      disabled={esCuentaCancelada}
                                                   >
                                                     <FileText className="h-3 w-3" />
                                                   </Button>
                                                 </TooltipTrigger>
                                                 <TooltipContent>
                                                   <p>Agregar CEP</p>
                                                 </TooltipContent>
                                               </Tooltip>
                                             )}
                                             
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
                                                   disabled={deletePaymentMutation.isPending || isStpPayment || esCuentaCancelada}
                                                 >
                                                   <Trash2 className="h-3 w-3" />
                                                 </Button>
                                               </TooltipTrigger>
                                               <TooltipContent>
                                                 <p>{isStpPayment ? "No se pueden eliminar pagos STP" : "Eliminar Pago"}</p>
                                               </TooltipContent>
                                             </Tooltip>
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
                              {!acuerdo.pago_completado && !esCuentaCancelada && (
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
                                        <Badge variant="outline" className="text-xs text-muted-foreground">
                                          {formatDate(multa.fecha_creacion)}
                                        </Badge>
                                      </div>
                                      <p className="text-sm text-muted-foreground">
                                        {multa.descripcion}
                                      </p>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                      <TooltipProvider>
                                        <Tooltip>
                                          <TooltipTrigger asChild>
                                            <Button
                                              variant="destructive"
                                              size="icon"
                                              onClick={() => setDeleteMultaDialog({ isOpen: true, multa })}
                                              disabled={deleteMultaMutation.isPending || multa.estaPagada || esCuentaCancelada}
                                            >
                                              <Trash2 className="h-4 w-4" />
                                            </Button>
                                          </TooltipTrigger>
                                           <TooltipContent>
                                             <p>{esCuentaCancelada ? "Cuenta cancelada - no se pueden eliminar multas" : multa.estaPagada ? "No se pueden eliminar multas pagadas" : "Eliminar Multa"}</p>
                                           </TooltipContent>
                                        </Tooltip>
                                      </TooltipProvider>
                                    </div>
                                  </div>
                                ))}
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
        </CardContent>
      </Card>
        </TabsContent>

        {/* Documentos Tab - only available for properties */}
        {cuentaDetalle?.tipo_cuenta === 'Propiedad' && cuentaDetalle?.id && (
          <TabsContent value="documentos" className="mt-6">
            <ReadOnlyDocumentsView cuentaCobranzaId={cuentaDetalle.id} />
          </TabsContent>
        )}
      </Tabs>

      <DeleteConfirmationDialog
        open={deleteDialog.isOpen}
        onOpenChange={(open) => setDeleteDialog({ isOpen: open, aplicacion: open ? deleteDialog.aplicacion : null })}
        onConfirm={confirmDeletePayment}
        title="Eliminar Aplicación de Pago"
        description={
          deleteDialog.aplicacion
            ? `¿Está seguro de que desea eliminar la aplicación de pago de ${formatCurrency(deleteDialog.aplicacion.monto)} para el concepto "${deleteDialog.aplicacion.conceptoNombre}"? Esta acción no se puede deshacer.`
            : ""
        }
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
      />

      <TransferirEntreComisionesDialog
        isOpen={transferDialog.isOpen}
        onClose={() => setTransferDialog({ isOpen: false })}
        cuentaOrigenId={cuentaId}
        ultimoPagoSTP={ultimoPagoSTP ? {
          id: ultimoPagoSTP.id,
          clave_rastreo: ultimoPagoSTP.clave_rastreo || '',
          monto: ultimoPagoSTP.monto
        } : null}
      />
    </div>
  );
}