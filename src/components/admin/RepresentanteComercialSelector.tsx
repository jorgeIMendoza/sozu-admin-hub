import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
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
import { useToast } from "@/hooks/use-toast";

interface RepresentanteComercialSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
}

export function RepresentanteComercialSelector({
  value,
  onValueChange,
  disabled = false,
  className,
}: RepresentanteComercialSelectorProps) {
  const [open, setOpen] = useState(false);
  const [isNewRepDialogOpen, setIsNewRepDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: representantesComerciales = [], isLoading } = useQuery({
    queryKey: ['representantes_comerciales_select'],
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
        .eq('id_tipo_entidad', 21) // Representante Comercial
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
      const { entityType, representativeId, commercialRepresentativeId, tempBankAccounts, tempBeneficiaries, pendingDocuments, inmobiliariaId, ...cleanPersonData } = personData;
      
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
          id_tipo_entidad: 21, // Representante Comercial
          id_proyecto: null,
          activo: true
        }])
        .select()
        .single();
      
      if (entidadError) throw entidadError;
      
      return { personId: personResult.id, entidadId: entidadResult.id };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['representantes_comerciales_select'] });
      queryClient.invalidateQueries({ queryKey: ['representantes_comerciales'] });
      setIsNewRepDialogOpen(false);
      onValueChange(data.entidadId.toString());
      toast({
        title: "Éxito",
        description: "Representante comercial creado y seleccionado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el representante comercial: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const selectedRep = representantesComerciales.find((rep) => rep.id === value);

  return (
    <>
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
            {selectedRep ? selectedRep.nombre_legal : "Selecciona un representante comercial"}
            <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-full p-0 min-w-[300px]" align="start">
          <Command>
            <CommandInput placeholder="Buscar representante comercial..." />
            <CommandList>
              <CommandEmpty>
                <div className="py-4 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No se encontró representante comercial.</p>
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
                    Crear nuevo representante comercial
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
                  Sin representante comercial
                </CommandItem>
                {representantesComerciales.map((rep) => (
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
                  Crear nuevo representante comercial
                </Button>
              </div>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      <Dialog open={isNewRepDialogOpen} onOpenChange={setIsNewRepDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Representante Comercial</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createRepresentanteMutation.mutate(data)}
            isLoading={createRepresentanteMutation.isPending}
            onCancel={() => setIsNewRepDialogOpen(false)}
            entityType="representante_legal"
            restrictToBasicTab={true}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}