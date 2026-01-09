import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, User, Mail, Phone, FileText, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface Prospecto {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  rfc?: string;
  curp?: string;
  tipo_persona: string;
}

interface ConvertirProspectoDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConvertirProspectoDialog({ open, onOpenChange }: ConvertirProspectoDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedProspecto, setSelectedProspecto] = useState<Prospecto | null>(null);
  const queryClient = useQueryClient();
  const { registrarCreacion } = useActivityLogger();

  // Buscar prospectos (id_tipo_entidad = 7)
  const { data: prospectos, isLoading } = useQuery({
    queryKey: ['prospectos-para-convertir', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id_persona,
          personas!entidades_relacionadas_id_persona_fkey(
            id,
            nombre_legal,
            email,
            telefono,
            rfc,
            curp,
            tipo_persona,
            activo
          )
        `)
        .eq('id_tipo_entidad', 7) // Prospectos
        .eq('activo', true);

      if (error) throw error;

      // Filtrar personas activas y que coincidan con la búsqueda
      const prospectosFiltrados = (data || [])
        .filter((er: any) => er.personas?.activo === true)
        .map((er: any) => ({
          id: er.personas.id,
          nombre_legal: er.personas.nombre_legal,
          email: er.personas.email,
          telefono: er.personas.telefono,
          rfc: er.personas.rfc,
          curp: er.personas.curp,
          tipo_persona: er.personas.tipo_persona
        }))
        .filter((p: Prospecto) => 
          p.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.rfc?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          p.curp?.toLowerCase().includes(searchTerm.toLowerCase())
        )
        // Eliminar duplicados
        .filter((v: Prospecto, i: number, a: Prospecto[]) => a.findIndex(t => t.id === v.id) === i)
        .sort((a: Prospecto, b: Prospecto) => a.nombre_legal.localeCompare(b.nombre_legal));

      return prospectosFiltrados as Prospecto[];
    },
    enabled: open && searchTerm.length >= 2,
  });

  // Verificar si ya es comprador
  const { data: yaEsComprador, isLoading: verificando } = useQuery({
    queryKey: ['verificar-comprador', selectedProspecto?.id],
    queryFn: async () => {
      if (!selectedProspecto) return false;

      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id')
        .eq('id_persona', selectedProspecto.id)
        .eq('id_tipo_entidad', 2) // Comprador
        .eq('activo', true)
        .is('id_proyecto', null)
        .maybeSingle();

      if (error) throw error;
      return !!data;
    },
    enabled: !!selectedProspecto,
  });

  const convertirMutation = useMutation({
    mutationFn: async (prospectoId: number) => {
      // Crear registro en entidades_relacionadas como comprador
      const { error } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: prospectoId,
          id_tipo_entidad: 2, // Comprador
          id_proyecto: null,
          activo: true
        }]);

      if (error) throw error;
    },
    onSuccess: async () => {
      await registrarCreacion(
        'entidad_relacionada',
        {
          id_persona: selectedProspecto?.id,
          nombre: selectedProspecto?.nombre_legal,
          email: selectedProspecto?.email,
          tipo_conversion: 'prospecto_a_comprador',
          id_tipo_entidad_anterior: 7,
          id_tipo_entidad_nuevo: 2,
        },
        'convertir_prospecto_a_comprador'
      );
      queryClient.invalidateQueries({ queryKey: ['compradores'] });
      toast.success(`${selectedProspecto?.nombre_legal} convertido a comprador exitosamente`);
      handleClose();
    },
    onError: async (error: any) => {
      await registrarCreacion(
        'entidad_relacionada',
        {
          id_persona: selectedProspecto?.id,
          nombre: selectedProspecto?.nombre_legal,
        },
        'convertir_prospecto_a_comprador',
        'error',
        error.message
      );
      toast.error(`Error al convertir: ${error.message}`);
    },
  });

  const handleClose = () => {
    setSearchTerm("");
    setSelectedProspecto(null);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (selectedProspecto) {
      convertirMutation.mutate(selectedProspecto.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Convertir Prospecto a Comprador
          </DialogTitle>
          <DialogDescription>
            Busca un prospecto existente y conviértelo en comprador para poder asignarle propiedades.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Buscador */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email, RFC o CURP..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedProspecto(null);
              }}
              className="pl-10"
            />
          </div>

          {/* Lista de resultados */}
          {searchTerm.length >= 2 && !selectedProspecto && (
            <ScrollArea className="h-[250px] rounded-md border">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Buscando...</p>
                </div>
              ) : prospectos && prospectos.length > 0 ? (
                <div className="p-2 space-y-2">
                  {prospectos.map((prospecto) => (
                    <Card
                      key={prospecto.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => setSelectedProspecto(prospecto)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <p className="font-medium">{prospecto.nombre_legal}</p>
                            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                              {prospecto.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {prospecto.email}
                                </span>
                              )}
                              {prospecto.telefono && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {prospecto.telefono}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline">
                            {prospecto.tipo_persona?.toLowerCase() === 'pf' || prospecto.tipo_persona === 'Física' ? 'Persona Física' : 'Persona Moral'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No se encontraron prospectos</p>
                </div>
              )}
            </ScrollArea>
          )}

          {/* Prospecto seleccionado - Confirmación */}
          {selectedProspecto && (
            <Card className="border-primary">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    Prospecto Seleccionado
                  </h4>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    onClick={() => setSelectedProspecto(null)}
                  >
                    Cambiar
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nombre:</span>
                    <p className="font-medium">{selectedProspecto.nombre_legal}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>
                    <p className="font-medium">
                      {selectedProspecto.tipo_persona?.toLowerCase() === 'pf' || selectedProspecto.tipo_persona === 'Física' 
                        ? 'Persona Física' 
                        : 'Persona Moral'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium">{selectedProspecto.email || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Teléfono:</span>
                    <p className="font-medium">{selectedProspecto.telefono || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RFC:</span>
                    <p className="font-medium">{selectedProspecto.rfc || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">CURP:</span>
                    <p className="font-medium">{selectedProspecto.curp || '-'}</p>
                  </div>
                </div>

                {verificando ? (
                  <p className="text-sm text-muted-foreground">Verificando...</p>
                ) : yaEsComprador ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">
                      ⚠️ Esta persona ya está registrada como comprador
                    </p>
                  </div>
                ) : (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                    <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      Listo para convertir a comprador
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose}>
            Cancelar
          </Button>
          <Button 
            onClick={handleConfirm}
            disabled={!selectedProspecto || yaEsComprador || convertirMutation.isPending}
          >
            {convertirMutation.isPending ? 'Convirtiendo...' : 'Confirmar Conversión'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
