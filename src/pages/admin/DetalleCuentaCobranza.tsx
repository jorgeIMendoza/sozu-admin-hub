import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ArrowLeft, FileText, DollarSign, CalendarDays, ChevronDown, ChevronUp } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

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
    clave_rastreo: string | null;
  };
}

interface CuentaDetalle {
  id: number;
  clabe_stp: string | null;
  precio_final: number;
  es_aprobado: boolean;
  fecha_compra: string;
  compradores: string[];
  proyecto: string;
  edificio: string;
  numero_propiedad: string;
  modelo: string;
  dueno: string;
}

export default function DetalleCuentaCobranza() {
  const { id } = useParams<{ id: string }>();
  const cuentaId = parseInt(id || '0');
  const [openAcuerdos, setOpenAcuerdos] = useState<{ [key: number]: boolean }>({});

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
          propiedades!ofertas_id_propiedad_fkey(
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
          personas!compradores_id_persona_fkey(nombre_legal)
        `)
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true);

      // Get project and building info
      const [entidadResult, edificioModeloResult, duenoResult] = await Promise.all([
        supabase
          .from('entidades_relacionadas')
          .select(`
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
        compradores: compradores?.map(c => c.personas?.nombre_legal).filter(Boolean) || [],
        proyecto: entidadResult.data?.proyectos?.nombre || 'Sin proyecto',
        edificio: edificioModeloResult.data?.edificios?.nombre || 'Sin edificio',
        numero_propiedad: oferta?.propiedades?.numero_propiedad || 'Sin número',
        modelo: edificioModeloResult.data?.modelos?.nombre || 'Sin modelo',
        dueno: duenoResult.data?.personas?.nombre_legal || 'Sin dueño'
      };

      return detalle;
    },
    enabled: !!cuentaId,
  });

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
          id_concepto
        `)
        .eq('id_cuenta_cobranza', cuentaId)
        .eq('activo', true)
        .order('orden');

      if (acuerdosError) throw acuerdosError;

      if (!acuerdos || acuerdos.length === 0) return [];

      // Get conceptos de pago
      const conceptoIds = acuerdos.map(a => a.id_concepto);
      const { data: conceptos } = await supabase
        .from('conceptos_pago')
        .select('id, nombre')
        .in('id', conceptoIds);

      // Get aplicaciones de pago for each acuerdo
      const acuerdoIds = acuerdos.map(a => a.id);
      const { data: aplicaciones } = await supabase
        .from('aplicaciones_pago')
        .select(`
          id,
          monto,
          fecha_creacion,
          id_acuerdo_pago,
          id_pago
        `)
        .in('id_acuerdo_pago', acuerdoIds)
        .eq('activo', true);

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
        
        // Calculate if payment is completed
        const totalAplicado = acuerdoAplicaciones.reduce((sum, app) => sum + app.monto, 0);
        const pagoCompletado = totalAplicado >= acuerdo.monto;
        
        return {
          id: acuerdo.id,
          orden: acuerdo.orden,
          monto: acuerdo.monto,
          fecha_pago: acuerdo.fecha_pago,
          pago_completado: pagoCompletado,
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
          })
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
          <Link to="/admin/pagos">
            <ArrowLeft className="h-4 w-4" />
          </Link>
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Detalle Cuenta de Cobranza #{cuentaDetalle.id}</h1>
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
            <p className="text-xs text-muted-foreground">
              {((totalPagado / (cuentaDetalle.precio_final || 1)) * 100).toFixed(1)}% del total
            </p>
          </CardContent>
        </Card>

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
              <div className="flex flex-wrap gap-2 mt-2">
                {cuentaDetalle.compradores.map((comprador, index) => (
                  <Badge key={index} variant="secondary">{comprador}</Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Acuerdos de pago */}
      <Card>
        <CardHeader>
          <CardTitle>Acuerdos de Pago y Aplicaciones</CardTitle>
        </CardHeader>
        <CardContent>
          {acuerdosPago && acuerdosPago.length > 0 ? (
            <div className="space-y-4">
              {acuerdosPago.map((acuerdo) => {
                const totalAplicado = acuerdo.aplicaciones.reduce((sum, app) => sum + app.monto, 0);
                const isOpen = openAcuerdos[acuerdo.id];
                
                return (
                  <Collapsible key={acuerdo.id} open={isOpen} onOpenChange={() => toggleAcuerdo(acuerdo.id)}>
                    <div className="border rounded-lg">
                      <CollapsibleTrigger asChild>
                        <div className="w-full p-4 flex items-center justify-between hover:bg-muted/50 cursor-pointer">
                          <div className="flex-1">
                            <div className="flex items-center justify-between mb-2">
                              <h4 className="font-semibold">Pago #{acuerdo.orden} - {acuerdo.concepto}</h4>
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
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {acuerdo.aplicaciones.map((aplicacion) => (
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
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          ) : (
                            <div className="text-center py-4 text-muted-foreground">
                              No hay pagos aplicados a este acuerdo
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
    </div>
  );
}