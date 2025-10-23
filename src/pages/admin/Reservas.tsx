import { useState, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Plus, Calendar as CalendarIcon } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ReservasCalendar } from "@/components/admin/ReservasCalendar";
import { ReservasList } from "@/components/admin/ReservasList";
import { NewReservaDialog } from "@/components/admin/NewReservaDialog";

const Reservas = () => {
  const [newDialogOpen, setNewDialogOpen] = useState(false);
  const [activeView, setActiveView] = useState<"calendario" | "activos">("calendario");
  const queryClient = useQueryClient();

  // Actualizar estatus automáticamente cada minuto
  useEffect(() => {
    const updateEstatus = async () => {
      try {
        await (supabase as any).rpc('actualizar_estatus_reservas');
        queryClient.invalidateQueries({ queryKey: ["reservas"] });
      } catch (error) {
        console.error('Error actualizando estatus:', error);
      }
    };

    // Ejecutar al montar y cada minuto
    updateEstatus();
    const interval = setInterval(updateEstatus, 60000);

    return () => clearInterval(interval);
  }, [queryClient]);

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
          persona_que_reserva:personas!reservas_id_persona_que_reserva_fkey(id, nombre_legal),
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

  // Obtener estatus de reserva para el filtro
  const { data: estatusReserva } = useQuery({
    queryKey: ["estatus_reserva"],
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("estatus_reserva")
        .select("*")
        .eq("activo", true)
        .order("nombre");

      if (error) throw error;
      return data as any[];
    },
  });

  const reservasActivas = reservas?.filter((r: any) => r.activo) || [];

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
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="calendario" className="flex items-center gap-2">
              <CalendarIcon className="h-4 w-4" />
              Calendario
            </TabsTrigger>
            <TabsTrigger value="activos">
              Activos ({reservasActivas.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="calendario" className="mt-6">
            <ReservasCalendar reservas={reservasActivas} isLoading={isLoading} />
          </TabsContent>

          <TabsContent value="activos" className="mt-6">
            <ReservasList 
              reservas={reservasActivas} 
              isLoading={isLoading}
              estatusReserva={estatusReserva || []}
            />
          </TabsContent>
        </Tabs>

        <NewReservaDialog open={newDialogOpen} onOpenChange={setNewDialogOpen} />
      </div>
  );
};

export default Reservas;
