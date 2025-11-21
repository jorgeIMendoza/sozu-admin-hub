import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [isLoading, setIsLoading] = useState(false);
  const [modeloId, setModeloId] = useState<string | undefined>(undefined);
  const [excludedCharacteristicIds, setExcludedCharacteristicIds] = useState<number[]>([]);
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
    queryKey: ['property_project', property.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('propiedades')
        .select(`
          id,
          edificios_modelos!fk_propiedades_edificio_modelo (
            edificios!edificios_modelos_id_edificio_fkey (
              proyectos!fk_edificios_proyecto (
                id,
                nombre
              )
            )
          )
        `)
        .eq('id', property.id)
        .maybeSingle();
      if (error) throw error;
      return data?.edificios_modelos?.edificios?.proyectos;
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

  // Fetch owners based on the custom query logic - filter by specific entity types and project
  const { data: entidadesRelacionadas } = useQuery({
    queryKey: ['propietarios_filtered', propertyProject?.id],
    queryFn: async () => {
      if (!propertyProject?.id) return [];
      
      const { data, error } = await supabase
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
      
      if (error) throw error;
      return data || [];
    },
    enabled: !!propertyProject?.id
  });

  // Fetch models based on project
  const { data: edificiosModelos } = useQuery({
    queryKey: ['modelos_filtered', propertyProject?.id],
    queryFn: async () => {
      if (!propertyProject?.id) return [];
      
      const { data, error } = await supabase
        .from('edificios_modelos')
        .select(`
          id,
          id_edificio,
          id_modelo,
          edificios!edificios_modelos_id_edificio_fkey (
            id,
            nombre,
            id_proyecto
          ),
          modelos!edificios_modelos_id_modelo_fkey (
            id,
            nombre
          )
        `)
        .eq('activo', true)
        .eq('edificios.id_proyecto', propertyProject.id);
      
      if (error) throw error;
      return data || [];
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

      setFormData({
        numero_propiedad: fullPropertyData.numero_propiedad,
        numero_piso: fullPropertyData.numero_piso?.toString() || '',
        m2_interiores: fullPropertyData.m2_interiores || 0,
        m2_exteriores: fullPropertyData.m2_exteriores || 0,
        m2_loft: fullPropertyData.m2_loft || 0,
        precio_lista: fullPropertyData.precio_lista || 0,
        monto_apartado: fullPropertyData.monto_apartado || 0,
        clabe_stp_tmp_apartado: clabeStp,
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
      const { error } = await supabase
        .from('propiedades')
        .update({
          numero_propiedad: formData.numero_propiedad,
          numero_piso: formData.numero_piso as any,
          m2_interiores: formData.m2_interiores,
          m2_exteriores: formData.m2_exteriores,
          m2_loft: formData.m2_loft,
          precio_lista: formData.precio_lista,
          monto_apartado: formData.monto_apartado,
          clabe_stp_tmp_apartado: formData.clabe_stp_tmp_apartado,
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
                    <Label htmlFor="numero_piso">Número de Piso *</Label>
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
                    <Input
                      id="precio_lista"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.precio_lista}
                      onChange={(e) => setFormData(prev => ({ ...prev, precio_lista: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ej: 2500000"
                      required
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="monto_apartado">Monto Apartado (Opcional)</Label>
                    <Input
                      id="monto_apartado"
                      type="number"
                      step="0.01"
                      min="0"
                      value={formData.monto_apartado}
                      onChange={(e) => setFormData(prev => ({ ...prev, monto_apartado: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ej: 50000"
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

                  <div className="space-y-2">
                    <Label htmlFor="estatus_disponibilidad">Estatus de Disponibilidad *</Label>
                    <Combobox
                      value={formData.id_estatus_disponibilidad}
                      onValueChange={(value) => setFormData(prev => ({ ...prev, id_estatus_disponibilidad: value }))}
                      options={estatusDisponibilidad?.map((estatus) => ({
                        value: estatus.id.toString(),
                        label: estatus.nombre,
                      })) || []}
                      placeholder="Selecciona estatus"
                      searchPlaceholder="Buscar estatus..."
                      emptyText="No se encontró el estatus."
                      disabled={true}
                    />
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