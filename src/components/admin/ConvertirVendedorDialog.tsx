import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Search, UserPlus, User, Mail, Phone, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useActivityLogger } from "@/hooks/useActivityLogger";

interface Candidato {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  rfc?: string;
  curp?: string;
  tipo_persona: string;
  origen: 'Prospecto' | 'Entidad Legal' | 'Comprador';
}

interface ConvertirVendedorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ConvertirVendedorDialog({ open, onOpenChange }: ConvertirVendedorDialogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCandidato, setSelectedCandidato] = useState<Candidato | null>(null);
  const queryClient = useQueryClient();
  const { registrarCreacion } = useActivityLogger();

  const { data: candidatos, isLoading } = useQuery({
    queryKey: ['candidatos-para-vendedor', searchTerm],
    queryFn: async () => {
      if (!searchTerm || searchTerm.length < 2) return [];

      const searchLower = searchTerm.toLowerCase();

      // Search prospectos (tipo_entidad = 7)
      const { data: prospectos, error: errorProspectos } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id_persona,
          id_tipo_entidad,
          personas!entidades_relacionadas_id_persona_fkey(
            id, nombre_legal, email, telefono, rfc, curp, tipo_persona, activo
          )
        `)
        .eq('id_tipo_entidad', 7)
        .eq('activo', true);

      if (errorProspectos) throw errorProspectos;

      // Search compradores (tipo_entidad = 2)
      const { data: compradores, error: errorCompradores } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id_persona,
          id_tipo_entidad,
          personas!entidades_relacionadas_id_persona_fkey(
            id, nombre_legal, email, telefono, rfc, curp, tipo_persona, activo
          )
        `)
        .eq('id_tipo_entidad', 2)
        .eq('activo', true);

      if (errorCompradores) throw errorCompradores;

      // Search entidades legales (personas morales)
      const { data: entidadesLegales, error: errorEntidades } = await supabase
        .from('personas')
        .select('id, nombre_legal, email, telefono, rfc, curp, tipo_persona, activo')
        .eq('activo', true)
        .or(`nombre_legal.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%`);

      if (errorEntidades) throw errorEntidades;

      const prospectosMap = (prospectos || [])
        .filter((er: any) => er.personas?.activo === true)
        .map((er: any) => ({
          id: er.personas.id,
          nombre_legal: er.personas.nombre_legal,
          email: er.personas.email,
          telefono: er.personas.telefono,
          rfc: er.personas.rfc,
          curp: er.personas.curp,
          tipo_persona: er.personas.tipo_persona,
          origen: 'Prospecto' as const
        }))
        .filter((p: any) =>
          p.nombre_legal?.toLowerCase().includes(searchLower) ||
          p.email?.toLowerCase().includes(searchLower) ||
          p.rfc?.toLowerCase().includes(searchLower) ||
          p.curp?.toLowerCase().includes(searchLower)
        );

      const compradoresMap = (compradores || [])
        .filter((er: any) => er.personas?.activo === true)
        .map((er: any) => ({
          id: er.personas.id,
          nombre_legal: er.personas.nombre_legal,
          email: er.personas.email,
          telefono: er.personas.telefono,
          rfc: er.personas.rfc,
          curp: er.personas.curp,
          tipo_persona: er.personas.tipo_persona,
          origen: 'Comprador' as const
        }))
        .filter((p: any) =>
          p.nombre_legal?.toLowerCase().includes(searchLower) ||
          p.email?.toLowerCase().includes(searchLower) ||
          p.rfc?.toLowerCase().includes(searchLower) ||
          p.curp?.toLowerCase().includes(searchLower)
        );

      const entidadesMap = (entidadesLegales || []).map((e: any) => ({
        id: e.id,
        nombre_legal: e.nombre_legal,
        email: e.email,
        telefono: e.telefono,
        rfc: e.rfc,
        curp: e.curp,
        tipo_persona: e.tipo_persona,
        origen: 'Entidad Legal' as const
      }));

      const combinados = [...prospectosMap, ...compradoresMap, ...entidadesMap];
      const unicos = combinados.filter((v, i, a) => a.findIndex(t => t.id === v.id) === i);
      return unicos.sort((a, b) => a.nombre_legal.localeCompare(b.nombre_legal));
    },
    enabled: open && searchTerm.length >= 2,
  });

  const { data: yaEsVendedor, isLoading: verificando } = useQuery({
    queryKey: ['verificar-vendedor', selectedCandidato?.id],
    queryFn: async () => {
      if (!selectedCandidato) return false;
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select('id')
        .eq('id_persona', selectedCandidato.id)
        .eq('id_tipo_entidad', 4)
        .eq('activo', true)
        .is('id_proyecto', null)
        .maybeSingle();
      if (error) throw error;
      return !!data;
    },
    enabled: !!selectedCandidato,
  });

  const convertirMutation = useMutation({
    mutationFn: async (candidatoId: number) => {
      const { error } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: candidatoId,
          id_tipo_entidad: 4, // Vendedor
          id_proyecto: null,
          activo: true
        }]);
      if (error) throw error;
    },
    onSuccess: async () => {
      await registrarCreacion(
        'entidad_relacionada',
        {
          id_persona: selectedCandidato?.id,
          nombre: selectedCandidato?.nombre_legal,
          email: selectedCandidato?.email,
          tipo_conversion: 'persona_a_vendedor',
          origen: selectedCandidato?.origen,
          id_tipo_entidad_nuevo: 4,
        },
        'convertir_a_vendedor'
      );
      queryClient.invalidateQueries({ queryKey: ['vendedores'] });
      toast.success(`${selectedCandidato?.nombre_legal} convertido a vendedor exitosamente`);
      handleClose();
    },
    onError: (error: any) => {
      toast.error(`Error al convertir: ${error.message}`);
    },
  });

  const handleClose = () => {
    setSearchTerm("");
    setSelectedCandidato(null);
    onOpenChange(false);
  };

  const handleConfirm = () => {
    if (selectedCandidato) {
      convertirMutation.mutate(selectedCandidato.id);
    }
  };

  const getOrigenBadgeVariant = (origen: string) => {
    switch (origen) {
      case 'Prospecto': return 'secondary';
      case 'Comprador': return 'default';
      case 'Entidad Legal': return 'outline';
      default: return 'outline';
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Convertir a Vendedor
          </DialogTitle>
          <DialogDescription>
            Busca un prospecto, comprador o entidad legal existente y conviértelo en vendedor.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre, email, RFC o CURP..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setSelectedCandidato(null);
              }}
              className="pl-10"
            />
          </div>

          {searchTerm.length >= 2 && !selectedCandidato && (
            <ScrollArea className="h-[250px] rounded-md border">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">Buscando...</p>
                </div>
              ) : candidatos && candidatos.length > 0 ? (
                <div className="p-2 space-y-2">
                  {candidatos.map((candidato) => (
                    <Card
                      key={candidato.id}
                      className="cursor-pointer hover:bg-accent transition-colors"
                      onClick={() => setSelectedCandidato(candidato)}
                    >
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <p className="font-medium">{candidato.nombre_legal}</p>
                              <Badge variant={getOrigenBadgeVariant(candidato.origen)} className="text-xs">
                                {candidato.origen}
                              </Badge>
                            </div>
                            <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                              {candidato.email && (
                                <span className="flex items-center gap-1">
                                  <Mail className="h-3 w-3" />
                                  {candidato.email}
                                </span>
                              )}
                              {candidato.telefono && (
                                <span className="flex items-center gap-1">
                                  <Phone className="h-3 w-3" />
                                  {candidato.telefono}
                                </span>
                              )}
                            </div>
                          </div>
                          <Badge variant="outline">
                            {candidato.tipo_persona?.toLowerCase() === 'pf' ? 'Persona Física' : 'Persona Moral'}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-muted-foreground">No se encontraron resultados</p>
                </div>
              )}
            </ScrollArea>
          )}

          {selectedCandidato && (
            <Card className="border-primary">
              <CardContent className="p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="font-semibold flex items-center gap-2">
                    <User className="h-4 w-4" />
                    {selectedCandidato.origen} Seleccionado
                  </h4>
                  <Button variant="ghost" size="sm" onClick={() => setSelectedCandidato(null)}>
                    Cambiar
                  </Button>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">Nombre:</span>
                    <p className="font-medium">{selectedCandidato.nombre_legal}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Tipo:</span>
                    <p className="font-medium">
                      {selectedCandidato.tipo_persona?.toLowerCase() === 'pf' ? 'Persona Física' : 'Persona Moral'}
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Email:</span>
                    <p className="font-medium">{selectedCandidato.email || '-'}</p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">RFC:</span>
                    <p className="font-medium">{selectedCandidato.rfc || '-'}</p>
                  </div>
                </div>

                {verificando ? (
                  <p className="text-sm text-muted-foreground">Verificando...</p>
                ) : yaEsVendedor ? (
                  <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-md p-3">
                    <p className="text-sm text-yellow-700 dark:text-yellow-400">
                      ⚠️ Esta persona ya está registrada como vendedor
                    </p>
                  </div>
                ) : (
                  <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-md p-3">
                    <p className="text-sm text-green-700 dark:text-green-400 flex items-center gap-1">
                      <Check className="h-4 w-4" />
                      Listo para convertir a vendedor
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
            disabled={!selectedCandidato || yaEsVendedor || convertirMutation.isPending}
          >
            {convertirMutation.isPending ? 'Convirtiendo...' : 'Confirmar Conversión'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
