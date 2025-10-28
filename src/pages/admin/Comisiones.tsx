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
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function Comisiones() {
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

      // Paso 2: Obtener ofertas relacionadas
      const ofertaIds = cuentas.map((c) => c.id_oferta).filter((id) => id !== null);
      
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

      // Paso 3: Obtener propiedades relacionadas
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

      // Paso 4: Obtener edificios
      const edificioIds = propiedades?.map((p) => p.id_edificio_modelo).filter(Boolean) || [];
      
      const { data: edificios, error: edificiosError } = edificioIds.length > 0
        ? await supabase
            .from("edificios_modelos")
            .select(`
              id,
              id_edificio
            `)
            .in("id", edificioIds)
        : { data: [], error: null };

      if (edificiosError) throw edificiosError;

      const edificioIdsReal = edificios?.map((em) => em.id_edificio).filter(Boolean) || [];
      
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

      // Paso 6: Obtener productos
      const productoIds = ofertas?.filter((o) => o.id_producto).map((o) => o.id_producto) || [];
      
      const { data: productos, error: productosError } = productoIds.length > 0
        ? await supabase
            .from("productos_servicios")
            .select(`
              id,
              nombre
            `)
            .in("id", productoIds)
        : { data: [], error: null };

      if (productosError) throw productosError;

      // Paso 7: Combinar todos los datos
      return cuentas.map((cuenta) => {
        const oferta = ofertas?.find((o) => o.id === cuenta.id_oferta);
        const propiedad = propiedades?.find((p) => p.id === oferta?.id_propiedad);
        const edificioModelo = edificios?.find((em) => em.id === propiedad?.id_edificio_modelo);
        const edificio = edificiosData?.find((e) => e.id === edificioModelo?.id_edificio);
        const proyecto = proyectos?.find((pr) => pr.id === edificio?.id_proyecto);
        const producto = productos?.find((prod) => prod.id === oferta?.id_producto);

        return {
          ...cuenta,
          proyecto_nombre: proyecto?.nombre,
          edificio_nombre: edificio?.nombre,
          numero_departamento: propiedad?.numero_propiedad,
          producto_nombre: producto?.nombre,
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
          <CardTitle>Comisiones</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>No. Cuenta</TableHead>
                <TableHead>Proyecto</TableHead>
                <TableHead>Edificio</TableHead>
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
              {comisiones?.map((comision: any) => {
                return (
                  <TableRow key={comision.id}>
                    <TableCell className="font-medium">
                      {formatCuentaCobranzaId(comision.id)}
                    </TableCell>
                    <TableCell>{comision.proyecto_nombre || "-"}</TableCell>
                    <TableCell>{comision.edificio_nombre || "-"}</TableCell>
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
