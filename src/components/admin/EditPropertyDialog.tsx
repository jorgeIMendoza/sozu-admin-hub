import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PropertyMultimediaTab } from "./PropertyMultimediaTab";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { PropertyCharacteristicsSection } from "./PropertyCharacteristicsSection";
import { PropertyYouTubeVideosSection } from "./PropertyYouTubeVideosSection";

interface Property {
  id: number;
  numero_propiedad: string;
  numero_piso: number;
  m2_reales: number;
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
  const [formData, setFormData] = useState({
    numero_propiedad: property.numero_propiedad,
    numero_piso: property.numero_piso,
    m2_reales: property.m2_reales,
    m2_escriturables: 0,
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
  const { data: vistas } = useQuery({
    queryKey: ['vistas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vistas')
        .select('id, nombre, url')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data;
    }
  });

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
          edificios_modelos!id_edificio_modelo (
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
    queryKey: ['modelos_filtered', propertyProject?.nombre],
    queryFn: async () => {
      if (!propertyProject?.nombre) return [];
      
      const { data, error } = await supabase
        .from('edificios_modelos')
        .select(`
          id,
          id_edificio,
          id_modelo,
          edificios!edificios_modelos_id_edificio_fkey (
            id,
            nombre,
            proyectos!fk_edificios_proyecto (
              id,
              nombre
            )
          ),
          modelos!edificios_modelos_id_modelo_fkey (
            id,
            nombre
          )
        `)
        .eq('activo', true);
      
      if (error) throw error;
      
      // Filter by project name
      const filtered = data?.filter(em => 
        em.edificios?.proyectos?.nombre === propertyProject.nombre
      ) || [];
      
      return filtered;
    },
    enabled: !!propertyProject?.nombre
  });

  // Fetch current property details using the same function as the listing
  useEffect(() => {
    const fetchPropertyDetails = async () => {
      // Use the same function as the properties listing to get CLABE STP
      const { data: propertiesData, error: propertiesError } = await supabase
        .rpc('get_properties_with_details');
      
      if (propertiesError) {
        console.error('Error fetching properties with details:', propertiesError);
        return;
      }

      // Find the current property in the results
      const currentProperty = propertiesData?.find((p: any) => p.id === property.id);
      
      if (!currentProperty) {
        console.error('Property not found in get_properties_with_details');
        return;
      }

      // Also get the full property data for form fields not in the function
      const { data: fullPropertyData, error: fullPropertyError } = await supabase
        .from('propiedades')
        .select('*')
        .eq('id', property.id)
        .maybeSingle();
      
      if (fullPropertyError) {
        console.error('Error fetching full property details:', fullPropertyError);
        return;
      }

      // Check if there's a cuenta_cobranza de PROPIEDAD associated
      let clabeStp = currentProperty.clabe_stp || '';

      const { data: cuentaCobranza, error: cuentaError } = await supabase
        .from('cuentas_cobranza')
        .select('clabe_stp, ofertas!fk_cuentas_cobranza_oferta(id_propiedad, id_producto)')
        .eq('ofertas.id_propiedad', property.id)
        .eq('ofertas.activo', true)
        .is('ofertas.id_producto', null)
        .eq('activo', true)
        .not('clabe_stp', 'is', null)
        .maybeSingle();

      if (cuentaCobranza?.clabe_stp) {
        clabeStp = cuentaCobranza.clabe_stp;
      }

      setFormData({
        numero_propiedad: fullPropertyData.numero_propiedad,
        numero_piso: fullPropertyData.numero_piso || 0,
        m2_reales: fullPropertyData.m2_reales || 0,
        m2_escriturables: fullPropertyData.m2_escriturables || 0,
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
          numero_piso: formData.numero_piso,
          m2_reales: formData.m2_reales,
          m2_escriturables: formData.m2_escriturables,
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
        title: "Propiedad actualizada",
        description: "Los datos de la propiedad se han actualizado correctamente.",
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
                    <Select value={formData.id_edificio_modelo} onValueChange={(value) => setFormData(prev => ({ ...prev, id_edificio_modelo: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona modelo" />
                      </SelectTrigger>
                      <SelectContent>
                        {edificiosModelos?.map((em) => (
                          <SelectItem key={em.id} value={em.id.toString()}>
                            {em.edificios?.nombre} - {em.modelos?.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="propietario">Propietario *</Label>
                    <Select 
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
                      disabled={parseInt(formData.id_estatus_disponibilidad) > 2}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona propietario" />
                      </SelectTrigger>
                      <SelectContent>
                        {entidadesRelacionadas?.map((entidad) => (
                          <SelectItem key={entidad.id} value={entidad.id.toString()}>
                            {entidad.personas?.nombre_legal}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                      type="number"
                      value={formData.numero_piso}
                      onChange={(e) => setFormData(prev => ({ ...prev, numero_piso: parseInt(e.target.value) || 0 }))}
                      placeholder="Ej: 1"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="m2_reales">M² Reales *</Label>
                    <Input
                      id="m2_reales"
                      type="number"
                      step="0.01"
                      value={formData.m2_reales}
                      onChange={(e) => setFormData(prev => ({ ...prev, m2_reales: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ej: 85.50"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="m2_escriturables">M² Escriturables *</Label>
                    <Input
                      id="m2_escriturables"
                      type="number"
                      step="0.01"
                      value={formData.m2_escriturables}
                      onChange={(e) => setFormData(prev => ({ ...prev, m2_escriturables: parseFloat(e.target.value) || 0 }))}
                      placeholder="Ej: 80.00"
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
                    <Select value={formData.id_tipo_transaccion} onValueChange={(value) => setFormData(prev => ({ ...prev, id_tipo_transaccion: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo de transacción" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposTransaccion?.map((tipo) => (
                          <SelectItem key={tipo.id} value={tipo.id.toString()}>
                            {tipo.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tipo_propiedad">Tipo de Propiedad *</Label>
                    <Select value={formData.id_tipo_propiedad} onValueChange={(value) => setFormData(prev => ({ ...prev, id_tipo_propiedad: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona tipo de propiedad" />
                      </SelectTrigger>
                      <SelectContent>
                        {tiposPropiedad?.map((tipo) => (
                          <SelectItem key={tipo.id} value={tipo.id.toString()}>
                            {tipo.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="estatus_disponibilidad">Estatus de Disponibilidad *</Label>
                    <Select value={formData.id_estatus_disponibilidad} onValueChange={(value) => setFormData(prev => ({ ...prev, id_estatus_disponibilidad: value }))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Selecciona estatus" />
                      </SelectTrigger>
                      <SelectContent>
                        {estatusDisponibilidad?.map((estatus) => (
                          <SelectItem key={estatus.id} value={estatus.id.toString()}>
                            {estatus.nombre}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
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
                <Card>
                  <CardHeader>
                    <CardTitle>Configuración del Modelo {property.modelo}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label className="text-sm font-medium">Número de Recámaras</Label>
                        <div className="mt-1">
                          <Badge variant="outline" className="text-sm">
                            {property.configuracion_modelo.numero_recamaras} recámaras
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Número de Baños Completos</Label>
                        <div className="mt-1">
                          <Badge variant="outline" className="text-sm">
                            {property.configuracion_modelo.numero_completo_banos} baños completos
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <Label className="text-sm font-medium">Número de Medios Baños</Label>
                        <div className="mt-1">
                          <Badge variant="outline" className="text-sm">
                            {property.configuracion_modelo.numero_medio_bano} medios baños
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Características */}
                <PropertyCharacteristicsSection propertyId={property.id} />
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
                      <Label htmlFor="vista">Vista *</Label>
                      <Select value={formData.id_vista} onValueChange={(value) => setFormData(prev => ({ ...prev, id_vista: value }))}>
                        <SelectTrigger className="mt-1">
                          <SelectValue placeholder="Selecciona una vista" />
                        </SelectTrigger>
                        <SelectContent>
                          {vistas?.map((vista) => (
                            <SelectItem key={vista.id} value={vista.id.toString()}>
                              {vista.nombre}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
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