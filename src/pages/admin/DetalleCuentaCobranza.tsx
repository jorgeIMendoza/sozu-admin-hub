import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, FileText, DollarSign, CalendarDays, ChevronDown, ChevronUp, Edit, Trash2, Plus, AlertTriangle } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { DeleteConfirmationDialog } from "@/components/admin/DeleteConfirmationDialog";
import { NewMultaDialog } from "@/components/admin/NewMultaDialog";

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
  pago: {
    id: number;
    fecha_pago: string;
    monto: number;
    metodo_pago: string;
    clave_rastreo: string | null;
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
  compradores: Comprador[];
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  dueno: string;
  proyecto_id: number;
  oferta_id: number;
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
  descripcion: string;
  fecha_creacion: string;
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
  }>({
    isOpen: false,
    acuerdoId: null
  });
  const [deleteMultaDialog, setDeleteMultaDialog] = useState<{ 
    isOpen: boolean; 
    multa: Multa | null 
  }>({
    isOpen: false,
    multa: null
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: cuentaDetalle, isLoading: cuentaLoading } = useQuery({
    queryKey: ["cuenta_detalle", cuentaId],
    queryFn: async () => {
      // Get cuenta cobranza with related data
      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          clabe_stp,
          precio_final,
          es_aprobado,
          fecha_compra,
          id_oferta
        `)
        .eq('id', cuentaId)
        .eq('activo', true)
        .single();

      if (cuentaError) throw cuentaError;

      // Get oferta and related data
      const { data: oferta } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_esquema_pago_seleccionado,
          propiedades!ofertas_id_propiedad_fkey(
            id,
            numero_propiedad,
            id_entidad_relacionada_dueno,
            id_edificio_modelo
          )
        `)
        .eq('id', cuenta.id_oferta)
        .single();

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
      const [entidadResult, edificioModeloResult, duenoResult] = await Promise.all([
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
          .maybeSingle()
      ]);

      const detalle: CuentaDetalle = {
        id: cuenta.id,
        clabe_stp: cuenta.clabe_stp,
        precio_final: cuenta.precio_final || 0,
        es_aprobado: cuenta.es_aprobado,
        fecha_compra: cuenta.fecha_compra,
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
        oferta_id: cuenta.id_oferta
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
        .single();

      if (error) throw error;

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
        const webhookResponse = await fetch('https://automatizacion-n8n.fbqqbe.easypanel.host/webhook-test/aplicaPago', {
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
            id_pago
          `)
          .in('id_acuerdo_pago', acuerdoIds)
          .eq('activo', true),
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
            .select('id, fecha_pago, monto, clave_rastreo, id_metodos_pago')
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
        
        // Use database value for payment completion status
        const totalAplicado = acuerdoAplicaciones.reduce((sum, app) => sum + app.monto, 0);
        
        return {
          id: acuerdo.id,
          orden: acuerdo.orden,
          monto: acuerdo.monto,
          fecha_pago: acuerdo.fecha_pago,
          pago_completado: acuerdo.pago_completado,
          concepto: concepto?.nombre || 'Sin concepto',
          aplicaciones: acuerdoAplicaciones.map(a => {
            const pago = pagos.find(p => p.id === a.id_pago);
            const metodoPago = metodosPago.find(m => m.id === pago?.id_metodos_pago);
            
            return {
              id: a.id,
              monto: a.monto,
              fecha_creacion: a.fecha_creacion,
              pago: {
                id: pago?.id || 0,
                fecha_pago: pago?.fecha_pago || '',
                monto: pago?.monto || 0,
                metodo_pago: metodoPago?.nombre || 'Sin método',
                clave_rastreo: pago?.clave_rastreo
              }
            };
          }),
          multas: acuerdoMultas.map(m => ({
            id: m.id,
            monto: m.monto,
            descripcion: m.descripcion,
            fecha_creacion: m.fecha_creacion
          }))
        };
      });

      return acuerdosConAplicaciones;
    },
    enabled: !!cuentaId,
  });

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
    sum + acuerdo.aplicaciones.reduce((appSum, app) => appSum + app.monto, 0), 0
  ) || 0;

  const totalPendiente = (cuentaDetalle?.precio_final || 0) - totalPagado;

  // Mutation to delete payment application
  const deletePaymentMutation = useMutation({
    mutationFn: async (aplicacionId: number) => {
      const { error } = await supabase
        .from('aplicaciones_pago')
        .update({ activo: false })
        .eq('id', aplicacionId);
      
      if (error) throw error;
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
    setMultaDialog({
      isOpen: true,
      acuerdoId
    });
  };

  const handleDeleteMulta = (multa: Multa) => {
    setDeleteMultaDialog({
      isOpen: true,
      multa
    });
  };

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

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild>
          <Link to="/admin/cuentas-cobranza">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Detalle Cuenta de Cobranza CC-{String(cuentaDetalle.id).padStart(6, '0')}</h1>
          <p className="text-muted-foreground">
            Información detallada de pagos y acuerdos
          </p>
        </div>
      </div>

      {/* Información general de la cuenta */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
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

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Estado</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <Badge variant={cuentaDetalle.es_aprobado ? "default" : "secondary"}>
              {cuentaDetalle.es_aprobado ? "Aprobado" : "Pendiente"}
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Información de la propiedad */}
      <Card>
        <CardHeader>
          <CardTitle>Información de la Propiedad</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="text-sm font-medium">Dueño</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.dueno}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Proyecto</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.proyecto}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Edificio</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.edificio}</p>
            </div>
            <div>
              <label className="text-sm font-medium">No. Propiedad</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.numero_propiedad}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Modelo</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.modelo}</p>
            </div>
            <div>
              <label className="text-sm font-medium">CLABE STP</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.clabe_stp || 'No asignada'}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Fecha Compra</label>
              <p className="text-sm text-muted-foreground">{formatDate(cuentaDetalle.fecha_compra)}</p>
            </div>
          </div>
          
          {cuentaDetalle.compradores.length > 0 && (
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
                        {cuentaDetalle.compradores.length === 1 ? 'Propiedad' : 'Copropiedad'}
                      </div>
                    </div>
                  </div>
                ))}
                
                {/* Total verification */}
                <div className="flex justify-between items-center pt-2 border-t">
                  <span className="text-sm font-medium">
                    Total {cuentaDetalle.compradores.length === 1 ? 'Propiedad' : 'Copropiedad'}:
                  </span>
                  <span className="font-bold">
                    {cuentaDetalle.compradores.reduce((sum, c) => sum + c.porcentaje_copropiedad, 0).toFixed(2)}%
                  </span>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acuerdos de pago */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Acuerdos de Pago y Aplicaciones</CardTitle>
            {/* Payment scheme selection when no scheme is selected */}
            {offerData && !offerData.id_esquema_pago_seleccionado && availableSchemes && availableSchemes.length > 0 && (
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
                <span className="text-sm text-muted-foreground">Plan de pagos:</span>
                <Badge variant="default">{offerData.esquema_nombre}</Badge>
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {acuerdosPago && acuerdosPago.length > 0 ? (
            <div className="space-y-4">
              {acuerdosPago.map((acuerdo, index) => {
                const totalAplicado = acuerdo.aplicaciones.reduce((sum, app) => sum + app.monto, 0);
                const isOpen = openAcuerdos[acuerdo.id];
                
                // Count how many "Parcialidad" concepts come before this one
                const parcialidadNumber = acuerdosPago
                  .slice(0, index + 1)
                  .filter(a => a.concepto.toLowerCase().includes('parcialidad')).length;
                
                // Format the concept name with parcialidad numbering
                const conceptoDisplay = acuerdo.concepto.toLowerCase().includes('parcialidad') 
                  ? `Parcialidad #${parcialidadNumber}`
                  : acuerdo.concepto;
                
                return (
                  <Collapsible key={acuerdo.id} open={isOpen} onOpenChange={() => toggleAcuerdo(acuerdo.id)}>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger asChild>
                        <div className="w-full p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold">{conceptoDisplay}</h4>
                              <Badge variant={acuerdo.pago_completado ? "default" : "secondary"}>
                                {acuerdo.pago_completado ? "Completado" : "Pendiente"}
                              </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <span>Monto: {formatCurrency(acuerdo.monto)}</span>
                              <span>Pagado: {formatCurrency(totalAplicado)}</span>
                              <span>Pendiente: {formatCurrency(acuerdo.monto - totalAplicado)}</span>
                              {acuerdo.fecha_pago && <span>Fecha límite: {formatDate(acuerdo.fecha_pago)}</span>}
                            </div>
                          </div>
                          <div className="ml-4">
                            {isOpen ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      
                      <CollapsibleContent>
                        <div className="px-4 pb-4">
                          {acuerdo.aplicaciones.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Fecha Pago</TableHead>
                                  <TableHead>Método</TableHead>
                                  <TableHead>Clave Rastreo</TableHead>
                                  <TableHead>Monto Aplicado</TableHead>
                                  <TableHead>Fecha Aplicación</TableHead>
                                  <TableHead>Acciones</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {acuerdo.aplicaciones.map((aplicacion, index) => {
                                  const isStpPayment = aplicacion.pago.metodo_pago?.toLowerCase().includes('stp');
                                  
                                  return (
                                    <TableRow key={aplicacion.id}>
                                      <TableCell>{formatDate(aplicacion.pago.fecha_pago)}</TableCell>
                                      <TableCell>{aplicacion.pago.metodo_pago}</TableCell>
                                      <TableCell>
                                        {aplicacion.pago.clave_rastreo ? (
                                          <Badge variant="outline">{aplicacion.pago.clave_rastreo}</Badge>
                                        ) : (
                                          <span className="text-muted-foreground">N/A</span>
                                        )}
                                      </TableCell>
                                      <TableCell className="font-medium">
                                        {formatCurrency(aplicacion.monto)}
                                      </TableCell>
                                      <TableCell>{formatDate(aplicacion.fecha_creacion)}</TableCell>
                                      <TableCell>
                                        <TooltipProvider>
                                          <div className="flex gap-2">
                                            {!isStpPayment && (
                                              <Tooltip>
                                                <TooltipTrigger asChild>
                                                  <Button
                                                    variant="outline"
                                                    size="icon"
                                                    onClick={() => handleEditPayment(aplicacion.id)}
                                                  >
                                                    <Edit className="h-4 w-4" />
                                                  </Button>
                                                </TooltipTrigger>
                                                <TooltipContent>
                                                  <p>Editar Pago</p>
                                                </TooltipContent>
                                              </Tooltip>
                                            )}
                                            <Tooltip>
                                              <TooltipTrigger asChild>
                                                <Button
                                                  variant="destructive"
                                                  size="icon"
                                                  onClick={() => handleDeletePayment({
                                                    id: aplicacion.id,
                                                    monto: aplicacion.monto,
                                                    conceptoNombre: conceptoDisplay
                                                  })}
                                                  disabled={deletePaymentMutation.isPending}
                                                >
                                                  <Trash2 className="h-4 w-4" />
                                                </Button>
                                              </TooltipTrigger>
                                              <TooltipContent>
                                                <p>Eliminar Pago</p>
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
                              {!acuerdo.pago_completado && (
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
                                          {formatCurrency(multa.monto)}
                                        </span>
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
                                               disabled={deleteMultaMutation.isPending}
                                             >
                                               <Trash2 className="h-4 w-4" />
                                             </Button>
                                           </TooltipTrigger>
                                           <TooltipContent>
                                             <p>Eliminar Multa</p>
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
        onOpenChange={(open) => setMultaDialog({ isOpen: open, acuerdoId: open ? multaDialog.acuerdoId : null })}
        acuerdoId={multaDialog.acuerdoId || 0}
        cuentaId={cuentaId}
      />
    </div>
  );
}