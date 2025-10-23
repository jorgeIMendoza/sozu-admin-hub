import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Search, Filter, Pencil, Trash2 } from "lucide-react";
import { format, parseISO, isToday, isFuture } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ReservasListProps {
  reservas: any[];
  isLoading: boolean;
  onDelete: (id: number) => void;
  showDeleted?: boolean;
}

export const ReservasList = ({ reservas, isLoading, onDelete, showDeleted }: ReservasListProps) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeSubTab, setActiveSubTab] = useState<"todas" | "hoy" | "proximas">("todas");

  const getFilteredReservas = () => {
    let filtered = reservas;

    // Filtrar por búsqueda
    if (searchTerm) {
      filtered = filtered.filter((r: any) => {
        const nombreCliente = `${r.acuerdos_pago?.cuentas_cobranza?.ofertas?.personas?.nombre || ""} ${r.acuerdos_pago?.cuentas_cobranza?.ofertas?.personas?.apellido_paterno || ""}`.toLowerCase();
        const espacio = r.espacios_reservables_edificio?.tipos_espacio_reservables?.nombre?.toLowerCase() || "";
        const estatus = r.estatus_reserva?.nombre?.toLowerCase() || "";
        return nombreCliente.includes(searchTerm.toLowerCase()) || 
               espacio.includes(searchTerm.toLowerCase()) ||
               estatus.includes(searchTerm.toLowerCase());
      });
    }

    // Filtrar por sub-tab
    if (activeSubTab === "hoy") {
      filtered = filtered.filter((r: any) => isToday(parseISO(r.fecha_reserva)));
    } else if (activeSubTab === "proximas") {
      filtered = filtered.filter((r: any) => {
        const fecha = parseISO(r.fecha_reserva);
        return isFuture(fecha) && !isToday(fecha);
      });
    }

    return filtered;
  };

  const filteredReservas = getFilteredReservas();

  const todayCount = reservas.filter((r: any) => isToday(parseISO(r.fecha_reserva))).length;
  const futureCount = reservas.filter((r: any) => {
    const fecha = parseISO(r.fecha_reserva);
    return isFuture(fecha) && !isToday(fecha);
  }).length;

  const getEstatusColor = (estatusNombre: string) => {
    const colors: Record<string, string> = {
      "Agendada": "bg-blue-100 text-blue-800 border-blue-300",
      "Confirmada": "bg-green-100 text-green-800 border-green-300",
      "Cancelada": "bg-red-100 text-red-800 border-red-300",
      "Completada": "bg-purple-100 text-purple-800 border-purple-300",
    };
    return colors[estatusNombre] || "bg-gray-100 text-gray-800 border-gray-300";
  };

  if (isLoading) {
    return <Card className="p-8 text-center">Cargando reservas...</Card>;
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {!showDeleted && (
          <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as any)}>
            <TabsList>
              <TabsTrigger value="todas">Todas</TabsTrigger>
              <TabsTrigger value="hoy">Hoy ({todayCount})</TabsTrigger>
              <TabsTrigger value="proximas">Próximas ({futureCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        )}

        <div className="flex gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por cliente, servicio, estatus..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          <Button variant="outline">
            <Filter className="h-4 w-4 mr-2" />
            Filtrar por estatus
          </Button>
        </div>

        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead>
                <TableHead>Espacio</TableHead>
                <TableHead>Fecha y Hora</TableHead>
                <TableHead>Costo</TableHead>
                <TableHead>Estatus</TableHead>
                <TableHead>Notas</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredReservas.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    No se encontraron reservas
                  </TableCell>
                </TableRow>
              ) : (
                filteredReservas.map((reserva) => (
                  <TableRow key={reserva.id}>
                  <TableCell className="font-medium">
                      {reserva.acuerdos_pago?.cuentas_cobranza?.ofertas?.personas?.nombre || "N/A"}{" "}
                      {reserva.acuerdos_pago?.cuentas_cobranza?.ofertas?.personas?.apellido_paterno || ""}
                    </TableCell>
                    <TableCell>{reserva.espacios_reservables_edificio?.tipos_espacio_reservables?.nombre || "N/A"}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        <div>{format(parseISO(reserva.fecha_reserva), "dd/MMM/yyyy", { locale: es })}</div>
                        <div className="text-sm text-muted-foreground">
                          {reserva.hora_reserva}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      ${Number(reserva.costo_final || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={getEstatusColor(reserva.estatus_reserva?.nombre || "")}>
                        {reserva.estatus_reserva?.nombre || "N/A"}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-[200px] truncate">
                      {reserva.espacios_reservables_edificio?.descripcion || "-"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button variant="ghost" size="sm">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => onDelete(reserva.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Card>
  );
};
