import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle, CheckCheck } from "lucide-react";
import { format, startOfWeek, addDays, isSameDay, parseISO, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { Badge } from "@/components/ui/badge";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";

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

  const estatusConfig = {
    1: { nombre: "Agendada", icon: Clock, color: "bg-blue-500/20 border-blue-500 text-blue-700", iconColor: "text-blue-600" },
    2: { nombre: "Confirmada", icon: CheckCircle2, color: "bg-green-500/20 border-green-500 text-green-700", iconColor: "text-green-600" },
    3: { nombre: "Cancelada", icon: XCircle, color: "bg-red-500/20 border-red-500 text-red-700", iconColor: "text-red-600" },
    4: { nombre: "Completada", icon: CheckCheck, color: "bg-purple-500/20 border-purple-500 text-purple-700", iconColor: "text-purple-600" },
  };

  const getReservasForDayAndTime = (day: Date, hour: number) => {
    return reservas.filter((reserva) => {
      const reservaDate = parseISO(reserva.fecha_reserva);
      const reservaHour = parseInt(reserva.hora_reserva.split(":")[0]);
      return isSameDay(reservaDate, day) && reservaHour === hour;
    });
  };

  const calculateReservaDuration = (reserva: any) => {
    // Usar la duración del espacio reservable si existe
    if (reserva.espacios_reservables_edificio?.duracion_reserva) {
      const duration = reserva.espacios_reservables_edificio.duracion_reserva;
      // La duración viene en formato interval (ej: "05:00:00" para 5 horas)
      const hours = parseInt(duration.split(":")[0]);
      return hours || 1;
    }
    // Fallback a hora_fin si existe
    if (reserva.hora_fin) {
      const horaInicio = parseInt(reserva.hora_reserva.split(":")[0]);
      const horaFin = parseInt(reserva.hora_fin.split(":")[0]);
      return horaFin - horaInicio || 1;
    }
    return 1; // Por defecto 1 hora
  };

  const calculateEndTime = (reserva: any) => {
    const horaInicio = parseInt(reserva.hora_reserva.split(":")[0]);
    const minutosInicio = parseInt(reserva.hora_reserva.split(":")[1] || "0");
    const duracion = calculateReservaDuration(reserva);
    
    const horaFin = horaInicio + duracion;
    return `${horaFin.toString().padStart(2, '0')}:${minutosInicio.toString().padStart(2, '0')}`;
  };

  const isSlotOccupied = (day: Date, hour: number) => {
    return reservas.some((reserva) => {
      const reservaDate = parseISO(reserva.fecha_reserva);
      if (!isSameDay(reservaDate, day)) return false;
      
      const reservaHour = parseInt(reserva.hora_reserva.split(":")[0]);
      const duration = calculateReservaDuration(reserva);
      return hour > reservaHour && hour < reservaHour + duration;
    });
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

        {/* Leyenda de estatus */}
        <div className="flex items-center gap-4 p-3 bg-muted/30 rounded-lg">
          <span className="text-sm font-medium">Estatus:</span>
          {Object.entries(estatusConfig).map(([id, config]) => {
            const IconComponent = config.icon;
            return (
              <div key={id} className="flex items-center gap-1.5">
                <IconComponent className={`h-4 w-4 ${config.iconColor}`} />
                <span className="text-sm">{config.nombre}</span>
              </div>
            );
          })}
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
                  const isOccupied = isSlotOccupied(day, hour);
                  
                  return (
                    <div
                      key={`${dayIndex}-${hour}`}
                      className="border-b border-l p-1 min-h-[60px] relative"
                    >
                      {!isOccupied && dayReservas.map((reserva, idx) => {
                        const duration = calculateReservaDuration(reserva);
                        const estatusInfo = estatusConfig[reserva.id_estatus_reserva as keyof typeof estatusConfig];
                        const IconComponent = estatusInfo?.icon;
                        const heightInPixels = duration * 60 - 8; // Cada hora = 60px, menos padding
                        
                        return (
                          <HoverCard key={idx}>
                            <HoverCardTrigger asChild>
                              <div
                                className={`rounded border p-2 cursor-pointer hover:opacity-80 transition-opacity absolute left-1 right-1 ${estatusInfo?.color}`}
                                style={{ 
                                  height: `${heightInPixels}px`,
                                  zIndex: 10
                                }}
                              >
                                <div className="flex items-center gap-1.5">
                                  {IconComponent && <IconComponent className={`h-3.5 w-3.5 flex-shrink-0 ${estatusInfo.iconColor}`} />}
                                  <span className="text-xs font-medium truncate">
                                    {reserva.persona_que_reserva?.nombre_legal || "Sin nombre"}
                                  </span>
                                </div>
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80">
                              <div className="space-y-2">
                                <div className="flex items-center gap-2">
                                  {IconComponent && <IconComponent className={`h-4 w-4 ${estatusInfo.iconColor}`} />}
                                  <h4 className="text-sm font-semibold">{estatusInfo?.nombre}</h4>
                                </div>
                                <div className="space-y-1.5 text-sm">
                                  <div>
                                    <span className="font-medium">Persona que reservó:</span>
                                    <p className="text-muted-foreground">{reserva.persona_que_reserva?.nombre_legal || "N/A"}</p>
                                  </div>
                                  <div>
                                    <span className="font-medium">Horario reservado:</span>
                                    <p className="text-muted-foreground">
                                      Desde {reserva.hora_reserva} hasta {calculateEndTime(reserva)}
                                    </p>
                                  </div>
                                  <div>
                                    <span className="font-medium">Espacio reservado:</span>
                                    <p className="text-muted-foreground">
                                      {reserva.espacios_reservables_edificio?.edificios?.proyectos?.nombre || "N/A"}-
                                      {reserva.espacios_reservables_edificio?.edificios?.nombre || "N/A"}-
                                      {reserva.espacios_reservables_edificio?.descripcion || "N/A"}
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        );
                      })}
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
