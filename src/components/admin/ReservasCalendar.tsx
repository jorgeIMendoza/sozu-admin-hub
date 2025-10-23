import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, Clock, CheckCircle2, XCircle, CheckCheck, Loader2, Ban } from "lucide-react";
import { format, startOfWeek, addDays, isSameDay, parseISO, addWeeks, subWeeks } from "date-fns";
import { es } from "date-fns/locale";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "@/components/ui/hover-card";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditReservaDialog } from "./EditReservaDialog";

interface ReservasCalendarProps {
  reservas: any[];
  isLoading: boolean;
}

export const ReservasCalendar = ({ reservas, isLoading }: ReservasCalendarProps) => {
  const [currentWeek, setCurrentWeek] = useState(new Date());
  const [editReservaId, setEditReservaId] = useState<number | null>(null);
  
  const weekStart = startOfWeek(currentWeek, { weekStartsOn: 1 }); // Lunes
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  
  // Generar horarios de 8:00 a 20:00
  const timeSlots = Array.from({ length: 13 }, (_, i) => i + 8);

  const estatusConfig = {
    1: { nombre: "Agendada", icon: Clock, color: "bg-blue-500/20 border-blue-500 text-blue-700", iconColor: "text-blue-600" },
    2: { nombre: "Pagada", icon: CheckCircle2, color: "bg-green-500/20 border-green-500 text-green-700", iconColor: "text-green-600" },
    3: { nombre: "En progreso", icon: Loader2, color: "bg-yellow-500/20 border-yellow-500 text-yellow-700", iconColor: "text-yellow-600" },
    4: { nombre: "Terminada", icon: CheckCheck, color: "bg-purple-500/20 border-purple-500 text-purple-700", iconColor: "text-purple-600" },
    5: { nombre: "Cancelada", icon: XCircle, color: "bg-red-500/20 border-red-500 text-red-700", iconColor: "text-red-600" },
    6: { nombre: "Reagendada", icon: Ban, color: "bg-orange-500/20 border-orange-500 text-orange-700", iconColor: "text-orange-600" },
  };

  const getReservasForDayAndTime = (day: Date, hour: number) => {
    const reservasEnSlot = reservas.filter((reserva) => {
      const reservaDate = parseISO(reserva.fecha_reserva);
      const reservaHour = parseInt(reserva.hora_reserva.split(":")[0]);
      return isSameDay(reservaDate, day) && reservaHour === hour;
    });
    
    // Asignar posición horizontal a cada reserva
    return reservasEnSlot.map((reserva, index) => ({
      ...reserva,
      horizontalIndex: index,
      totalInSlot: reservasEnSlot.length
    }));
  };

  const calculateReservaDuration = (reserva: any) => {
    // Usar la duración del espacio reservable si existe
    if (reserva.espacios_reservables_edificio?.duracion_reserva) {
      const duration = reserva.espacios_reservables_edificio.duracion_reserva;
      // La duración viene en formato interval (ej: "05:00:00" para 5 horas)
      const hours = parseInt(duration.split(":")[0]);
      const minutes = parseInt(duration.split(":")[1] || "0");
      return hours + minutes / 60;
    }
    // Fallback a hora_fin si existe
    if (reserva.hora_fin) {
      const [horaInicio, minutosInicio] = reserva.hora_reserva.split(":").map(Number);
      const [horaFin, minutosFin] = reserva.hora_fin.split(":").map(Number);
      const inicio = horaInicio + minutosInicio / 60;
      const fin = horaFin + minutosFin / 60;
      return fin - inicio || 1;
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

  const getReservasByEstatusForDay = (day: Date) => {
    const reservasDelDia = reservas.filter((reserva) => {
      const reservaDate = parseISO(reserva.fecha_reserva);
      return isSameDay(reservaDate, day);
    });
    
    const countByEstatus: Record<number, number> = {};
    reservasDelDia.forEach((reserva) => {
      const estatus = reserva.id_estatus_reserva;
      countByEstatus[estatus] = (countByEstatus[estatus] || 0) + 1;
    });
    
    return countByEstatus;
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
            {weekDays.map((day, i) => {
              const reservasPorEstatus = getReservasByEstatusForDay(day);
              const tieneReservas = Object.keys(reservasPorEstatus).length > 0;
              
              return (
                <div key={i} className="border-b border-l p-2 text-center bg-muted/50">
                  <div className="font-semibold text-sm">
                    {format(day, "EEE", { locale: es }).toUpperCase()}
                  </div>
                  <div className="text-2xl font-bold">{format(day, "d")}</div>
                  {tieneReservas && (
                    <div className="flex gap-1.5 justify-center mt-1 flex-wrap">
                      {Object.entries(reservasPorEstatus).map(([estatusId, count]) => {
                        const estatusInfo = estatusConfig[parseInt(estatusId) as keyof typeof estatusConfig];
                        const IconComponent = estatusInfo?.icon;
                        return (
                          <TooltipProvider key={estatusId}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <div className="flex flex-col items-center gap-0">
                                  {IconComponent && <IconComponent className={`h-3 w-3 ${estatusInfo.iconColor}`} />}
                                  <span className="text-xs font-semibold">{count}</span>
                                </div>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>{estatusInfo?.nombre}</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

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
                        
                        // Calcular offset vertical basado en minutos de inicio
                        const minutosInicio = parseInt(reserva.hora_reserva.split(":")[1] || "0");
                        const topOffsetPixels = (minutosInicio / 60) * 60; // 60px por hora
                        
                        // Calcular altura exacta considerando minutos
                        const heightInPixels = duration * 60 - 4; // Cada hora = 60px
                        
                        // Calcular posición horizontal
                        const totalReservas = reserva.totalInSlot || 1;
                        const widthPercent = 100 / totalReservas;
                        const leftPercent = (reserva.horizontalIndex || 0) * widthPercent;
                        
                        return (
                          <HoverCard key={idx} openDelay={200}>
                            <HoverCardTrigger asChild>
                              <div
                                className={`rounded border p-2 cursor-pointer hover:opacity-80 transition-opacity absolute ${estatusInfo?.color}`}
                                style={{ 
                                  height: `${heightInPixels}px`,
                                  top: `${topOffsetPixels}px`,
                                  zIndex: 10,
                                  left: `${leftPercent}%`,
                                  width: `calc(${widthPercent}% - 4px)`,
                                  marginLeft: '2px'
                                }}
                                onClick={() => setEditReservaId(reserva.id)}
                              >
                                <div className="flex items-center justify-center">
                                  {IconComponent && <IconComponent className={`h-3.5 w-3.5 ${estatusInfo.iconColor}`} />}
                                </div>
                              </div>
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80" side="right">
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
                                  <div>
                                    <span className="font-medium">Costo:</span>
                                    <p className="text-muted-foreground">
                                      ${reserva.acuerdos_pago?.monto?.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) || "0.00"}
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
      
      <EditReservaDialog
        open={editReservaId !== null}
        onOpenChange={(open) => !open && setEditReservaId(null)}
        reservaId={editReservaId}
      />
    </Card>
  );
};
