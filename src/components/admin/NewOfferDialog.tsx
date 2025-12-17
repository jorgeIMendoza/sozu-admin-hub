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
import { FileText, Check, ChevronsUpDown, UserPlus, Warehouse, Car, Info, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useActivityLogger } from "@/hooks/useActivityLogger";

const baseProspectSchema = z.object({
  tipo_persona: z.string().min(1, "El tipo de persona es requerido"),
  nombre_completo: z.string().min(1, "El nombre completo es requerido"),
  email: z.string().email("Email inválido"),
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
}

export function NewOfferDialog({ propertyId, propertyNumber }: NewOfferDialogProps) {
  const [open, setOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedPerson, setSelectedPerson] = useState<any>(null);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingFormData, setPendingFormData] = useState<FormData | null>(null);
  const [productSchemeSelections, setProductSchemeSelections] = useState<Record<number, number | null>>({});
  const [propertySchemeSelection, setPropertySchemeSelection] = useState<number | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { profile } = useAuth();
  const { registrarGeneracionOferta } = useActivityLogger();

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

  // Reset form when dialog opens
  useEffect(() => {
    if (open) {
      form.reset({
        mode: "precargada",
        selectedPersonId: undefined,
        tipo_persona: "pf",
        nombre_completo: "",
        email: "",
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
    }
  }, [open, form]);

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
        bodegas: (bodegasRes.data || []).map(b => ({
          ...b,
          paymentSchemes: schemesMap[b.id_producto] || []
        })),
        estacionamientos: (estacionamientosRes.data || []).map(e => ({
          ...e,
          paymentSchemes: schemesMap[e.id_producto] || []
        }))
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
          
          const schemeData = {
            id_proyecto: projectId,
            nombre: schemeName,
            porcentaje_enganche: parseFloat(data.porcentaje_enganche || "0"),
            porcentaje_mensualidades: parseFloat(data.porcentaje_mensualidades || "0"),
            porcentaje_entrega: parseFloat(data.porcentaje_entrega || "0"),
            numero_mensualidades: parseInt(data.numero_mensualidades || "0"),
            numero_pagos_enganche: parseInt(data.numero_pagos_enganche || "1"),
            porcentaje_descuento_aumento: parseFloat(data.porcentaje_descuento_aumento || "0"),
            es_manual: true,
            activo: true
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

      // Check if person exists in entidades_relacionadas for this project
      const projectId = propertyDetails?.entidades_relacionadas?.proyectos?.id;
      if (projectId && personId) {
        console.log("Checking if person exists in entidades_relacionadas for project:", projectId);
        
        const { data: existingRelation } = await supabase
          .from("entidades_relacionadas")
          .select("id")
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
            activo: true
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
        } else {
          console.log("Person already exists in entidades_relacionadas");
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

        // Generate CLABE only if a payment scheme is selected
        let clabeData: string | null = null;
        if (selectedSchemeId && productService?.id_entidad_relacionada_dueno) {
          const { data: generatedClabe, error: clabeError } = await supabase
            .rpc('crear_referencia_bancaria', {
              id_er_dueno: productService.id_entidad_relacionada_dueno
            });
          
          if (clabeError) {
            console.error(`Error generating CLABE for ${product.nombre}:`, clabeError);
            productOffersResults.warnings.push(
              `Error al generar CLABE para ${product.tipo === 'bodega' ? 'bodega' : 'estacionamiento'} "${product.nombre}": ${clabeError.message}`
            );
            continue;
          }
          clabeData = generatedClabe;
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
        productOffersResults
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
      
      // Generate main property PDF
      try {
        const { generateOfferPDF } = await import('@/services/htmlToPdfService');
        await generateOfferPDF({
          propertyId,
          offerId: result.offerId,
          propertyNumber,
          leadName: result.leadName,
          leadEmail: result.leadEmail,
          leadPhone: result.leadPhone,
          creatorEmail: profile?.email || ''
        });
        
        toast({
          title: "PDF de propiedad generado",
          description: "El PDF de la oferta de propiedad se ha descargado.",
        });

        // Generate PDFs for product offers - with delay between each to avoid browser blocking
        if (result.productOffersResults.createdOffers.length > 0) {
          toast({
            title: "Generando PDFs de productos...",
            description: `Descargando ${result.productOffersResults.createdOffers.length} PDF(s) de productos.`,
          });

          for (const productOffer of result.productOffersResults.createdOffers) {
            // Small delay to allow browser to handle downloads
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            try {
              await generateOfferPDF({
                propertyId,
                offerId: productOffer.offerId,
                propertyNumber,
                leadName: result.leadName,
                leadEmail: result.leadEmail,
                leadPhone: result.leadPhone,
                creatorEmail: profile?.email || '',
                isProductOffer: true,
                productId: productOffer.productId
              });
              console.log(`PDF generated for product offer ${productOffer.offerId} - ${productOffer.productName}`);
            } catch (productPdfError) {
              console.error(`Error generating PDF for product ${productOffer.productName}:`, productPdfError);
              toast({
                title: "Aviso",
                description: `No se pudo generar el PDF para ${productOffer.productName}`,
                variant: "destructive",
              });
            }
          }
          
          toast({
            title: "PDFs de productos generados",
            description: `Se descargaron ${result.productOffersResults.createdOffers.length} PDF(s) de productos.`,
          });
        }
      } catch (pdfError) {
        console.error('Error generating PDF:', pdfError);
        toast({
          title: "Error al generar PDF",
          description: "La oferta se creó correctamente, pero hubo un error al generar el PDF.",
          variant: "destructive",
        });
      }
      
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

  // Calculate products with price > 0 and their scheme status
  const productsWithPriceInfo = React.useMemo(() => {
    if (!includedProducts) return { valid: [], invalid: [], total: 0 };
    
    const allProducts = [
      ...includedProducts.bodegas.map((b: any) => ({
        ...b,
        tipo: 'Bodega',
        precioFinal: ((b.productos_servicios as any)?.precio_lista || 0) * (b.m2 || 0),
        hasSchemes: (b.paymentSchemes?.length || 0) > 0
      })),
      ...includedProducts.estacionamientos.map((e: any) => ({
        ...e,
        tipo: 'Estacionamiento', 
        precioFinal: ((e.productos_servicios as any)?.precio_lista || 0) * (e.m2 || 0),
        hasSchemes: (e.paymentSchemes?.length || 0) > 0
      }))
    ].filter(p => p.precioFinal > 0);

    const valid = allProducts.filter(p => p.hasSchemes);
    const invalid = allProducts.filter(p => !p.hasSchemes);
    
    return { valid, invalid, total: allProducts.length };
  }, [includedProducts]);

  const onSubmit = (data: FormData) => {
    console.log("Form submitted successfully!");
    
    // If there are products with price > 0, show confirmation dialog
    if (productsWithPriceInfo.total > 0) {
      setPendingFormData(data);
      setShowConfirmDialog(true);
    } else {
      // No products, proceed directly (note: no confirmation dialog means no scheme selection for property)
      createOfferMutation.mutate({ data, schemeSelections: {}, propertySchemeId: null });
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
  };

  const projectName = propertyDetails?.entidades_relacionadas?.proyectos?.nombre;

  return (
    <>
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
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>
                            Porcentaje Entrega (%) *
                            {selectedMode === "manual" && remainingPercentage !== 100 && (
                              <span className="text-sm text-muted-foreground ml-1">
                                (Restante: {remainingPercentage.toFixed(2)}%)
                              </span>
                            )}
                          </FormLabel>
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
                          disabled={selectedPerson !== null}
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
                        <Input 
                          type="email" 
                          placeholder="Ingresa el email" 
                          disabled={selectedPerson !== null}
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
                          placeholder="Ingresa el teléfono (10 dígitos obligatorios)" 
                          disabled={selectedPerson !== null}
                          {...field}
                          onChange={(e) => {
                            // Solo permitir números y máximo 10 dígitos
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

             {/* Opciones de visualización en PDF */}
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

    {/* Confirmation Dialog for generating multiple offers */}
    <AlertDialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
      <AlertDialogContent className="max-w-lg">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Confirmar generación de ofertas
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-4">
            <p>
              Esta propiedad tiene {productsWithPriceInfo.total} producto(s) con costo extra. 
              Se generarán las siguientes ofertas:
            </p>
            
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
                              Eng: {scheme.porcentaje_enganche || 0}% | Mens: {scheme.porcentaje_mensualidades || 0}% ({scheme.numero_mensualidades || 0} pagos) | Ent: {scheme.porcentaje_entrega || 0}%
                              {scheme.porcentaje_descuento_aumento ? ` | ${scheme.porcentaje_descuento_aumento > 0 ? '+' : ''}${scheme.porcentaje_descuento_aumento}%` : ''}
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
                                        Eng: {scheme.porcentaje_enganche || 0}% | Mens: {scheme.porcentaje_mensualidades || 0}% ({scheme.numero_mensualidades || 0} pagos) | Ent: {scheme.porcentaje_entrega || 0}%
                                      </span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            {!productSchemeSelections[p.id_producto] && (
                              <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                Se generará PDF sin cuenta CLABE para pagos
                              </p>
                            )}
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

            <p className="text-sm text-muted-foreground">
              Se descargarán {1 + productsWithPriceInfo.valid.length} PDF(s) automáticamente.
            </p>
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