import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { ChevronDown, ChevronRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function AprobacionComisiones() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [expandedCuentas, setExpandedCuentas] = useState<Set<number>>(new Set());
  const [activeTab, setActiveTab] = useState("pendientes");

  const toggleCuenta = (cuentaId: number) => {
    const newExpanded = new Set(expandedCuentas);
    if (newExpanded.has(cuentaId)) {
      newExpanded.delete(cuentaId);
    } else {
      newExpanded.add(cuentaId);
    }
    setExpandedCuentas(newExpanded);
  };

  const aprobarComisionistaMutation = useMutation({
    mutationFn: async ({ email, idCuenta }: { email: string; idCuenta: number }) => {
      const { error } = await supabase
        .from("comisionistas")
        .update({ aprobada: true })
        .eq("email_usuario", email)
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aprobacion-comisiones"] });
      toast({
        title: "Comisionista aprobado",
        description: "La comisión ha sido aprobada exitosamente"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al aprobar la comisión",
        variant: "destructive"
      });
      console.error("Error al aprobar comisionista:", error);
    }
  });

  const aprobarTodosComisionistasMutation = useMutation({
    mutationFn: async (idCuenta: number) => {
      const { error } = await supabase
        .from("comisionistas")
        .update({ aprobada: true })
        .eq("id_cuenta_cobranza", idCuenta)
        .eq("activo", true)
        .eq("aprobada", false);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["aprobacion-comisiones"] });
      toast({
        title: "Comisionistas aprobados",
        description: "Todas las comisiones han sido aprobadas exitosamente"
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "Hubo un error al aprobar las comisiones",
        variant: "destructive"
      });
      console.error("Error al aprobar comisionistas:", error);
    }
  });

  const { data: cuentasConComisionistas, isLoading } = useQuery({
    queryKey: ["aprobacion-comisiones"],
    queryFn: async () => {
      // Paso 1: Obtener cuentas donde la comisión está pagada
      const { data: cuentas, error: cuentasError } = await supabase
        .from("cuentas_cobranza")
        .select(`
          id,
          precio_final,
          porcentaje_comision_venta,
          iva_incluido,
          id_oferta
        `)
        .eq("es_pagada_comision_venta", true)
        .is("id_cuenta_cobranza_padre", null)
        .order("id", { ascending: false });

      if (cuentasError) throw cuentasError;
      if (!cuentas || cuentas.length === 0) return [];

      // Paso 2: Obtener ofertas relacionadas
      const ofertaIds = cuentas.map(c => c.id_oferta).filter(id => id !== null);
      const { data: ofertas, error: ofertasError } = ofertaIds.length > 0
        ? await supabase.from("ofertas").select(`
            id,
            id_propiedad,
            id_producto
          `).in("id", ofertaIds)
        : { data: [], error: null };

      if (ofertasError) throw ofertasError;

      // Paso 3: Obtener propiedades y modelos
      const propiedadIds = ofertas?.filter(o => o.id_propiedad).map(o => o.id_propiedad) || [];
      const { data: propiedades, error: propiedadesError } = propiedadIds.length > 0
        ? await supabase.from("propiedades").select(`
            id,
            numero_propiedad,
            id_edificio_modelo
          `).in("id", propiedadIds)
        : { data: [], error: null };

      if (propiedadesError) throw propiedadesError;

      // Paso 4: Obtener edificios y modelos
      const edificioModeloIds = propiedades?.map(p => p.id_edificio_modelo).filter(Boolean) || [];
      const { data: edificiosModelos, error: edificiosModelosError } = edificioModeloIds.length > 0
        ? await supabase.from("edificios_modelos").select(`
            id,
            id_edificio,
            modelos!edificios_modelos_id_modelo_fkey(nombre)
          `).in("id", edificioModeloIds)
        : { data: [], error: null };

      if (edificiosModelosError) throw edificiosModelosError;

      const edificioIdsReal = edificiosModelos?.map(em => em.id_edificio).filter(Boolean) || [];
      const { data: edificiosData, error: edificiosDataError } = edificioIdsReal.length > 0
        ? await supabase.from("edificios").select(`
            id,
            nombre,
            id_proyecto
          `).in("id", edificioIdsReal)
        : { data: [], error: null };

      if (edificiosDataError) throw edificiosDataError;

      // Paso 5: Obtener proyectos
      const proyectoIds = edificiosData?.map(e => e.id_proyecto).filter(Boolean) || [];
      const { data: proyectos, error: proyectosError } = proyectoIds.length > 0
        ? await supabase.from("proyectos").select(`
            id,
            nombre
          `).in("id", proyectoIds)
        : { data: [], error: null };

      if (proyectosError) throw proyectosError;

      // Paso 6: Obtener productos
      const productoIds = ofertas?.filter(o => o.id_producto).map(o => o.id_producto) || [];
      const { data: productos, error: productosError } = productoIds.length > 0
        ? await supabase.from("productos_servicios").select(`
            id,
            nombre,
            id_categoria,
            categorias_producto!productos_servicios_id_categoria_fkey(nombre)
          `).in("id", productoIds)
        : { data: [], error: null };

      if (productosError) throw productosError;

      // Paso 7: Obtener comisionistas para todas las cuentas
      const cuentaIds = cuentas.map(c => c.id);
      const { data: comisionistas, error: comisionistasError } = await supabase
        .from("comisionistas")
        .select("*")
        .in("id_cuenta_cobranza", cuentaIds)
        .eq("activo", true);

      if (comisionistasError) throw comisionistasError;

      // Paso 8: Combinar datos
      return cuentas.map(cuenta => {
        const oferta = ofertas?.find(o => o.id === cuenta.id_oferta);
        const propiedad = propiedades?.find(p => p.id === oferta?.id_propiedad);
        const edificioModelo = edificiosModelos?.find(em => em.id === propiedad?.id_edificio_modelo);
        const edificio = edificiosData?.find(e => e.id === edificioModelo?.id_edificio);
        const proyecto = proyectos?.find(pr => pr.id === edificio?.id_proyecto);
        const producto = productos?.find(prod => prod.id === oferta?.id_producto);

        let tipo: 'Propiedad' | 'Producto' | 'Servicio' = 'Propiedad';
        if (oferta?.id_producto && producto) {
          const categoriaNombre = producto.categorias_producto?.nombre?.toLowerCase();
          tipo = categoriaNombre === 'servicios' ? 'Servicio' : 'Producto';
        }

        const comisionistasFiltered = comisionistas?.filter(c => c.id_cuenta_cobranza === cuenta.id) || [];

        return {
          ...cuenta,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          modelo_nombre: edificioModelo?.modelos?.nombre,
          numero_departamento: propiedad?.numero_propiedad,
          producto_nombre: producto?.nombre,
          tipo,
          comisionistas: comisionistasFiltered
        };
      });
    }
  });

  const formatMonto = (monto: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN"
    }).format(monto);
  };

  // Aplicar filtros
  const cuentasFiltradas = cuentasConComisionistas?.filter((cuenta: any) => {
    if (filtroGeneral) {
      const searchTerm = filtroGeneral.toLowerCase();
      const matchId = formatCuentaCobranzaId(cuenta.id, cuenta.tipo).toLowerCase().includes(searchTerm);
      const matchProyecto = cuenta.proyecto_nombre?.toLowerCase().includes(searchTerm);
      const matchNumero = (cuenta.numero_departamento || cuenta.producto_nombre || "").toLowerCase().includes(searchTerm);
      const matchModelo = cuenta.modelo_nombre?.toLowerCase().includes(searchTerm);
      
      if (!matchId && !matchProyecto && !matchNumero && !matchModelo) {
        return false;
      }
    }
    return true;
  }) || [];

  // Separar en pendientes y completas
    const cuentasPendientes = cuentasFiltradas.filter((cuenta: any) => 
      cuenta.comisionistas.length === 0 || cuenta.comisionistas.some((c: any) => !c.aprobada)
    );

    const cuentasCompletas = cuentasFiltradas.filter((cuenta: any) => 
      cuenta.comisionistas.length > 0 && cuenta.comisionistas.every((c: any) => c.aprobada)
    );

  // Calcular totales
  const calcularPorcentajeTotalComisiones = (cuenta: any) => {
    const totalPorcentaje = cuenta.comisionistas.reduce((sum: number, c: any) => sum + (c.porcentaje_comision || 0), 0);
    return totalPorcentaje;
  };

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Aprobación de Comisiones</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
              <Skeleton className="h-12 w-full" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const renderCuentasTable = (cuentas: any[], isPendientes: boolean) => (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-12"></TableHead>
          <TableHead>No. Cuenta</TableHead>
          <TableHead>Tipo</TableHead>
          <TableHead>Proyecto</TableHead>
          <TableHead>Edificio</TableHead>
          <TableHead>Modelo</TableHead>
          <TableHead>No. Departamento</TableHead>
          <TableHead>Precio final</TableHead>
          <TableHead>Comisión Total</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {cuentas.length === 0 ? (
          <TableRow>
            <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
              No hay cuentas {isPendientes ? 'pendientes' : 'completas'}
            </TableCell>
          </TableRow>
        ) : (
          cuentas.map((cuenta: any) => {
            const isExpanded = expandedCuentas.has(cuenta.id);
            const comisionistasPendientes = cuenta.comisionistas.filter((c: any) => !c.aprobada);
            const porcentajeTotalPendiente = calcularPorcentajeTotalComisiones(cuenta);
            const tieneComisionistas = cuenta.comisionistas.length > 0;
            
            return (
              <>
                <TableRow key={cuenta.id} className="cursor-pointer hover:bg-accent/50">
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {isExpanded ? (
                      <ChevronDown className="h-4 w-4" />
                    ) : (
                      <ChevronRight className="h-4 w-4" />
                    )}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)} className="font-medium">
                    {formatCuentaCobranzaId(cuenta.id, cuenta.tipo)}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    <Badge variant="outline">{cuenta.tipo}</Badge>
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.proyecto_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.edificio_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.modelo_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {cuenta.numero_departamento || cuenta.producto_nombre || "-"}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    {formatMonto(cuenta.precio_final)}
                  </TableCell>
                  <TableCell onClick={() => toggleCuenta(cuenta.id)}>
                    <div className="space-y-1">
                      <div className="font-medium">{formatMonto((cuenta.precio_final * porcentajeTotalPendiente) / 100)}</div>
                      <Badge variant={porcentajeTotalPendiente > 0 ? "default" : "secondary"}>
                        {porcentajeTotalPendiente.toFixed(2)}%
                      </Badge>
                    </div>
                  </TableCell>
                </TableRow>
                
                {isExpanded && (
                  <TableRow>
                    <TableCell colSpan={9} className="bg-muted/30 p-6">
                      <div className="space-y-4">
                        {!tieneComisionistas ? (
                          <div className="text-center py-4 text-muted-foreground">
                            No se han configurado comisionistas para esta cuenta
                          </div>
                        ) : (
                          <>
                            {isPendientes && comisionistasPendientes.length > 0 && (
                              <div className="flex justify-end mb-4">
                                <Button
                                  onClick={() => aprobarTodosComisionistasMutation.mutate(cuenta.id)}
                                  disabled={aprobarTodosComisionistasMutation.isPending}
                                >
                                  Aprobar Todos
                                </Button>
                              </div>
                            )}

                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Email Comisionista</TableHead>
                                  <TableHead>Comisión</TableHead>
                                  <TableHead>Estado</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {cuenta.comisionistas.map((comisionista: any) => {
                                  const montoBase = (cuenta.precio_final * comisionista.porcentaje_comision) / 100;
                                  const montoFinal = cuenta.iva_incluido ? montoBase * 1.16 : montoBase;
                                  
                                  return (
                                    <TableRow key={comisionista.email_usuario}>
                                      <TableCell>{comisionista.email_usuario}</TableCell>
                                      <TableCell>
                                        <div className="space-y-1">
                                          <div className="font-medium">{formatMonto(montoFinal)}</div>
                                          <Badge variant="outline">
                                            {comisionista.porcentaje_comision.toFixed(2)}%
                                          </Badge>
                                        </div>
                                      </TableCell>
                                      <TableCell>
                                        {comisionista.aprobada ? (
                                          <Badge variant="secondary" className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100">
                                            <Check className="h-3 w-3 mr-1" />
                                            Aprobado
                                          </Badge>
                                        ) : isPendientes ? (
                                          <Button
                                            size="sm"
                                            onClick={() => aprobarComisionistaMutation.mutate({
                                              email: comisionista.email_usuario,
                                              idCuenta: cuenta.id
                                            })}
                                            disabled={aprobarComisionistaMutation.isPending}
                                          >
                                            <Check className="h-4 w-4 mr-2" />
                                            Aprobar
                                          </Button>
                                        ) : null}
                                      </TableCell>
                                    </TableRow>
                                  );
                                })}
                                {cuenta.comisionistas.length > 0 && (
                                  <TableRow className="font-semibold bg-muted/50">
                                    <TableCell>Total a dispersar</TableCell>
                                    <TableCell>
                                      <div className="space-y-1">
                                        <div className="font-bold">{formatMonto((cuenta.precio_final * porcentajeTotalPendiente) / 100)}</div>
                                        <Badge variant="default">
                                          {porcentajeTotalPendiente.toFixed(2)}%
                                        </Badge>
                                      </div>
                                    </TableCell>
                                    <TableCell></TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </>
            );
          })
        )}
      </TableBody>
    </Table>
  );

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <CardTitle>Aprobación de Comisiones</CardTitle>
        </CardHeader>
        <CardContent>
          {/* Filtro General */}
          <div className="mb-6">
            <Input
              type="text"
              placeholder="Buscar por ID, proyecto, número o modelo..."
              value={filtroGeneral}
              onChange={(e) => setFiltroGeneral(e.target.value)}
            />
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="pendientes">
                Aprobaciones Pendientes
                <Badge variant="outline" className="ml-2">
                  {cuentasPendientes.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="completas">
                Aprobaciones Completas
                <Badge variant="outline" className="ml-2">
                  {cuentasCompletas.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="pendientes">
              {renderCuentasTable(cuentasPendientes, true)}
            </TabsContent>

            <TabsContent value="completas">
              {renderCuentasTable(cuentasCompletas, false)}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
