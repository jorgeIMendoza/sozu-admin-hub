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
      const { data, error } = await supabase
        .from("cuentas_cobranza")
        .select(`
          id,
          precio_final,
          porcentaje_comision_venta,
          monto_comision_pagado,
          fecha_pago_comision,
          es_comision_venta_efectivo,
          es_pagada_comision_venta,
          id_oferta,
          ofertas!fk_ccob_oferta (
            id_propiedad,
            id_producto,
            propiedades!ofertas_id_propiedad_fkey (
              id,
              numero_departamento,
              edificios!propiedades_id_edificio_modelo_fkey (
                id,
                nombre,
                proyectos!edificios_id_proyecto_fkey (
                  id,
                  nombre
                )
              )
            ),
            productos!ofertas_id_producto_fkey (
              id,
              nombre
            )
          )
        `)
        .is("id_cuenta_cobranza_padre", null)
        .order("id", { ascending: false });

      if (error) throw error;
      return data;
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
              {comisiones?.map((comision) => {
                const oferta = comision.ofertas as any;
                const propiedad = oferta?.propiedades;
                const producto = oferta?.productos;
                const edificio = propiedad?.edificios;
                const proyecto = edificio?.proyectos;
                
                const montoComision = (comision.precio_final * comision.porcentaje_comision_venta) / 100;

                return (
                  <TableRow key={comision.id}>
                    <TableCell className="font-medium">
                      {formatCuentaCobranzaId(comision.id)}
                    </TableCell>
                    <TableCell>{proyecto?.nombre || "-"}</TableCell>
                    <TableCell>{edificio?.nombre || "-"}</TableCell>
                    <TableCell>
                      {propiedad?.numero_departamento || producto?.nombre || "-"}
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
