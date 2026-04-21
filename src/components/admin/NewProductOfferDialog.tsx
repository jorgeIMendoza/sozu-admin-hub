import { useState, useEffect, useRef, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShoppingCart, UserPlus, AlertCircle, Info, Mail } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { isValidRFC } from "@/utils/fiscalDataValidation";
import { formatEscalonadoLabel } from "@/utils/escalonadoUtils";

// Form validation schema - made more flexible for both modes
const formSchema = z.object({
  mode: z.enum(["precargada", "manual"]).default("precargada"),
  selectedSchemeId: z.number().optional(),
  porcentaje_enganche: z.string().optional(),
  porcentaje_mensualidades: z.string().optional(),
  porcentaje_entrega: z.string().optional(),
  numero_mensualidades: z.string().optional(),
  porcentaje_descuento_aumento: z.string().optional(),
  tipo_persona: z.string().min(1, "El tipo de persona es requerido"),
  razon_social: z.string().min(1, "Este campo es requerido"),
  email: z.string().email("Email inválido"),
  clave_pais_telefono: z.string().min(1, "Selecciona el código de país"),
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
  // Only validate percentages in manual mode
  if (data.mode === "manual") {
    const eng = parseFloat(data.porcentaje_enganche || "0");
    const mens = parseFloat(data.porcentaje_mensualidades || "0");
    const ent = parseFloat(data.porcentaje_entrega || "0");
    const total = eng + mens + ent;
    return Math.abs(total - 100) < 0.01;
  }
  return true;
}, {
  message: "La suma de los porcentajes debe ser 100%",
  path: ["porcentaje_entrega"]
}).refine((data) => {
  // Only validate mensualidades in manual mode
  if (data.mode === "manual") {
    const porcentajeMens = parseFloat(data.porcentaje_mensualidades || "0");
    const numMens = parseInt(data.numero_mensualidades || "0");
    if (porcentajeMens > 0 && numMens <= 0) {
      return false;
    }
  }
  return true;
}, {
  message: "Si hay porcentaje de mensualidades, el número debe ser mayor a 0",
  path: ["numero_mensualidades"]
});
// Note: In precargada mode, scheme selection is now OPTIONAL
// If no scheme is selected, all schemes will be shown without marking and no bank account section

type FormData = z.infer<typeof formSchema>;

interface NewProductOfferDialogProps {
  propertyId: number;
  property: any;
  onSuccess?: () => void;
}

export function NewProductOfferDialog({ propertyId, property, onSuccess }: NewProductOfferDialogProps) {
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
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [confirmReasons, setConfirmReasons] = useState<string[]>([]);
  const [pendingFormValues, setPendingFormValues] = useState<FormData | null>(null);
  const [sendEmailOnGenerate, setSendEmailOnGenerate] = useState(false);
  const selectedProductRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();
  const { profile } = useAuth();
  const { impersonatedAgentPersonaId, isImpersonating } = useAgentImpersonation();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: "precargada",
      selectedSchemeId: undefined,
      porcentaje_enganche: "",
      porcentaje_mensualidades: "",
      porcentaje_entrega: "",
      numero_mensualidades: "",
      porcentaje_descuento_aumento: "",
      tipo_persona: "pf",
      razon_social: "",
      email: "",
      clave_pais_telefono: "MX",
      telefono: "",
      rfc: "",
      curp: "",
    },
  });

  const selectedPersonType = form.watch("tipo_persona");
  const selectedMode = form.watch("mode");
  
  // Watch percentage fields for manual mode
  const watchedEnganche = form.watch("porcentaje_enganche");
  const watchedMensualidades = form.watch("porcentaje_mensualidades");
  const watchedEntrega = form.watch("porcentaje_entrega");
  const watchedNumeroMensualidades = form.watch("numero_mensualidades");
  const watchedDescuentoAumento = form.watch("porcentaje_descuento_aumento");
  
  // Calculate remaining percentage
  const remainingPercentage = 100 - (parseFloat(watchedEnganche || "0") + parseFloat(watchedMensualidades || "0"));

  // Calculate manual scheme amounts for preview
  // precio_lista ya viene calculado (precio_m2 * metraje) cuando aplica
  const manualSchemeCalculations = useMemo(() => {
    const basePrice = parseFloat(String(selectedProductData?.precio_lista || "0"));
    const descuentoAumento = parseFloat(watchedDescuentoAumento || "0");
    const precioAjustado = basePrice * (1 + descuentoAumento / 100);
    
    const enganchePct = parseFloat(watchedEnganche || "0");
    const mensualidadesPct = parseFloat(watchedMensualidades || "0");
    const entregaPct = parseFloat(watchedEntrega || "0");
    const numMensualidades = parseInt(watchedNumeroMensualidades || "0");
    
    const montoEnganche = precioAjustado * (enganchePct / 100);
    const montoMensualidades = precioAjustado * (mensualidadesPct / 100);
    const montoEntrega = precioAjustado * (entregaPct / 100);
    const montoPorMensualidad = numMensualidades > 0 ? montoMensualidades / numMensualidades : 0;
    
    return {
      precioOriginal: basePrice,
      precioAjustado,
      diferencia: precioAjustado - basePrice,
      montoEnganche,
      montoMensualidades,
      montoEntrega,
      montoPorMensualidad,
      numMensualidades
    };
  }, [selectedProductData?.precio_lista, watchedEnganche, watchedMensualidades, watchedEntrega, watchedNumeroMensualidades, watchedDescuentoAumento]);

  // Reset form and states when dialog opens
  useEffect(() => {
    if (open) {
      const isDisponible = property?.disponibilidad === "Disponible";
      setUseCurrentBuyer(!isDisponible);
      setShowProspectSearch(isDisponible);
      setSelectedPerson(null);
      setSearchTerm("");
      setSearchOpen(false);
      setSelectedCategory(null);
      setSelectedProduct(null);
      setSelectedProductData(null);
      form.reset({
        mode: "precargada",
        selectedSchemeId: undefined,
        porcentaje_enganche: "",
        porcentaje_mensualidades: "",
        porcentaje_entrega: "",
        numero_mensualidades: "",
        porcentaje_descuento_aumento: "",
        tipo_persona: "pf",
        razon_social: "",
        email: "",
        clave_pais_telefono: "MX",
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
      form.setValue("clave_pais_telefono", currentBuyerData.clave_pais_telefono || "MX");
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
      form.setValue("clave_pais_telefono", currentBuyerData.clave_pais_telefono || "MX");
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

  // Get project ID from property details for filtering products
  const projectId = propertyDetails?.entidades_relacionadas?.proyectos?.id;

  // Fetch products/services by category, filtered by id_proyecto for products
  const { data: products = [] } = useQuery({
    queryKey: ['productos-servicios-por-categoria', selectedCategory, projectId],
    queryFn: async (): Promise<any[]> => {
      if (!selectedCategory) return [];
      
      // If "Servicios" category is selected (id = -1) - services are global (no project filter)
      if (selectedCategory === -1) {
        const { data, error } = await (supabase as any)
          .from('productos_servicios')
          .select('id, nombre, precio_lista, descripcion, es_producto, id_categoria, categorias_producto!fk_prodserv_categoria(tiene_metraje)')
          .eq('es_producto', false)
          .eq('activo', true)
          .order('nombre');
        if (error) throw error;
        return data || [];
      }
      
      // For products: filter by id_proyecto directly
      if (!projectId) {
        return []; // No project, no products
      }
      
      const { data, error } = await (supabase as any)
        .from('productos_servicios')
        .select('id, nombre, precio_lista, descripcion, es_producto, id_categoria, categorias_producto!fk_prodserv_categoria(tiene_metraje)')
        .eq('id_categoria', selectedCategory)
        .eq('activo', true)
        .eq('id_proyecto', projectId)
        .order('nombre');
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCategory,
  });

  // Determine effective persona ID for prospect filtering
  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  const effectivePersonaId = isImpersonating ? impersonatedAgentPersonaId : profile?.id_persona;
  const shouldFilterByOwner = !isSuperAdmin || isImpersonating;

  // Fetch existing personas for search - filtered by ownership for non-super-admins
  const { data: existingPersonas = [] } = useQuery({
    queryKey: ['personas-search', searchTerm, shouldFilterByOwner, effectivePersonaId],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];

      if (shouldFilterByOwner && effectivePersonaId) {
        const { data, error } = await supabase
          .from("entidades_relacionadas")
          .select("personas!entidades_relacionadas_id_persona_fkey(*)")
          .eq("id_tipo_entidad", 7)
          .eq("activo", true)
          .eq("id_persona_duena_lead", effectivePersonaId);
        
        if (error) throw error;
        const s = searchTerm.toLowerCase();
        const unique = new Map<number, any>();
        (data || []).forEach((er: any) => {
          if (!er.personas) return;
          const p = er.personas;
          if (p.nombre_legal?.toLowerCase().includes(s) || p.email?.toLowerCase().includes(s) || p.rfc?.toLowerCase().includes(s)) {
            unique.set(p.id, p);
          }
        });
        return Array.from(unique.values()).slice(0, 10);
      }

      // Super admin without impersonation - search all
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

  // Fetch payment schemes for the selected product (only non-manual schemes)
  const { data: productPaymentSchemes = [] } = useQuery({
    queryKey: ['product-payment-schemes-for-offer', selectedProduct],
    queryFn: async () => {
      if (!selectedProduct) return [];
      const { data, error } = await supabase
        .from('esquemas_pago')
        .select('*')
        .eq('id_producto', selectedProduct)
        .eq('activo', true)
        .eq('es_manual', false)
        .order('orden', { ascending: true });
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedProduct,
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
      form.setValue("clave_pais_telefono", currentBuyerData.clave_pais_telefono || "MX");
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
    form.setValue("clave_pais_telefono", persona.clave_pais_telefono || "MX");
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
    form.setValue("clave_pais_telefono", "MX");
    form.setValue("telefono", "");
    form.setValue("rfc", "");
    form.setValue("curp", "");
  };

  // Effect to set mode to manual when product has no payment schemes
  useEffect(() => {
    if (selectedProduct && productPaymentSchemes.length === 0) {
      form.setValue("mode", "manual");
    }
  }, [selectedProduct, productPaymentSchemes, form]);

  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategory(categoryId);
  };

  const handleProductSelect = async (productId: number) => {
    // Fetch full product data including owner entity and category
    const { data: productData, error } = await supabase
      .from('productos_servicios')
      .select(`
        *,
        entidades_relacionadas!productos_servicios_id_entidad_relacionada_dueno_fkey (
          id,
          cuenta_madre_stp,
          personas!entidades_relacionadas_id_persona_fkey (nombre_legal)
        ),
        categorias_producto!fk_prodserv_categoria (
          tiene_metraje
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

    // Si la categoría tiene metraje, buscar el metraje de la bodega/estacionamiento asociado
    let metraje: number | null = null;
    let precioListaCalculado = parseFloat(String(productData.precio_lista || "0"));
    
    if (productData.categorias_producto?.tiene_metraje) {
      // Primero intentar buscar en bodegas
      const { data: bodegaData } = await supabase
        .from('bodegas')
        .select('m2')
        .eq('id_producto', productId)
        .eq('id_propiedad', propertyId)
        .eq('activo', true)
        .maybeSingle();
      
      if (bodegaData?.m2) {
        metraje = bodegaData.m2;
      } else {
        // Si no hay bodega, buscar en estacionamientos
        const { data: estacionamientoData } = await supabase
          .from('estacionamientos')
          .select('m2')
          .eq('id_producto', productId)
          .eq('id_propiedad', propertyId)
          .eq('activo', true)
          .maybeSingle();
        
        if (estacionamientoData?.m2) {
          metraje = estacionamientoData.m2;
        }
      }
      
      // Calcular precio de lista real = precio por m2 * metraje
      if (metraje) {
        precioListaCalculado = parseFloat(String(productData.precio_lista || "0")) * metraje;
        console.log('💰 Precio calculado con metraje:', { 
          precio_m2: productData.precio_lista, 
          metraje, 
          precio_total: precioListaCalculado 
        });
      }
    }

    // Enriquecer productData con metraje y precio calculado
    const enrichedProductData = {
      ...productData,
      metraje,
      precio_lista_original: productData.precio_lista,
      precio_lista: precioListaCalculado, // Sobrescribir con precio calculado
    };

    setSelectedProduct(productId);
    setSelectedProductData(enrichedProductData);
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

  const handleGenerateOffer = async (confirmedFormValues?: FormData) => {
    const formValues = confirmedFormValues ?? form.getValues();

    if (!confirmedFormValues) {
      const missingScheme = formValues.mode === "precargada" && !formValues.selectedSchemeId;
      const missingRFC = !isValidRFC(formValues.rfc);
      const reasons: string[] = [];

      if (missingRFC) reasons.push("el prospecto no tiene un RFC válido");
      if (missingScheme) reasons.push("no se seleccionó un plan de pago");

      if (reasons.length > 0) {
        setPendingFormValues(formValues);
        setConfirmReasons(reasons);
        setShowConfirmDialog(true);
        return;
      }
    }

    setIsGenerating(true);

    try {
      
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
            clave_pais_telefono: formValues.clave_pais_telefono || 'MX',
            telefono: formValues.telefono,
            rfc: formValues.rfc,
            curp: formValues.curp || null,
          })
          .select()
          .single();
        
        if (personaError) throw personaError;
        personaId = newPersona.id;
      }

      // Step 2: Get or create payment scheme (optional in precargada mode)
      let schemeId: number | null = null;
      let clabeData: string | null = null;
      
      if (formValues.mode === "precargada") {
        // Use selected preloaded scheme if provided
        if (formValues.selectedSchemeId) {
          schemeId = formValues.selectedSchemeId;
        }
        // If no scheme selected, schemeId stays null - all schemes will be shown
      } else {
        // Create manual payment scheme
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
            porcentaje_enganche: parseFloat(formValues.porcentaje_enganche || "0"),
            porcentaje_mensualidades: parseFloat(formValues.porcentaje_mensualidades || "0"),
            porcentaje_entrega: parseFloat(formValues.porcentaje_entrega || "0"),
            numero_mensualidades: parseInt(formValues.numero_mensualidades || "0"),
            porcentaje_descuento_aumento: formValues.porcentaje_descuento_aumento 
              ? parseFloat(formValues.porcentaje_descuento_aumento) 
              : 0,
            es_manual: true,
            id_producto: selectedProduct,
          })
          .select()
          .single();
        
        if (esquemaError) throw esquemaError;
        schemeId = esquemaPago.id;
      }

      // Step 3: Get CLABE STP ONLY if a scheme is selected
      // Reutiliza CLABEs existentes de ofertas sin cuenta de cobranza o genera una nueva
      let clabeResult: { clabe: string; sourceOfferIds: number[]; isNew: boolean } | null = null;
      if (schemeId) {
        console.log('🔍 Obteniendo CLABE (reutilizada o nueva) para propiedad:', propertyId, 'producto:', selectedProduct);
        
        const { getOrCreateProductClabe } = await import('@/utils/clabeReuseUtils');
        clabeResult = await getOrCreateProductClabe(
          propertyId,
          selectedProduct!,
          selectedProductData.id_entidad_relacionada_dueno
        );
        clabeData = clabeResult.clabe;
        
        console.log('✨ CLABE obtenida:', clabeData);
      } else {
        console.log('ℹ️ Sin esquema seleccionado - no se genera CLABE');
      }

      // Step 3.5: Liberar la CLABE de las ofertas fuente ANTES del INSERT para
      // evitar violación del UNIQUE constraint (clabe_stp_tmp_producto).
      // Esto también limpia la URL del PDF de las ofertas fuente para forzar regeneración.
      if (clabeResult && clabeResult.sourceOfferIds.length > 0) {
        const { clearSourceOfferClabes } = await import('@/utils/clabeReuseUtils');
        await clearSourceOfferClabes(clabeResult.sourceOfferIds);
      }

      // Step 4: Create offer and get the created offer ID
      const { data: ofertaData, error: ofertaError } = await supabase
        .from('ofertas')
        .insert({
          id_persona_lead: personaId,
          id_producto: selectedProduct,
          id_propiedad: propertyId,
          id_esquema_pago_seleccionado: schemeId,
          email_creador: profile?.email || '',
          clabe_stp_tmp_producto: clabeData,
        })
        .select()
        .single();
      
      if (ofertaError) throw ofertaError;

      // Assign prospect to the offer creator agent in entidades_relacionadas
      const creatorPersonaId = (() => {
        if (profile?.id_persona) return Number(profile.id_persona);
        return null;
      })();

      let resolvedOwnerPersonaId = creatorPersonaId;
      if (!resolvedOwnerPersonaId && profile?.email) {
        const { data: creatorUser } = await supabase
          .from("usuarios")
          .select("id_persona")
          .eq("email", profile.email)
          .maybeSingle() as any;
        resolvedOwnerPersonaId = creatorUser?.id_persona ? Number(creatorUser.id_persona) : null;
      }

      const projectId = propertyDetails?.entidades_relacionadas?.proyectos?.id;
      if (projectId && personaId) {
        const { data: existingRelation } = await supabase
          .from("entidades_relacionadas")
          .select("id, id_persona_duena_lead")
          .eq("id_persona", personaId)
          .eq("id_proyecto", projectId)
          .eq("id_tipo_entidad", 7)
          .eq("activo", true)
          .maybeSingle();

        if (!existingRelation) {
          const { error: relationError } = await supabase
            .from("entidades_relacionadas")
            .insert({
              id_persona: personaId,
              id_proyecto: projectId,
              id_tipo_entidad: 7,
              id_estatus_persona: 3,
              id_persona_duena_lead: resolvedOwnerPersonaId,
              activo: true,
            });
          if (relationError) console.error("Error creating entidades_relacionadas:", relationError);
          else console.log("Created prospect relation with agent assignment");
        } else if (resolvedOwnerPersonaId && existingRelation.id_persona_duena_lead !== resolvedOwnerPersonaId) {
          await supabase
            .from("entidades_relacionadas")
            .update({ id_persona_duena_lead: resolvedOwnerPersonaId })
            .eq("id", existingRelation.id);
          console.log("Updated prospect relation owner to offer creator");
        }
      }

      toast({
        title: "Éxito",
        description: "Oferta de producto/servicio generada correctamente. Descargando PDF...",
      });


      // Generate PDF for the created offer
      try {
        const { generateOfferPDF } = await import('@/services/htmlToPdfService');
        
        await generateOfferPDF({
          propertyId: propertyId,
          offerId: ofertaData.id,
          propertyNumber: propertyNumber || '',
          leadName: formValues.razon_social,
          leadEmail: formValues.email,
          leadPhone: formValues.telefono,
          creatorEmail: profile?.email || '',
          isProductOffer: true,
          productId: selectedProduct
        });
        // Solo enviar por correo si el usuario marcó explícitamente el checkbox.
        // Nunca enviar de forma automática.
        if (sendEmailOnGenerate) {
          const { sendOfferEmailDirect } = await import('@/services/ofertaEmailService');
          await sendOfferEmailDirect({
            offerId: ofertaData.id,
            propertyNumber: propertyNumber || '',
            recipientEmail: formValues.email,
            recipientName: formValues.razon_social,
            tipo: 'producto',
          });
        }
      } catch (pdfError) {
        console.error('Error generating PDF:', pdfError);
        toast({
          title: "Advertencia",
          description: "La oferta se creó pero no se pudo generar el PDF automáticamente",
          variant: "default",
        });
      }

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
      setSendEmailOnGenerate(false);
      
      // Call onSuccess callback to refresh the offers list
      onSuccess?.();

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

  const handleConfirmGenerate = () => {
    if (!pendingFormValues) return;
    const values = pendingFormValues;
    setShowConfirmDialog(false);
    setPendingFormValues(null);
    setConfirmReasons([]);
    void handleGenerateOffer(values);
  };

  const handleCancelGenerate = () => {
    setShowConfirmDialog(false);
    setPendingFormValues(null);
    setConfirmReasons([]);
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
              {/* Step 1: Product Selection - Always show first */}
              {!selectedProductData ? (
                <div className="space-y-4">
                  <h3 className="text-lg font-semibold">1. Seleccionar Producto/Servicio</h3>
                  <Button onClick={() => setShowCategoryDialog(true)} className="w-full">
                    Seleccionar producto/servicio
                  </Button>
                </div>
              ) : (
                <>
                  {/* Selected Product/Service Display */}
                  <div ref={selectedProductRef} className="bg-green-50 border border-green-200 rounded-lg p-4 dark:bg-green-900/20 dark:border-green-800">
                    <h4 className="font-semibold text-green-900 dark:text-green-100 mb-2">
                      ✓ Producto/Servicio Seleccionado
                    </h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Nombre:</span> {selectedProductData.nombre}</p>
                      {selectedProductData.descripcion && (
                        <p><span className="font-medium">Descripción:</span> {selectedProductData.descripcion}</p>
                      )}
                      {selectedProductData.metraje && selectedProductData.precio_lista_original && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium">Precio por m²:</span> ${parseFloat(String(selectedProductData.precio_lista_original)).toLocaleString('es-MX', { minimumFractionDigits: 2 })} × {selectedProductData.metraje} m²
                        </p>
                      )}
                      {selectedProductData.precio_lista && (
                        <p><span className="font-medium">Precio Lista:</span> ${parseFloat(String(selectedProductData.precio_lista)).toLocaleString('es-MX', { minimumFractionDigits: 2 })}</p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-green-700 hover:text-green-900 dark:text-green-300 dark:hover:text-green-100"
                      onClick={() => {
                        setSelectedProduct(null);
                        setSelectedProductData(null);
                        form.setValue("mode", "precargada");
                        form.setValue("selectedSchemeId", undefined);
                      }}
                    >
                      Cambiar producto/servicio
                    </Button>
                  </div>

                  <Separator />

                  {/* Step 2: Mode Selection and Scheme */}
                  <div className="space-y-4">
                    <h3 className="text-lg font-semibold">2. Esquema de Pago</h3>
                    
                    {/* Mode selector - only show if there are preloaded schemes OR user can use manual */}
                    {(productPaymentSchemes.length > 0 || profile?.rol_nombre === 'Super Administrador' || profile?.rol_nombre === 'Agente Interno') && (
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
                                {productPaymentSchemes.length > 0 && (
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="precargada" id="prod-precargada" />
                                    <Label htmlFor="prod-precargada">Precargada</Label>
                                  </div>
                                )}
                                {profile?.rol_nombre !== 'Agente Inmobiliario' && (
                                  <div className="flex items-center space-x-2">
                                    <RadioGroupItem value="manual" id="prod-manual" />
                                    <Label htmlFor="prod-manual">Manual</Label>
                                  </div>
                                )}
                              </RadioGroup>
                            </FormControl>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    )}

                    {/* Preloaded scheme selector */}
                    {selectedMode === "precargada" && productPaymentSchemes.length > 0 && (
                      <>
                        <FormField
                          control={form.control}
                          name="selectedSchemeId"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>Seleccionar Esquema de Pago (Opcional)</FormLabel>
                              <Select 
                                onValueChange={(value) => field.onChange(value ? parseInt(value) : undefined)} 
                                value={field.value?.toString() || ""}
                              >
                                <FormControl>
                                  <SelectTrigger>
                                    <SelectValue placeholder="Selecciona un esquema de pago (opcional)" />
                                  </SelectTrigger>
                                </FormControl>
                                <SelectContent>
                                  {productPaymentSchemes.map((scheme: any) => {
                                    const tramos = scheme.tramos_mensualidad as any[];
                                    const isEscalonado = Array.isArray(tramos) && tramos.length > 0;
                                    
                                    return (
                                      <SelectItem key={scheme.id} value={scheme.id.toString()}>
                                        <div className="flex flex-col">
                                          <span>{scheme.nombre}</span>
                                          <span className="text-xs text-muted-foreground">
                                             {isEscalonado
                                               ? formatEscalonadoLabel(scheme, tramos, selectedProductData?.precio_lista)
                                               : `Eng: ${scheme.porcentaje_enganche}% | Mens: ${scheme.porcentaje_mensualidades}% (${scheme.numero_mensualidades}) | Ent: ${scheme.porcentaje_entrega}%`
                                             }
                                          </span>
                                        </div>
                                      </SelectItem>
                                    );
                                  })}
                                </SelectContent>
                              </Select>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                        
                        {!form.watch("selectedSchemeId") && (
                          <Card className="border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/50">
                            <CardContent className="p-4">
                              <p className="text-sm text-amber-800 dark:text-amber-200">
                                <strong>Nota:</strong> Si no seleccionas un esquema de pago, la oferta mostrará todos los esquemas disponibles.
                              </p>
                            </CardContent>
                          </Card>
                        )}
                      </>
                    )}

                    {/* Manual scheme fields */}
                    {selectedMode === "manual" && (
                      <div className="space-y-4 p-4 border rounded-lg bg-muted/30">
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
                            render={({ field }) => {
                              const maxAllowed = Math.max(0, remainingPercentage);
                              const currentValue = parseFloat(field.value || "0");
                              const isExceeding = currentValue > maxAllowed + 0.01;
                              
                              return (
                                <FormItem>
                                  <FormLabel>
                                    Porcentaje Entrega (%) *
                                    {remainingPercentage !== 100 && (
                                      <span className={`text-sm ml-1 ${isExceeding ? 'text-destructive' : 'text-muted-foreground'}`}>
                                        (Restante: {remainingPercentage.toFixed(2)}%)
                                      </span>
                                    )}
                                  </FormLabel>
                                  <FormControl>
                                    <Input 
                                      type="number" 
                                      step="0.01" 
                                      max={maxAllowed}
                                      placeholder="0.00" 
                                      className={isExceeding ? 'border-destructive' : ''}
                                      {...field}
                                      onChange={(e) => {
                                        const val = parseFloat(e.target.value) || 0;
                                        const clampedValue = Math.min(val, maxAllowed);
                                        field.onChange(clampedValue.toString());
                                      }}
                                    />
                                  </FormControl>
                                  <FormMessage />
                                </FormItem>
                              );
                            }}
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
                          render={({ field }) => {
                            const value = parseFloat(field.value || "0");
                            const isDiscount = value < 0;
                            const isIncrease = value > 0;
                            
                            return (
                              <FormItem>
                                <FormLabel className="flex items-center gap-2">
                                  Porcentaje Descuento/Aumento (%)
                                  {isDiscount && (
                                    <Badge variant="destructive" className="text-xs">Descuento</Badge>
                                  )}
                                  {isIncrease && (
                                    <Badge variant="default" className="text-xs">Aumento</Badge>
                                  )}
                                </FormLabel>
                                <FormControl>
                                  <Input type="number" step="0.01" placeholder="0" {...field} />
                                </FormControl>
                                <FormDescription>
                                  Valores negativos = descuento, positivos = aumento
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            );
                          }}
                        />

                        {/* Manual scheme preview */}
                        {manualSchemeCalculations.precioOriginal > 0 && (parseFloat(watchedEnganche || "0") > 0 || parseFloat(watchedMensualidades || "0") > 0 || parseFloat(watchedEntrega || "0") > 0) && (
                          <div className="mt-4 p-4 bg-primary/5 rounded-lg border border-primary/20">
                            <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                              <Info className="h-4 w-4 text-primary" />
                              Vista previa del esquema de pago
                            </h4>
                            
                            {manualSchemeCalculations.diferencia !== 0 && (
                              <div className="mb-3 pb-3 border-b border-primary/20">
                                <div className="flex justify-between text-sm">
                                  <span className="text-muted-foreground">Precio original:</span>
                                  <span>${manualSchemeCalculations.precioOriginal.toLocaleString()}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                  <span className={manualSchemeCalculations.diferencia < 0 ? "text-green-600" : "text-amber-600"}>
                                    {manualSchemeCalculations.diferencia < 0 ? "Descuento:" : "Aumento:"}
                                  </span>
                                  <span className={manualSchemeCalculations.diferencia < 0 ? "text-green-600" : "text-amber-600"}>
                                    {manualSchemeCalculations.diferencia < 0 ? "-" : "+"}${Math.abs(manualSchemeCalculations.diferencia).toLocaleString()}
                                  </span>
                                </div>
                                <div className="flex justify-between text-sm font-semibold mt-1">
                                  <span>Precio ajustado:</span>
                                  <span className="text-primary">${manualSchemeCalculations.precioAjustado.toLocaleString()}</span>
                                </div>
                              </div>
                            )}
                            
                            <div className="space-y-2 text-sm">
                              {parseFloat(watchedEnganche || "0") > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Enganche ({watchedEnganche}%):</span>
                                  <span className="font-medium">${manualSchemeCalculations.montoEnganche.toLocaleString()}</span>
                                </div>
                              )}
                              {parseFloat(watchedMensualidades || "0") > 0 && (
                                <>
                                  <div className="flex justify-between">
                                    <span className="text-muted-foreground">Mensualidades ({watchedMensualidades}%):</span>
                                    <span className="font-medium">${manualSchemeCalculations.montoMensualidades.toLocaleString()}</span>
                                  </div>
                                  {manualSchemeCalculations.numMensualidades > 0 && (
                                    <div className="flex justify-between pl-4 text-xs">
                                      <span className="text-muted-foreground">{manualSchemeCalculations.numMensualidades} pagos de:</span>
                                      <span>${manualSchemeCalculations.montoPorMensualidad.toLocaleString()}</span>
                                    </div>
                                  )}
                                </>
                              )}
                              {parseFloat(watchedEntrega || "0") > 0 && (
                                <div className="flex justify-between">
                                  <span className="text-muted-foreground">Entrega ({watchedEntrega}%):</span>
                                  <span className="font-medium">${manualSchemeCalculations.montoEntrega.toLocaleString()}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show error if no schemes and manual not available */}
                    {productPaymentSchemes.length === 0 && selectedMode === "precargada" && (
                      <Card className="border-destructive/50 bg-destructive/10">
                        <CardContent className="p-4 flex items-center gap-3">
                          <AlertCircle className="h-5 w-5 text-destructive flex-shrink-0" />
                          <div>
                            <p className="font-medium text-destructive">
                              Sin esquemas de pago disponibles
                            </p>
                            <p className="text-sm text-destructive/80">
                              Este producto no tiene esquemas de pago configurados. Usa el modo Manual para crear uno.
                            </p>
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  <Separator />

                  {/* Comprador Section Title */}
                  <h3 className="text-lg font-semibold">3. Datos del Comprador</h3>
                </>
              )}

              {/* Only show buyer fields after product is selected */}
              {selectedProductData && (
                <>
            {/* Comprador Actual Checkbox - Only show when property is not "Disponible" */}
            {property?.disponibilidad !== "Disponible" && (
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
            )}

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
                </div>

                <div className="grid grid-cols-[auto,1fr] gap-4 items-end">
                  <FormField
                    control={form.control}
                    name="clave_pais_telefono"
                    render={({ field }) => (
                      <FormItem className="w-24">
                        <FormLabel>País *</FormLabel>
                        <Select 
                          onValueChange={field.onChange} 
                          value={field.value}
                          disabled={isFieldDisabled}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="--" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="MX">🇲🇽 +52</SelectItem>
                            <SelectItem value="US">🇺🇸 +1</SelectItem>
                            <SelectItem value="CA">🇨🇦 +1</SelectItem>
                          </SelectContent>
                        </Select>
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
                            placeholder="10 dígitos"
                            disabled={isFieldDisabled}
                            maxLength={10}
                            {...field}
                            onChange={(e) => {
                              const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                              field.onChange(value);
                            }}
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
                </>
              )}

              <div className="flex items-center justify-between gap-4 pt-2">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="sendEmailOnGenerateProduct"
                    checked={sendEmailOnGenerate}
                    onCheckedChange={(checked) => setSendEmailOnGenerate(checked === true)}
                  />
                  <label
                    htmlFor="sendEmailOnGenerateProduct"
                    className="text-sm text-foreground cursor-pointer"
                  >
                    Enviar oferta por correo al prospecto
                  </label>
                </div>
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => setOpen(false)}>
                    Cancelar
                  </Button>
                  {selectedProductData && (
                    <Button
                      onClick={() => void handleGenerateOffer()}
                      disabled={isGenerating || (selectedMode === "precargada" && productPaymentSchemes.length === 0)}
                    >
                      {isGenerating ? "Generando..." : "Generar Oferta"}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </Form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-amber-500" />
              Confirmar generación de oferta
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <p>La oferta se generará sin sección de datos bancarios por lo siguiente:</p>
              <ul className="ml-5 list-disc">
                {confirmReasons.map((reason, idx) => (
                  <li key={idx}>{reason}.</li>
                ))}
              </ul>
              <p className="text-sm text-muted-foreground">¿Deseas continuar?</p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={handleCancelGenerate}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleConfirmGenerate}>Continuar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
                        {product.categorias_producto?.tiene_metraje ? 'Precio por m²' : 'Precio'}: ${parseFloat(product.precio_lista).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
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
