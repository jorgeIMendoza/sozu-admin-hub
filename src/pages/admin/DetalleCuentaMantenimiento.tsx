import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, DollarSign, CalendarDays, ChevronDown, ChevronUp, Home, ArrowRight, CreditCard } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { formatCuentaMantenimientoId } from "@/utils/cuentaCobranzaUtils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { AddManualPaymentDialog } from "@/components/admin/AddManualPaymentDialog";
import { TransferirEntreComisionesDialog } from "@/components/admin/TransferirEntreComisionesDialog";

interface AcuerdoPago {
  id: number;
  orden: number;
  monto: number;
  fecha_pago: string | null;
  pago_completado: boolean;
  concepto: string;
  aplicaciones: AplicacionPago[];
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
    id_metodos_pago: number;
    clave_rastreo: string | null;
  };
}

interface Propietario {
  id_persona?: number;
  nombre_legal: string;
  rfc: string | null;
  porcentaje_copropiedad: number;
}

interface CuentaDetalle {
  id: number;
  precio_final: number;
  propietarios: Propietario[];
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  proyecto_id: number;
  id_cuenta_cobranza_padre: number | null;
  clabe_stp: string | null;
}

export default function DetalleCuentaMantenimiento() {
  const { id } = useParams<{ id: string }>();
  const cuentaId = parseInt(id || '0');
  const [openAcuerdos, setOpenAcuerdos] = useState<{ [key: number]: boolean }>({});
  const [manualPaymentDialog, setManualPaymentDialog] = useState(false);
  const [transferDialog, setTransferDialog] = useState<{ isOpen: boolean }>({ isOpen: false });
  const [propietariosOpen, setPropietariosOpen] = useState(false);

  const { data: cuentaDetalle, isLoading: cuentaLoading } = useQuery({
    queryKey: ["cuenta_mantenimiento_detalle", cuentaId],
    queryFn: async () => {
      // Get cuenta mantenimiento (stored in cuentas_cobranza with id_cuenta_cobranza_padre not null)
      const { data: cuenta, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select('id, precio_final, id_cuenta_cobranza_padre, clabe_stp')
        .eq('id', cuentaId)
        .not('id_cuenta_cobranza_padre', 'is', null)
        .maybeSingle();

      if (cuentaError) throw cuentaError;
      if (!cuenta) throw new Error('Cuenta de mantenimiento no encontrada');

      // Get parent account to retrieve property data
      const { data: parentCuenta } = cuenta.id_cuenta_cobranza_padre 
        ? await supabase
            .from('cuentas_cobranza')
            .select('id, id_oferta')
            .eq('id', cuenta.id_cuenta_cobranza_padre)
            .maybeSingle()
        : { data: null };

      // Get oferta and propiedad data from parent account
      const { data: oferta } = parentCuenta?.id_oferta 
        ? await supabase
            .from('ofertas')
            .select(`
              id,
              propiedades!ofertas_id_propiedad_fkey(
                id,
                numero_propiedad,
                id_entidad_relacionada_dueno,
                id_edificio_modelo
              )
            `)
            .eq('id', parentCuenta.id_oferta)
            .maybeSingle()
        : { data: null };

      // Get propietarios (from parent cuenta_cobranza if exists)
      let propietarios: Propietario[] = [];
      if (cuenta.id_cuenta_cobranza_padre) {
        const { data: compradores } = await supabase
          .from('compradores')
          .select(`
            id_persona,
            porcentaje_copropiedad,
            personas!compradores_id_persona_fkey(id, nombre_legal, rfc)
          `)
          .eq('id_cuenta_cobranza', cuenta.id_cuenta_cobranza_padre)
          .eq('activo', true);

        propietarios = compradores?.map(c => ({
          id_persona: c.personas?.id,
          nombre_legal: c.personas?.nombre_legal || '',
          rfc: c.personas?.rfc || null,
          porcentaje_copropiedad: c.porcentaje_copropiedad || 0
        })).filter(c => c.nombre_legal) || [];
      }

      // Get project and building info
      const [entidadResult, edificioModeloResult] = await Promise.all([
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
          .maybeSingle()
      ]);

      const detalle: CuentaDetalle = {
        id: cuenta.id,
        precio_final: cuenta.precio_final || 0,
        propietarios,
        proyecto: entidadResult.data?.proyectos?.nombre || 'Sin proyecto',
        edificio: edificioModeloResult.data?.edificios?.nombre || 'Sin edificio',
        numero_propiedad: oferta?.propiedades?.numero_propiedad || 'Sin número',
        modelo: edificioModeloResult.data?.modelos?.nombre || 'Sin modelo',
        proyecto_id: entidadResult.data?.id_proyecto || 0,
        id_cuenta_cobranza_padre: cuenta.id_cuenta_cobranza_padre,
        clabe_stp: cuenta.clabe_stp
      };

      return detalle;
    },
    enabled: !!cuentaId,
  });

  // Fetch acuerdos de pago (using regular acuerdos_pago table)
  const { data: acuerdosPago } = useQuery({
    queryKey: ["acuerdos_mantenimiento", cuentaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('acuerdos_pago')
        .select('id, orden, monto, fecha_pago, pago_completado, id_concepto')
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true)
        .order('orden');

      if (error) throw error;

      // Get conceptos for the acuerdos
      const conceptoIds = [...new Set(data?.map(a => a.id_concepto).filter(id => id) || [])];
      const { data: conceptos } = conceptoIds.length > 0 ? await supabase
        .from('conceptos_pago')
        .select('id, nombre')
        .in('id', conceptoIds) : { data: [] };

      const conceptosMap = new Map<number, string>();
      conceptos?.forEach(c => conceptosMap.set(c.id, c.nombre));

      // Get aplicaciones for each acuerdo
      const acuerdosWithApps = await Promise.all(
        (data || []).map(async (acuerdo) => {
          const { data: apps } = await supabase
            .from('aplicaciones_pago')
            .select('id, monto, fecha_creacion, id_pago')
            .eq('id_acuerdo_pago', acuerdo.id)
            .eq('activo', true);

          // Get pago details for each aplicacion
          const pagoIds = [...new Set(apps?.map(app => app.id_pago).filter((id): id is number => id !== null) || [])];
          const { data: pagos } = pagoIds.length > 0 ? await supabase
            .from('pagos')
            .select('id, fecha_pago, monto, clave_rastreo, id_metodos_pago')
            .in('id', pagoIds) : { data: [] };

          // Get metodos_pago
          const metodoIds = [...new Set(pagos?.map(p => p.id_metodos_pago).filter((id): id is number => id !== null) || [])];
          const { data: metodos } = metodoIds.length > 0 ? await supabase
            .from('metodos_pago')
            .select('id, nombre')
            .in('id', metodoIds) : { data: [] };

          const pagosMap = new Map<number, any>();
          pagos?.forEach(p => pagosMap.set(p.id, p));
          const metodosMap = new Map<number, string>();
          metodos?.forEach(m => metodosMap.set(m.id, m.nombre));

          return {
            id: acuerdo.id,
            orden: acuerdo.orden,
            monto: acuerdo.monto,
            fecha_pago: acuerdo.fecha_pago,
            pago_completado: acuerdo.pago_completado,
            concepto: conceptosMap.get(acuerdo.id_concepto) || 'Sin concepto',
            aplicaciones: (apps || []).map(app => {
              const pago = pagosMap.get(app.id_pago);
              return {
                id: app.id,
                monto: app.monto,
                fecha_creacion: app.fecha_creacion,
                pago: {
                  id: pago?.id || 0,
                  fecha_pago: pago?.fecha_pago || '',
                  monto: pago?.monto || 0,
                  metodo_pago: metodosMap.get(pago?.id_metodos_pago) || '',
                  id_metodos_pago: pago?.id_metodos_pago || 0,
                  clave_rastreo: pago?.clave_rastreo || null
                }
              };
            })
          };
        })
      );

      return acuerdosWithApps;
    },
    enabled: !!cuentaId,
  });

  const formatDate = (date: string) => {
    return format(new Date(date), "dd 'de' MMMM 'de' yyyy", { locale: es });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  const toggleAcuerdo = (acuerdoId: number) => {
    setOpenAcuerdos((prev) => ({
      ...prev,
      [acuerdoId]: !prev[acuerdoId],
    }));
  };

  if (cuentaLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Cargando cuenta de mantenimiento...</p>
        </div>
      </div>
    );
  }

  if (!cuentaDetalle) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-2xl font-bold mb-2">Cuenta no encontrada</p>
          <Link to="/admin/cuentas-mantenimiento">
            <Button variant="link">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Regresar a Cuentas de Mantenimiento
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const totalPagado = acuerdosPago?.reduce((sum, acuerdo) => {
    const totalAcuerdo = acuerdo.aplicaciones.reduce((appSum, app) => appSum + app.monto, 0);
    return sum + totalAcuerdo;
  }, 0) || 0;

  // Calculate pending payments including multas
  const pagoMensual = acuerdosPago?.reduce((sum, acuerdo) => {
    const totalAplicado = acuerdo.aplicaciones.reduce((appSum, app) => appSum + app.monto, 0);
    const pendiente = acuerdo.monto - totalAplicado;
    return sum + (pendiente > 0 ? pendiente : 0);
  }, 0) || 0;

  const saldoPendiente = cuentaDetalle.precio_final - totalPagado;

  // Find last payment and check if it's STP
  const pagosAplicados = acuerdosPago?.flatMap(acuerdo => 
    (acuerdo.aplicaciones || [])
  ) || [];
  
  // Get the most recent payment (regardless of method)
  const ultimoPago = pagosAplicados
    .sort((a, b) => new Date(b.fecha_creacion).getTime() - new Date(a.fecha_creacion).getTime())[0]?.pago || null;
  
  // Check if the last payment is STP (method ID = 6)
  const ultimoPagoEsSTP = ultimoPago && 'id_metodos_pago' in ultimoPago ? ultimoPago.id_metodos_pago === 6 : false;
  
  // Only set ultimoPagoSTP if the most recent payment is STP
  const ultimoPagoSTP = ultimoPagoEsSTP ? ultimoPago : null;

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" asChild>
            <Link to="/admin/cuentas-mantenimiento">
              <ArrowLeft className="h-4 w-4" />
            </Link>
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-3xl font-bold">
                Detalle Cuenta de Mantenimiento {formatCuentaMantenimientoId(cuentaDetalle.id)}
              </h1>
              <Badge variant="secondary" className="text-xs px-2 py-0.5">
                Mantenimiento
              </Badge>
            </div>
            <p className="text-muted-foreground">
              Información detallada de pagos y acuerdos
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setTransferDialog({ isOpen: true })}
            variant="outline"
            disabled={!ultimoPagoSTP}
          >
            <ArrowRight className="h-4 w-4 mr-2" />
            Transferir entre cuentas
          </Button>
          <Button 
            onClick={() => setManualPaymentDialog(true)}
          >
            <CreditCard className="h-4 w-4 mr-2" />
            Agregar pago manual
          </Button>
        </div>
      </div>

      {/* Cards de Resumen */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pago Mensual</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatCurrency(pagoMensual)}</div>
            <p className="text-xs text-muted-foreground">Incluye recargos y multas pendientes</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Pagado</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatCurrency(totalPagado)}</div>
            <p className="text-xs text-muted-foreground">
              Pagado en esta cuenta
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Saldo Pendiente</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">{formatCurrency(saldoPendiente)}</div>
            <p className="text-xs text-muted-foreground">
              Por pagar
            </p>
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
            <div>
              <label className="text-sm font-medium">CLABE STP</label>
              <p className="text-sm text-muted-foreground">{cuentaDetalle.clabe_stp || 'No asignada'}</p>
            </div>
          </div>
          
          {cuentaDetalle?.propietarios && cuentaDetalle.propietarios.length > 0 && (
            <div className="mt-4">
              <Collapsible open={propietariosOpen} onOpenChange={setPropietariosOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="w-full flex items-center justify-between p-3 h-auto">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">Propietarios ({cuentaDetalle.propietarios.length})</span>
                    </div>
                    {propietariosOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Nombre</TableHead>
                        <TableHead>RFC</TableHead>
                        <TableHead className="text-right">% Copropiedad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {cuentaDetalle.propietarios.map((propietario, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{propietario.nombre_legal}</TableCell>
                          <TableCell>
                            {propietario.rfc ? (
                              <Badge variant="secondary">{propietario.rfc}</Badge>
                            ) : (
                              'Sin RFC'
                            )}
                          </TableCell>
                          <TableCell className="text-right">{propietario.porcentaje_copropiedad.toFixed(2)}%</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <div className="mt-2 text-right pr-4">
                    <span className="text-sm font-medium">
                      Total: {cuentaDetalle.propietarios.reduce((sum, p) => sum + p.porcentaje_copropiedad, 0).toFixed(2)}%
                    </span>
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acuerdos de Pago */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CardTitle className="flex items-center gap-2">
              <CalendarDays className="h-5 w-5" />
              Acuerdos de Pago
            </CardTitle>
            <Badge variant="secondary">
              {acuerdosPago?.length || 0} acuerdos
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {acuerdosPago && acuerdosPago.length > 0 ? (
            <div className="space-y-2">
              {acuerdosPago.map((acuerdo) => {
                const totalAplicado = (acuerdo.aplicaciones || []).reduce((sum, app) => sum + app.monto, 0);
                const isOpen = openAcuerdos[acuerdo.id];
                
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
                                <span className="text-sm font-medium">{acuerdo.concepto}</span>
                              </div>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-sm text-muted-foreground">
                                {formatCurrency(acuerdo.monto)}
                              </span>
                              {acuerdo.fecha_pago && (
                                <span className="text-xs text-muted-foreground">
                                  Vence: {formatDate(acuerdo.fecha_pago)}
                                </span>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge variant={acuerdo.pago_completado ? "default" : totalAplicado > 0 ? "secondary" : "outline"}>
                              {acuerdo.pago_completado ? "Pagado" : totalAplicado > 0 ? "Parcial" : "Pendiente"}
                            </Badge>
                            {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                          </div>
                        </div>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="p-4 border-t">
                          {acuerdo.aplicaciones.length > 0 ? (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Fecha</TableHead>
                                  <TableHead>Monto</TableHead>
                                  <TableHead>Método</TableHead>
                                  <TableHead>Clave Rastreo</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {acuerdo.aplicaciones.map((app) => (
                                  <TableRow key={app.id}>
                                    <TableCell>{formatDate(app.pago.fecha_pago)}</TableCell>
                                    <TableCell>{formatCurrency(app.monto)}</TableCell>
                                    <TableCell>{app.pago.metodo_pago}</TableCell>
                                    <TableCell>{app.pago.clave_rastreo || '-'}</TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">
                              No hay pagos aplicados
                            </div>
                          )}
                          <div className="mt-2 pt-2 border-t flex justify-between text-sm">
                            <span>Total aplicado:</span>
                            <span className="font-semibold">{formatCurrency(totalAplicado)}</span>
                          </div>
                          {totalAplicado < acuerdo.monto && (
                            <div className="mt-1 flex justify-between text-sm text-muted-foreground">
                              <span>Saldo pendiente:</span>
                              <span>{formatCurrency(acuerdo.monto - totalAplicado)}</span>
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
              No hay acuerdos de pago registrados
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialogs */}
      <AddManualPaymentDialog
        isOpen={manualPaymentDialog}
        onClose={() => setManualPaymentDialog(false)}
        cuentaCobranzaId={cuentaId}
        cuentaCobranzaLabel={formatCuentaMantenimientoId(cuentaId)}
        tipoCuenta="Propiedad"
        precioFinal={cuentaDetalle.precio_final}
        montoPagado={totalPagado}
        esMantenimiento={true}
      />
      
      <TransferirEntreComisionesDialog
        isOpen={transferDialog.isOpen}
        onClose={() => setTransferDialog({ isOpen: false })}
        cuentaOrigenId={cuentaId}
        ultimoPagoSTP={ultimoPagoSTP && 'id' in ultimoPagoSTP && 'clave_rastreo' in ultimoPagoSTP && 'monto' in ultimoPagoSTP ? {
          id: ultimoPagoSTP.id,
          clave_rastreo: ultimoPagoSTP.clave_rastreo || '',
          monto: ultimoPagoSTP.monto
        } : null}
      />
    </div>
  );
}
