import React from "react";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Check, ChevronsUpDown, UserPlus } from "lucide-react";
import { cn } from "@/lib/utils";

const baseProspectSchema = z.object({
  tipo_persona: z.string().min(1, "El tipo de persona es requerido"),
  nombre_completo: z.string().min(1, "El nombre completo es requerido"),
  email: z.string().email("Email inválido"),
  telefono: z.string().min(10, "El teléfono debe tener al menos 10 dígitos"),
  rfc: z.string().min(1, "El RFC es requerido"),
  curp: z.string().optional(),
});

const manualPaymentSchema = z.object({
  porcentaje_enganche: z.string().optional(),
  porcentaje_mensualidades: z.string().optional(),
  porcentaje_entrega: z.string().optional(),
  numero_mensualidades: z.string().optional(),
  porcentaje_descuento_aumento: z.string().optional(),
});

const formSchema = z.object({
  mode: z.enum(["precargada", "manual"]).default("precargada"),
  selectedPersonId: z.number().optional(),
  ...baseProspectSchema.shape,
  ...manualPaymentSchema.shape,
}).refine((data) => {
  if (data.mode === "manual") {
    return data.porcentaje_enganche && data.porcentaje_mensualidades && 
           data.porcentaje_entrega && data.numero_mensualidades && 
           data.porcentaje_descuento_aumento;
  }
  return true;
}, {
  message: "En modo manual, todos los campos de pago son requeridos",
  path: ["mode"]
});

type FormData = z.infer<typeof formSchema>;

interface NewOfferDialogProps {
  propertyId: number;
  propertyNumber: string;
}

export function NewOfferDialog({ propertyId, propertyNumber }: NewOfferDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: "precargada",
      selectedPersonId: undefined,
      tipo_persona: "pf",
      nombre_completo: "",
      email: "",
      telefono: "",
      rfc: "",
      curp: "",
      porcentaje_enganche: "",
      porcentaje_mensualidades: "", 
      porcentaje_entrega: "",
      numero_mensualidades: "",
      porcentaje_descuento_aumento: "",
    },
  });

  const selectedMode = form.watch("mode");
  const selectedPersonType = form.watch("tipo_persona");

  // Search persons query
  const { data: persons = [] } = useQuery({
    queryKey: ["persons-search", searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      
      const { data, error } = await supabase
        .from("personas")
        .select("id, nombre_legal, email, telefono, rfc, curp, tipo_persona")
        .ilike("nombre_legal", `%${searchTerm}%`)
        .eq("activo", true)
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2,
  });

  // Fill form when person is selected
  useEffect(() => {
    if (selectedPerson) {
      form.setValue("selectedPersonId", selectedPerson.id);
      form.setValue("tipo_persona", selectedPerson.tipo_persona);
      form.setValue("nombre_completo", selectedPerson.nombre_legal);
      form.setValue("email", selectedPerson.email);
      form.setValue("telefono", selectedPerson.telefono || "");
      form.setValue("rfc", selectedPerson.rfc || "");
      form.setValue("curp", selectedPerson.curp || "");
    }
  }, [selectedPerson, form]);

  const clearPersonSelection = () => {
    setSelectedPerson(null);
    form.setValue("selectedPersonId", undefined);
    form.reset({
      mode: selectedMode,
      selectedPersonId: undefined,
      tipo_persona: "pf",
      nombre_completo: "",
      email: "",
      telefono: "",
      rfc: "",
      curp: "",
      porcentaje_enganche: "",
      porcentaje_mensualidades: "",
      porcentaje_entrega: "",
      numero_mensualidades: "",
      porcentaje_descuento_aumento: "",
    });
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase()
      .substring(0, 3);
  };

  // Fetch property details with project information
  const { data: propertyDetails } = useQuery({
    queryKey: ["property-details", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("propiedades")
        .select(`
          id,
          numero_propiedad,
          entidades_relacionadas!id_entidad_relacionada_dueno(
            proyectos!entidades_relacionadas_id_proyecto_fkey(
              id,
              nombre
            )
          )
        `)
        .eq("id", propertyId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  const createOfferMutation = useMutation({
    mutationFn: async (data: FormData) => {
      let personId = data.selectedPersonId;
      
      // Create, get, or update person
      if (!personId) {
        // Check if person already exists by RFC
        const { data: existingPerson } = await supabase
          .from("personas")
          .select("id")
          .eq("rfc", data.rfc)
          .eq("activo", true)
          .maybeSingle();

        if (existingPerson) {
          personId = existingPerson.id;
        } else {
          // Create new person
          const personData = {
            tipo_persona: data.tipo_persona,
            nombre_legal: data.nombre_completo,
            email: data.email,
            telefono: data.telefono,
            rfc: data.rfc || null,
            curp: data.curp || null,
            activo: true
          };

          const { data: newPerson, error: personError } = await supabase
            .from("personas")
            .insert(personData)
            .select("id")
            .single();

          if (personError) throw personError;
          personId = newPerson.id;
        }
      } else if (selectedPerson) {
        // Update existing person if data has changed
        const hasChanges = 
          selectedPerson.tipo_persona !== data.tipo_persona ||
          selectedPerson.nombre_legal !== data.nombre_completo ||
          selectedPerson.email !== data.email ||
          selectedPerson.telefono !== data.telefono ||
          selectedPerson.rfc !== data.rfc ||
          selectedPerson.curp !== data.curp;

        if (hasChanges) {
          const updateData = {
            tipo_persona: data.tipo_persona,
            nombre_legal: data.nombre_completo,
            email: data.email,
            telefono: data.telefono,
            rfc: data.rfc || null,
            curp: data.curp || null
          };

          const { error: updateError } = await supabase
            .from("personas")
            .update(updateData)
            .eq("id", personId);

          if (updateError) throw updateError;
        }
      }

      let schemeId = null;

      // If manual mode, create payment scheme
      if (data.mode === "manual") {
        const projectId = propertyDetails?.entidades_relacionadas?.proyectos?.id;
        const projectName = propertyDetails?.entidades_relacionadas?.proyectos?.nombre;
        
        if (projectId && projectName) {
          const initials = getInitials(data.nombre_completo);
          const schemeName = `manual_${propertyNumber}_${projectName}_${initials}`;
          
          const schemeData = {
            id_proyecto: projectId,
            nombre: schemeName,
            porcentaje_enganche: parseFloat(data.porcentaje_enganche || "0"),
            porcentaje_mensualidades: parseFloat(data.porcentaje_mensualidades || "0"),
            porcentaje_entrega: parseFloat(data.porcentaje_entrega || "0"),
            numero_mensualidades: parseInt(data.numero_mensualidades || "0"),
            porcentaje_descuento_aumento: parseFloat(data.porcentaje_descuento_aumento || "0"),
            es_manual: true,
            activo: true
          };

          const { data: newScheme, error: schemeError } = await supabase
            .from("esquemas_pago")
            .insert(schemeData)
            .select("id")
            .single();

          if (schemeError) throw schemeError;
          schemeId = newScheme.id;
        }
      }

      // Finally, create the offer
      const offerData = {
        id_propiedad: propertyId,
        id_persona_lead: personId,
        id_esquema_pago_seleccionado: schemeId,
        fecha_generacion: new Date().toISOString(),
        activo: true
      };

      const { error: offerError } = await supabase
        .from("ofertas")
        .insert(offerData);

      if (offerError) throw offerError;
    },
    onSuccess: () => {
      toast({
        title: "Oferta creada",
        description: `La oferta para la propiedad ${propertyNumber} ha sido generada exitosamente.`,
      });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setOpen(false);
      form.reset();
      setSelectedPerson(null);
      setSearchTerm("");
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo generar la oferta. Inténtalo de nuevo.",
        variant: "destructive",
      });
      console.error("Error creating offer:", error);
    },
  });

  const onSubmit = (data: FormData) => {
    createOfferMutation.mutate(data);
  };

  const projectName = propertyDetails?.entidades_relacionadas?.proyectos?.nombre;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
          title="Generar oferta"
        >
          <FileText className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Generar Oferta</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Propiedad <span className="font-semibold">{propertyNumber}</span>
            {projectName && <span className="font-semibold"> de {projectName}</span>}
          </p>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Mode Selection */}
            <FormField
              control={form.control}
              name="mode"
              render={({ field }) => (
                <FormItem className="space-y-3">
                  <FormLabel>Tipo de Oferta</FormLabel>
                  <FormControl>
                    <RadioGroup
                      onValueChange={field.onChange}
                      value={field.value}
                      className="flex space-x-6"
                    >
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="precargada" id="precargada" />
                        <Label htmlFor="precargada">Precargada</Label>
                      </div>
                      <div className="flex items-center space-x-2">
                        <RadioGroupItem value="manual" id="manual" />
                        <Label htmlFor="manual">Manual</Label>
                      </div>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <Separator />

            {/* Person Search Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Buscar Prospecto</h3>
                {selectedPerson && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={clearPersonSelection}
                  >
                    <UserPlus className="h-4 w-4 mr-2" />
                    Nuevo Prospecto
                  </Button>
                )}
              </div>
              
              {!selectedPerson && (
                <div className="space-y-2">
                  <Label>Buscar persona existente</Label>
                  <Popover open={searchOpen} onOpenChange={setSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        aria-expanded={searchOpen}
                        className="w-full justify-between"
                      >
                        {selectedPerson
                          ? selectedPerson.nombre_legal
                          : "Buscar por nombre..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0">
                      <Command>
                        <CommandInput 
                          placeholder="Buscar persona..." 
                          value={searchTerm}
                          onValueChange={setSearchTerm}
                        />
                        <CommandList>
                          <CommandEmpty>
                            {searchTerm.length < 2 
                              ? "Escribe al menos 2 caracteres para buscar" 
                              : "No se encontraron personas"}
                          </CommandEmpty>
                          <CommandGroup>
                            {persons.map((person) => (
                              <CommandItem
                                key={person.id}
                                value={person.nombre_legal}
                                onSelect={() => {
                                  setSelectedPerson(person);
                                  setSearchOpen(false);
                                  setSearchTerm("");
                                }}
                              >
                                <Check
                                  className={cn(
                                    "mr-2 h-4 w-4",
                                    selectedPerson?.id === person.id ? "opacity-100" : "opacity-0"
                                  )}
                                />
                                <div className="flex flex-col">
                                  <span>{person.nombre_legal}</span>
                                  <span className="text-sm text-muted-foreground">
                                    {person.email} - {person.rfc}
                                  </span>
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                  {searchTerm.length >= 2 && persons.length === 0 && (
                    <p className="text-sm text-muted-foreground">
                      No se encontró ninguna persona. Se creará una nueva al guardar.
                    </p>
                  )}
                </div>
              )}

              {selectedPerson && (
                <div className="p-4 border rounded-lg bg-muted/50">
                  <p className="font-medium">{selectedPerson.nombre_legal}</p>
                  <p className="text-sm text-muted-foreground">{selectedPerson.email}</p>
                  <p className="text-sm text-muted-foreground">RFC: {selectedPerson.rfc}</p>
                </div>
              )}
            </div>

            <Separator />

          {/* Prospect Information Section */}
            <div className="space-y-4">
              <h3 className="text-lg font-medium">Información del Prospecto</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="tipo_persona"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Tipo de Persona *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="pf">Persona Física</SelectItem>
                          <SelectItem value="pm">Persona Moral</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="nombre_completo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        {selectedPersonType === "pm" ? "Razón Social *" : "Nombre Completo *"}
                      </FormLabel>
                      <FormControl>
                        <Input 
                          placeholder={selectedPersonType === "pm" ? "Ingresa la razón social" : "Ingresa el nombre completo"} 
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="email"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Email *</FormLabel>
                      <FormControl>
                        <Input type="email" placeholder="Ingresa el email" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="telefono"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Teléfono *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ingresa el teléfono (10 dígitos obligatorios)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="rfc"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>RFC *</FormLabel>
                      <FormControl>
                        <Input placeholder="Ingresa el RFC (Ej: ABC123456DEF)" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {selectedPersonType === "pf" && (
                  <FormField
                    control={form.control}
                    name="curp"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>CURP</FormLabel>
                        <FormControl>
                          <Input placeholder="Ingresa la CURP (Ej: ABCD123456HMNEFFD01)" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}
              </div>
            </div>

            {/* Manual Payment Scheme Section */}
            {selectedMode === "manual" && (
              <>
                <Separator />
                <div className="space-y-4">
                  <h3 className="text-lg font-medium">Esquema de Pago Personalizado</h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                     <FormField
                       control={form.control}
                       name="porcentaje_enganche"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>Porcentaje Enganche (%) *</FormLabel>
                           <FormControl>
                             <Input type="number" step="0.01" placeholder="0.00" {...field} />
                           </FormControl>
                           <FormMessage />
                         </FormItem>
                       )}
                     />

                     <FormField
                       control={form.control}
                       name="porcentaje_mensualidades"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>Porcentaje Mensualidades (%) *</FormLabel>
                           <FormControl>
                             <Input type="number" step="0.01" placeholder="0.00" {...field} />
                           </FormControl>
                           <FormMessage />
                         </FormItem>
                       )}
                     />
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <FormField
                       control={form.control}
                       name="porcentaje_entrega"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>Porcentaje Entrega (%) *</FormLabel>
                           <FormControl>
                             <Input type="number" step="0.01" placeholder="0.00" {...field} />
                           </FormControl>
                           <FormMessage />
                         </FormItem>
                       )}
                     />

                     <FormField
                       control={form.control}
                       name="numero_mensualidades"
                       render={({ field }) => (
                         <FormItem>
                           <FormLabel>Número de Mensualidades *</FormLabel>
                           <FormControl>
                             <Input type="number" placeholder="12" {...field} />
                           </FormControl>
                           <FormMessage />
                         </FormItem>
                       )}
                     />
                   </div>

                   <FormField
                     control={form.control}
                     name="porcentaje_descuento_aumento"
                     render={({ field }) => (
                       <FormItem>
                         <FormLabel>Porcentaje Descuento/Aumento (%) *</FormLabel>
                         <FormControl>
                           <Input type="number" step="0.01" placeholder="0" {...field} />
                         </FormControl>
                         <FormMessage />
                       </FormItem>
                     )}
                   />
                </div>
              </>
            )}

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createOfferMutation.isPending}
              >
                {createOfferMutation.isPending ? "Generando..." : "Generar Oferta"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}