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
import { DocumentsTab } from "./DocumentsTab";
import { PropertyMultimediaSection } from "./PropertyMultimediaSection";
import { PropertyCharacteristicsSection } from "./PropertyCharacteristicsSection";

interface Property {
  id: number;
  dueño: string;
  numero_propiedad: string;
  numero_piso: number;
  m2_reales: number;
  precio_lista: number;
  clabe_stp: string;
  vista: string;
  transaccion: string;
  tipo_propiedad: string;
  disponibilidad: string;
  activo: boolean;
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
    clabe_stp_tmp_apartado: property.clabe_stp,
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
        .select('id, nombre')
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
        .single();
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
        .single();
      
      if (fullPropertyError) {
        console.error('Error fetching full property details:', fullPropertyError);
        return;
      }

      setFormData({
        numero_propiedad: fullPropertyData.numero_propiedad,
        numero_piso: fullPropertyData.numero_piso || 0,
        m2_reales: fullPropertyData.m2_reales || 0,
        m2_escriturables: fullPropertyData.m2_escriturables || 0,
        precio_lista: formData.precio_lista,
        monto_apartado: formData.monto_apartado || 0,
        clabe_stp_tmp_apartado: currentProperty.clabe_stp || '', // This comes from the function with COALESCE logic
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

        <Tabs defaultValue="basic" className="w-full">
          <TabsList className="grid w-full grid-cols-4 mb-4 bg-muted">
            <TabsTrigger value="basic" className="text-foreground">Datos Básicos</TabsTrigger>
            <TabsTrigger value="documents" className="text-foreground">Documentos</TabsTrigger>
            <TabsTrigger value="multimedia" className="text-foreground">Multimedia</TabsTrigger>
            <TabsTrigger value="characteristics" className="text-foreground">Características</TabsTrigger>
          </TabsList>
          
          <TabsContent value="basic">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="numero_propiedad">Número de Propiedad</Label>
                  <Input
                    id="numero_propiedad"
                    value={formData.numero_propiedad}
                    onChange={(e) => setFormData(prev => ({ ...prev, numero_propiedad: e.target.value }))}
                    required
                  />
                </div>

            <div className="space-y-2">
              <Label htmlFor="numero_piso">Número de Piso</Label>
              <Input
                id="numero_piso"
                type="number"
                value={formData.numero_piso}
                onChange={(e) => setFormData(prev => ({ ...prev, numero_piso: parseInt(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m2_reales">M² Reales</Label>
              <Input
                id="m2_reales"
                type="number"
                step="0.01"
                value={formData.m2_reales}
                onChange={(e) => setFormData(prev => ({ ...prev, m2_reales: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="m2_escriturables">M² Escriturables</Label>
              <Input
                id="m2_escriturables"
                type="number"
                step="0.01"
                value={formData.m2_escriturables}
                onChange={(e) => setFormData(prev => ({ ...prev, m2_escriturables: parseFloat(e.target.value) || 0 }))}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="precio_lista">Precio Lista</Label>
              <Input
                id="precio_lista"
                type="number"
                step="0.01"
                min="0"
                value={formData.precio_lista}
                onChange={(e) => setFormData(prev => ({ ...prev, precio_lista: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="monto_apartado">Monto Apartado</Label>
              <Input
                id="monto_apartado"
                type="number"
                step="0.01"
                min="0"
                value={formData.monto_apartado}
                onChange={(e) => setFormData(prev => ({ ...prev, monto_apartado: parseFloat(e.target.value) || 0 }))}
                placeholder="0.00"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="clabe_stp">CLABE STP</Label>
              <Input
                id="clabe_stp"
                value={formData.clabe_stp_tmp_apartado}
                readOnly
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="descripcion">Descripción</Label>
              <textarea
                id="descripcion"
                className="flex min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={formData.descripcion}
                onChange={(e) => setFormData(prev => ({ ...prev, descripcion: e.target.value }))}
                placeholder="Descripción de la propiedad (opcional)"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="vista">Vista</Label>
              <Select value={formData.id_vista} onValueChange={(value) => setFormData(prev => ({ ...prev, id_vista: value }))}>
                <SelectTrigger>
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

            <div className="space-y-2">
              <Label htmlFor="tipo_transaccion">Tipo de Transacción</Label>
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
              <Label htmlFor="tipo_propiedad">Tipo de Propiedad</Label>
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
              <Label htmlFor="estatus_disponibilidad">Estatus de Disponibilidad</Label>
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

            <div className="space-y-2">
              <Label htmlFor="propietario">Propietario</Label>
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

            <div className="space-y-2">
              <Label htmlFor="edificio_modelo">Edificio-Modelo</Label>
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
          </div>

              <div className="flex justify-end space-x-2">
                <Button type="button" variant="outline" onClick={onClose}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={isLoading}>
                  {isLoading ? "Guardando..." : "Guardar Cambios"}
                </Button>
              </div>
            </form>
          </TabsContent>
          
          <TabsContent value="documents">
            <DocumentsTab 
              entityId={property.id} 
              entityType="propiedad"
              onDocumentAdded={() => {
                toast({
                  title: "Documento agregado",
                  description: "El documento se ha agregado correctamente."
                });
              }}
            />
          </TabsContent>

          <TabsContent value="multimedia">
            <PropertyMultimediaSection propertyId={property.id} />
          </TabsContent>

          <TabsContent value="characteristics">
            <PropertyCharacteristicsSection propertyId={property.id} />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};