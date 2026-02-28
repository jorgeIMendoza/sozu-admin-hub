import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PropertyMultimediaTab } from "./PropertyMultimediaTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PropertyCharacteristicsSection } from "./PropertyCharacteristicsSection";
import { PropertyYouTubeVideosSection } from "./PropertyYouTubeVideosSection";
import React from "react";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useAuth } from "@/contexts/AuthContext";

// Constantes para roles y estatus
const ROL_SUPER_ADMIN = 1;
const ROL_ADMIN_DATA = 10;
const ESTATUS_INVENTARIO = 1;
const ESTATUS_DISPONIBLE = 2;
const ESTATUS_VENDIDO = 5;
const ESTATUS_ASIGNADO = 10; // NADIE puede cambiar A este estatus, ni DESDE este estatus

// Funciones para formatear moneda
const formatCurrency = (value: string | number | undefined): string => {
  if (!value && value !== 0) return "";
  const numValue = typeof value === "string" ? parseFloat(value.replace(/,/g, "")) : value;
  if (isNaN(numValue)) return "";
  return numValue.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

const parseCurrency = (value: string): number => {
  const cleanValue = value.replace(/,/g, "");
  const parsed = parseFloat(cleanValue);
  return isNaN(parsed) ? 0 : parsed;
};

// Componente auxiliar para mostrar la configuración del modelo
const ModelConfigurationDisplay = ({ 
  modeloId, 
  modelName,
  onCharacteristicsLoaded 
}: { 
  modeloId: string; 
  modelName: string;
  onCharacteristicsLoaded?: (ids: number[]) => void;
}) => {
  const { data: modelDetails } = useQuery({
    queryKey: ["model-details-display", modeloId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos")
        .select("*")
        .eq("id", parseInt(modeloId))
        .single();
      
      if (error) throw error;
      return data;
    },
    enabled: !!modeloId,
  });

  const { data: modelCharacteristics, isLoading } = useQuery({
    queryKey: ["model-chars-display", modeloId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("modelos_caracteristicas")
        .select(`
          id,
          caracteristicas (
            id,
            nombre,
            activo
          )
        `)
        .eq("id_modelo", parseInt(modeloId))
        .eq("activo", true);
      
      if (error) throw error;
      return (data || []).filter((mc: any) => mc.caracteristicas?.activo === true);
    },
    enabled: !!modeloId,
  });

  // Notificar al padre cuando se carguen las características
  React.useEffect(() => {
    if (modelCharacteristics && onCharacteristicsLoaded) {
      const ids = modelCharacteristics
        .map((mc: any) => mc.caracteristicas?.id)
        .filter((id): id is number => id !== undefined);
      onCharacteristicsLoaded(ids);
    }
  }, [modelCharacteristics, onCharacteristicsLoaded]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración del Modelo {modelName}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {modelDetails && (
          <div className="grid grid-cols-3 gap-4">
            <div>
              <Label className="text-sm font-medium">Número de Recámaras</Label>
              <div className="mt-1">
                <Badge variant="outline" className="text-sm">
                  {modelDetails.numero_recamaras || 0} recámaras
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Número de Baños Completos</Label>
              <div className="mt-1">
                <Badge variant="outline" className="text-sm">
                  {modelDetails.numero_completo_banos || 0} baños completos
                </Badge>
              </div>
            </div>
            <div>
              <Label className="text-sm font-medium">Número de Medios Baños</Label>
              <div className="mt-1">
                <Badge variant="outline" className="text-sm">
                  {modelDetails.numero_medio_bano || 0} medios baños
                </Badge>
              </div>
            </div>
          </div>
        )}

        {/* Características del Modelo */}
        {isLoading && (
          <div className="pt-4 border-t">
            <Label className="text-sm font-medium">Características del Modelo</Label>
            <p className="text-sm text-muted-foreground mt-2">Cargando características...</p>
          </div>
        )}
        
        {!isLoading && modelCharacteristics && modelCharacteristics.length > 0 && (
          <div className="pt-4 border-t">
            <Label className="text-sm font-medium">Características del Modelo</Label>
            <div className="mt-2 p-3 border rounded-md bg-muted/50">
              <div className="flex flex-wrap gap-2">
                {modelCharacteristics.map((mc: any) => (
                  <Badge key={mc.id} variant="secondary">
                    {mc.caracteristicas?.nombre || 'Sin nombre'}
                  </Badge>
                ))}
              </div>
            </div>
          </div>
        )}
        
        {!isLoading && (!modelCharacteristics || modelCharacteristics.length === 0) && (
          <div className="pt-4 border-t">
            <Label className="text-sm font-medium">Características del Modelo</Label>
            <p className="text-sm text-muted-foreground mt-2">
              Este modelo no tiene características asignadas
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
import { Combobox } from "@/components/ui/combobox";

interface Property {
  id: number;
  numero_propiedad: string;
  numero_piso: string | null;
  m2_interiores: number;
  m2_exteriores: number;
  precio_lista: number;
  clabe_stp_tmp_apartado: string | null;
  activo: boolean;
  es_aprobado: boolean;
  // Relaciones
  propietario: string;
  proyecto: string;
  edificio: string;
  modelo: string;
  vista: string;
  disponibilidad: string;
  configuracion_modelo: {
    numero_recamaras: number;
    numero_completo_banos: number;
    numero_medio_bano: number;
  };
  // Nueva propiedad para verificar si tiene ofertas
  tieneOfertas: boolean;
}

interface EditPropertyDialogProps {
  property: Property;
  onClose: () => void;
  onSuccess: () => void;
}

export const EditPropertyDialog = ({ property, onClose, onSuccess }: EditPropertyDialogProps) => {
  const { toast } = useToast();
  const { profile } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [modeloId, setModeloId] = useState<string | undefined>(undefined);
  const { registrarActualizacion } = useActivityLogger();
  const [excludedCharacteristicIds, setExcludedCharacteristicIds] = useState<number[]>([]);
  const [originalStatusId, setOriginalStatusId] = useState<number | null>(null);

  // Verificar si el usuario puede editar el estatus de propiedad
  const isSuperAdmin = profile?.rol_id === ROL_SUPER_ADMIN;
  const canEditPropertyStatus = isSuperAdmin || profile?.rol_id === ROL_ADMIN_DATA;
  const allowedStatusIds = [ESTATUS_INVENTARIO, ESTATUS_DISPONIBLE];
  
  // Debug log temporal
  console.log('DEBUG EditPropertyDialog - profile:', profile, 'rol_id:', profile?.rol_id, 'canEditPropertyStatus:', canEditPropertyStatus, 'originalStatusId:', originalStatusId);
  const [formData, setFormData] = useState({
    numero_propiedad: property.numero_propiedad,
    numero_piso: property.numero_piso || '',
    m2_interiores: property.m2_interiores || 0,
    m2_exteriores: property.m2_exteriores || 0,
    m2_loft: 0,
    precio_lista: property.precio_lista,
    monto_apartado: 0,
    clabe_stp_tmp_apartado: property.clabe_stp_tmp_apartado || '',
    descripcion: '',
    url_imagen_portada: '',
    id_vista: '',
    id_tipo_transaccion: '',
    id_tipo_propiedad: '',
    id_estatus_disponibilidad: '',
    id_entidad_relacionada_dueno: '',
    id_edificio_modelo: ''
  });

  // Fetch catalogs for dropdowns
  const { data: tiposTransaccion } = useQuery({
    queryKey: ['tipos_transaccion'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_transaccion')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

  const { data: tiposPropiedad } = useQuery({
    queryKey: ['tipos_propiedad'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tipos_propiedad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

  const { data: estatusDisponibilidad } = useQuery({
    queryKey: ['estatus_disponibilidad'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('estatus_disponibilidad')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

  // Fetch property project info first
  const { data: propertyProject } = useQuery({
    queryKey: ['property_project', property.proyecto],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('proyectos')
        .select('id, nombre')
        .ilike('nombre', property.proyecto);
      if (error) throw error;
      return (data && data.length > 0) ? data[0] : null;
    }
  });

  // Fetch catalogs for dropdowns - vistas (must be after propertyProject)
  const { data: vistas } = useQuery({
    queryKey: ['vistas', propertyProject?.id],
    queryFn: async () => {
      if (!propertyProject?.id) return [];
      
      const { data, error } = await supabase
        .from('vistas')
        .select('id, nombre, url')
        .eq('activo', true)
        .eq('id_proyecto', propertyProject.id)
        .order('nombre');
      if (error) throw error;
      return data;
    },
    enabled: !!propertyProject?.id
  });

  // Fetch owners based on the custom query logic - filter by specific entity types and project, plus global owners
  const { data: entidadesRelacionadas } = useQuery({
    queryKey: ['propietarios_filtered', propertyProject?.id],
    queryFn: async () => {
      if (!propertyProject?.id) return [];
      
      // Buscar entidades relacionadas del proyecto
      const { data: projectOwners, error: projectError } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          id_proyecto,
          id_persona,
          proyectos!entidades_relacionadas_id_proyecto_fkey (
            id,
            nombre
          ),
          personas!fk_entrel_persona (
            id,
            nombre_legal
          ),
          tipos_entidad!id_tipo_entidad (
            id,
            nombre
          )
        `)
        .in('id_tipo_entidad', [4, 9, 10, 15])
        .eq('id_proyecto', propertyProject.id)
        .eq('activo', true);
      
      if (projectError) throw projectError;

      // Buscar dueños globales (id_tipo_entidad=17, sin proyecto específico)
      const { data: globalOwners, error: globalError } = await supabase
        .from('entidades_relacionadas')
        .select(`
          id,
          id_proyecto,
          id_persona,
          personas!fk_entrel_persona (
            id,
            nombre_legal
          ),
          tipos_entidad!id_tipo_entidad (
            id,
            nombre
          )
        `)
        .eq('id_tipo_entidad', 17)
        .is('id_proyecto', null)
        .eq('activo', true);
      
      if (globalError) throw globalError;

      // Combinar ambas listas
      const combined = [...(projectOwners || []), ...(globalOwners || [])];
      
      // Eliminar duplicados por id de persona y ordenar
      const unique = combined.filter((v, i, a) => 
        a.findIndex(t => t.personas?.id === v.personas?.id) === i
      ).sort((a, b) => 
        (a.personas?.nombre_legal || '').localeCompare(b.personas?.nombre_legal || '')
      );
      
      return unique;
    },
    enabled: !!propertyProject?.id
  });

  const { data: edificiosModelos } = useQuery({
    queryKey: ['modelos_filtered', propertyProject?.id],
    queryFn: async () => {
      if (!propertyProject?.id) return [];

      // Step 1: Get all edificios for this project
      const { data: edificios, error: edificiosError } = await supabase
        .from('edificios')
        .select('id, nombre')
        .eq('id_proyecto', propertyProject.id);
      
      if (edificiosError) throw edificiosError;
      if (!edificios || edificios.length === 0) return [];

      const edificioIds = edificios.map(e => e.id);

      // Step 2: Get all edificios_modelos for these edificios
      const { data: edificiosModelosData, error: emError } = await supabase
        .from('edificios_modelos')
        .select('id, id_edificio, id_modelo')
        .in('id_edificio', edificioIds);
      
      if (emError) throw emError;
      if (!edificiosModelosData || edificiosModelosData.length === 0) return [];

      const modeloIds = [...new Set(edificiosModelosData.map(em => em.id_modelo))];

      // Step 3: Get all modelos
      const { data: modelos, error: modelosError } = await supabase
        .from('modelos')
        .select('id, nombre')
        .in('id', modeloIds);
      
      if (modelosError) throw modelosError;

      // Step 4: Map everything together
      const edificiosMap = new Map(edificios.map(e => [e.id, e]));
      const modelosMap = new Map(modelos?.map(m => [m.id, m]) || []);

      return edificiosModelosData.map(em => ({
        id: em.id,
        id_edificio: em.id_edificio,
        id_modelo: em.id_modelo,
        edificios: edificiosMap.get(em.id_edificio) || { id: em.id_edificio, nombre: '' },
        modelos: modelosMap.get(em.id_modelo) || { id: em.id_modelo, nombre: '' }
      }));
    },
    enabled: !!propertyProject?.id
  });

  // Fetch current property details
  useEffect(() => {
    const fetchPropertyDetails = async () => {
      // Get the full property data
      const { data: fullPropertyData, error: fullPropertyError } = await supabase
        .from('propiedades')
        .select('*')
        .eq('id', property.id)
        .maybeSingle();
      
      if (fullPropertyError) {
        console.error('Error fetching full property details:', fullPropertyError);
        return;
      }

      // Get id_modelo from id_edificio_modelo
      if (fullPropertyData?.id_edificio_modelo) {
        const { data: edificioModelo, error: emError } = await supabase
          .from('edificios_modelos')
          .select('id_modelo')
          .eq('id', fullPropertyData.id_edificio_modelo)
          .maybeSingle();
        
        if (!emError && edificioModelo) {
          setModeloId(edificioModelo.id_modelo.toString());
          console.log('Model ID loaded:', edificioModelo.id_modelo);
        }
      }

      // Check CLABE STP - first check if there's clabe_stp_tmp_apartado
      let clabeStp = fullPropertyData?.clabe_stp_tmp_apartado || '';

      // If not, check if there's a cuenta_cobranza with CLABE
      if (!clabeStp) {
        const { data: cuentasCobranza } = await supabase
          .from('cuentas_cobranza')
          .select(`
            clabe_stp,
            ofertas!fk_cuentas_cobranza_oferta (
              id_propiedad,
              id_producto,
              activo
            )
          `)
          .eq('activo', true)
          .not('clabe_stp', 'is', null);

        // Filter for this property's offers
        if (cuentasCobranza && cuentasCobranza.length > 0) {
          const cuentaPropiedad = cuentasCobranza.find(cc => 
            cc.ofertas?.id_propiedad === property.id && 
            cc.ofertas?.activo === true &&
            cc.ofertas?.id_producto === null
          );
          
          if (cuentaPropiedad?.clabe_stp) {
            clabeStp = cuentaPropiedad.clabe_stp;
          }
        }
      }

      // Guardar el estatus original para validación posterior
      setOriginalStatusId(fullPropertyData.id_estatus_disponibilidad || null);

      setFormData({
        numero_propiedad: fullPropertyData.numero_propiedad,
        numero_piso: fullPropertyData.numero_piso?.toString() || '',
        m2_interiores: fullPropertyData.m2_interiores || 0,
        m2_exteriores: fullPropertyData.m2_exteriores || 0,
        m2_loft: fullPropertyData.m2_loft || 0,
        precio_lista: fullPropertyData.precio_lista || 0,
        monto_apartado: fullPropertyData.monto_apartado ?? 0,
        clabe_stp_tmp_apartado: clabeStp || '',
        descripcion: fullPropertyData.descripcion || '',
        url_imagen_portada: fullPropertyData.url_imagen_portada || '',
        id_vista: fullPropertyData.id_vista?.toString() || '',
        id_tipo_transaccion: fullPropertyData.id_tipo_transaccion?.toString() || '',
        id_tipo_propiedad: fullPropertyData.id_tipo_propiedad?.toString() || '',
        id_estatus_disponibilidad: fullPropertyData.id_estatus_disponibilidad?.toString() || '',
        id_entidad_relacionada_dueno: fullPropertyData.id_entidad_relacionada_dueno?.toString() || '',
        id_edificio_modelo: fullPropertyData.id_edificio_modelo?.toString() || ''
      });
    };

    fetchPropertyDetails();
  }, [property.id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validar cambio de estatus de propiedad
      const currentStatusId = parseInt(formData.id_estatus_disponibilidad);
      
      if (originalStatusId !== null && currentStatusId !== originalStatusId) {
        // REGLA 1: NADIE puede cambiar A "Asignado" - solo el sistema lo asigna
        if (currentStatusId === ESTATUS_ASIGNADO) {
          toast({
            title: "Error",
            description: "El estatus 'Asignado' solo puede ser establecido por el sistema al asignar una propiedad.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        // REGLA 2: NADIE puede cambiar DESDE "Asignado" a otro estatus
        if (originalStatusId === ESTATUS_ASIGNADO) {
          toast({
            title: "Error",
            description: "No se puede cambiar el estatus de una propiedad que ya está 'Asignado'.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }

        // Si no es Super Admin o Admin de Data, rechazar cualquier cambio de estatus
        if (!canEditPropertyStatus) {
          toast({
            title: "Error",
            description: "No tienes permiso para cambiar el estatus de la propiedad.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
        
        // Usuarios no-super solo pueden cambiar entre Inventario <-> Disponible
        if (!isSuperAdmin && (!allowedStatusIds.includes(currentStatusId) || !allowedStatusIds.includes(originalStatusId))) {
          toast({
            title: "Error",
            description: "Solo se permite cambiar entre Inventario y Disponible.",
            variant: "destructive",
          });
          setIsLoading(false);
          return;
        }
      }
      const { error } = await supabase
        .from('propiedades')
        .update({
          numero_propiedad: formData.numero_propiedad,
          numero_piso: formData.numero_piso as any,
          m2_interiores: formData.m2_interiores,
          m2_exteriores: formData.m2_exteriores,
          m2_loft: formData.m2_loft,
          precio_lista: formData.precio_lista,
          monto_apartado: formData.monto_apartado || null,
          clabe_stp_tmp_apartado: formData.clabe_stp_tmp_apartado?.trim() || null,
          descripcion: formData.descripcion || null,
          url_imagen_portada: formData.url_imagen_portada || null,
          id_vista: parseInt(formData.id_vista),
          id_tipo_transaccion: parseInt(formData.id_tipo_transaccion),
          id_tipo_propiedad: parseInt(formData.id_tipo_propiedad),
          id_estatus_disponibilidad: parseInt(formData.id_estatus_disponibilidad),
          id_entidad_relacionada_dueno: parseInt(formData.id_entidad_relacionada_dueno),
          id_edificio_modelo: parseInt(formData.id_edificio_modelo),
          es_aprobado: false // Cuando se edita una propiedad, se pone en draft
        })
        .eq('id', property.id);

      if (error) throw error;

      toast({
        title: "✅ Propiedad actualizada exitosamente",
        description: "⚠️ IMPORTANTE: La propiedad pasará a estado DRAFT para que puedas verificar los cambios antes de aprobarla nuevamente.",
      });

      // Si se cambió manualmente a Vendido (5), disparar generación de factura de comisión Sozu
      if (originalStatusId !== null && currentStatusId === ESTATUS_VENDIDO && originalStatusId !== ESTATUS_VENDIDO) {
        try {
          // Buscar la cuenta de cobranza activa asociada a esta propiedad
          const { data: cuentaData } = await supabase
            .from('cuentas_cobranza')
            .select('id, id_oferta')
            .eq('activo', true)
            .is('id_cuenta_cobranza_padre', null);

          // Filtrar por propiedad a través de la oferta
          if (cuentaData && cuentaData.length > 0) {
            for (const cuenta of cuentaData) {
              const { data: ofertaData } = await supabase
                .from('ofertas')
                .select('id_propiedad')
                .eq('id', cuenta.id_oferta)
                .single();

              if (ofertaData?.id_propiedad === property.id) {
                console.log(`[EditPropertyDialog] Propiedad ${property.id} cambiada a Vendido. Generando factura comisión para cuenta ${cuenta.id}`);
                supabase.functions.invoke('generar-factura-comision-sozu', {
                  body: { id_cuenta_cobranza: cuenta.id }
                }).then(({ data, error: fnError }) => {
                  if (fnError) {
                    console.error('[EditPropertyDialog] Error generando factura comisión:', fnError);
                  } else {
                    console.log('[EditPropertyDialog] Factura comisión resultado:', data);
                  }
                });
                break;
              }
            }
          }
        } catch (facturaErr) {
          console.error('[EditPropertyDialog] Error buscando cuenta para factura:', facturaErr);
          // No bloquear el flujo principal
        }
      }

      // Registrar actividad
      registrarActualizacion('propiedad', 
        { id: property.id, numero_propiedad: property.numero_propiedad },
        { id: property.id, ...formData }
      );

      onSuccess();
    } catch (error) {
      console.error('Error updating property:', error);
      toast({
        title: "Error",
        description: "No se pudo actualizar la propiedad.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Editar Propiedad: {property.numero_propiedad}
            {propertyProject?.nombre && ` de ${propertyProject.nombre}`}
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="general" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="general">Características Generales</TabsTrigger>
            <TabsTrigger value="descripcion">Descripción</TabsTrigger>
            <TabsTrigger value="multimedia">Multimedia</TabsTrigger>
          </TabsList>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <TabsContent value="general" className="space-y-6">
              {/* Información del Proyecto y Propietario */}
              <Card>
                <CardHeader>
                  <CardTitle>Información del Proyecto</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="edificio_modelo">Edificio-Modelo *</Label>
                    <Combobox
                      value={formData.id_edificio_modelo}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, id_edificio_modelo: value }))}
                      options={edificiosModelos?.map((em) => ({
                        value: em.id.toString(),
                        label: `${em.edificios?.nombre} - ${em.modelos?.nombre}`,
                      })) || []}
                      placeholder="Selecciona modelo"
                      searchPlaceholder="Buscar modelo..."
                      emptyText="No se encontró el modelo."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="propietario">Propietario *</Label>
                    <Combobox
                      value={formData.id_entidad_relacionada_dueno}
                      onValueChange={async (value) => {
                        setFormData(prev => ({ ...prev, id_entidad_relacionada_dueno: value }));
                        
                        // Generate new CLABE STP when owner changes (but don't save to DB yet)
                        if (value) {
                          try {
                            const { data: nuevaClabe, error } = await supabase
                              .rpc('crear_referencia_bancaria', { id_er_dueno: parseInt(value) });
                            
                            if (error) {
                              console.error('Error generating new CLABE STP:', error);
                              toast({
                                title: "Error",
                                description: "No se pudo generar la nueva CLABE STP.",
                                variant: "destructive",
                              });
                              return;
                            }

                            // Update only form state (don't save to database until submit)
                            setFormData(prev => ({ ...prev, clabe_stp_tmp_apartado: nuevaClabe || '' }));
                            
                            toast({
                              title: "CLABE STP generada",
                              description: "Se ha generado una nueva CLABE STP. Guarda los cambios para aplicarla.",
                            });
                          } catch (error) {
                            console.error('Error in CLABE STP generation:', error);
                            toast({
                              title: "Error",
                              description: "Error inesperado al generar la CLABE STP.",
                              variant: "destructive",
                            });
                          }
                        }
                      }}
                      options={entidadesRelacionadas?.map((entidad) => ({
                        value: entidad.id.toString(),
                        label: entidad.personas?.nombre_legal || "",
                      })) || []}
                      placeholder="Selecciona propietario"
                      searchPlaceholder="Buscar propietario..."
                      emptyText="No se encontró el propietario."
                      disabled={parseInt(formData.id_estatus_disponibilidad) > 2}
                    />
                  </div>

                  <div className="space-y-2 col-span-2">
                    <Label htmlFor="clabe_stp">CLABE STP</Label>
                    <Input
                      id="clabe_stp"
                      value={formData.clabe_stp_tmp_apartado}
                      readOnly
                      className="bg-muted"
                    />
                    <p className="text-sm text-muted-foreground">
                      Esta CLABE se genera automáticamente al seleccionar un propietario
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* Datos Básicos de la Propiedad */}
              <Card>
                <CardHeader>
                  <CardTitle>Datos Básicos</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="numero_propiedad">Número de la Propiedad *</Label>
                    <Input
                      id="numero_propiedad"
                      value={formData.numero_propiedad}
                      onChange={(e) => setFormData(prev => ({ ...prev, numero_propiedad: e.target.value }))}
                      placeholder="Ej: A-101"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="numero_piso">Nivel *</Label>
                    <Input
                      id="numero_piso"
                      type="text"
                      value={formData.numero_piso}
                      onChange={(e) => setFormData(prev => ({ ...prev, numero_piso: e.target.value }))}
                      placeholder="Ej: 1, PB, Mezzanine"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="m2_interiores">M2 interiores *</Label>
                    <Input
                      id="m2_interiores"
                      type="number"
                      step="0.01"
                      value={formData.m2_interiores}
                      onChange={(e) => setFormData(prev => ({ ...prev, m2_interiores: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ej: 85.50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="m2_exteriores">M2 exteriores *</Label>
                    <Input
                      id="m2_exteriores"
                      type="number"
                      step="0.01"
                      value={formData.m2_exteriores}
                      onChange={(e) => setFormData(prev => ({ ...prev, m2_exteriores: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ej: 80.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="m2_loft">M2 Loft</Label>
                    <Input
                      id="m2_loft"
                      type="number"
                      step="0.01"
                      value={formData.m2_loft}
                      onChange={(e) => setFormData(prev => ({ ...prev, m2_loft: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ej: 20.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="precio_lista">Precio de Lista *</Label>
                    <CurrencyInput
                      id="precio_lista"
                      value={Math.round((formData.precio_lista || 0) * 100)}
                      onChange={(cents) => setFormData(prev => ({ ...prev, precio_lista: cents / 100 }))}
                      placeholder="0.00"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monto_apartado">Monto Apartado (Opcional)</Label>
                    <Input
                      id="monto_apartado"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.monto_apartado || ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setFormData(prev => ({ ...prev, monto_apartado: value === '' ? 0 : parseFloat(value) }));
                      }}
                      placeholder="Ej: 50000.00"
                    />
                  </div>
                </CardContent>
              </Card>

              {/* Clasificación de la Propiedad */}
              <Card>
                <CardHeader>
                  <CardTitle>Clasificaciones</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="tipo_transaccion">Tipo de Transacción *</Label>
                    <Combobox
                      value={formData.id_tipo_transaccion}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, id_tipo_transaccion: value }))}
                      options={tiposTransaccion?.map((tipo) => ({
                        value: tipo.id.toString(),
                        label: tipo.nombre,
                      })) || []}
                      placeholder="Selecciona tipo de transacción"
                      searchPlaceholder="Buscar tipo..."
                      emptyText="No se encontró el tipo."
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tipo_propiedad">Tipo de Propiedad *</Label>
                    <Combobox
                      value={formData.id_tipo_propiedad}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, id_tipo_propiedad: value }))}
                      options={tiposPropiedad?.map((tipo) => ({
                        value: tipo.id.toString(),
                        label: tipo.nombre,
                      })) || []}
                      placeholder="Selecciona tipo de propiedad"
                      searchPlaceholder="Buscar tipo..."
                      emptyText="No se encontró el tipo."
                    />
                  </div>

                  {/* Campo de Estatus de propiedad - Reglas especiales para "Asignado" */}
                  <div className="space-y-2">
                    <Label htmlFor="estatus_propiedad">Estatus de propiedad *</Label>
                    {(() => {
                      const userCanEdit = profile?.rol_id === ROL_SUPER_ADMIN || profile?.rol_id === ROL_ADMIN_DATA;
                      // Si la propiedad está en "Asignado", NADIE puede cambiarla
                      const isAsignado = originalStatusId === ESTATUS_ASIGNADO;
                      // Super Admin puede editar cualquier estatus (excepto Asignado), otros roles solo Inventario/Disponible
                      const statusIsEditable = !isAsignado && (isSuperAdmin || (originalStatusId !== null && allowedStatusIds.includes(originalStatusId)));
                      const fieldEnabled = userCanEdit && statusIsEditable;
                      
                      return (
                        <>
                          <Select
                            value={formData.id_estatus_disponibilidad}
                            onValueChange={(val) => setFormData(prev => ({ ...prev, id_estatus_disponibilidad: val }))}
                            disabled={!fieldEnabled}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona estatus" />
                            </SelectTrigger>
                            <SelectContent>
                              {estatusDisponibilidad?.map((estatus) => {
                                // NADIE puede seleccionar "Asignado" - solo el sistema lo asigna
                                if (estatus.id === ESTATUS_ASIGNADO) {
                                  const isCurrent = estatus.id.toString() === formData.id_estatus_disponibilidad;
                                  // Solo mostrar si es el estatus actual (para que se vea el valor)
                                  if (!isCurrent) return null;
                                  return (
                                    <SelectItem 
                                      key={estatus.id} 
                                      value={estatus.id.toString()}
                                      disabled={true}
                                      className="opacity-50"
                                    >
                                      {estatus.nombre} (solo sistema)
                                    </SelectItem>
                                  );
                                }
                                
                                // Super Admin puede seleccionar cualquier estatus excepto Asignado
                                const isAllowed = isSuperAdmin || allowedStatusIds.includes(estatus.id);
                                const isCurrent = estatus.id.toString() === formData.id_estatus_disponibilidad;
                                return (
                                  <SelectItem 
                                    key={estatus.id} 
                                    value={estatus.id.toString()}
                                    disabled={!isAllowed && !isCurrent}
                                    className={!isAllowed && !isCurrent ? "opacity-50" : ""}
                                  >
                                    {estatus.nombre}
                                  </SelectItem>
                                );
                              })}
                            </SelectContent>
                          </Select>
                          {isAsignado && (
                            <p className="text-xs text-amber-600">
                              El estatus "Asignado" no puede ser modificado manualmente.
                            </p>
                          )}
                        </>
                      );
                    })()}
                  </div>

                </CardContent>
              </Card>
            </TabsContent>
            
            <TabsContent value="descripcion" className="space-y-6">
              <div className="grid gap-6">
                {/* Descripción de la Propiedad */}
                <Card>
                  <CardHeader>
                    <CardTitle>Descripción de la Propiedad</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Label htmlFor="descripcion">Descripción</Label>
                      <Textarea
                        id="descripcion"
                        value={formData.descripcion}
                        onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                        placeholder="Describe las características y amenidades de la propiedad..."
                        className="min-h-[120px]"
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Configuración del Modelo */}
                {modeloId && (
                  <ModelConfigurationDisplay 
                    modeloId={modeloId} 
                    modelName={property.modelo}
                    onCharacteristicsLoaded={setExcludedCharacteristicIds}
                  />
                )}

                {/* Características extra de la Propiedad */}
                <PropertyCharacteristicsSection 
                  propertyId={property.id} 
                  excludeCharacteristicIds={excludedCharacteristicIds}
                />
              </div>
            </TabsContent>

            <TabsContent value="multimedia" className="space-y-6">
              <div className="grid gap-6">
                {/* Vista de la Propiedad */}
                <Card>
                  <CardHeader>
                    <CardTitle>Vista de la Propiedad</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <Label htmlFor="vista">Vista</Label>
                      <Combobox
                        value={formData.id_vista}
                        onValueChange={(value) => setFormData(prev => ({ ...prev, id_vista: value }))}
                        options={vistas?.map((vista) => ({
                          value: vista.id.toString(),
                          label: vista.nombre,
                        })) || []}
                        placeholder="Selecciona una vista"
                        searchPlaceholder="Buscar vista..."
                        emptyText="No se encontró la vista."
                        className="mt-1"
                      />
                    </div>
                    
                    {/* Mostrar imagen de la vista seleccionada */}
                    {formData.id_vista && (
                      <div className="mt-4">
                        <Label>Imagen de la Vista</Label>
                        {(() => {
                          const selectedVista = vistas?.find(v => v.id.toString() === formData.id_vista);
                          
                          if (selectedVista?.url) {
                            return (
                              <div className="mt-2 border rounded-lg overflow-hidden">
                                <img
                                  src={selectedVista.url}
                                  alt={selectedVista.nombre}
                                  className="w-full h-48 object-cover"
                                  onError={(e) => {
                                    const imgElement = e.currentTarget as HTMLImageElement;
                                    const nextElement = imgElement.nextElementSibling as HTMLElement;
                                    imgElement.style.display = 'none';
                                    if (nextElement) nextElement.style.display = 'flex';
                                  }}
                                />
                                <div 
                                  className="hidden w-full h-48 bg-muted flex-col items-center justify-center text-muted-foreground"
                                >
                                  <p>Imagen no disponible</p>
                                  <p className="text-sm">{selectedVista.nombre}</p>
                                </div>
                              </div>
                            );
                          } else {
                            return (
                              <div className="mt-2 w-full h-48 bg-muted rounded-lg flex flex-col items-center justify-center text-muted-foreground border">
                                <p>Sin imagen disponible</p>
                                <p className="text-sm">{selectedVista?.nombre}</p>
                              </div>
                            );
                          }
                        })()}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Imágenes y Videos */}
                <Card>
                  <CardHeader>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>👁️</span>
                        <CardTitle>Imágenes y Videos</CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <PropertyMultimediaTab propertyId={property.id} />
                  </CardContent>
                </Card>
              </div>
            </TabsContent>


            {/* Botones de acción - visibles en todas las pestañas */}
            <div className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={onClose}>
                Cancelar
              </Button>
              <Button type="submit" disabled={isLoading}>
                {isLoading ? "Guardando..." : "Guardar Cambios"}
              </Button>
            </div>
          </form>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};