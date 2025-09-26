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

interface TransferirEntreComisionesDialogProps {
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

export function TransferirEntreComisionesDialog({
  isOpen,
  onClose,
  cuentaOrigenId,
  ultimoPagoSTP
}: TransferirEntreComisionesDialogProps) {
  const [pagadorInfo, setPagadorInfo] = useState<PagadorInfo | null>(null);
  const [cuentasDestino, setCuentasDestino] = useState<CuentaDestino[]>([]);
  const [cuentaDestinoSeleccionada, setCuentaDestinoSeleccionada] = useState<string>("");
  const [montoTransferir, setMontoTransferir] = useState<number>(0);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const montoRestante = (ultimoPagoSTP?.monto || 0) - montoTransferir;

  useEffect(() => {
    if (isOpen && ultimoPagoSTP?.clave_rastreo) {
      fetchPagadorInfo();
    } else if (!isOpen) {
      // Reset state when dialog closes
      setPagadorInfo(null);
      setCuentasDestino([]);
      setCuentaDestinoSeleccionada("");
      setMontoTransferir(0);
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
    if (!cuentaDestinoSeleccionada || montoTransferir <= 0) {
      toast({
        title: "Error",
        description: "Seleccione una cuenta destino y un monto válido",
        variant: "destructive",
      });
      return;
    }

    if (montoTransferir >= (ultimoPagoSTP?.monto || 0)) {
      toast({
        title: "Error",
        description: "El monto debe ser menor al pago original",
        variant: "destructive",
      });
      return;
    }

    try {
      setLoading(true);
      
      // Aquí implementarías la lógica de transferencia
      // Por ahora solo mostramos un mensaje de éxito
      toast({
        title: "Transferencia realizada",
        description: `Se transfirió $${montoTransferir.toLocaleString()} a la cuenta seleccionada`,
      });

      onClose();
      
    } catch (error) {
      console.error('Error in transfer:', error);
      toast({
        title: "Error",
        description: "Error al realizar la transferencia",
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
            Transfiere parte del último pago STP a otra cuenta de cobranza del mismo comprador.
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
              ) : (
                <div className="flex items-center gap-2 p-4 border rounded-lg bg-orange-50 dark:bg-orange-950/20">
                  <AlertTriangle className="w-5 h-5 text-orange-600" />
                  <span className="text-sm">
                    No se encontraron otras cuentas activas para este comprador
                  </span>
                </div>
              )}
            </div>

            {/* Monto a transferir */}
            {cuentasDestino.length > 0 && (
              <div className="space-y-3">
                <Label htmlFor="monto">Monto a transferir</Label>
                <Input
                  id="monto"
                  type="number"
                  min="0"
                  max={(ultimoPagoSTP?.monto || 0) - 0.01}
                  step="0.01"
                  value={montoTransferir}
                  onChange={(e) => setMontoTransferir(parseFloat(e.target.value) || 0)}
                  placeholder="0.00"
                />
                
                {montoTransferir > 0 && (
                  <div className="flex justify-between items-center p-3 bg-muted/50 rounded-lg text-sm">
                    <span>Monto que permanecerá en cuenta original:</span>
                    <Badge variant={montoRestante >= 0 ? "default" : "destructive"}>
                      ${montoRestante.toLocaleString()}
                    </Badge>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleTransferir} 
            disabled={loading || !cuentaDestinoSeleccionada || montoTransferir <= 0 || montoTransferir >= (ultimoPagoSTP?.monto || 0) || cuentasDestino.length === 0}
          >
            Transferir
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}