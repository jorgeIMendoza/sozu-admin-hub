import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, User, Hash } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface TransferPaymentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  cuentaOrigenId: number;
  ultimoPagoSTP: {
    id: number;
    clave_rastreo: string;
    monto: number;
  } | null;
}

interface PagadorInfo {
  nombre_ordenante: string;
  rfc_curp_ordenante: string;
}

interface CuentaDestino {
  id: number;
  numero_propiedad: string;
  proyecto: string;
  edificio: string;
}

export function TransferPaymentDialog({
  isOpen,
  onClose,
  cuentaOrigenId,
  ultimoPagoSTP
}: TransferPaymentDialogProps) {
  const [pagadorInfo, setPagadorInfo] = useState<PagadorInfo | null>(null);
  const [cuentasDestino, setCuentasDestino] = useState<CuentaDestino[]>([]);
  const [cuentaDestinoSeleccionada, setCuentaDestinoSeleccionada] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { registrarActualizacion } = useActivityLogger();

  useEffect(() => {
    if (isOpen && ultimoPagoSTP?.clave_rastreo) {
      fetchPagadorInfo();
    } else if (!isOpen) {
      // Reset state when dialog closes
      setPagadorInfo(null);
      setCuentasDestino([]);
      setCuentaDestinoSeleccionada("");
      setLoading(false);
    }
  }, [isOpen, ultimoPagoSTP?.clave_rastreo]);

  const fetchPagadorInfo = async () => {
    if (!ultimoPagoSTP?.clave_rastreo) return;

    try {
      setLoading(true);

      // Obtener info del pagador desde pagos_stp_raw
      const { data: stpData, error: stpError } = await supabase
        .from('pagos_stp_raw')
        .select('nombre_ordenante, rfc_curp_ordenante')
        .eq('claverastreo', ultimoPagoSTP.clave_rastreo)
        .single();

      if (stpError) {
        console.error('Error fetching STP data:', stpError);
        toast({
          title: "Error",
          description: "No se pudo obtener información del pagador",
          variant: "destructive",
        });
        return;
      }

      setPagadorInfo(stpData);

      // Buscar personas con ese RFC/CURP
      const { data: personas, error: personasError } = await supabase
        .from('personas')
        .select('id')
        .or(`rfc.eq.${stpData.rfc_curp_ordenante},curp.eq.${stpData.rfc_curp_ordenante}`)
        .eq('activo', true);

      if (personasError || !personas || personas.length === 0) {
        toast({
          title: "Información",
          description: "No se encontró persona con ese RFC/CURP",
        });
        setCuentasDestino([]);
        return;
      }

      const personaIds = personas.map(p => p.id);

      // Buscar si es comprador en otras cuentas activas
      const { data: compradores, error: compradoresError } = await supabase
        .from('compradores')
        .select(`
          id_cuenta_cobranza
        `)
        .in('id_persona', personaIds)
        .eq('activo', true)
        .neq('id_cuenta_cobranza', cuentaOrigenId);

      if (compradoresError) {
        console.error('Error fetching compradores:', compradoresError);
        toast({
          title: "Error",
          description: "No se pudo buscar cuentas del comprador",
          variant: "destructive",
        });
        return;
      }

      if (!compradores || compradores.length === 0) {
        toast({
          title: "Información",
          description: "No se encontraron otras cuentas de cobranza para este comprador",
        });
        setCuentasDestino([]);
        return;
      }

      // Obtener detalles de las cuentas de cobranza
      const cuentaIds = compradores.map(c => c.id_cuenta_cobranza);
      
      const { data: cuentasDetalles } = await supabase
        .from('cuentas_cobranza')
        .select(`
          id,
          activo,
          id_oferta
        `)
        .in('id', cuentaIds)
        .eq('activo', true);

      if (!cuentasDetalles || cuentasDetalles.length === 0) {
        setCuentasDestino([]);
        return;
      }

      // Obtener detalles de las ofertas y propiedades
      const ofertaIds = cuentasDetalles.map(c => c.id_oferta);
      
      const { data: ofertas } = await supabase
        .from('ofertas')
        .select(`
          id,
          id_propiedad
        `)
        .in('id', ofertaIds);

      if (!ofertas) {
        setCuentasDestino([]);
        return;
      }

      // Obtener detalles de las propiedades
      const propiedadIds = ofertas.map(o => o.id_propiedad);
      
      const { data: propiedades } = await supabase
        .from('propiedades')
        .select(`
          id,
          numero_propiedad,
          id_entidad_relacionada_dueno,
          id_edificio_modelo
        `)
        .in('id', propiedadIds);

      // Obtener proyectos y edificios
      const entidadIds = propiedades?.map(p => p.id_entidad_relacionada_dueno).filter(Boolean) || [];
      const edificioModeloIds = propiedades?.map(p => p.id_edificio_modelo).filter(Boolean) || [];

      const [entidadesResult, edificiosResult] = await Promise.all([
        entidadIds.length > 0 ? supabase
          .from('entidades_relacionadas')
          .select(`
            id,
            id_proyecto,
            proyectos!entidades_relacionadas_id_proyecto_fkey(nombre)
          `)
          .in('id', entidadIds) : { data: [] },
        edificioModeloIds.length > 0 ? supabase
          .from('edificios_modelos')
          .select(`
            id,
            edificios!edificios_modelos_id_edificio_fkey(nombre)
          `)
          .in('id', edificioModeloIds) : { data: [] }
      ]);

      // Procesar y combinar datos
      const cuentasFormateadas: CuentaDestino[] = [];
      
      for (const cuenta of cuentasDetalles) {
        const oferta = ofertas.find(o => o.id === cuenta.id_oferta);
        if (!oferta) continue;
        
        const propiedad = propiedades?.find(p => p.id === oferta.id_propiedad);
        if (!propiedad) continue;
        
        const entidad = entidadesResult.data?.find(e => e.id === propiedad.id_entidad_relacionada_dueno);
        const edificio = edificiosResult.data?.find(e => e.id === propiedad.id_edificio_modelo);
        
        cuentasFormateadas.push({
          id: cuenta.id,
          numero_propiedad: propiedad.numero_propiedad,
          proyecto: entidad?.proyectos?.nombre || 'Sin proyecto',
          edificio: edificio?.edificios?.nombre || 'Sin edificio'
        });
      }

      setCuentasDestino(cuentasFormateadas);

    } catch (error) {
      console.error('Error in fetchPagadorInfo:', error);
      toast({
        title: "Error",
        description: "Error al procesar la información",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTransferir = async () => {
    if (!cuentaDestinoSeleccionada) {
      toast({
        title: "Error",
        description: "Seleccione una cuenta destino",
        variant: "destructive",
      });
      return;
    }

    if (!ultimoPagoSTP?.id) {
      toast({
        title: "Error",
        description: "No se encontró el ID del pago",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      const cuentaDestinoId = parseInt(cuentaDestinoSeleccionada);
      const montoTotalTransferir = ultimoPagoSTP.monto;

      // 1. Obtener IDs de acuerdos afectados en la cuenta origen ANTES de desactivar
      const { data: aplicacionesOrigen, error: aplicacionesOrigenError } = await supabase
        .from('aplicaciones_pago')
        .select('id_acuerdo_pago')
        .eq('id_pago', ultimoPagoSTP.id)
        .eq('activo', true);

      if (aplicacionesOrigenError) {
        throw new Error('Error al obtener aplicaciones de pago de origen');
      }

      const acuerdosAfectadosIds = aplicacionesOrigen?.map(a => a.id_acuerdo_pago) || [];

      // 2. Desactivar todas las aplicaciones de pago existentes para este pago
      const { error: deactivateError } = await supabase
        .from('aplicaciones_pago')
        .update({ activo: false })
        .eq('id_pago', ultimoPagoSTP.id);

      if (deactivateError) {
        throw new Error('Error al desactivar aplicaciones de pago existentes');
      }

      // 3. Marcar los acuerdos de origen como NO completados
      if (acuerdosAfectadosIds.length > 0) {
        const { error: updateOrigenError } = await supabase
          .from('acuerdos_pago')
          .update({ pago_completado: false })
          .in('id', acuerdosAfectadosIds);

        if (updateOrigenError) {
          console.error('Error al actualizar acuerdos de origen:', updateOrigenError);
        }
      }

      // 4. Obtener acuerdos de pago NO completados de la cuenta destino
      const { data: acuerdosDestino, error: acuerdosDestinoError } = await supabase
        .from('acuerdos_pago')
        .select('id, monto, orden')
        .eq('id_cuenta_cobranza', cuentaDestinoId)
        .eq('pago_completado', false)
        .eq('activo', true)
        .order('orden');

      if (acuerdosDestinoError) {
        throw new Error('Error al obtener acuerdos de pago de cuenta destino');
      }

      const aplicacionesPago = [];
      const acuerdosCompletados = [];

      // 5. Aplicar el monto COMPLETO a la cuenta destino
      let montoRestante = montoTotalTransferir;
      for (const acuerdo of acuerdosDestino || []) {
        if (montoRestante <= 0) break;

        const montoAplicar = Math.min(montoRestante, acuerdo.monto);
        
        aplicacionesPago.push({
          id_pago: ultimoPagoSTP.id,
          id_acuerdo_pago: acuerdo.id,
          monto: montoAplicar,
          es_multa: false,
          activo: true
        });

        // Si el acuerdo se completa totalmente, marcarlo como completado
        if (montoAplicar >= acuerdo.monto) {
          acuerdosCompletados.push({
            id: acuerdo.id,
            pago_completado: true
          });
        }

        montoRestante -= montoAplicar;
      }

      // 6. Insertar nuevas aplicaciones de pago
      if (aplicacionesPago.length > 0) {
        const { error: insertError } = await supabase
          .from('aplicaciones_pago')
          .insert(aplicacionesPago);

        if (insertError) {
          throw new Error('Error al crear nuevas aplicaciones de pago');
        }
      }

      // 7. Actualizar acuerdos completados en la cuenta destino
      for (const acuerdo of acuerdosCompletados) {
        const { error: updateError } = await supabase
          .from('acuerdos_pago')
          .update({ pago_completado: acuerdo.pago_completado })
          .eq('id', acuerdo.id);

        if (updateError) {
          console.error('Error al actualizar acuerdo completado:', updateError);
        }
      }

      // Registrar transferencia en log de actividades
      await registrarActualizacion('pagos',
        { 
          id_pago: ultimoPagoSTP.id,
          id_cuenta_cobranza_origen: cuentaOrigenId,
          monto: montoTotalTransferir
        },
        {
          id_pago: ultimoPagoSTP.id,
          id_cuenta_cobranza_destino: cuentaDestinoId,
          monto: montoTotalTransferir,
          clave_rastreo: ultimoPagoSTP.clave_rastreo
        },
        'transferir_pago_entre_cuentas'
      );

      toast({
        title: "Transferencia realizada",
        description: `Se transfirió el monto completo de $${montoTotalTransferir.toLocaleString()} a la cuenta seleccionada`,
      });

      // Detectar si las cuentas son de mantenimiento
      const { data: cuentaOrigen } = await supabase
        .from('cuentas_cobranza')
        .select('id_cuenta_cobranza_padre')
        .eq('id', cuentaOrigenId)
        .single();

      const { data: cuentaDestino } = await supabase
        .from('cuentas_cobranza')
        .select('id_cuenta_cobranza_padre')
        .eq('id', cuentaDestinoId)
        .single();

      const esMantenimientoOrigen = !!cuentaOrigen?.id_cuenta_cobranza_padre;
      const esMantenimientoDestino = !!cuentaDestino?.id_cuenta_cobranza_padre;

      // Invalidate queries for source account
      if (esMantenimientoOrigen) {
        queryClient.invalidateQueries({ queryKey: ["cuenta_mantenimiento_detalle", cuentaOrigenId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_mantenimiento", cuentaOrigenId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_mantenimiento", cuentaOrigenId] });
        queryClient.invalidateQueries({ queryKey: ["multas_mantenimiento", cuentaOrigenId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaOrigenId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaOrigenId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaOrigenId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaOrigenId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaOrigenId] });
      }

      // Invalidate queries for destination account
      if (esMantenimientoDestino) {
        queryClient.invalidateQueries({ queryKey: ["cuenta_mantenimiento_detalle", cuentaDestinoId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_mantenimiento", cuentaDestinoId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_mantenimiento", cuentaDestinoId] });
        queryClient.invalidateQueries({ queryKey: ["multas_mantenimiento", cuentaDestinoId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaDestinoId] });
      } else {
        queryClient.invalidateQueries({ queryKey: ["cuenta_detalle", cuentaDestinoId] });
        queryClient.invalidateQueries({ queryKey: ["acuerdos_pago", cuentaDestinoId] });
        queryClient.invalidateQueries({ queryKey: ["pagos_cuenta", cuentaDestinoId] });
        queryClient.invalidateQueries({ queryKey: ["aplicaciones_por_pago", cuentaDestinoId] });
      }

      // Invalidar queries genéricas
      queryClient.invalidateQueries({ queryKey: ["cuentas_cobranza"] });
      queryClient.invalidateQueries({ queryKey: ["cuentas_mantenimiento"] });

      onClose();
      
    } catch (error) {
      console.error('Error in transfer:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Error al realizar la transferencia",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Hash className="w-5 h-5" />
            Transferir entre cuentas
          </DialogTitle>
          <DialogDescription>
            Transfiere el monto COMPLETO del último pago STP a otra cuenta de cobranza del mismo comprador.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Información del pagador */}
            {pagadorInfo && (
              <div className="border rounded-lg p-4 bg-muted/30">
                <h3 className="font-semibold mb-3 flex items-center gap-2">
                  <User className="w-4 h-4" />
                  Información del último pago STP
                </h3>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <Label className="text-muted-foreground">Nombre del ordenante</Label>
                    <p className="font-medium">{pagadorInfo.nombre_ordenante}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">RFC/CURP</Label>
                    <p className="font-medium">{pagadorInfo.rfc_curp_ordenante}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Monto original</Label>
                    <p className="font-medium">${ultimoPagoSTP?.monto.toLocaleString()}</p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground">Clave de rastreo</Label>
                    <p className="font-medium">{ultimoPagoSTP?.clave_rastreo}</p>
                  </div>
                </div>
              </div>
            )}

            {/* Selector de cuenta destino */}
            <div className="space-y-3">
              <Label htmlFor="cuenta-destino">Cuenta destino</Label>
              {cuentasDestino.length > 0 ? (
                <>
                  <Select value={cuentaDestinoSeleccionada} onValueChange={setCuentaDestinoSeleccionada}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cuenta destino" />
                    </SelectTrigger>
                    <SelectContent>
                      {cuentasDestino.map((cuenta) => (
                        <SelectItem key={cuenta.id} value={cuenta.id.toString()}>
                          <div className="flex flex-col">
                            <span className="font-medium">Cuenta #{cuenta.id} - {cuenta.numero_propiedad}</span>
                            <span className="text-sm text-muted-foreground">
                              {cuenta.proyecto} - {cuenta.edificio}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  
                  {/* Advertencia de transferencia completa */}
                  <div className="flex items-start gap-3 p-4 border rounded-lg bg-yellow-50 dark:bg-yellow-950/20">
                    <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm space-y-1">
                      <p className="font-medium text-yellow-900 dark:text-yellow-100">
                        Se transferirá el monto COMPLETO
                      </p>
                      <p className="text-yellow-800 dark:text-yellow-200">
                        Monto: ${ultimoPagoSTP?.monto.toLocaleString()}
                      </p>
                      <p className="text-yellow-700 dark:text-yellow-300 text-xs">
                        Los acuerdos de la cuenta origen se marcarán como incompletos y el pago completo se aplicará a la cuenta destino.
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex items-center gap-2 p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/20">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <span className="text-sm">
                    No se encontraron otras cuentas activas para este comprador
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleTransferir} 
            disabled={loading || !cuentaDestinoSeleccionada || cuentasDestino.length === 0}
          >
            Transferir monto completo
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
