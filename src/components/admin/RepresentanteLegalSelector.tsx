import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, Pencil } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { PersonForm } from "./PersonForm";
import { toast } from "sonner";

interface RepresentanteLegalSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function RepresentanteLegalSelector({
  value,
  onValueChange,
  disabled = false,
  className,
}: RepresentanteLegalSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isNewRepDialogOpen, setIsNewRepDialogOpen] = useState(false);
  const [isEditRepDialogOpen, setIsEditRepDialogOpen] = useState(false);
  const [editRepData, setEditRepData] = useState<any>(null);
  const [isLoadingEditData, setIsLoadingEditData] = useState(false);
  const queryClient = useQueryClient();

  const { data: representantesLegales = [], isLoading } = useQuery({
    queryKey: ['representantes_legales_select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          personas!entidades_relacionadas_id_persona_fkey!inner (
            id,
            nombre_legal,
            activo
          )
        `)
        .eq('personas.activo', true)
        .eq('activo', true)
        .eq('id_tipo_entidad', 1) // Only Representante Legal
        .is('id_proyecto', null)
        .order('personas(nombre_legal)');
      
      if (error) throw error;
      return (data || []).map((item: any) => ({
        id: item.id.toString(),
        nombre_legal: item.personas.nombre_legal
      }));
    },
  });

  const createRepresentanteMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, ...cleanPersonData } = personData;
      
      // Create person record
      const { data: personResult, error: personError } = await supabase
        .from('personas')
        .insert([{ ...cleanPersonData, tipo_persona: 'pf' }])
        .select()
        .single();
      
      if (personError) throw personError;
      
      // Create entidades_relacionadas record
      const { data: entidadResult, error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .insert([{
          id_persona: personResult.id,
          id_tipo_entidad: 1, // Representante Legal
          id_proyecto: null,
          activo: true
        }])
        .select()
        .single();
      
      if (entidadError) throw entidadError;
      
      return { personId: personResult.id, entidadId: entidadResult.id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['representantes_legales_select'] });
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      setIsNewRepDialogOpen(false);
      // Auto-select the new representative
      onValueChange(data.entidadId.toString());
      toast.success("Representante legal creado y seleccionado correctamente.");
    },
    onError: (error: any) => {
      let errorMessage = `Error al crear el representante legal: ${error.message}`;
      
      // Manejar error de email duplicado
      if (error.code === '23505' && error.message?.includes('personas_email_key')) {
        errorMessage = "El correo electrónico ya está registrado. Por favor, use un correo diferente.";
      }
      
      toast.error(errorMessage, {
        duration: 10000,
      });
    },
  });

  // Fetch full data for editing
  const handleEditRep = async () => {
    if (!value) return;
    setIsLoadingEditData(true);
    try {
      // Get the persona id from the entidad_relacionada
      const { data: entidad, error: entidadError } = await supabase
        .from('entidades_relacionadas')
        .select('id_persona')
        .eq('id', parseInt(value))
        .single();
      
      if (entidadError || !entidad) throw entidadError || new Error('No se encontró la entidad');

      const { data: persona, error: personaError } = await supabase
        .from('personas')
        .select('*')
        .eq('id', entidad.id_persona)
        .single();
      
      if (personaError || !persona) throw personaError || new Error('No se encontró la persona');

      setEditRepData({ ...persona, entidadId: parseInt(value) });
      setIsEditRepDialogOpen(true);
    } catch (error: any) {
      toast.error(`Error al cargar datos: ${error.message}`);
    } finally {
      setIsLoadingEditData(false);
    }
  };

  // Update representante mutation
  const updateRepresentanteMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { entityType, representativeId, commercialRepresentativeId, inmobiliariaId, tempBankAccounts, tempBeneficiaries, pendingDocuments, entidadId, ...cleanPersonData } = personData;
      
      const { error } = await supabase
        .from('personas')
        .update(cleanPersonData)
        .eq('id', editRepData.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_legales_select'] });
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      setIsEditRepDialogOpen(false);
      setEditRepData(null);
      toast.success("Representante legal actualizado correctamente.");
    },
    onError: (error: any) => {
      toast.error(`Error al actualizar: ${error.message}`, { duration: 10000 });
    },
  });

  const selectedRep = representantesLegales.find((rep) => rep.id === value);

  return (
    <>
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn(
                "w-full justify-between",
                !value && "text-muted-foreground",
                className
              )}
              disabled={disabled}
            >
              {selectedRep ? selectedRep.nombre_legal : "Selecciona un representante legal"}
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0 min-w-[300px]" align="start">
            <Command>
              <CommandInput placeholder="Buscar representante legal..." />
              <CommandList>
                <CommandEmpty>
                  <div className="py-4 text-center">
                    <p className="text-sm text-muted-foreground mb-3">No se encontró representante legal.</p>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setOpen(false);
                        setIsNewRepDialogOpen(true);
                      }}
                      className="gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      Crear nuevo representante legal
                    </Button>
                  </div>
                </CommandEmpty>
                <CommandGroup>
                  <CommandItem
                    value="none"
                    onSelect={() => {
                      onValueChange("");
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 h-4 w-4",
                        !value ? "opacity-100" : "opacity-0"
                      )}
                    />
                    Sin representante legal
                  </CommandItem>
                  {representantesLegales.map((rep) => (
                    <CommandItem
                      key={rep.id}
                      value={rep.nombre_legal}
                      onSelect={() => {
                        onValueChange(rep.id === value ? "" : rep.id);
                        setOpen(false);
                      }}
                    >
                      <Check
                        className={cn(
                          "mr-2 h-4 w-4",
                          value === rep.id ? "opacity-100" : "opacity-0"
                        )}
                      />
                      {rep.nombre_legal}
                    </CommandItem>
                  ))}
                </CommandGroup>
                <div className="border-t border-border p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setOpen(false);
                      setIsNewRepDialogOpen(true);
                    }}
                    className="w-full justify-start gap-2 text-primary hover:text-primary"
                  >
                    <Plus className="h-4 w-4" />
                    Crear nuevo representante legal
                  </Button>
                </div>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {/* Edit button - only shown when a rep is selected */}
        {value && !disabled && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={handleEditRep}
            disabled={isLoadingEditData}
            title="Editar representante legal"
            className="shrink-0"
          >
            <Pencil className="h-4 w-4" />
          </Button>
        )}
      </div>

      {/* Dialog para nuevo representante legal */}
      <Dialog open={isNewRepDialogOpen} onOpenChange={setIsNewRepDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Representante Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createRepresentanteMutation.mutate(data)}
            isLoading={createRepresentanteMutation.isPending}
            onCancel={() => setIsNewRepDialogOpen(false)}
            entityType="representante_legal"
          />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar representante legal */}
      <Dialog open={isEditRepDialogOpen} onOpenChange={(open) => {
        setIsEditRepDialogOpen(open);
        if (!open) setEditRepData(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Representante Legal</DialogTitle>
          </DialogHeader>
          {editRepData && (
            <PersonForm
              initialData={editRepData}
              onSubmit={(data) => updateRepresentanteMutation.mutate(data)}
              isLoading={updateRepresentanteMutation.isPending}
              onCancel={() => {
                setIsEditRepDialogOpen(false);
                setEditRepData(null);
              }}
              entityType="representante_legal"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
