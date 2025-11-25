import { useState, useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart, UserPlus } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";

// Form validation schema
const formSchema = z.object({
  porcentaje_enganche: z.string()
    .min(1, "El porcentaje de enganche es requerido")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) > 0 && parseFloat(val) <= 100, 
      "Debe estar entre 0 y 100"),
  porcentaje_mensualidades: z.string()
    .min(1, "El porcentaje de mensualidades es requerido")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 100, 
      "Debe estar entre 0 y 100"),
  porcentaje_entrega: z.string()
    .min(1, "El porcentaje de entrega es requerido")
    .refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0 && parseFloat(val) <= 100, 
      "Debe estar entre 0 y 100"),
  numero_mensualidades: z.string()
    .min(1, "El número de mensualidades es requerido")
    .refine((val) => !isNaN(parseInt(val)) && parseInt(val) > 0, 
      "Debe ser mayor a 0"),
  porcentaje_descuento_aumento: z.string().optional(),
  tipo_persona: z.string().min(1, "El tipo de persona es requerido"),
  razon_social: z.string().min(1, "Este campo es requerido"),
  email: z.string().email("Email inválido"),
  telefono: z.string()
    .min(10, "El teléfono debe tener 10 dígitos")
    .max(10, "El teléfono debe tener 10 dígitos")
    .regex(/^[0-9]{10}$/, "El teléfono debe contener solo números"),
  rfc: z.string()
    .optional()
    .refine((val) => {
      if (!val || val === "") return true;
      return /^[A-ZÑ&]{3,4}[0-9]{6}[A-Z0-9]{3}$/.test(val);
    }, "Formato de RFC inválido")
    .refine((val) => {
      if (!val || val === "") return true;
      return val.length <= 13;
    }, "El RFC no puede tener más de 13 caracteres"),
  curp: z.string().optional(),
}).refine((data) => {
  const eng = parseFloat(data.porcentaje_enganche || "0");
  const mens = parseFloat(data.porcentaje_mensualidades || "0");
  const ent = parseFloat(data.porcentaje_entrega || "0");
  const total = eng + mens + ent;
  return Math.abs(total - 100) < 0.01;
}, {
  message: "La suma de los porcentajes debe ser 100%",
  path: ["porcentaje_entrega"]
});

type FormData = z.infer<typeof formSchema>;

interface NewProductOfferDialogProps {
  propertyId: number;
  property: any;
}

export function NewProductOfferDialog({ propertyId, property }: NewProductOfferDialogProps) {
  const [open, setOpen] = useState(false);
  const [useCurrentBuyer, setUseCurrentBuyer] = useState(true);
  const [showProspectSearch, setShowProspectSearch] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [selectedProductData, setSelectedProductData] = useState<any>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const selectedProductRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      porcentaje_enganche: "",
      porcentaje_mensualidades: "",
      porcentaje_entrega: "",
      numero_mensualidades: "",
      porcentaje_descuento_aumento: "",
      tipo_persona: "pf",
      razon_social: "",
      email: "",
      telefono: "",
      rfc: "",
      curp: "",
    },
  });

  const selectedPersonType = form.watch("tipo_persona");

  // Reset form and states when dialog opens
  useEffect(() => {
    if (open) {
      setUseCurrentBuyer(true);
      setShowProspectSearch(false);
      setSelectedPerson(null);
      setSearchTerm("");
      setSearchOpen(false);
      setSelectedCategory(null);
      setSelectedProduct(null);
      setSelectedProductData(null);
      form.reset({
        porcentaje_enganche: "",
        porcentaje_mensualidades: "",
        porcentaje_entrega: "",
        numero_mensualidades: "",
        porcentaje_descuento_aumento: "",
        tipo_persona: "pf",
        razon_social: "",
        email: "",
        telefono: "",
        rfc: "",
        curp: "",
      });
    }
  }, [open, form]);

  // Fetch property details with project information
  const { data: propertyDetails } = useQuery({
    queryKey: ["property-details-product", propertyId],
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

  // Fetch current buyer data
  const { data: currentBuyerData } = useQuery({
    queryKey: ['current-buyer', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compradores')
        .select('personas!compradores_id_persona_fkey(*)')
        .eq('id_cuenta_cobranza', property.cuenta_cobranza_id)
        .eq('activo', true)
        .order('fecha_creacion', { ascending: true })
        .limit(1)
        .single();
      
      if (error) throw error;
      return data?.personas;
    },
    enabled: !!property.cuenta_cobranza_id && useCurrentBuyer,
  });

  // Update form when currentBuyerData changes or useCurrentBuyer changes
  useEffect(() => {
    if (useCurrentBuyer && currentBuyerData) {
      form.setValue("tipo_persona", currentBuyerData.tipo_persona || "pf");
      form.setValue("razon_social", currentBuyerData.nombre_legal || "");
      form.setValue("email", currentBuyerData.email || "");
      form.setValue("telefono", currentBuyerData.telefono || "");
      form.setValue("rfc", currentBuyerData.rfc || "");
      form.setValue("curp", currentBuyerData.curp || "");
      setSelectedPerson(null);
    }
  }, [useCurrentBuyer, currentBuyerData, form]);

  // Fill data when modal opens with current buyer selected
  useEffect(() => {
    if (open && useCurrentBuyer && currentBuyerData) {
      form.setValue("tipo_persona", currentBuyerData.tipo_persona || "pf");
      form.setValue("razon_social", currentBuyerData.nombre_legal || "");
      form.setValue("email", currentBuyerData.email || "");
      form.setValue("telefono", currentBuyerData.telefono || "");
      form.setValue("rfc", currentBuyerData.rfc || "");
      form.setValue("curp", currentBuyerData.curp || "");
    }
  }, [open, useCurrentBuyer, currentBuyerData, form]);

  // Fetch active categories + add "Servicios" option
  const { data: categoriesData = [] } = useQuery({
    queryKey: ['categorias-productos-activas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_producto')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
  });

  // Add "Servicios" as a special category
  const categories = [
    { id: -1, nombre: 'Servicios' },
    ...categoriesData
  ];

  // Fetch products/services by category
  const { data: products = [] } = useQuery({
    queryKey: ['productos-servicios-por-categoria', selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return [];
      
      // If "Servicios" category is selected (id = -1)
      if (selectedCategory === -1) {
        const { data, error } = await supabase
          .from('productos_servicios')
          .select('*')
          .eq('es_producto', false)
          .eq('activo', true)
          .order('nombre');
        if (error) throw error;
        return data || [];
      }
      
      // Otherwise, fetch by category
      const { data, error } = await supabase
        .from('productos_servicios')
        .select('*')
        .eq('id_categoria', selectedCategory)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCategory,
  });

  // Fetch existing personas for search
  const { data: existingPersonas = [] } = useQuery({
    queryKey: ['personas-search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('activo', true)
        .or(`nombre_legal.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%`)
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2 && showProspectSearch,
  });

  const handleCheckboxChange = (checked: boolean) => {
    setUseCurrentBuyer(checked);
    setShowProspectSearch(!checked);
    
    if (!checked) {
      form.setValue("tipo_persona", "pf");
      form.setValue("razon_social", "");
      form.setValue("email", "");
      form.setValue("telefono", "");
      form.setValue("rfc", "");
      form.setValue("curp", "");
      setSelectedPerson(null);
    } else if (currentBuyerData) {
      // When checking the box, populate with current buyer data
      form.setValue("tipo_persona", currentBuyerData.tipo_persona || "pf");
      form.setValue("razon_social", currentBuyerData.nombre_legal || "");
      form.setValue("email", currentBuyerData.email || "");
      form.setValue("telefono", currentBuyerData.telefono || "");
      form.setValue("rfc", currentBuyerData.rfc || "");
      form.setValue("curp", currentBuyerData.curp || "");
      setSelectedPerson(null);
    }
  };

  const handleSelectExistingPerson = (persona: any) => {
    setSelectedPerson(persona);
    form.setValue("tipo_persona", persona.tipo_persona || "pf");
    form.setValue("razon_social", persona.nombre_legal);
    form.setValue("email", persona.email);
    form.setValue("telefono", persona.telefono || "");
    form.setValue("rfc", persona.rfc || "");
    form.setValue("curp", persona.curp || "");
    setSearchTerm("");
    setSearchOpen(false);
  };

  const clearPersonSelection = () => {
    setSelectedPerson(null);
    form.setValue("tipo_persona", "pf");
    form.setValue("razon_social", "");
    form.setValue("email", "");
    form.setValue("telefono", "");
    form.setValue("rfc", "");
    form.setValue("curp", "");
  };

  const handleSelectProductService = async () => {
    const isValid = await form.trigger();
    if (isValid) {
      setShowCategoryDialog(true);
    }
  };

  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategory(categoryId);
  };

  const handleProductSelect = async (productId: number) => {
    // Fetch full product data including owner entity
    const { data: productData, error } = await supabase
      .from('productos_servicios')
      .select(`
        *,
        entidades_relacionadas!productos_servicios_id_entidad_relacionada_dueno_fkey (
          id,
          cuenta_madre_stp,
          personas!entidades_relacionadas_id_persona_fkey (nombre_legal)
        )
      `)
      .eq('id', productId)
      .single();
    
    console.log('🔍 Producto seleccionado completo:', productData);
    
    if (error) {
      console.error('❌ Error cargando producto:', error);
      toast({
        title: "Error",
        description: "No se pudo cargar la información del producto",
        variant: "destructive",
      });
      return;
    }

    if (!productData.id_entidad_relacionada_dueno) {
      toast({
        title: "Error",
        description: "Este producto no tiene un dueño asignado. Configure el dueño del producto primero.",
        variant: "destructive",
      });
      return;
    }

    if (!productData.entidades_relacionadas?.cuenta_madre_stp) {
      toast({
        title: "Error",
        description: "El dueño del producto no tiene una cuenta madre STP configurada.",
        variant: "destructive",
      });
      return;
    }

    setSelectedProduct(productId);
    setSelectedProductData(productData);
    setShowCategoryDialog(false);
    
    toast({
      title: "Producto/Servicio seleccionado",
      description: "Ahora puedes generar la oferta",
    });

    // Scroll to selected product section
    setTimeout(() => {
      selectedProductRef.current?.scrollIntoView({ 
        behavior: 'smooth', 
        block: 'end' 
      });
    }, 100);
  };

  const handleGenerateOffer = async () => {
    setIsGenerating(true);
    
    try {
      const formValues = form.getValues();
      
      // Step 1: Create or get persona (comprador)
      let personaId: number;
      
      if (useCurrentBuyer && currentBuyerData) {
        personaId = currentBuyerData.id;
      } else if (selectedPerson) {
        personaId = selectedPerson.id;
      } else {
        // Create new persona
        const { data: newPersona, error: personaError } = await supabase
          .from('personas')
          .insert({
            tipo_persona: formValues.tipo_persona,
            nombre_legal: formValues.razon_social,
            email: formValues.email,
            telefono: formValues.telefono,
            rfc: formValues.rfc,
            curp: formValues.curp || null,
          })
          .select()
          .single();
        
        if (personaError) throw personaError;
        personaId = newPersona.id;
      }

      // Step 2: Create payment scheme
      // Generate initials from buyer name
      const getInitials = (name: string) => {
        return name
          .split(' ')
          .map(word => word.charAt(0).toUpperCase())
          .join('');
      };
      
      const buyerInitials = getInitials(formValues.razon_social);
      const productName = selectedProductData?.nombre || 'Producto';
      const schemeName = `${productName}_${propertyNumber}_${projectName}_${buyerInitials}`;
      
      const { data: esquemaPago, error: esquemaError } = await supabase
        .from('esquemas_pago')
        .insert({
          nombre: schemeName,
          porcentaje_enganche: parseFloat(formValues.porcentaje_enganche),
          porcentaje_mensualidades: parseFloat(formValues.porcentaje_mensualidades),
          porcentaje_entrega: parseFloat(formValues.porcentaje_entrega),
          numero_mensualidades: parseInt(formValues.numero_mensualidades),
          porcentaje_descuento_aumento: formValues.porcentaje_descuento_aumento 
            ? parseFloat(formValues.porcentaje_descuento_aumento) 
            : 0,
          es_manual: true,
          id_producto: selectedProduct,
        })
        .select()
        .single();
      
      if (esquemaError) throw esquemaError;

      // Step 3: Get CLABE STP using crear_referencia_bancaria
      console.log('🔍 Llamando crear_referencia_bancaria con id_er_dueno:', selectedProductData.id_entidad_relacionada_dueno);
      console.log('📦 selectedProductData completo:', selectedProductData);
      
      const { data: clabeData, error: clabeError } = await supabase
        .rpc('crear_referencia_bancaria', {
          id_er_dueno: selectedProductData.id_entidad_relacionada_dueno
        });
      
      console.log('✅ CLABE generada:', clabeData);
      console.log('❌ Error CLABE:', clabeError);
      
      if (clabeError) {
        console.error('💥 Error generando CLABE:', clabeError);
        throw clabeError;
      }

      if (!clabeData || typeof clabeData !== 'string' || clabeData.length !== 18) {
        const errorMsg = `CLABE inválida generada: "${clabeData}" (tipo: ${typeof clabeData}, longitud: ${clabeData?.length || 0})`;
        console.error('⚠️', errorMsg);
        throw new Error(errorMsg);
      }

      console.log('✨ CLABE válida, procediendo a crear oferta con:', clabeData);

      // Step 4: Create offer
      const { error: ofertaError } = await supabase
        .from('ofertas')
        .insert({
          id_persona_lead: personaId,
          id_producto: selectedProduct,
          id_propiedad: propertyId,
          id_esquema_pago_seleccionado: esquemaPago.id,
          email_creador: 'jorge.mendoza@sozu.com', // Fixed user email
          clabe_stp_tmp_producto: clabeData,
        });
      
      if (ofertaError) throw ofertaError;

      toast({
        title: "Éxito",
        description: "Oferta de producto/servicio generada correctamente",
      });

      // Reset and close
      setOpen(false);
      setShowCategoryDialog(false);
      form.reset();
      setUseCurrentBuyer(true);
      setShowProspectSearch(false);
      setSelectedCategory(null);
      setSelectedProduct(null);
      setSelectedProductData(null);
      setSelectedPerson(null);

    } catch (error: any) {
      console.error("💥 Error generating offer:", error);
      console.error("🔍 Error details:", {
        message: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint,
      });
      toast({
        title: "Error",
        description: error.message || "Error al generar la oferta",
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const projectName = propertyDetails?.entidades_relacionadas?.proyectos?.nombre;
  const propertyNumber = propertyDetails?.numero_propiedad;
  const isFieldDisabled = useCurrentBuyer || selectedPerson !== null;

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="hover:bg-blue-50 hover:text-blue-600">
                  <ShoppingCart className="h-4 w-4" />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generar oferta de productos/servicios</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generar Oferta de Producto/Servicio</DialogTitle>
            <p className="text-sm text-muted-foreground">
              Propiedad <span className="font-semibold">{propertyNumber}</span>
              {projectName && <span className="font-semibold"> de {projectName}</span>}
            </p>
          </DialogHeader>

          <Form {...form}>
            <div className="space-y-6">
              {/* Esquema de Pago Personalizado */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Esquema de Pago Personalizado</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="porcentaje_enganche"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Porcentaje Enganche (%) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                          />
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
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="porcentaje_entrega"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Porcentaje Entrega (%) *</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min="0"
                            max="100"
                            step="0.01"
                            placeholder="0.00"
                            {...field}
                          />
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
                          <Input
                            type="number"
                            min="1"
                            step="1"
                            placeholder="12"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="porcentaje_descuento_aumento"
                    render={({ field }) => {
                      const value = parseFloat(field.value || "0");
                      const isDiscount = value < 0;
                      const isIncrease = value > 0;
                      
                      return (
                        <FormItem className="col-span-2">
                          <FormLabel className="flex items-center gap-2">
                            Porcentaje Descuento/Aumento (%)
                            {isDiscount && (
                              <Badge variant="destructive" className="text-xs">
                                Descuento
                              </Badge>
                            )}
                            {isIncrease && (
                              <Badge variant="default" className="text-xs">
                                Aumento
                              </Badge>
                            )}
                          </FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="0"
                              {...field}
                            />
                          </FormControl>
                          <FormDescription>
                            Usa valores negativos para descuentos (ej: -5 = 5% descuento) y valores positivos para aumentos (ej: 3 = 3% aumento)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />
                </div>
              </div>

            {/* Comprador Actual Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="comprador-actual"
                checked={useCurrentBuyer}
                onCheckedChange={handleCheckboxChange}
              />
              <Label htmlFor="comprador-actual" className="cursor-pointer">
                Comprador actual
              </Label>
            </div>

              {/* Buscar Prospecto - Only shown if useCurrentBuyer is false */}
              {showProspectSearch && (
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
                            <Command className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-full p-0" align="start">
                          <Command>
                            <CommandInput
                              placeholder="Buscar persona..."
                              value={searchTerm}
                              onValueChange={setSearchTerm}
                            />
                            <CommandEmpty>
                              {searchTerm.length < 2 
                                ? "Escribe al menos 2 caracteres para buscar" 
                                : "No se encontraron resultados."}
                            </CommandEmpty>
                            <CommandGroup>
                              {existingPersonas.map((persona: any) => (
                                <CommandItem
                                  key={persona.id}
                                  value={persona.nombre_legal}
                                  onSelect={() => handleSelectExistingPerson(persona)}
                                >
                                  <div className="flex flex-col">
                                    <span className="font-medium">{persona.nombre_legal}</span>
                                    <span className="text-sm text-muted-foreground">
                                      {persona.email} - {persona.rfc}
                                    </span>
                                  </div>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </Command>
                        </PopoverContent>
                      </Popover>
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
              )}

              {/* Información del Prospecto */}
              <div className="space-y-4">
                <h3 className="text-lg font-semibold">Información del Prospecto</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="tipo_persona"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Tipo de Persona *</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          disabled={isFieldDisabled}
                        >
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
                    name="razon_social"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          {form.watch("tipo_persona") === "pf" ? "Nombre completo *" : "Razón Social *"}
                        </FormLabel>
                        <FormControl>
                          <Input
                            placeholder={form.watch("tipo_persona") === "pf" ? "Ingresa el nombre completo" : "Ingresa la razón social"}
                            disabled={isFieldDisabled}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email *</FormLabel>
                        <FormControl>
                          <Input
                            type="email"
                            placeholder="Ingresa el email"
                            disabled={isFieldDisabled}
                            {...field}
                          />
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
                          <Input
                            type="tel"
                            placeholder="Ingresa el teléfono (10 dígitos obligatorios)"
                            disabled={isFieldDisabled}
                            maxLength={10}
                            {...field}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="rfc"
                    render={({ field }) => (
                      <FormItem className={selectedPersonType === "pf" ? "" : "col-span-2"}>
                        <FormLabel>RFC</FormLabel>
                        <FormControl>
                          <Input
                            placeholder="Ingresa el RFC (Ej: ABC123456DEF)"
                            disabled={isFieldDisabled}
                            maxLength={13}
                            {...field}
                          />
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
                            <Input
                              placeholder="Ingresa la CURP (Ej: ABCD123456HMNEFFD01)"
                              disabled={isFieldDisabled}
                              maxLength={18}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              </div>

              {/* Selected Product/Service Display */}
              {selectedProductData && (
                <div ref={selectedProductRef} className="bg-green-50 border border-green-200 rounded-lg p-4">
                  <h4 className="font-semibold text-green-900 mb-2">
                    ✓ Producto/Servicio Seleccionado
                  </h4>
                  <div className="space-y-1 text-sm">
                    <p><span className="font-medium">Nombre:</span> {selectedProductData.nombre}</p>
                    {selectedProductData.descripcion && (
                      <p><span className="font-medium">Descripción:</span> {selectedProductData.descripcion}</p>
                    )}
                    {selectedProductData.precio_lista && (
                      <p><span className="font-medium">Precio Lista:</span> ${parseFloat(selectedProductData.precio_lista).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                    )}
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 text-green-700 hover:text-green-900"
                    onClick={() => {
                      setSelectedProduct(null);
                      setSelectedProductData(null);
                      setShowCategoryDialog(true);
                    }}
                  >
                    Cambiar producto/servicio
                  </Button>
                </div>
              )}

              <div className="flex justify-end space-x-2">
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancelar
                </Button>
                {!selectedProduct ? (
                  <Button onClick={handleSelectProductService}>
                    Seleccionar producto/servicio
                  </Button>
                ) : (
                  <Button onClick={handleGenerateOffer} disabled={isGenerating}>
                    {isGenerating ? "Generando..." : "Generar Oferta"}
                  </Button>
                )}
              </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Category and Product Selection Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {!selectedCategory ? 'Seleccionar Categoría' : 'Seleccionar Producto/Servicio'}
            </DialogTitle>
          </DialogHeader>

          {!selectedCategory ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Selecciona una categoría</p>
              <div className="grid grid-cols-2 gap-4">
                {categories.map((category: any) => (
                  <Button
                    key={category.id}
                    variant="outline"
                    className="h-20"
                    onClick={() => handleCategorySelect(category.id)}
                  >
                    {category.nombre}
                  </Button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" onClick={() => setSelectedCategory(null)}>
                ← Volver a categorías
              </Button>
              <p className="text-sm text-muted-foreground">Selecciona un producto/servicio</p>
              <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                {products.map((product: any) => (
                  <Button
                    key={product.id}
                    variant="outline"
                    className="h-auto py-4 px-4 text-left flex flex-col items-start"
                    onClick={() => handleProductSelect(product.id)}
                  >
                    <span className="font-semibold">{product.nombre}</span>
                    {product.descripcion && (
                      <span className="text-sm text-muted-foreground mt-1">{product.descripcion}</span>
                    )}
                    {product.precio_lista && (
                      <span className="text-sm font-medium mt-2">
                        Precio: ${parseFloat(product.precio_lista).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
