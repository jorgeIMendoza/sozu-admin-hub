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
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
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
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  FormDescription,
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
import { Checkbox } from "@/components/ui/checkbox";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText, Check, ChevronsUpDown, UserPlus, Warehouse, Car, Info, AlertTriangle, Plus, Trash2, X, Mail } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useAgentImpersonation } from "@/contexts/AgentImpersonationContext";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { Switch } from "@/components/ui/switch";
import { isValidRFC } from "@/utils/fiscalDataValidation";
import { CurrencyInput } from "@/components/ui/currency-input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// Interface for tiered monthly payments (tramos de mensualidades)
interface TramoMensualidad {
  id: string;
  numero_mensualidades: number;
  monto: number; // stored as cents for CurrencyInput
}

const baseProspectSchema = z.object({
  tipo_persona: z.string().min(1, "El tipo de persona es requerido"),
  nombre_completo: z.string().min(1, "El nombre completo es requerido"),
  email: z.string().email("Email inválido"),
  clave_pais_telefono: z.string().min(1, "Selecciona el código de país"),
  telefono: z.string()
    .min(10, "El teléfono debe tener exactamente 10 dígitos")
    .max(10, "El teléfono debe tener exactamente 10 dígitos")
    .regex(/^[0-9]{10}$/, "El teléfono debe contener solo números y tener exactamente 10 dígitos"),
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
  curp: z.string()
    .optional()
    .refine((val) => {
      if (!val || val === "") return true;
      return /^[A-Z]{4}[0-9]{6}[HM][A-Z]{5}[0-9A-Z][0-9]$/.test(val);
    }, "Formato de CURP inválido")
    .refine((val) => {
      if (!val || val === "") return true;
      return val.length === 18;
    }, "La CURP debe tener exactamente 18 caracteres"),
});

const manualPaymentSchema = z.object({
  porcentaje_enganche: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Debe ser un número válido mayor o igual a 0"),
  porcentaje_mensualidades: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Debe ser un número válido mayor o igual a 0"),
  porcentaje_entrega: z.string().refine((val) => !isNaN(parseFloat(val)) && parseFloat(val) >= 0, "Debe ser un número válido mayor o igual a 0"),
  numero_mensualidades: z.string().min(1, "El número de mensualidades es requerido"),
  numero_pagos_enganche: z.string()
    .refine((val) => {
      const num = parseInt(val);
      return !isNaN(num) && num >= 1 && num <= 2;
    }, "Debe ser un número entre 1 y 2")
    .optional(),
  porcentaje_descuento_aumento: z.string().optional(),
});

const formSchema = z.object({
  mode: z.enum(["precargada", "manual"]).default("precargada"),
  selectedPersonId: z.number().optional(),
  ...baseProspectSchema.shape,
  // Opciones de visualización en PDF
  mostrar_piso_en_oferta: z.boolean().default(true),
  mostrar_precio_m2_en_oferta: z.boolean().default(true),
  mostrar_seccion_efectivo_en_oferta: z.boolean().default(true),
  // Manual payment fields - only validated when mode is "manual"
  porcentaje_enganche: z.string().optional(),
  porcentaje_mensualidades: z.string().optional(),
  porcentaje_entrega: z.string().optional(),
  numero_mensualidades: z.string().optional(),
  numero_pagos_enganche: z.string().optional(),
  porcentaje_descuento_aumento: z.string().optional(),
}).refine((data) => {
  if (data.mode === "manual") {
    // Validate required fields for manual mode
    if (!data.porcentaje_enganche || data.porcentaje_enganche === "") {
      return false;
    }
    if (!data.porcentaje_mensualidades || data.porcentaje_mensualidades === "") {
      return false;
    }
    if (!data.porcentaje_entrega || data.porcentaje_entrega === "") {
      return false;
    }
    if (!data.numero_mensualidades || data.numero_mensualidades === "") {
      return false;
    }
    
    // Validate numeric values
    const enganche = parseFloat(data.porcentaje_enganche);
    const mensualidades = parseFloat(data.porcentaje_mensualidades);
    const entrega = parseFloat(data.porcentaje_entrega);
    
    if (isNaN(enganche) || enganche < 0) return false;
    if (isNaN(mensualidades) || mensualidades < 0) return false;
    if (isNaN(entrega) || entrega < 0) return false;
    
    // Validate percentages sum to 100
    const total = enganche + mensualidades + entrega;
    return Math.abs(total - 100) < 0.01;
  }
  return true;
}, {
  message: "Para modo manual: todos los campos de pago son requeridos y los porcentajes deben sumar 100%",
  path: ["mode"]
});

type FormData = z.infer<typeof formSchema>;

interface NewOfferDialogProps {
  propertyId: number;
  propertyNumber: string;
  forceManualMode?: boolean; // For resale properties that require manual mode only
  hideManualMode?: boolean; // Hide the manual mode option (for inmobiliarias portal)
  hidePdfOptions?: boolean; // Hide PDF visualization options (for inmobiliarias portal)
  customTrigger?: React.ReactNode; // Optional custom trigger element
  preSelectedSchemeId?: number | null; // Pre-selected payment scheme from inventory detail
  onTrackSubmit?: () => void; // Optional callback to track "Generar Oferta" submit inside modal
  onTrackFillIntent?: () => void;
  hideBankingInPdf?: boolean;
  forceLight?: boolean; // Force light mode on dialog (for agent portal on mobile)
}

export function NewOfferDialog({ propertyId, propertyNumber, forceManualMode = false, hideManualMode = false, hidePdfOptions = false, customTrigger, preSelectedSchemeId, onTrackSubmit, onTrackFillIntent, hideBankingInPdf = false, forceLight = false }: NewOfferDialogProps) {
  const fillIntentTracked = React.useRef(false);
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [sendEmailOnGenerate, setSendEmailOnGenerate] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [productSchemeSelections, setProductSchemeSelections] = useState<Record<number, number | null>>({});
  const [propertySchemeSelection, setPropertySchemeSelection] = useState<number | null>(null);
  const [localSchemeId, setLocalSchemeId] = useState<number | null>(null);
  const [usarTramosPersonalizados, setUsarTramosPersonalizados] = useState(false);
  const [tramosMensualidad, setTramosMensualidad] = useState<TramoMensualidad[]>([]);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { impersonatedAgentPersonaId, isImpersonating } = useAgentImpersonation();
  const { registrarGeneracionOferta } = useActivityLogger();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      mode: forceManualMode ? "manual" : "precargada",
      selectedPersonId: undefined,
      tipo_persona: "pf",
      nombre_completo: "",
      email: "",
      clave_pais_telefono: "MX",
      telefono: "",
      rfc: "",
      curp: "",
      mostrar_piso_en_oferta: true,
      mostrar_precio_m2_en_oferta: true,
      mostrar_seccion_efectivo_en_oferta: true,
      porcentaje_enganche: "",
      porcentaje_mensualidades: "", 
      porcentaje_entrega: "",
      numero_mensualidades: "",
      numero_pagos_enganche: "1",
      porcentaje_descuento_aumento: "",
    },
  });

  const selectedMode = form.watch("mode");
  const selectedPersonType = form.watch("tipo_persona");

  // Watch percentage fields for manual payment validation
  const watchedEnganche = form.watch("porcentaje_enganche");
  const watchedMensualidades = form.watch("porcentaje_mensualidades");
  const watchedNumeroPagosEnganche = form.watch("numero_pagos_enganche");
  const remainingPercentage = 100 - (parseFloat(watchedEnganche || "0") + parseFloat(watchedMensualidades || "0"));
  const porcentajePorPago = watchedNumeroPagosEnganche && watchedEnganche 
    ? (parseFloat(watchedEnganche) / parseInt(watchedNumeroPagosEnganche)).toFixed(2)
    : "0.00";

  // Determine effective persona ID for prospect filtering
  const isSuperAdmin = profile?.rol_id === 1 || profile?.rol_id === 2;
  const effectivePersonaId = isImpersonating ? impersonatedAgentPersonaId : profile?.id_persona;
  const shouldFilterByOwner = !isSuperAdmin || isImpersonating;

  // Search persons query - filtered by ownership for non-super-admins
  const { data: persons = [] } = useQuery({
    queryKey: ["persons-search", searchTerm, shouldFilterByOwner, effectivePersonaId],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      
      if (shouldFilterByOwner && effectivePersonaId) {
        // Filter through entidades_relacionadas to only show owned prospects
        const { data, error } = await supabase
          .from("entidades_relacionadas")
          .select("personas!entidades_relacionadas_id_persona_fkey(id, nombre_legal, email, telefono, clave_pais_telefono, rfc, curp, tipo_persona)")
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
      
      // Super admin without impersonation - search all personas
      const { data, error } = await supabase
        .from("personas")
        .select("id, nombre_legal, email, telefono, clave_pais_telefono, rfc, curp, tipo_persona")
        .ilike("nombre_legal", `%${searchTerm}%`)
        .eq("activo", true)
        .limit(10);
      
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2,
  });

  // Initialize localSchemeId from preSelectedSchemeId when dialog opens
  useEffect(() => {
    if (open) {
      setLocalSchemeId(preSelectedSchemeId || null);
    }
  }, [open, preSelectedSchemeId]);

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        mode: forceManualMode ? "manual" : "precargada",
        selectedPersonId: undefined,
        tipo_persona: "pf",
        nombre_completo: "",
        email: "",
        clave_pais_telefono: "MX",
        telefono: "",
        rfc: "",
        curp: "",
        mostrar_piso_en_oferta: true,
        mostrar_precio_m2_en_oferta: true,
        mostrar_seccion_efectivo_en_oferta: true,
        porcentaje_enganche: "",
        porcentaje_mensualidades: "",
        porcentaje_entrega: "",
        numero_mensualidades: "",
        numero_pagos_enganche: "1",
        porcentaje_descuento_aumento: "",
      });
      setSelectedPerson(null);
      setSearchTerm("");
      setUsarTramosPersonalizados(false);
      setTramosMensualidad([]);
      fillIntentTracked.current = false;
    }
  }, [open, form]);

  // Fill form when person is selected
  useEffect(() => {
    if (selectedPerson) {
      form.setValue("selectedPersonId", selectedPerson.id);
      form.setValue("tipo_persona", selectedPerson.tipo_persona);
      form.setValue("nombre_completo", selectedPerson.nombre_legal);
      form.setValue("email", selectedPerson.email);
      form.setValue("clave_pais_telefono", selectedPerson.clave_pais_telefono || "MX");
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
      clave_pais_telefono: "MX",
      telefono: "",
      rfc: "",
      curp: "",
      mostrar_piso_en_oferta: true,
      mostrar_precio_m2_en_oferta: true,
      mostrar_seccion_efectivo_en_oferta: true,
      porcentaje_enganche: "",
      porcentaje_mensualidades: "",
      porcentaje_entrega: "",
      numero_mensualidades: "",
      numero_pagos_enganche: "1",
      porcentaje_descuento_aumento: "",
    });
    setUsarTramosPersonalizados(false);
    setTramosMensualidad([]);
  };

  // Helper functions for tramos
  const addTramo = () => {
    if (tramosMensualidad.length < 3) {
      setTramosMensualidad([
        ...tramosMensualidad,
        { id: crypto.randomUUID(), numero_mensualidades: 0, monto: 0 }
      ]);
    }
  };

  const removeTramo = (id: string) => {
    setTramosMensualidad(tramosMensualidad.filter(t => t.id !== id));
  };

  const updateTramo = (id: string, field: 'numero_mensualidades' | 'monto', value: number) => {
    setTramosMensualidad(tramosMensualidad.map(t => 
      t.id === id ? { ...t, [field]: value } : t
    ));
  };

  

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map(word => word.charAt(0))
      .join('')
      .toUpperCase();
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
          precio_lista,
          entidades_relacionadas!id_entidad_relacionada_dueno(
            proyectos!entidades_relacionadas_id_proyecto_fkey(
              id,
              nombre,
              mostrar_piso_en_oferta,
              mostrar_precio_m2_en_oferta,
              mostrar_seccion_efectivo_en_oferta
            )
          )
        `)
        .eq("id", propertyId)
        .maybeSingle();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch bodegas and estacionamientos for this property with product prices and payment schemes
  const { data: includedProducts, isLoading: isLoadingProducts } = useQuery({
    queryKey: ["property-included-products-with-schemes", propertyId],
    queryFn: async () => {
      console.log('[DEBUG] Fetching products for propertyId:', propertyId);
      
      const [bodegasRes, estacionamientosRes] = await Promise.all([
        supabase
          .from("bodegas")
          .select("id, nombre, es_incluido, m2, id_producto, productos_servicios!bodegas_id_producto_fkey(id, precio_lista, nombre, id_entidad_relacionada_dueno)")
          .eq("id_propiedad", propertyId)
          .eq("activo", true),
        supabase
          .from("estacionamientos")
          .select("id, nombre, es_incluido, m2, id_producto, productos_servicios!estacionamientos_id_producto_fkey(id, precio_lista, nombre, id_entidad_relacionada_dueno)")
          .eq("id_propiedad", propertyId)
          .eq("activo", true)
      ]);

      console.log('[DEBUG] bodegasRes.data:', bodegasRes.data);
      console.log('[DEBUG] bodegasRes.error:', bodegasRes.error);
      console.log('[DEBUG] estacionamientosRes.data:', estacionamientosRes.data);
      console.log('[DEBUG] estacionamientosRes.error:', estacionamientosRes.error);

      // Fetch entidades_relacionadas data for cuenta_madre_stp
      const entidadIds = [
        ...(bodegasRes.data || []).map(b => (b.productos_servicios as any)?.id_entidad_relacionada_dueno),
        ...(estacionamientosRes.data || []).map(e => (e.productos_servicios as any)?.id_entidad_relacionada_dueno)
      ].filter((id): id is number => !!id);
      console.log('[DEBUG] extracted entidadIds:', entidadIds);

      let entidadesMap: Record<number, { cuenta_madre_stp: string | null; nombre_dueno: string }> = {};
      if (entidadIds.length > 0) {
        const { data: entidades, error: entidadesError } = await supabase
          .from("entidades_relacionadas")
          .select("id, cuenta_madre_stp, personas!entidades_relacionadas_id_persona_fkey(nombre_legal)")
          .in("id", [...new Set(entidadIds)]);
        
        console.log('[DEBUG] entidadIds:', entidadIds);
        console.log('[DEBUG] entidades query result:', entidades);
        console.log('[DEBUG] entidades query error:', entidadesError);
        
        if (entidades) {
          entidades.forEach((e: any) => {
            entidadesMap[e.id] = {
              cuenta_madre_stp: e.cuenta_madre_stp,
              nombre_dueno: e.personas?.nombre_legal || 'Dueño no configurado'
            };
          });
        }
      }
      console.log('[DEBUG] entidadesMap:', entidadesMap);

      // For each product with price > 0, fetch its payment schemes
      const allProducts = [
        ...(bodegasRes.data || []).map(b => ({ ...b, tipo: 'bodega' as const })),
        ...(estacionamientosRes.data || []).map(e => ({ ...e, tipo: 'estacionamiento' as const }))
      ];

      // Fetch payment schemes for all products
      const productIds = allProducts
        .filter(p => {
          const precioLista = (p.productos_servicios as any)?.precio_lista || 0;
          const m2 = p.m2 || 0;
          return (precioLista * m2) > 0;
        })
        .map(p => p.id_producto)
        .filter((id): id is number => !!id);

      let schemesMap: Record<number, any[]> = {};
      if (productIds.length > 0) {
        const { data: schemes } = await supabase
          .from("esquemas_pago")
          .select("*")
          .in("id_producto", productIds)
          .eq("es_manual", false)
          .eq("activo", true);
        
        if (schemes) {
          schemesMap = schemes.reduce((acc, scheme) => {
            if (!acc[scheme.id_producto]) {
              acc[scheme.id_producto] = [];
            }
            acc[scheme.id_producto].push(scheme);
            return acc;
          }, {} as Record<number, any[]>);
        }
      }

      return {
        bodegas: (bodegasRes.data || []).map(b => {
          const entidadId = (b.productos_servicios as any)?.id_entidad_relacionada_dueno;
          const entidadInfo = entidadId ? entidadesMap[entidadId] : null;
          return {
            ...b,
            paymentSchemes: schemesMap[b.id_producto] || [],
            entidadInfo
          };
        }),
        estacionamientos: (estacionamientosRes.data || []).map(e => {
          const entidadId = (e.productos_servicios as any)?.id_entidad_relacionada_dueno;
          const entidadInfo = entidadId ? entidadesMap[entidadId] : null;
          return {
            ...e,
            paymentSchemes: schemesMap[e.id_producto] || [],
            entidadInfo
          };
        })
      };
    },
    enabled: open && !!propertyId,
  });

  // Get project ID from property details
  const projectId = propertyDetails?.entidades_relacionadas?.proyectos?.id;

  // Fetch property payment schemes for the confirmation dialog (by project, not property)
  const { data: propertyPaymentSchemes = [] } = useQuery({
    queryKey: ["property-payment-schemes-dialog", projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data, error } = await supabase
        .from("esquemas_pago")
        .select("id, nombre, porcentaje_enganche, porcentaje_mensualidades, porcentaje_entrega, numero_mensualidades, porcentaje_descuento_aumento")
        .eq("id_proyecto", projectId)
        .is("id_producto", null)
        .eq("es_manual", false)
        .eq("activo", true);
      
      if (error) throw error;
      return data || [];
    },
    enabled: open && !!projectId,
  });

  // Update form values when project config loads
  useEffect(() => {
    if (propertyDetails?.entidades_relacionadas?.proyectos) {
      const projectConfig = propertyDetails.entidades_relacionadas.proyectos;
      form.setValue("mostrar_piso_en_oferta", projectConfig.mostrar_piso_en_oferta ?? true);
      form.setValue("mostrar_precio_m2_en_oferta", projectConfig.mostrar_precio_m2_en_oferta ?? true);
      form.setValue("mostrar_seccion_efectivo_en_oferta", projectConfig.mostrar_seccion_efectivo_en_oferta ?? true);
    }
  }, [propertyDetails, form]);

  const createOfferMutation = useMutation({
    mutationFn: async ({ data, schemeSelections, propertySchemeId }: { 
      data: FormData; 
      schemeSelections: Record<number, number | null>;
      propertySchemeId?: number | null;
    }) => {
      console.log("Mutation function called with:", data);
      let personId = data.selectedPersonId;
      
      // Create, get, or update person
      if (!personId) {
        console.log("No person ID, checking for existing person...");
        // Check if person already exists by RFC
        const { data: existingPerson } = await supabase
          .from("personas")
          .select("id")
          .eq("rfc", data.rfc)
          .eq("activo", true)
          .maybeSingle();

        if (existingPerson) {
          console.log("Found existing person:", existingPerson);
          personId = existingPerson.id;
        } else {
          console.log("Creating new person...");
          // Create new person
          const personData = {
            tipo_persona: data.tipo_persona,
            nombre_legal: data.nombre_completo,
            email: data.email,
            clave_pais_telefono: data.clave_pais_telefono || 'MX',
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

          if (personError) {
            console.error("Person creation error:", personError);
            throw personError;
          }
          console.log("Created new person:", newPerson);
          personId = newPerson.id;
        }
      } else if (selectedPerson) {
        console.log("Updating existing person if needed...");
        // Update existing person if data has changed
        const hasChanges = 
          selectedPerson.tipo_persona !== data.tipo_persona ||
          selectedPerson.nombre_legal !== data.nombre_completo ||
          selectedPerson.email !== data.email ||
          selectedPerson.telefono !== data.telefono ||
          selectedPerson.rfc !== data.rfc ||
          selectedPerson.curp !== data.curp;

        if (hasChanges) {
          console.log("Person has changes, updating...");
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

          if (updateError) {
            console.error("Person update error:", updateError);
            throw updateError;
          }
          console.log("Person updated successfully");
        }
      }

      // Use propertySchemeId if provided from confirmation dialog, otherwise null for manual mode
      let schemeId: number | null = propertySchemeId || null;

      // If manual mode, create payment scheme
      if (data.mode === "manual") {
        console.log("Manual mode, creating payment scheme...");
        // Validate percentages sum to 100 before attempting to save
        const enganche = parseFloat(data.porcentaje_enganche || "0");
        const mensualidades = parseFloat(data.porcentaje_mensualidades || "0");
        const entrega = parseFloat(data.porcentaje_entrega || "0");
        const total = enganche + mensualidades + entrega;
        
        console.log("Payment percentages - Enganche:", enganche, "Mensualidades:", mensualidades, "Entrega:", entrega, "Total:", total);
        
        if (Math.abs(total - 100) >= 0.01) {
          console.error("Percentages don't sum to 100:", total);
          throw new Error("Los porcentajes de enganche, mensualidades y entrega deben sumar exactamente 100%");
        }

        const projectId = propertyDetails?.entidades_relacionadas?.proyectos?.id;
        const projectName = propertyDetails?.entidades_relacionadas?.proyectos?.nombre;
        
        console.log("Project details:", { projectId, projectName });
        
        if (projectId && projectName) {
          const initials = getInitials(data.nombre_completo);
          const schemeName = `manual_${propertyNumber}_${projectName}_${initials}`;
          
          console.log("Creating scheme with name:", schemeName);
          
          const schemeData: any = {
            id_proyecto: projectId,
            nombre: schemeName,
            porcentaje_enganche: parseFloat(data.porcentaje_enganche || "0"),
            porcentaje_mensualidades: parseFloat(data.porcentaje_mensualidades || "0"),
            porcentaje_entrega: parseFloat(data.porcentaje_entrega || "0"),
            numero_mensualidades: parseInt(data.numero_mensualidades || "0"),
            numero_pagos_enganche: parseInt(data.numero_pagos_enganche || "1"),
            porcentaje_descuento_aumento: parseFloat(data.porcentaje_descuento_aumento || "0"),
            es_manual: true,
            activo: true,
            // Add tiered monthly payments if enabled
            tramos_mensualidad: usarTramosPersonalizados && tramosMensualidad.length > 0
              ? tramosMensualidad.map((t, i) => ({
                  orden: i + 1,
                  numero_mensualidades: t.numero_mensualidades,
                  monto: t.monto / 100 // Convert from cents to decimal
                }))
              : null
          };

          const { data: newScheme, error: schemeError } = await supabase
            .from("esquemas_pago")
            .insert(schemeData)
            .select("id")
            .single();

          if (schemeError) {
            console.error("Scheme creation error:", schemeError);
            throw schemeError;
          }
          console.log("Created scheme:", newScheme);
          schemeId = newScheme.id;
        }
      }

      // Finally, create the offer
      console.log("Creating offer...");
      const offerData = {
        id_propiedad: propertyId,
        id_persona_lead: personId,
        id_esquema_pago_seleccionado: schemeId,
        mostrar_piso_en_oferta: data.mostrar_piso_en_oferta,
        mostrar_precio_m2_en_oferta: data.mostrar_precio_m2_en_oferta,
        mostrar_seccion_efectivo_en_oferta: data.mostrar_seccion_efectivo_en_oferta,
        activo: true,
        email_creador: profile?.email || ''
        // Remove fecha_generacion to let the database set it with DEFAULT CURRENT_TIMESTAMP
      };

      console.log("Offer data:", offerData);

      const { data: newOffer, error: offerError } = await supabase
        .from("ofertas")
        .insert(offerData)
        .select('id')
        .single();

      if (offerError) {
        console.error("Offer creation error:", offerError);
        throw offerError;
      }

      console.log("Created offer:", newOffer);

      // Ensure prospect ownership is assigned to the offer creator agent persona
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

      // Check if person exists in entidades_relacionadas for this project
      const projectId = propertyDetails?.entidades_relacionadas?.proyectos?.id;
      if (projectId && personId) {
        console.log("Checking if person exists in entidades_relacionadas for project:", projectId);

        const { data: existingRelation } = await supabase
          .from("entidades_relacionadas")
          .select("id, id_persona_duena_lead")
          .eq("id_persona", personId)
          .eq("id_proyecto", projectId)
          .eq("id_tipo_entidad", 7)
          .eq("activo", true)
          .maybeSingle();

        if (!existingRelation) {
          console.log("Person not found in entidades_relacionadas, creating new relation...");

          const relationData = {
            id_persona: personId,
            id_proyecto: projectId,
            id_tipo_entidad: 7, // Cliente/Lead
            id_estatus_persona: 3, // Abierto
            id_persona_duena_lead: resolvedOwnerPersonaId,
            activo: true,
          };

          const { error: relationError } = await supabase
            .from("entidades_relacionadas")
            .insert(relationData);

          if (relationError) {
            console.error("Error creating entidades_relacionadas:", relationError);
            // Don't throw error to not interrupt the offer creation flow
          } else {
            console.log("Created new entidades_relacionadas record");
          }
        } else if (resolvedOwnerPersonaId && existingRelation.id_persona_duena_lead !== resolvedOwnerPersonaId) {
          await supabase
            .from("entidades_relacionadas")
            .update({ id_persona_duena_lead: resolvedOwnerPersonaId })
            .eq("id", existingRelation.id);
          console.log("Updated prospect relation owner to offer creator");
        }
      }

      // Generate automatic product offers for bodegas and estacionamientos with price > 0
      const productOffersResults: { 
        created: number; 
        warnings: string[];
        createdOffers: Array<{
          offerId: number;
          productId: number;
          productName: string;
        }>;
      } = { created: 0, warnings: [], createdOffers: [] };
      
      // Fetch bodegas for this property
      const { data: allBodegas } = await supabase
        .from("bodegas")
        .select(`
          id, nombre, id_producto, m2,
          productos_servicios!bodegas_id_producto_fkey(id, nombre, precio_lista, id_entidad_relacionada_dueno)
        `)
        .eq("id_propiedad", propertyId)
        .eq("activo", true);

      // Fetch estacionamientos for this property
      const { data: allEstacionamientos } = await supabase
        .from("estacionamientos")
        .select(`
          id, nombre, id_producto, m2,
          productos_servicios!estacionamientos_id_producto_fkey(id, nombre, precio_lista, id_entidad_relacionada_dueno)
        `)
        .eq("id_propiedad", propertyId)
        .eq("activo", true);

      const allProducts = [
        ...(allBodegas || []).map(b => ({ ...b, tipo: 'bodega' })),
        ...(allEstacionamientos || []).map(e => ({ ...e, tipo: 'estacionamiento' }))
      ];

      for (const product of allProducts) {
        const productService = product.productos_servicios as any;
        const productId = product.id_producto;
        const precioLista = productService?.precio_lista || 0;
        const m2 = product.m2 || 0;
        const precioFinal = precioLista * m2;
        
        // Only generate offer if price is greater than 0
        if (precioFinal <= 0) {
          console.log(`Skipping product offer for ${product.nombre} - price is 0 (included in apartment)`);
          continue;
        }

        // Fetch payment schemes for this product with es_manual = false
        const { data: productSchemes } = await supabase
          .from("esquemas_pago")
          .select("*")
          .eq("id_producto", productId)
          .eq("es_manual", false)
          .eq("activo", true)
          .order("id", { ascending: true });

        if (!productSchemes || productSchemes.length === 0) {
          productOffersResults.warnings.push(
            `${product.tipo === 'bodega' ? 'Bodega' : 'Estacionamiento'} "${product.nombre}" no tiene esquemas de pago configurados`
          );
          continue;
        }

        // Use user-selected scheme or null if "sin seleccionar"
        const selectedSchemeId = schemeSelections[productId];

        // Generate or reuse CLABE only if a payment scheme is selected
        let clabeData: string | null = null;
        let clabeResult: { clabe: string; sourceOfferIds: number[]; isNew: boolean } | null = null;
        if (selectedSchemeId && productService?.id_entidad_relacionada_dueno) {
          try {
            const { getOrCreateProductClabe } = await import('@/utils/clabeReuseUtils');
            clabeResult = await getOrCreateProductClabe(
              propertyId,
              productId,
              productService.id_entidad_relacionada_dueno
            );
            clabeData = clabeResult.clabe;
            console.log(`✅ CLABE obtenida para ${product.nombre}:`, clabeData);
          } catch (clabeError: any) {
            console.error(`Error generating CLABE for ${product.nombre}:`, clabeError);
            productOffersResults.warnings.push(
              `Error al generar CLABE para ${product.tipo === 'bodega' ? 'bodega' : 'estacionamiento'} "${product.nombre}": ${clabeError.message}`
            );
            continue;
          }
        }

        // Limpiar CLABEs de ofertas fuente ANTES del INSERT para evitar violación de unique constraint
        if (clabeResult && clabeResult.sourceOfferIds.length > 0) {
          const { clearSourceOfferClabes } = await import('@/utils/clabeReuseUtils');
          await clearSourceOfferClabes(clabeResult.sourceOfferIds);
        }

        const productOfferData = {
          id_propiedad: propertyId,
          id_producto: productId,
          id_persona_lead: personId, // Same client as property offer
          id_esquema_pago_seleccionado: selectedSchemeId || null,
          clabe_stp_tmp_producto: clabeData,
          activo: true,
          email_creador: profile?.email || ''
        };

        const { data: createdProductOffer, error: productOfferError } = await supabase
          .from("ofertas")
          .insert(productOfferData)
          .select('id')
          .single();

        if (productOfferError) {
          console.error(`Error creating product offer for ${product.nombre}:`, productOfferError);
          productOffersResults.warnings.push(
            `Error al crear oferta para ${product.tipo === 'bodega' ? 'bodega' : 'estacionamiento'} "${product.nombre}"`
          );
        } else {
          productOffersResults.created++;
          productOffersResults.createdOffers.push({
            offerId: createdProductOffer.id,
            productId: productId,
            productName: product.nombre
          });
          console.log(`Created product offer for ${product.nombre} with ID ${createdProductOffer.id}`);
        }
      }

      // Return data needed for PDF generation
      return {
        offerId: newOffer.id,
        personId,
        leadName: data.nombre_completo,
        leadEmail: data.email,
        leadPhone: data.telefono,
        productOffersResults,
        schemeId,
        leadRfc: data.rfc || null
      };
    },
    onSuccess: async (result) => {
      // Registrar actividad de generación de oferta
      registrarGeneracionOferta({
        id_oferta: result.offerId,
        id_propiedad: propertyId,
        numero_propiedad: propertyNumber,
        id_persona_lead: result.personId,
        nombre_lead: result.leadName,
        email_lead: result.leadEmail,
        ofertas_productos: result.productOffersResults.created,
        creador: profile?.email
      });

      // Show main offer success message
      toast({
        title: "Oferta creada",
        description: `La oferta para la propiedad ${propertyNumber} ha sido generada exitosamente.`,
      });


      // Show product offers results
      if (result.productOffersResults.created > 0) {
        toast({
          title: "Ofertas de productos generadas",
          description: `Se generaron ${result.productOffersResults.created} oferta(s) de productos.`,
        });
      }

      if (result.productOffersResults.warnings.length > 0) {
        result.productOffersResults.warnings.forEach(warning => {
          toast({
            title: "Aviso",
            description: warning,
            variant: "destructive",
          });
        });
      }
      
      // Generate PDFs client-side and download
      let allOfferIdsForEmail: number[] = [];
      const emailServicePromise = import('@/services/ofertaEmailService');
      try {
        const allOfferIds = [result.offerId];
        for (const productOffer of result.productOffersResults.createdOffers) {
          allOfferIds.push(productOffer.offerId);
        }
        allOfferIdsForEmail = allOfferIds;

        toast({
          title: "Generando PDFs...",
          description: `Preparando ${allOfferIds.length} PDF(s) para descarga`,
        });

        const { generateOfferPDFAsBase64 } = await import('@/services/htmlToPdfService');
        const generatedPdfFiles: { blob: Blob; filename: string; offerId: number; tipo: string; url: string }[] = [];
        const preGeneratedAttachments: { base64: string; filename: string; offerId: number; tipo: string }[] = [];

        // Generate main property offer PDF
        const mainPdfs = await generateOfferPDFAsBase64({
          propertyId,
          offerId: result.offerId,
          propertyNumber,
          leadName: result.leadName,
          leadEmail: result.leadEmail,
          leadPhone: result.leadPhone || '',
          creatorEmail: profile?.email || '',
        });
        for (const pdf of mainPdfs) {
          generatedPdfFiles.push({ blob: pdf.blob, filename: pdf.filename, url: pdf.url, offerId: result.offerId, tipo: 'propiedad' });
          if (pdf.base64) {
            preGeneratedAttachments.push({ base64: pdf.base64, filename: pdf.filename, offerId: result.offerId, tipo: 'propiedad' });
          }
        }

        // Generate product offer PDFs
        for (const productOffer of result.productOffersResults.createdOffers) {
          try {
            const productPdfs = await generateOfferPDFAsBase64({
              propertyId,
              offerId: productOffer.offerId,
              propertyNumber,
              leadName: result.leadName,
              leadEmail: result.leadEmail,
              leadPhone: result.leadPhone || '',
              creatorEmail: profile?.email || '',
              isProductOffer: true,
              productId: productOffer.productId,
            });
            for (const pdf of productPdfs) {
              generatedPdfFiles.push({ blob: pdf.blob, filename: pdf.filename, url: pdf.url, offerId: productOffer.offerId, tipo: 'producto' });
              if (pdf.base64) {
                preGeneratedAttachments.push({ base64: pdf.base64, filename: pdf.filename, offerId: productOffer.offerId, tipo: 'producto' });
              }
            }
          } catch (prodPdfErr) {
            console.error(`Error generating product PDF for ${productOffer.productName}:`, prodPdfErr);
          }
        }

        // Download PDFs directly for all roles
        for (const attachment of generatedPdfFiles) {
          try {
            const url = URL.createObjectURL(attachment.blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = attachment.filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (dlErr) {
            console.error('Error downloading PDF:', dlErr);
          }
        }
        toast({
          title: "Oferta generada",
          description: `Se descargaron ${generatedPdfFiles.length} PDF(s).`,
        });
      } catch (pdfErr) {
        console.error('Error generating/downloading PDFs:', pdfErr);
        toast({
          title: "Error al generar oferta",
          description: "La oferta se creó correctamente, pero hubo un error al generar los PDFs.",
          variant: "destructive",
        });
        queryClient.invalidateQueries({ queryKey: ["properties"] });
        setOpen(false);
        form.reset();
        setSelectedPerson(null);
        setSearchTerm("");
        return;
      }

      try {
        // Reutilizar el módulo ya precargado antes de generar PDFs para evitar fallos de carga tardía en iPhone/WebKit.
        const { sendMultipleOffersEmail, sendMultipleOffersEmailDirect } = await emailServicePromise;
        const emailSent = await sendMultipleOffersEmail({
          offerIds: allOfferIdsForEmail,
          propertyNumber,
          recipientEmail: result.leadEmail,
          recipientName: result.leadName,
        });
        // Si no se envió automáticamente y el usuario eligió enviar antes de generar
        if (!emailSent && sendEmailOnGenerate) {
          await sendMultipleOffersEmailDirect({
            offerIds: allOfferIdsForEmail,
            propertyNumber,
            recipientEmail: result.leadEmail,
            recipientName: result.leadName,
          });
        }
      } catch (emailErr) {
        console.error('Error sending offer email after PDF generation:', emailErr);
        toast({
          title: "PDFs generados",
          description: "Los PDFs se generaron correctamente, pero no se pudo completar el envío por correo.",
          variant: "destructive",
        });
      }

      setSendEmailOnGenerate(false);
      
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setOpen(false);
      form.reset();
      setSelectedPerson(null);
      setSearchTerm("");
    },
    onError: (error: any) => {
      console.error("Error creating offer:", error);
      
      // Handle specific database constraint errors
      if (error?.code === "23505" && error?.details?.includes("rfc")) {
        form.setError("rfc", {
          type: "manual",
          message: "Este RFC ya está registrado en el sistema. Use otro RFC o busque la persona existente."
        });
        return;
      }
      
      // Handle other constraint errors
      if (error?.code === "23505") {
        toast({
          title: "Error de datos duplicados",
          description: "Ya existe un registro con estos datos. Verifique la información ingresada.",
          variant: "destructive",
        });
        return;
      }
      
      // Handle date constraint error
      if (error?.code === "23514" && error?.message?.includes("chk_ofertas_fecha_no_futuro")) {
        toast({
          title: "Error de fecha",
          description: "La fecha de generación no puede ser futura. Contacte al administrador.",
          variant: "destructive",
        });
        return;
      }
      
      // Generic error
      toast({
        title: "Error",
        description: "No se pudo generar la oferta. Inténtalo de nuevo.",
        variant: "destructive",
      });
    },
  });

  // Find selected scheme details
  const selectedSchemeDetails = React.useMemo(() => {
    if (!localSchemeId || !propertyPaymentSchemes) return null;
    return propertyPaymentSchemes.find((s: any) => s.id === localSchemeId) || null;
  }, [localSchemeId, propertyPaymentSchemes]);

  // Calculate property price and products total
  const priceCalculations = React.useMemo(() => {
    const propertyPrice = propertyDetails?.precio_lista || 0;
    
    // Apply scheme adjustment if a scheme is selected
    const schemeAdjustment = selectedSchemeDetails?.porcentaje_descuento_aumento || 0;
    const adjustedPropertyPrice = propertyPrice * (1 + schemeAdjustment / 100);
    
    let productsTotal = 0;
    if (includedProducts) {
      includedProducts.bodegas.forEach((b: any) => {
        const precio = (b.productos_servicios as any)?.precio_lista || 0;
        const m2 = b.m2 || 0;
        productsTotal += precio * m2;
      });
      includedProducts.estacionamientos.forEach((e: any) => {
        const precio = (e.productos_servicios as any)?.precio_lista || 0;
        const m2 = e.m2 || 0;
        productsTotal += precio * m2;
      });
    }
    
    return {
      propertyPrice,
      adjustedPropertyPrice,
      schemeAdjustment,
      productsTotal,
      grandTotal: adjustedPropertyPrice + productsTotal
    };
  }, [propertyDetails?.precio_lista, includedProducts, selectedSchemeDetails]);

  // Calculate products with price > 0 and their scheme status
  const productsWithPriceInfo = React.useMemo(() => {
    if (!includedProducts) return { valid: [], invalid: [], total: 0 };
    
    const allProducts = [
      ...includedProducts.bodegas.map((b: any) => {
        const precioLista = (b.productos_servicios as any)?.precio_lista || 0;
        const m2 = b.m2 || 0;
        return {
          ...b,
          tipo: 'Bodega',
          precioFinal: m2 > 0 ? precioLista * m2 : precioLista,
          hasSchemes: (b.paymentSchemes?.length || 0) > 0,
          hasCuentaMadreStp: !!(b.entidadInfo?.cuenta_madre_stp),
          nombreDueno: b.entidadInfo?.nombre_dueno || 'Dueño no configurado'
        };
      }),
      ...includedProducts.estacionamientos.map((e: any) => {
        const precioLista = (e.productos_servicios as any)?.precio_lista || 0;
        const m2 = e.m2 || 0;
        return {
          ...e,
          tipo: 'Estacionamiento', 
          precioFinal: m2 > 0 ? precioLista * m2 : precioLista,
          hasSchemes: (e.paymentSchemes?.length || 0) > 0,
          hasCuentaMadreStp: !!(e.entidadInfo?.cuenta_madre_stp),
          nombreDueno: e.entidadInfo?.nombre_dueno || 'Dueño no configurado'
        };
      })
    ].filter(p => p.precioFinal > 0 && !p.es_incluido);

    const valid = allProducts.filter(p => p.hasSchemes);
    const invalid = allProducts.filter(p => !p.hasSchemes);
    
    return { valid, invalid, total: allProducts.length };
  }, [includedProducts]);

  // Calculate manual scheme amounts
  const watchedEntrega = form.watch("porcentaje_entrega");
  const watchedNumeroMensualidades = form.watch("numero_mensualidades");
  const watchedDescuentoAumento = form.watch("porcentaje_descuento_aumento");
  
  const manualSchemeCalculations = React.useMemo(() => {
    const basePrice = priceCalculations.propertyPrice;
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
  }, [priceCalculations.propertyPrice, watchedEnganche, watchedMensualidades, watchedEntrega, watchedNumeroMensualidades, watchedDescuentoAumento]);

  // Validate tramos sum equals numero_mensualidades and amounts match expected total
  const tramosValidation = React.useMemo(() => {
    const numeroMensualidadesTotal = parseInt(form.watch("numero_mensualidades") || "0");
    const sumaTramos = tramosMensualidad.reduce((acc, t) => acc + t.numero_mensualidades, 0);
    const isCountValid = sumaTramos === numeroMensualidadesTotal;
    const diferenciaCantidad = numeroMensualidadesTotal - sumaTramos;
    
    // Calculate total money from tramos (monto is in cents, divide by 100)
    const sumaMontos = tramosMensualidad.reduce((acc, t) => acc + (t.numero_mensualidades * (t.monto / 100)), 0);
    
    // Get expected monthly payment amount from calculations
    const montoEsperado = manualSchemeCalculations.montoMensualidades;
    const diferenciaMonto = montoEsperado - sumaMontos;
    const isMontosValid = Math.abs(diferenciaMonto) < 1; // $1 tolerance for rounding
    
    return {
      isCountValid,
      isMontosValid,
      isValid: isCountValid && isMontosValid, // Both validations must pass
      sumaTramos,
      diferenciaCantidad,
      sumaMontos,
      montoEsperado,
      diferenciaMonto,
      hasTramos: tramosMensualidad.length > 0
    };
  }, [tramosMensualidad, form.watch("numero_mensualidades"), manualSchemeCalculations.montoMensualidades]);

  const confirmBankingReasons = React.useMemo(() => {
    if (!pendingFormData) return [] as string[];

    const reasons: string[] = [];
    if (!isValidRFC(pendingFormData.rfc)) reasons.push("el prospecto no tiene un RFC válido");
    if (pendingFormData.mode === "precargada" && !propertySchemeSelection) reasons.push("no se seleccionó un plan de pago");

    return reasons;
  }, [pendingFormData, propertySchemeSelection]);

  const onSubmit = (data: FormData) => {
    console.log("Form submitted successfully!");
    onTrackSubmit?.();

    const missingScheme = data.mode === "precargada" && !localSchemeId;
    const missingRFC = !isValidRFC(data.rfc);
    const shouldShowBankingConfirm = missingScheme || missingRFC;

    if (productsWithPriceInfo.total > 0 || shouldShowBankingConfirm) {
      setPendingFormData(data);
      setPropertySchemeSelection(localSchemeId);
      setShowConfirmDialog(true);
    } else {
      // No products ni advertencias bancarias, proceder directamente
      createOfferMutation.mutate({ data, schemeSelections: {}, propertySchemeId: localSchemeId });
    }
  };

  const handleConfirmGenerate = () => {
    if (pendingFormData) {
      createOfferMutation.mutate({ 
        data: pendingFormData, 
        schemeSelections: productSchemeSelections,
        propertySchemeId: propertySchemeSelection
      });
      setShowConfirmDialog(false);
      setPendingFormData(null);
      setProductSchemeSelections({});
      setPropertySchemeSelection(null);
    }
  };

  const handleCancelGenerate = () => {
    setShowConfirmDialog(false);
    setPendingFormData(null);
    setProductSchemeSelections({});
    setPropertySchemeSelection(null);
    setSendEmailOnGenerate(false);
  };

  const projectName = propertyDetails?.entidades_relacionadas?.proyectos?.nombre;

  return (
    <>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {customTrigger || (
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
            title="Generar oferta"
          >
            <FileText className="h-4 w-4" />
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className={cn("sm:max-w-[600px] max-h-[90vh] overflow-y-auto", forceLight && "light")}>
        <DialogHeader>
          <DialogTitle>Configurar Oferta</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Propiedad <span className="font-semibold">{propertyNumber}</span>
            {projectName && <span className="font-semibold"> de {projectName}</span>}
          </p>
          
          {/* Plan Selector - unified */}
          {selectedMode !== "manual" && propertyPaymentSchemes && propertyPaymentSchemes.length > 0 && (
            <div className={`mt-2 rounded-lg border p-2.5 transition-colors ${
              selectedSchemeDetails
                ? "bg-emerald-50 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800"
                : "bg-muted/40 border-border/60"
            }`}>
              <div className="flex items-center gap-2">
                <FileText className={`h-3.5 w-3.5 shrink-0 ${selectedSchemeDetails ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`} />
                <Select
                  value={localSchemeId?.toString() || "none"}
                  onValueChange={(value) => {
                    setLocalSchemeId(value === "none" ? null : parseInt(value));
                  }}
                >
                  <SelectTrigger className={`h-8 text-xs border-0 shadow-none bg-transparent px-1 ${
                    selectedSchemeDetails ? "text-emerald-700 font-medium dark:text-emerald-300" : "text-muted-foreground"
                  }`}>
                    <SelectValue placeholder="Seleccionar plan de pago..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">
                      <span className="text-muted-foreground italic">Sin plan seleccionado</span>
                    </SelectItem>
                    {propertyPaymentSchemes.map((scheme: any) => (
                      <SelectItem key={scheme.id} value={scheme.id.toString()}>
                        <div className="flex flex-col">
                          <span>{scheme.nombre}</span>
                          <span className="text-xs text-muted-foreground">
                            {(() => {
                              const tramos = scheme.tramos_mensualidad as any[];
                              const hasFixedAmount = tramos?.some((t: any) => t.monto_mensualidad && t.monto_mensualidad > 0);
                              if (hasFixedAmount) {
                                const montoStr = tramos.map((t: any) => `$${(t.monto_mensualidad / 100).toLocaleString('es-MX')}`).join(' / ');
                                return `Eng: ${scheme.porcentaje_enganche || 0}% | Monto de mensualidades: ${montoStr}`;
                              }
                              return `Eng: ${scheme.porcentaje_enganche || 0}% | Mens: ${scheme.porcentaje_mensualidades || 0}% (${scheme.numero_mensualidades || 0} pagos) | Ent: ${scheme.porcentaje_entrega || 0}%`;
                            })()}
                            {(() => {
                              const tramos = scheme.tramos_mensualidad as any[];
                              const hasFixedAmount = tramos?.some((t: any) => t.monto_mensualidad && t.monto_mensualidad > 0);
                              if (!hasFixedAmount && scheme.porcentaje_descuento_aumento) {
                                return ` | ${scheme.porcentaje_descuento_aumento > 0 ? '+' : ''}${scheme.porcentaje_descuento_aumento}%`;
                              }
                              return '';
                            })()}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedSchemeDetails?.porcentaje_descuento_aumento !== 0 && selectedSchemeDetails?.porcentaje_descuento_aumento != null && (
                  <Badge variant="outline" className={`text-[10px] shrink-0 ${
                    selectedSchemeDetails.porcentaje_descuento_aumento < 0
                      ? "border-emerald-300 bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                      : "border-destructive/30 bg-destructive/10 text-destructive"
                  }`}>
                    {selectedSchemeDetails.porcentaje_descuento_aumento > 0 ? "+" : ""}{selectedSchemeDetails.porcentaje_descuento_aumento}%
                  </Badge>
                )}
                {selectedSchemeDetails && (
                  <button
                    type="button"
                    onClick={() => setLocalSchemeId(null)}
                    className="ml-auto text-muted-foreground hover:text-foreground shrink-0"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          )}
          {selectedMode !== "manual" && (!propertyPaymentSchemes || propertyPaymentSchemes.length === 0) && (
            <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-muted/60 border border-border/60 text-muted-foreground">
              <FileText className="h-3.5 w-3.5 shrink-0" />
              <span>Sin planes de pago disponibles</span>
            </div>
          )}

          {/* Price Summary Section */}
          <div className="mt-3 p-3 bg-primary/5 rounded-lg border border-primary/20">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Precio Propiedad:</span>
                {priceCalculations.schemeAdjustment !== 0 ? (
                  <>
                    <p className="text-xs text-muted-foreground line-through">${priceCalculations.propertyPrice.toLocaleString()}</p>
                    <p className="font-semibold text-lg">${priceCalculations.adjustedPropertyPrice.toLocaleString()}</p>
                  </>
                ) : (
                  <p className="font-semibold text-lg">${priceCalculations.propertyPrice.toLocaleString()}</p>
                )}
              </div>
              {priceCalculations.productsTotal > 0 && (
                <div>
                  <span className="text-muted-foreground">Productos adicionales:</span>
                  <p className="font-medium text-amber-600">+${priceCalculations.productsTotal.toLocaleString()}</p>
                </div>
              )}
            </div>
            {priceCalculations.productsTotal > 0 && (
              <div className="mt-2 pt-2 border-t border-primary/20">
                <div className="flex justify-between items-center">
                  <span className="font-medium">Total:</span>
                  <span className="font-bold text-xl text-primary">${priceCalculations.grandTotal.toLocaleString()}</span>
                </div>
              </div>
            )}
          </div>
          
          {/* Badges for included products */}
          <div className="mt-3 p-3 bg-muted/50 rounded-lg border">
            <div className="flex items-center gap-2 mb-2">
              <Info className="h-4 w-4 text-blue-500" />
              <span className="text-sm font-medium">Productos asociados a esta propiedad:</span>
            </div>
            {isLoadingProducts ? (
              <p className="text-xs text-muted-foreground">Cargando productos...</p>
            ) : !includedProducts || (includedProducts.bodegas.length === 0 && includedProducts.estacionamientos.length === 0) ? (
              <p className="text-xs text-muted-foreground">Esta propiedad no tiene bodegas ni estacionamientos asociados.</p>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {includedProducts.bodegas.map((bodega: any) => {
                    const precioLista = bodega.productos_servicios?.precio_lista || 0;
                    const m2 = bodega.m2 || 0;
                    const precioFinal = precioLista * m2;
                    const isIncludedInPrice = precioFinal === 0;
                    return (
                      <Badge 
                        key={`bodega-${bodega.id}`}
                        variant={isIncludedInPrice ? "default" : "outline"}
                        className={cn(
                          "flex items-center gap-1",
                          isIncludedInPrice ? "bg-amber-500 hover:bg-amber-600" : "border-amber-500 text-amber-700"
                        )}
                      >
                        <Warehouse className="h-3 w-3" />
                        {bodega.nombre}
                        {isIncludedInPrice ? (
                          <span className="text-xs ml-1">(incluida)</span>
                        ) : (
                          <span className="text-xs ml-1">(${precioFinal.toLocaleString()})</span>
                        )}
                      </Badge>
                    );
                  })}
                  {includedProducts.estacionamientos.map((est: any) => {
                    const precioLista = est.productos_servicios?.precio_lista || 0;
                    const m2 = est.m2 || 0;
                    const precioFinal = precioLista * m2;
                    const isIncludedInPrice = precioFinal === 0;
                    return (
                      <Badge 
                        key={`est-${est.id}`}
                        variant={isIncludedInPrice ? "default" : "outline"}
                        className={cn(
                          "flex items-center gap-1",
                          isIncludedInPrice ? "bg-blue-500 hover:bg-blue-600" : "border-blue-500 text-blue-700"
                        )}
                      >
                        <Car className="h-3 w-3" />
                        {est.nombre}
                        {isIncludedInPrice ? (
                          <span className="text-xs ml-1">(incluido)</span>
                        ) : (
                          <span className="text-xs ml-1">(${precioFinal.toLocaleString()})</span>
                        )}
                      </Badge>
                    );
                  })}
                </div>
                {/* Product scheme selectors for products with price > 0 */}
                {productsWithPriceInfo.valid.length > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-medium text-muted-foreground">Esquemas de pago de productos:</p>
                    {productsWithPriceInfo.valid.map((p: any) => (
                      <div key={p.id_producto} className="flex items-center gap-2">
                        <span className="text-xs text-foreground min-w-0 truncate flex-1">{p.tipo} "{p.nombre}":</span>
                        <Select
                          value={productSchemeSelections[p.id_producto]?.toString() || "none"}
                          onValueChange={(value) => {
                            setProductSchemeSelections(prev => ({
                              ...prev,
                              [p.id_producto]: value === "none" ? null : parseInt(value)
                            }));
                          }}
                        >
                          <SelectTrigger className="h-7 text-[11px] w-48">
                            <SelectValue placeholder="Sin seleccionar" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">
                              <span className="text-muted-foreground italic">Sin seleccionar</span>
                            </SelectItem>
                            {p.paymentSchemes?.map((scheme: any) => (
                              <SelectItem key={scheme.id} value={scheme.id.toString()}>
                                {scheme.nombre}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ))}
                  </div>
                )}
                {/* Show disclaimer only if there are products with price > 0 */}
                {(includedProducts.bodegas.some((b: any) => {
                  const precio = b.productos_servicios?.precio_lista || 0;
                  const m2 = b.m2 || 0;
                  return (precio * m2) > 0;
                }) ||
                  includedProducts.estacionamientos.some((e: any) => {
                    const precio = e.productos_servicios?.precio_lista || 0;
                    const m2 = e.m2 || 0;
                    return (precio * m2) > 0;
                  })) && (
                  <p className="text-xs text-muted-foreground mt-2">
                    Los productos No incluidos generan ofertas adicionales.
                  </p>
                )}
              </>
            )}
          </div>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* Mode Selection - Manual available for all roles except Agente Inmobiliario, hidden if hideManualMode is true */}
            {(() => {
              // If hideManualMode is true, don't show the manual option
              const canUseManualMode = !hideManualMode && profile?.rol_nombre !== 'Agente Inmobiliario';
              
              // If forceManualMode is true (Reventa), show only manual mode as a badge
              if (forceManualMode) {
                return (
                  <div className="space-y-2">
                    <Label>Tipo de Oferta</Label>
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary" className="px-3 py-1">Manual (Reventa)</Badge>
                      <span className="text-xs text-muted-foreground">Las propiedades en reventa solo permiten ofertas manuales</span>
                    </div>
                  </div>
                );
              }
              
              // If hideManualMode is true, don't show radio options, just show "Precargada" as the only option
              if (hideManualMode) {
                return null; // Don't show the mode selection at all
              }
              
              return (
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
                          {canUseManualMode && (
                            <div className="flex items-center space-x-2">
                              <RadioGroupItem value="manual" id="manual" />
                              <Label htmlFor="manual">Manual</Label>
                            </div>
                          )}
                        </RadioGroup>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              );
            })()}

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

                    {parseFloat(watchedEnganche || "0") >= 10 && (
                      <FormField
                        control={form.control}
                        name="numero_pagos_enganche"
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>Número de Pagos de Enganche *</FormLabel>
                            <FormControl>
                              <Input 
                                type="number" 
                                min="1"
                                max="2"
                                step="1"
                                placeholder="1" 
                                {...field}
                                onChange={(e) => {
                                  const value = e.target.value.replace(/\D/g, '');
                                  const numValue = parseInt(value) || 1;
                                  const clampedValue = Math.min(Math.max(numValue, 1), 2);
                                  field.onChange(clampedValue.toString());
                                }}
                              />
                            </FormControl>
                            <FormMessage />
                            {parseInt(field.value || "1") > 1 && (
                              <p className="text-sm text-muted-foreground mt-1">
                                Cada pago será del {porcentajePorPago}%
                              </p>
                            )}
                          </FormItem>
                        )}
                      />
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                    <FormField
                      control={form.control}
                      name="porcentaje_entrega"
                      render={({ field }) => {
                        const maxAllowed = Math.max(0, 100 - parseFloat(watchedEnganche || "0") - parseFloat(watchedMensualidades || "0"));
                        const currentValue = parseFloat(field.value || "0");
                        const isExceeding = currentValue > maxAllowed + 0.01;
                        
                        return (
                          <FormItem>
                            <FormLabel>
                              Porcentaje Entrega (%) *
                              {selectedMode === "manual" && remainingPercentage !== 100 && (
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
                                  // Clamp value to max allowed
                                  const clampedValue = Math.min(val, maxAllowed);
                                  field.onChange(clampedValue.toString());
                                }}
                              />
                            </FormControl>
                            {isExceeding && (
                              <p className="text-xs text-destructive">El porcentaje no puede exceder {maxAllowed.toFixed(2)}%</p>
                            )}
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

                  {/* Tiered Monthly Payments Section */}
                  {parseInt(form.watch("numero_mensualidades") || "0") > 0 && parseFloat(watchedMensualidades || "0") > 0 && (
                    <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <Label htmlFor="usar-tramos" className="text-sm font-medium">
                            Usar montos escalonados
                          </Label>
                          <Switch
                            id="usar-tramos"
                            checked={usarTramosPersonalizados}
                            onCheckedChange={(checked) => {
                              setUsarTramosPersonalizados(checked);
                              if (checked && tramosMensualidad.length === 0) {
                                addTramo();
                              }
                            }}
                          />
                        </div>
                        {usarTramosPersonalizados && tramosMensualidad.length < 3 && (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addTramo}
                            className="h-8"
                          >
                            <Plus className="h-4 w-4 mr-1" />
                            Agregar tramo
                          </Button>
                        )}
                      </div>

                      {usarTramosPersonalizados && (
                        <>
                          <p className="text-xs text-muted-foreground mb-3">
                            Define hasta 3 tramos con diferentes montos por mensualidad. La suma de mensualidades debe ser igual al total ({form.watch("numero_mensualidades")}).
                          </p>
                          
                          <div className="space-y-3">
                            {tramosMensualidad.map((tramo, index) => {
                              const mensualidadesAcumuladas = tramosMensualidad
                                .slice(0, index)
                                .reduce((acc, t) => acc + t.numero_mensualidades, 0);
                              
                              return (
                                <div key={tramo.id} className="flex items-center gap-2 bg-background p-3 rounded border">
                                  <div className="flex-1 grid grid-cols-2 gap-3">
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Nº de mensualidades</Label>
                                      <Input
                                        type="number"
                                        min="1"
                                        value={tramo.numero_mensualidades || ""}
                                        onChange={(e) => updateTramo(tramo.id, 'numero_mensualidades', parseInt(e.target.value) || 0)}
                                        placeholder="12"
                                        className="h-9"
                                      />
                                    </div>
                                    <div>
                                      <Label className="text-xs text-muted-foreground">Monto por mensualidad</Label>
                                      <CurrencyInput
                                        value={tramo.monto}
                                        onChange={(value) => updateTramo(tramo.id, 'monto', value)}
                                        placeholder="$0.00"
                                        className="h-9"
                                      />
                                    </div>
                                  </div>
                                  <div className="flex flex-col items-center gap-1">
                                    {index > 0 && (
                                      <span className="text-[10px] text-muted-foreground">
                                        (mes {mensualidadesAcumuladas + 1}+)
                                      </span>
                                    )}
                                    <Button
                                      type="button"
                                      variant="ghost"
                                      size="icon"
                                      className="h-8 w-8 text-destructive hover:text-destructive"
                                      onClick={() => removeTramo(tramo.id)}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Count validation */}
                          {tramosValidation.hasTramos && (
                            <div className={`flex items-center gap-2 text-sm p-2 rounded ${
                              tramosValidation.isCountValid 
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                            }`}>
                              {tramosValidation.isCountValid ? (
                                <>
                                  <Check className="h-4 w-4" />
                                  <span>✓ Mensualidades: {tramosValidation.sumaTramos} de {form.watch("numero_mensualidades")}</span>
                                </>
                              ) : (
                                <>
                                  <AlertTriangle className="h-4 w-4" />
                                  <span>
                                    {tramosValidation.diferenciaCantidad > 0 
                                      ? `Faltan ${tramosValidation.diferenciaCantidad} mensualidades por asignar`
                                      : `Hay ${Math.abs(tramosValidation.diferenciaCantidad)} mensualidades de más`}
                                  </span>
                                </>
                              )}
                            </div>
                          )}
                          
                          {/* Amount validation */}
                          {tramosValidation.hasTramos && tramosValidation.isCountValid && (
                            <div className={`flex items-center justify-between text-sm p-2 rounded mt-2 ${
                              tramosValidation.isMontosValid 
                                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                                : 'bg-destructive/10 text-destructive border border-destructive/30'
                            }`}>
                              <div className="flex items-center gap-2">
                                {tramosValidation.isMontosValid ? (
                                  <Check className="h-4 w-4" />
                                ) : (
                                  <AlertTriangle className="h-4 w-4" />
                                )}
                                <span>
                                  Suma tramos: ${tramosValidation.sumaMontos.toLocaleString()}
                                </span>
                                <span className="text-muted-foreground">
                                  (esperado: ${tramosValidation.montoEsperado.toLocaleString()})
                                </span>
                              </div>
                              {!tramosValidation.isMontosValid && (
                                <span className="font-medium">
                                  {tramosValidation.diferenciaMonto > 0 
                                    ? `Faltan $${tramosValidation.diferenciaMonto.toLocaleString()}`
                                    : `Excede $${Math.abs(tramosValidation.diferenciaMonto).toLocaleString()}`
                                  }
                                </span>
                              )}
                            </div>
                          )}
                          
                          {/* Suggested uniform amount */}
                          {tramosValidation.hasTramos && !tramosValidation.isMontosValid && tramosValidation.isCountValid && (
                            <p className="text-xs text-muted-foreground mt-2">
                              💡 Monto sugerido por mensualidad (uniforme): $
                              {(tramosValidation.montoEsperado / parseInt(form.watch("numero_mensualidades") || "1")).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  )}

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
                            <Input type="number" step="0.01" placeholder="0" {...field} />
                          </FormControl>
                          <FormDescription>
                            Usa valores negativos para descuentos (ej: -5 = 5% descuento) y valores positivos para aumentos (ej: 3 = 3% aumento)
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      );
                    }}
                  />

                  {/* Calculated amounts preview */}
                  {priceCalculations.propertyPrice > 0 && (parseFloat(watchedEnganche || "0") > 0 || parseFloat(watchedMensualidades || "0") > 0 || parseFloat(watchedEntrega || "0") > 0) && (
                    <div className="mt-4 p-4 bg-muted/50 rounded-lg border">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Info className="h-4 w-4 text-primary" />
                        Vista previa del esquema de pago
                      </h4>
                      
                      {/* Price adjustment */}
                      {manualSchemeCalculations.diferencia !== 0 && (
                        <div className="mb-3 pb-3 border-b">
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
                      
                      {/* Payment breakdown */}
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
                            {usarTramosPersonalizados && tramosMensualidad.length > 0 ? (
                              // Show tiered breakdown
                              <div className="pl-4 space-y-1">
                                {tramosMensualidad.map((tramo, index) => {
                                  const mensualidadesAcumuladas = tramosMensualidad
                                    .slice(0, index)
                                    .reduce((acc, t) => acc + t.numero_mensualidades, 0);
                                  return (
                                    <div key={tramo.id} className="flex justify-between text-xs">
                                      <span className="text-muted-foreground">
                                        {tramo.numero_mensualidades} pagos de:
                                      </span>
                                      <span>
                                        ${(tramo.monto / 100).toLocaleString()}
                                        {index > 0 && (
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <span className="ml-1 text-blue-600 cursor-help">(mes {mensualidadesAcumuladas + 1}+)</span>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>A partir del mes {mensualidadesAcumuladas + 1} en adelante</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        )}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              // Show uniform payment
                              manualSchemeCalculations.numMensualidades > 0 && (
                                <div className="flex justify-between pl-4 text-xs">
                                  <span className="text-muted-foreground">{manualSchemeCalculations.numMensualidades} pagos de:</span>
                                  <span>${manualSchemeCalculations.montoPorMensualidad.toLocaleString()}</span>
                                </div>
                              )
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
              </>
            )}

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
                                  if (!fillIntentTracked.current) {
                                    fillIntentTracked.current = true;
                                    onTrackFillIntent?.();
                                  }
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
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        disabled={selectedPerson !== null}
                      >
                        <FormControl>
                          <SelectTrigger className="neu-input h-auto">
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
                          disabled={selectedPerson !== null}
                          className="neu-input h-auto"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-[1fr,auto,1fr] gap-4 items-end">
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
                          disabled={selectedPerson !== null}
                          className="neu-input h-auto"
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="clave_pais_telefono"
                  render={({ field }) => (
                    <FormItem className="w-24">
                      <FormLabel>País *</FormLabel>
                      <Select 
                        onValueChange={field.onChange} 
                        value={field.value}
                        disabled={selectedPerson !== null}
                      >
                        <FormControl>
                          <SelectTrigger className="neu-input h-auto">
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
                    <FormItem className="flex-1">
                      <FormLabel>Teléfono *</FormLabel>
                      <FormControl>
                        <Input 
                          placeholder="10 dígitos" 
                          disabled={selectedPerson !== null}
                          className="neu-input h-auto"
                          {...field}
                          onChange={(e) => {
                            const value = e.target.value.replace(/\D/g, '').slice(0, 10);
                            field.onChange(value);
                          }}
                          maxLength={10}
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
                       name="rfc"
                       render={({ field }) => (
                       <FormItem>
                            <FormLabel>RFC</FormLabel>
                             <FormControl>
                             <Input 
                               placeholder="Ingresa el RFC (Ej: ABC123456DEF)" 
                               maxLength={13}
                               disabled={selectedPerson !== null}
                               className="neu-input h-auto"
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
                                  maxLength={18}
                                  disabled={selectedPerson !== null}
                                  className="neu-input h-auto"
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

             <Separator />

             {/* Opciones de visualización en PDF - Hidden if hidePdfOptions is true */}
             {!hidePdfOptions && (
               <div className="space-y-4">
                 <h3 className="text-sm font-semibold">Opciones de visualización en PDF</h3>
                 <p className="text-xs text-muted-foreground">
                   Selecciona qué información deseas mostrar en esta oferta
                 </p>
                 
                 {propertyDetails?.entidades_relacionadas?.proyectos?.mostrar_piso_en_oferta !== false && (
                   <FormField
                     control={form.control}
                     name="mostrar_piso_en_oferta"
                     render={({ field }) => (
                       <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                         <FormControl>
                           <Checkbox
                             checked={field.value}
                             onCheckedChange={field.onChange}
                           />
                         </FormControl>
                         <div className="space-y-1 leading-none">
                           <FormLabel>Mostrar nivel</FormLabel>
                         </div>
                       </FormItem>
                     )}
                   />
                 )}
                 
                 {propertyDetails?.entidades_relacionadas?.proyectos?.mostrar_precio_m2_en_oferta !== false && (
                   <FormField
                     control={form.control}
                     name="mostrar_precio_m2_en_oferta"
                     render={({ field }) => (
                       <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                         <FormControl>
                           <Checkbox
                             checked={field.value}
                             onCheckedChange={field.onChange}
                           />
                         </FormControl>
                         <div className="space-y-1 leading-none">
                           <FormLabel>Mostrar precio por m²</FormLabel>
                         </div>
                       </FormItem>
                     )}
                   />
                 )}
                 
                 {propertyDetails?.entidades_relacionadas?.proyectos?.mostrar_seccion_efectivo_en_oferta !== false && (
                   <FormField
                     control={form.control}
                     name="mostrar_seccion_efectivo_en_oferta"
                     render={({ field }) => (
                       <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                         <FormControl>
                           <Checkbox
                             checked={field.value}
                             onCheckedChange={field.onChange}
                           />
                         </FormControl>
                         <div className="space-y-1 leading-none">
                           <FormLabel>Mostrar sección de pago en efectivo</FormLabel>
                         </div>
                       </FormItem>
                     )}
                   />
                 )}
               </div>
             )}

            <div className="flex justify-end space-x-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
                className="rounded-2xl px-6"
              >
                Cancelar
              </Button>
              <button
                type="submit"
                disabled={createOfferMutation.isPending || (usarTramosPersonalizados && !tramosValidation.isValid)}
                className="px-6 py-2.5 rounded-2xl bg-primary text-primary-foreground font-semibold text-sm tracking-wide transition-all duration-300 hover:bg-primary/90 flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {createOfferMutation.isPending ? "Generando..." : "Generar Oferta"}
              </button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>

    {/* Confirmation Dialog for generating multiple offers */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent className={cn("max-w-lg", forceLight && "light")}>
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            {productsWithPriceInfo.total > 0 ? "Confirmar generación de ofertas" : "Confirmar generación de oferta"}
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            {productsWithPriceInfo.total > 0 && (
              <p>
                Esta propiedad tiene {productsWithPriceInfo.total} producto(s) con costo extra.
                Se generarán las siguientes ofertas:
              </p>
            )}
            
            <div className="bg-muted/50 rounded-lg p-3 space-y-4">
              {/* Property offer with scheme selector */}
              <div className="bg-background rounded-md p-3 border">
                <div className="flex items-center gap-2 text-sm mb-2">
                  <FileText className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-foreground">Oferta de propiedad</span>
                </div>
                <div className="ml-6">
                  <label className="text-xs text-muted-foreground block mb-1">Esquema de pago:</label>
                  <Select
                    value={propertySchemeSelection?.toString() || "none"}
                    onValueChange={(value) => {
                      setPropertySchemeSelection(value === "none" ? null : parseInt(value));
                    }}
                  >
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue placeholder="Sin seleccionar" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">
                        <span className="text-muted-foreground italic">Sin seleccionar</span>
                      </SelectItem>
                      {propertyPaymentSchemes?.map((scheme: any) => (
                        <SelectItem key={scheme.id} value={scheme.id.toString()}>
                          <div className="flex flex-col">
                            <span>{scheme.nombre}</span>
                            <span className="text-xs text-muted-foreground">
                              {(() => {
                                const tramos = scheme.tramos_mensualidad as any[];
                                const hasFixedAmount = tramos?.some((t: any) => t.monto_mensualidad && t.monto_mensualidad > 0);
                                if (hasFixedAmount) {
                                  const montoStr = tramos.map((t: any) => `$${(t.monto_mensualidad / 100).toLocaleString('es-MX')}`).join(' / ');
                                  return `Eng: ${scheme.porcentaje_enganche || 0}% | Monto de mensualidades: ${montoStr}`;
                                }
                                return `Eng: ${scheme.porcentaje_enganche || 0}% | Mens: ${scheme.porcentaje_mensualidades || 0}% (${scheme.numero_mensualidades || 0} pagos) | Ent: ${scheme.porcentaje_entrega || 0}%`;
                              })()}
                              {(() => {
                                const tramos = scheme.tramos_mensualidad as any[];
                                const hasFixedAmount = tramos?.some((t: any) => t.monto_mensualidad && t.monto_mensualidad > 0);
                                if (!hasFixedAmount && scheme.porcentaje_descuento_aumento) {
                                  return ` | ${scheme.porcentaje_descuento_aumento > 0 ? '+' : ''}${scheme.porcentaje_descuento_aumento}%`;
                                }
                                return '';
                              })()}
                            </span>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              
              {productsWithPriceInfo.valid.length > 0 && (
                <div className="flex items-start gap-2 text-sm">
                  <FileText className="h-4 w-4 text-blue-600 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-medium">{productsWithPriceInfo.valid.length} oferta(s) de productos:</span>
                    <div className="mt-2 space-y-3">
                      {productsWithPriceInfo.valid.map((p: any, i: number) => (
                        <div key={i} className="bg-background rounded-md p-2 border">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-foreground">• {p.tipo} "{p.nombre}" (${p.precioFinal.toLocaleString()})</span>
                          </div>
                          <div className="ml-2">
                            <label className="text-xs text-muted-foreground block mb-1">Esquema de pago:</label>
                            <Select
                              value={productSchemeSelections[p.id_producto]?.toString() || "none"}
                              onValueChange={(value) => {
                                setProductSchemeSelections(prev => ({
                                  ...prev,
                                  [p.id_producto]: value === "none" ? null : parseInt(value)
                                }));
                              }}
                            >
                              <SelectTrigger className="h-8 text-xs">
                                <SelectValue placeholder="Sin seleccionar" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">
                                  <span className="text-muted-foreground italic">Sin seleccionar</span>
                                </SelectItem>
                                {p.paymentSchemes?.map((scheme: any) => (
                                  <SelectItem key={scheme.id} value={scheme.id.toString()}>
                                    <div className="flex flex-col">
                                      <span>{scheme.nombre}</span>
                                      <span className="text-xs text-muted-foreground">
                                        {(() => {
                                          const tramos = scheme.tramos_mensualidad as any[];
                                          const hasFixedAmount = tramos?.some((t: any) => t.monto_mensualidad && t.monto_mensualidad > 0);
                                          if (hasFixedAmount) {
                                            const montoStr = tramos.map((t: any) => `$${(t.monto_mensualidad / 100).toLocaleString('es-MX')}`).join(' / ');
                                            return `Eng: ${scheme.porcentaje_enganche || 0}% | Monto de mensualidades: ${montoStr}`;
                                          }
                                          return `Eng: ${scheme.porcentaje_enganche || 0}% | Mens: ${scheme.porcentaje_mensualidades || 0}% (${scheme.numero_mensualidades || 0} pagos) | Ent: ${scheme.porcentaje_entrega || 0}%`;
                                        })()}
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!productSchemeSelections[p.id_producto] ? (
                              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Se generará PDF sin cuenta CLABE (no hay esquema seleccionado)
                              </p>
                            ) : !p.hasCuentaMadreStp ? (
                              <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                No se puede generar CLABE: El dueño "{p.nombreDueno}" no tiene cuenta madre STP configurada
                              </p>
                            ) : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {productsWithPriceInfo.invalid.length > 0 && (
              <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <div>
                    <span className="font-medium">
                      {productsWithPriceInfo.invalid.length} producto(s) NO tienen esquemas de pago configurados:
                    </span>
                    <ul className="ml-4 mt-1">
                      {productsWithPriceInfo.invalid.map((p, i) => (
                        <li key={i}>• {p.tipo} "{p.nombre}"</li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs">
                      Estos productos NO generarán oferta. Configure sus esquemas de pago primero.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {confirmBankingReasons.length > 0 && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <div className="flex items-start gap-2 text-sm text-amber-700">
                  <AlertTriangle className="h-4 w-4 mt-0.5" />
                  <div>
                    <span className="font-medium">Aviso de datos bancarios:</span>
                    <ul className="ml-4 mt-1 list-disc">
                      {confirmBankingReasons.map((reason, idx) => (
                        <li key={idx}>La oferta se generará sin sección de datos bancarios porque {reason}.</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {confirmBankingReasons.length > 0 && (
              <div className="flex items-center gap-2 mt-2">
                <Checkbox
                  id="sendEmailOnGenerate"
                  checked={sendEmailOnGenerate}
                  onCheckedChange={(checked) => setSendEmailOnGenerate(checked === true)}
                />
                <label htmlFor="sendEmailOnGenerate" className="text-sm text-foreground cursor-pointer">
                  También enviar oferta(s) por correo al prospecto
                </label>
              </div>
            )}

            {productsWithPriceInfo.total > 0 ? (
              <p className="text-sm text-muted-foreground">
                Se descargarán {1 + productsWithPriceInfo.valid.length} PDF(s) automáticamente.
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                Se generará 1 PDF automáticamente.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={handleCancelGenerate}>
            Cancelar
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={handleConfirmGenerate}
            disabled={createOfferMutation.isPending}
          >
            {createOfferMutation.isPending ? "Generando..." : "Generar Ofertas"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}