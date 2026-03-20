import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { User, Mail, Phone, Building2, Edit, Save, X, Loader2 } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface AgenteVendedorInfo {
  nombre: string;
  email: string;
  telefono: string | null;
  tipoAgente: 'interno' | 'inmobiliario' | 'otro';
  organizacion: string | null;
  rolNombre?: string;
}

interface AgenteVendedorDialogProps {
  isOpen: boolean;
  onClose: () => void;
  agente: AgenteVendedorInfo | null;
  ofertaId?: number;
  canEdit?: boolean;
}

export function AgenteVendedorDialog({ isOpen, onClose, agente, ofertaId, canEdit = false }: AgenteVendedorDialogProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [searchEmail, setSearchEmail] = useState('');
  const [selectedNewAgent, setSelectedNewAgent] = useState<{ email: string; nombre: string } | null>(null);
  const queryClient = useQueryClient();

  // Search for agents
  const { data: searchResults } = useQuery({
    queryKey: ["agent_search", searchEmail],
    queryFn: async () => {
      if (!searchEmail || searchEmail.length < 2) return [];
      
      const { data } = await supabase
        .from('usuarios')
        .select('email, nombre')
        .in('rol_id', [1, 2, 3, 9, 10]) // Super Admin, Admin Proyecto, Agente Inmobiliario, Agente Interno, Admin Data
        .or(`email.ilike.%${searchEmail}%,nombre.ilike.%${searchEmail}%`)
        .limit(10);
      
      return data || [];
    },
    enabled: searchEmail.length >= 2 && isEditing
  });

  // Mutation to update email_creador
  const updateAgentMutation = useMutation({
    mutationFn: async (newEmail: string) => {
      if (!ofertaId) throw new Error("No se puede actualizar: ID de oferta no disponible");
      
      const { error } = await supabase
        .from('ofertas')
        .update({ email_creador: newEmail, url: null })
        .eq('id', ofertaId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Agente vendedor actualizado correctamente");
      queryClient.invalidateQueries({ queryKey: ["agente_vendedor"] });
      setIsEditing(false);
      setSearchEmail('');
      setSelectedNewAgent(null);
    },
    onError: (error) => {
      console.error("Error updating agent:", error);
      toast.error("Error al actualizar el agente vendedor");
    }
  });

  const handleSave = () => {
    if (!selectedNewAgent) {
      toast.error("Selecciona un nuevo agente");
      return;
    }
    updateAgentMutation.mutate(selectedNewAgent.email);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setSearchEmail('');
    setSelectedNewAgent(null);
  };

  if (!agente) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Detalles del Agente Vendedor
          </DialogTitle>
        </DialogHeader>
        
        {!isEditing ? (
          <div className="space-y-4 py-4">
            <div className="flex items-center gap-3">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <User className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="font-semibold text-lg">{agente.nombre}</p>
              </div>
            </div>

            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-3 text-sm">
                <Mail className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Correo:</span>
                <a href={`mailto:${agente.email}`} className="text-primary hover:underline">
                  {agente.email}
                </a>
              </div>

              <div className="flex items-center gap-3 text-sm">
                <Phone className="h-4 w-4 text-muted-foreground" />
                <span className="text-muted-foreground">Teléfono:</span>
                {agente.telefono ? (
                  <a href={`tel:${agente.telefono}`} className="text-primary hover:underline">
                    {agente.telefono}
                  </a>
                ) : (
                  <span className="text-muted-foreground italic">No disponible</span>
                )}
              </div>

              {agente.organizacion && (
                <div className="flex items-center gap-3 text-sm">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">Organización:</span>
                  <span className="font-medium">{agente.organizacion}</span>
                </div>
              )}
            </div>
            
            {canEdit && ofertaId && (
              <DialogFooter className="pt-4">
                <Button variant="outline" onClick={() => setIsEditing(true)}>
                  <Edit className="h-4 w-4 mr-2" />
                  Cambiar Agente
                </Button>
              </DialogFooter>
            )}
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
              <p className="text-sm text-amber-700 dark:text-amber-300">
                ⚠️ Vas a cambiar el agente vendedor de esta oferta. El agente actual es: <strong>{agente.nombre}</strong>
              </p>
            </div>
            
            <div className="space-y-2">
              <Label>Buscar nuevo agente</Label>
              <div className="relative">
                <Input
                  placeholder="Buscar por email o nombre..."
                  value={searchEmail}
                  onChange={(e) => {
                    setSearchEmail(e.target.value);
                    setSelectedNewAgent(null);
                  }}
                />
                {searchResults && searchResults.length > 0 && searchEmail && !selectedNewAgent && (
                  <div className="absolute z-50 w-full mt-1 bg-popover border rounded-md shadow-lg max-h-60 overflow-auto">
                    {searchResults.map((user) => (
                      <div
                        key={user.email}
                        className="px-3 py-2 hover:bg-accent cursor-pointer transition-colors"
                        onClick={() => {
                          setSelectedNewAgent(user);
                          setSearchEmail('');
                        }}
                      >
                        <p className="font-medium">{user.nombre || user.email}</p>
                        <p className="text-sm text-muted-foreground">{user.email}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {selectedNewAgent && (
              <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-700 dark:text-green-300">
                  Nuevo agente seleccionado: <strong>{selectedNewAgent.nombre || selectedNewAgent.email}</strong>
                </p>
                <p className="text-xs text-green-600 dark:text-green-400">{selectedNewAgent.email}</p>
              </div>
            )}
            
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={handleCancel} disabled={updateAgentMutation.isPending}>
                <X className="h-4 w-4 mr-2" />
                Cancelar
              </Button>
              <Button onClick={handleSave} disabled={!selectedNewAgent || updateAgentMutation.isPending}>
                {updateAgentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Save className="h-4 w-4 mr-2" />
                )}
                Guardar
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export type { AgenteVendedorInfo };