import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCuentaCobranzaId } from "@/utils/cuentaCobranzaUtils";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Comisiones() {
  const [filtroGeneral, setFiltroGeneral] = useState("");
  const [filtroId, setFiltroId] = useState("");
  const [filtroTipo, setFiltroTipo] = useState<string>("todos");
  const [filtroProyecto, setFiltroProyecto] = useState<string>("todos");
  const [filtroEdificio, setFiltroEdificio] = useState<string>("todos");
  const [filtroModelo, setFiltroModelo] = useState<string>("todos");
  const [filtroNumero, setFiltroNumero] = useState("");
  const [filtroEstatus, setFiltroEstatus] = useState<string>("todos");

  const { data: comisiones, isLoading } = useQuery({
    queryKey: ["comisiones"],
    queryFn: async () => {
      // Paso 1: Obtener cuentas de cobranza básicas (sin mantenimiento)
      const { data: cuentas, error: cuentasError } = await supabase
        .from("cuentas_cobranza")
        .select(`
          id,
          precio_final,
          porcentaje_comision_venta,
          monto_comision_pagado,
          fecha_pago_comision,
          es_comision_venta_efectivo,
          es_pagada_comision_venta,
          id_oferta
        `)
        .is("id_cuenta_cobranza_padre", null)
        .order("id", { ascending: false });

      if (cuentasError) throw cuentasError;
      if (!cuentas || cuentas.length === 0) return [];

      // Paso 1.5: Filtrar solo cuentas con enganche completo pagado
      const cuentaIds = cuentas.map((c) => c.id);
      
      // Obtener acuerdos de enganche (id_concepto = 2) no completados
      const { data: acuerdosEnganchePendientes, error: acuerdosError } = await supabase
        .from("acuerdos_pago")
        .select("id_cuenta_cobranza")
        .in("id_cuenta_cobranza", cuentaIds)
        .eq("id_concepto", 2) // Enganche
        .eq("pago_completado", false)
        .eq("activo", true);

      if (acuerdosError) throw acuerdosError;

      // IDs de cuentas con enganche pendiente
      const cuentasConEnganchePendiente = new Set(
        acuerdosEnganchePendientes?.map((a) => a.id_cuenta_cobranza) || []
      );

      // Filtrar solo cuentas que NO tienen enganche pendiente Y que tienen al menos un acuerdo de enganche
      const { data: acuerdosEnganches, error: acuerdosEngancheError } = await supabase
        .from("acuerdos_pago")
        .select("id_cuenta_cobranza")
        .in("id_cuenta_cobranza", cuentaIds)
        .eq("id_concepto", 2)
        .eq("activo", true);

      if (acuerdosEngancheError) throw acuerdosEngancheError;

      const cuentasConEnganche = new Set(
        acuerdosEnganches?.map((a) => a.id_cuenta_cobranza) || []
      );

      // Solo incluir cuentas que tienen enganche Y lo tienen completo
      const cuentasFiltradas = cuentas.filter(
        (c) => cuentasConEnganche.has(c.id) && !cuentasConEnganchePendiente.has(c.id)
      );

      if (cuentasFiltradas.length === 0) return [];

      // Paso 2: Obtener ofertas relacionadas
      const ofertaIds = cuentasFiltradas.map((c) => c.id_oferta).filter((id) => id !== null);
      
      const { data: ofertas, error: ofertasError } = ofertaIds.length > 0 
        ? await supabase
            .from("ofertas")
            .select(`
              id,
              id_propiedad,
              id_producto
            `)
            .in("id", ofertaIds)
        : { data: [], error: null };

      if (ofertasError) throw ofertasError;

      // Paso 3: Obtener propiedades y modelos relacionados
      const propiedadIds = ofertas?.filter((o) => o.id_propiedad).map((o) => o.id_propiedad) || [];
      
      const { data: propiedades, error: propiedadesError } = propiedadIds.length > 0
        ? await supabase
            .from("propiedades")
            .select(`
              id,
              numero_propiedad,
              id_edificio_modelo
            `)
            .in("id", propiedadIds)
        : { data: [], error: null };

      if (propiedadesError) throw propiedadesError;

      // Paso 4: Obtener edificios y modelos
      const edificioModeloIds = propiedades?.map((p) => p.id_edificio_modelo).filter(Boolean) || [];
      
      const { data: edificiosModelos, error: edificiosModelosError } = edificioModeloIds.length > 0
        ? await supabase
            .from("edificios_modelos")
            .select(`
              id,
              id_edificio,
              modelos!edificios_modelos_id_modelo_fkey(nombre)
            `)
            .in("id", edificioModeloIds)
        : { data: [], error: null };

      if (edificiosModelosError) throw edificiosModelosError;
      const edificioIdsReal = edificiosModelos?.map((em) => em.id_edificio).filter(Boolean) || [];
      
      const { data: edificiosData, error: edificiosDataError } = edificioIdsReal.length > 0
        ? await supabase
            .from("edificios")
            .select(`
              id,
              nombre,
              id_proyecto
            `)
            .in("id", edificioIdsReal)
        : { data: [], error: null };

      if (edificiosDataError) throw edificiosDataError;

      // Paso 5: Obtener proyectos
      const proyectoIds = edificiosData?.map((e) => e.id_proyecto).filter(Boolean) || [];
      
      const { data: proyectos, error: proyectosError } = proyectoIds.length > 0
        ? await supabase
            .from("proyectos")
            .select(`
              id,
              nombre
            `)
            .in("id", proyectoIds)
        : { data: [], error: null };

      if (proyectosError) throw proyectosError;

      // Paso 6: Obtener productos con categorías
      const productoIds = ofertas?.filter((o) => o.id_producto).map((o) => o.id_producto) || [];
      
      const { data: productos, error: productosError } = productoIds.length > 0
        ? await supabase
            .from("productos_servicios")
            .select(`
              id,
              nombre,
              id_categoria,
              categorias_producto!productos_servicios_id_categoria_fkey(nombre)
            `)
            .in("id", productoIds)
        : { data: [], error: null };

      if (productosError) throw productosError;

      // Paso 7: Combinar todos los datos
      return cuentasFiltradas.map((cuenta) => {
        const oferta = ofertas?.find((o) => o.id === cuenta.id_oferta);
        const propiedad = propiedades?.find((p) => p.id === oferta?.id_propiedad);
        const edificioModelo = edificiosModelos?.find((em) => em.id === propiedad?.id_edificio_modelo);
        const edificio = edificiosData?.find((e) => e.id === edificioModelo?.id_edificio);
        const proyecto = proyectos?.find((pr) => pr.id === edificio?.id_proyecto);
        const producto = productos?.find((prod) => prod.id === oferta?.id_producto);

        // Determinar tipo de cuenta
        let tipo: 'Propiedad' | 'Producto' | 'Servicio' = 'Propiedad';
        if (oferta?.id_producto && producto) {
          const categoriaNombre = producto.categorias_producto?.nombre?.toLowerCase();
          tipo = categoriaNombre === 'servicios' ? 'Servicio' : 'Producto';
        }

        return {
          ...cuenta,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          modelo_nombre: edificioModelo?.modelos?.nombre,
          numero_departamento: propiedad?.numero_propiedad,
          producto_nombre: producto?.nombre,
          tipo: tipo,
        };
      });
    },
  });

  const formatMonto = (monto: number) => {
    return new Intl.NumberFormat("es-MX", {
      style: "currency",
      currency: "MXN",
    }).format(monto);
  };

  // Aplicar filtros
  const comisionesFiltradas = comisiones?.filter((comision: any) => {
    // Filtro general
    if (filtroGeneral) {
      const searchTerm = filtroGeneral.toLowerCase();
      const matchId = formatCuentaCobranzaId(comision.id, comision.tipo).toLowerCase().includes(searchTerm);
      const matchProyecto = comision.proyecto_nombre?.toLowerCase().includes(searchTerm);
      const matchNumero = (comision.numero_departamento || comision.producto_nombre || "").toLowerCase().includes(searchTerm);
      const matchModelo = comision.modelo_nombre?.toLowerCase().includes(searchTerm);
      
      if (!matchId && !matchProyecto && !matchNumero && !matchModelo) {
        return false;
      }
    }

    // Filtro por ID
    if (filtroId && !formatCuentaCobranzaId(comision.id, comision.tipo).includes(filtroId)) {
      return false;
    }

    // Filtro por tipo
    if (filtroTipo !== "todos" && comision.tipo !== filtroTipo) {
      return false;
    }

    // Filtro por proyecto
    if (filtroProyecto !== "todos" && comision.proyecto_nombre !== filtroProyecto) {
      return false;
    }

    // Filtro por edificio
    if (filtroEdificio !== "todos" && comision.edificio_nombre !== filtroEdificio) {
      return false;
    }

    // Filtro por modelo
    if (filtroModelo !== "todos" && comision.modelo_nombre !== filtroModelo) {
      return false;
    }

    // Filtro por número
    if (filtroNumero) {
      const numero = (comision.numero_departamento || comision.producto_nombre || "").toLowerCase();
      if (!numero.includes(filtroNumero.toLowerCase())) {
        return false;
      }
    }

    // Filtro por estatus
    if (filtroEstatus !== "todos") {
      const esPagado = comision.es_pagada_comision_venta;
      if (filtroEstatus === "pagado" && !esPagado) {
        return false;
      }
      if (filtroEstatus === "pendiente" && esPagado) {
        return false;
      }
    }

    return true;
  }) || [];

  // Obtener valores únicos para los filtros
  const proyectosUnicos = [...new Set(comisiones?.map((c: any) => c.proyecto_nombre).filter(Boolean))] as string[];
  const edificiosUnicos = [...new Set(comisiones?.map((c: any) => c.edificio_nombre).filter(Boolean))] as string[];
  const modelosUnicos = [...new Set(comisiones?.map((c: any) => c.modelo_nombre).filter(Boolean))] as string[];

  if (isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>Comisiones</CardTitle>
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

  return (
    <div className="container mx-auto py-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Comisiones</CardTitle>
            <Badge variant="outline" className="text-lg px-4 py-1">
              {comisionesFiltradas.length} cuenta{comisionesFiltradas.length !== 1 ? 's' : ''}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {/* Filtros */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="md:col-span-4">
              <input
                type="text"
                placeholder="Buscar por ID, proyecto, número o modelo..."
                value={filtroGeneral}
                onChange={(e) => setFiltroGeneral(e.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              />
            </div>
            
            <input
              type="text"
              placeholder="Filtrar por ID..."
              value={filtroId}
              onChange={(e) => setFiltroId(e.target.value)}
              className="px-3 py-2 border rounded-md"
            />

            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="todos">Todos los tipos</option>
              <option value="Propiedad">Propiedad</option>
              <option value="Producto">Producto</option>
              <option value="Servicio">Servicio</option>
            </select>

            <select
              value={filtroProyecto}
              onChange={(e) => setFiltroProyecto(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="todos">Todos los proyectos</option>
              {proyectosUnicos.map((proyecto) => (
                <option key={proyecto} value={proyecto}>
                  {proyecto}
                </option>
              ))}
            </select>

            <select
              value={filtroEdificio}
              onChange={(e) => setFiltroEdificio(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="todos">Todos los edificios</option>
              {edificiosUnicos.map((edificio) => (
                <option key={edificio} value={edificio}>
                  {edificio}
                </option>
              ))}
            </select>

            <select
              value={filtroModelo}
              onChange={(e) => setFiltroModelo(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="todos">Todos los modelos</option>
              {modelosUnicos.map((modelo) => (
                <option key={modelo} value={modelo}>
                  {modelo}
                </option>
              ))}
            </select>

            <input
              type="text"
              placeholder="Filtrar por número..."
              value={filtroNumero}
              onChange={(e) => setFiltroNumero(e.target.value)}
              className="px-3 py-2 border rounded-md"
            />

            <select
              value={filtroEstatus}
              onChange={(e) => setFiltroEstatus(e.target.value)}
              className="px-3 py-2 border rounded-md"
            >
              <option value="todos">Todos los estatus</option>
              <option value="pagado">Pagado</option>
              <option value="pendiente">Pendiente</option>
            </select>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. Cuenta</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Edificio</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>No. Departamento</TableHead>
                <TableHead>Monto</TableHead>
                <TableHead>% Comisión</TableHead>
                <TableHead>Monto Comisión Pagado</TableHead>
                <TableHead>Fecha Pago</TableHead>
                <TableHead>En Efectivo</TableHead>
                <TableHead>Estatus</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {comisionesFiltradas?.map((comision: any) => {
                return (
                  <TableRow key={comision.id}>
                    <TableCell className="font-medium">
                      {formatCuentaCobranzaId(comision.id, comision.tipo)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{comision.tipo}</Badge>
                    </TableCell>
                    <TableCell>{comision.proyecto_nombre || "-"}</TableCell>
                    <TableCell>{comision.edificio_nombre || "-"}</TableCell>
                    <TableCell>{comision.modelo_nombre || "-"}</TableCell>
                    <TableCell>
                      {comision.numero_departamento || comision.producto_nombre || "-"}
                    </TableCell>
                    <TableCell>{formatMonto(comision.precio_final)}</TableCell>
                    <TableCell>{comision.porcentaje_comision_venta}%</TableCell>
                    <TableCell>
                      {formatMonto(comision.monto_comision_pagado)}
                    </TableCell>
                    <TableCell>
                      {comision.fecha_pago_comision
                        ? format(new Date(comision.fecha_pago_comision), "dd/MMM/yyyy", {
                            locale: es,
                          })
                        : "-"}
                    </TableCell>
                    <TableCell>
                      {comision.es_comision_venta_efectivo ? (
                        <Badge variant="secondary">Sí</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {comision.es_pagada_comision_venta ? (
                        <Badge variant="default">Pagado</Badge>
                      ) : (
                        <Badge variant="destructive">Pendiente</Badge>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
