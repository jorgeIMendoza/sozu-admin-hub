import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { ReservasCalendar } from "@/components/admin/ReservasCalendar";
import { ReservasList } from "@/components/admin/ReservasList";
import { NewReservaDialog } from "@/components/admin/NewReservaDialog";

const Reservas = () => {
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<"calendario" | "activos" | "eliminados" | "espacios">("calendario");
  const queryClient = useQueryClient();

  // @ts-ignore - Tablas no están en types aún
  const { data: reservas, isLoading } = useQuery({
    queryKey: ["reservas"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("reservas")
        .select(`
          *,
          espacios_reservables_edificio(
            id,
            descripcion,
            costo_por_hr,
            duracion_reserva,
            url_imagen,
            edificios(
              id,
              nombre,
              proyectos!fk_edificios_proyecto(id, nombre)
            ),
            tipos_espacio_reservables(id, nombre)
          ),
          estatus_reserva(id, nombre),
          acuerdos_pago(
            id,
            cuentas_cobranza!fk_acuerdos_pago_cuenta_cobranza(
              id,
              ofertas!fk_cuentas_cobranza_oferta(
                id,
                propiedades!ofertas_id_propiedad_fkey(numero_propiedad),
                personas!ofertas_id_persona_lead_fkey(id, nombre_legal)
              )
            )
          )
        `)
        .order("fecha_reserva", { ascending: false })
        .order("hora_reserva", { ascending: false });

      if (error) throw error;
      return data as any[];
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await (supabase as any)
        .from("reservas")
        .update({ activo: false })
        .eq("id", id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reservas"] });
      toast.success("Reserva eliminada exitosamente");
    },
    onError: (error: any) => {
      toast.error(`Error al eliminar: ${error.message}`);
    },
  });

  // Query para espacios reservables
  const { data: espaciosReservables, isLoading: espaciosLoading } = useQuery({
    queryKey: ["espacios_reservables_todos"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("espacios_reservables_edificio")
        .select(`
          *,
          edificios(
            id,
            nombre,
            proyectos!fk_edificios_proyecto(id, nombre)
          ),
          tipos_espacio_reservables(id, nombre)
        `)
        .eq("activo", true)
        .order("id_edificio");

      if (error) throw error;
      return data as any[];
    },
  });

  const reservasActivas = reservas?.filter((r: any) => r.activo) || [];
  const reservasEliminadas = reservas?.filter((r: any) => !r.activo) || [];

  // Agrupar espacios por edificio
  const espaciosPorEdificio = espaciosReservables?.reduce((acc: any, espacio: any) => {
    const edificioId = espacio.edificios?.id;
    if (!edificioId) return acc;
    
    if (!acc[edificioId]) {
      acc[edificioId] = {
        edificio: espacio.edificios,
        espacios: [],
      };
    }
    acc[edificioId].espacios.push(espacio);
    return acc;
  }, {}) || {};

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
              <CalendarIcon className="h-5 w-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">Reservas</h1>
              <p className="text-muted-foreground">Gestión de reservas de espacios</p>
            </div>
          </div>
          <Button onClick={() => setNewDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            Nueva Reserva
          </Button>
        </div>

        <Tabs value={activeView} onValueChange={(v) => setActiveView(v as any)} className="w-full">
          <TabsList className="grid w-full max-w-2xl grid-cols-4">
            <TabsTrigger value="calendario" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendario
            </TabsTrigger>
            <TabsTrigger value="espacios">
              Espacios Reservables
            </TabsTrigger>
            <TabsTrigger value="activos">
              Activos ({reservasActivas.length})
            </TabsTrigger>
            <TabsTrigger value="eliminados">
              Eliminados ({reservasEliminadas.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendario" className="mt-6">
            <ReservasCalendar reservas={reservasActivas} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="espacios" className="mt-6">
            {espaciosLoading ? (
              <div className="text-center py-8">Cargando espacios...</div>
            ) : (
              <div className="space-y-4">
                {Object.values(espaciosPorEdificio).map((grupo: any) => (
                  <div key={grupo.edificio.id} className="border rounded-lg overflow-hidden">
                    <details className="group">
                      <summary className="flex items-center justify-between p-4 cursor-pointer bg-muted/30 hover:bg-muted/50 transition-colors">
                        <div>
                          <h3 className="text-lg font-semibold">{grupo.edificio.nombre}</h3>
                          <p className="text-sm text-muted-foreground">
                            {grupo.edificio.proyectos?.nombre} • {grupo.espacios.length} espacio(s)
                          </p>
                        </div>
                        <div className="text-muted-foreground group-open:rotate-180 transition-transform">
                          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="6 9 12 15 18 9"></polyline>
                          </svg>
                        </div>
                      </summary>
                      <div className="p-4 space-y-3 bg-card">
                        {grupo.espacios.map((espacio: any) => (
                          <div key={espacio.id} className="border rounded-lg p-4 hover:border-primary/50 transition-colors">
                            <div className="flex items-start gap-4">
                              {espacio.url_imagen && (
                                <img 
                                  src={espacio.url_imagen} 
                                  alt={espacio.tipos_espacio_reservables?.nombre}
                                  className="w-24 h-24 object-cover rounded-lg"
                                />
                              )}
                              <div className="flex-1">
                                <h4 className="font-semibold text-lg">
                                  {espacio.tipos_espacio_reservables?.nombre || "Sin tipo"}
                                </h4>
                                {espacio.descripcion && (
                                  <p className="text-sm text-muted-foreground mt-1">
                                    {espacio.descripcion}
                                  </p>
                                )}
                                <div className="flex gap-4 mt-2 text-sm">
                                  <div>
                                    <span className="font-medium">Costo/hr:</span>{" "}
                                    ${Number(espacio.costo_por_hr || 0).toLocaleString("es-MX", { minimumFractionDigits: 2 })}
                                  </div>
                                  {espacio.duracion_reserva && (
                                    <div>
                                      <span className="font-medium">Duración:</span>{" "}
                                      {espacio.duracion_reserva}
                                    </div>
                                  )}
                                  <div>
                                    <span className="font-medium">Recurrente:</span>{" "}
                                    {espacio.permitir_reservas_recurrentes ? "Sí" : "No"}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="activos" className="mt-6">
            <ReservasList 
              reservas={reservasActivas} 
              isLoading={isLoading}
              onDelete={(id) => deleteMutation.mutate(id)}
            />
          </TabsContent>

          <TabsContent value="eliminados" className="mt-6">
            <ReservasList 
              reservas={reservasEliminadas} 
              isLoading={isLoading}
              onDelete={(id) => deleteMutation.mutate(id)}
              showDeleted
            />
          </TabsContent>
        </Tabs>

        <NewReservaDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
      </div>
  );
};

export default Reservas;
