import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { format, startOfWeek, addDays, isSameDay, parseISO, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";

interface ReservasCalendarProps {
  reservas: any[];
  isLoading: boolean;
}

export const ReservasCalendar = ({ reservas, isLoading }: ReservasCalendarProps) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Lunes
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Generar horarios de 8:00 a 20:00
  const timeSlots = Array.from({ length: 13 }, (_, i) => i + 8);

  const getReservasForDayAndTime = (day: Date, hour: number) => {
    return reservas.filter((reserva) => {
      const reservaDate = parseISO(reserva.fecha_reserva);
      const reservaHour = parseInt(reserva.hora_reserva.split(":")[0]);
      return isSameDay(reservaDate, day) && reservaHour === hour;
    });
  };

  const getReservaColor = (estatusId: number) => {
    const colors: Record<number, string> = {
      1: "bg-blue-500/20 border-blue-500", // Agendada
      2: "bg-green-500/20 border-green-500", // Confirmada
      3: "bg-red-500/20 border-red-500", // Cancelada
      4: "bg-purple-500/20 border-purple-500", // Completada
    };
    return colors[estatusId] || "bg-gray-500/20 border-gray-500";
  };

  const countReservasByDay = (day: Date) => {
    return reservas.filter((reserva) => {
      const reservaDate = parseISO(reserva.fecha_reserva);
      return isSameDay(reservaDate, day);
    }).length;
  };

  if (isLoading) {
    return <Card className="p-8 text-center">Cargando calendario...</Card>;
  }

  return (
    <Card className="p-6">
      <div className="space-y-4">
        {/* Header con navegación */}
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-semibold">
            {format(weekStart, "d 'de' MMMM", { locale: es })} - {format(addDays(weekStart, 6), "d 'de' MMMM, yyyy", { locale: es })}
          </h3>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(subWeeks(currentWeek, 1))}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(new Date())}
            >
              Hoy
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCurrentWeek(addWeeks(currentWeek, 1))}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Calendario */}
        <div className="border rounded-lg overflow-auto">
          <div className="grid grid-cols-8 min-w-[800px]">
            {/* Header con días */}
            <div className="border-b p-2 bg-muted/50"></div>
            {weekDays.map((day, i) => (
              <div key={i} className="border-b border-l p-2 text-center bg-muted/50">
                <div className="font-semibold text-sm">
                  {format(day, "EEE", { locale: es }).toUpperCase()}
                </div>
                <div className="text-2xl font-bold">{format(day, "d")}</div>
                {countReservasByDay(day) > 0 && (
                  <div className="flex gap-1 justify-center mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {countReservasByDay(day)}
                    </Badge>
                  </div>
                )}
              </div>
            ))}

            {/* Filas de horarios */}
            {timeSlots.map((hour) => (
              <>
                <div key={`time-${hour}`} className="border-b border-r p-2 text-sm font-medium bg-muted/30 flex items-start">
                  {hour}:00
                </div>
                {weekDays.map((day, dayIndex) => {
                  const dayReservas = getReservasForDayAndTime(day, hour);
                  return (
                    <div
                      key={`${dayIndex}-${hour}`}
                      className="border-b border-l p-1 min-h-[80px] relative"
                    >
                      {dayReservas.map((reserva, idx) => (
                        <div
                          key={idx}
                          className={`rounded border p-1 mb-1 text-xs ${getReservaColor(reserva.id_estatus_reserva)}`}
                        >
                          <div className="font-medium truncate">
                            {reserva.acuerdos_pago?.cuentas_cobranza?.ofertas?.personas?.nombre || "N/A"}
                          </div>
                          <div className="text-muted-foreground truncate">
                            {reserva.espacios_reservables_edificio?.tipos_espacio_reservables?.nombre || "Espacio"}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}
              </>
            ))}
          </div>
        </div>
      </div>
    </Card>
  );
};
