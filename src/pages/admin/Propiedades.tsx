import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Search, Edit, Trash2, Upload } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { EditPropertyDialog } from "@/components/admin/EditPropertyDialog";
import { BulkUploadPropertiesDialog } from "@/components/admin/BulkUploadPropertiesDialog";

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

const Propiedades = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activas");
  const [editingProperty, setEditingProperty] = useState<Property | null>(null);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: properties, isLoading } = useQuery({
    queryKey: ['properties'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_properties_with_details');
      
      if (error) throw error;
      
      return data || [];
    },
  });

  const filteredProperties = properties?.filter(property => {
    const matchesSearch = 
      property.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.dueño.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.vista.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.tipo_propiedad.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === "activas" ? property.activo : !property.activo;
    
    return matchesSearch && matchesTab;
  }) || [];

  const handleDelete = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: false })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad eliminada",
        description: "La propiedad se ha marcado como inactiva correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo eliminar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const handleRestore = async (propertyId: number) => {
    try {
      const { error } = await supabase
        .from('propiedades')
        .update({ activo: true })
        .eq('id', propertyId);

      if (error) throw error;

      toast({
        title: "Propiedad restaurada",
        description: "La propiedad se ha reactivado correctamente.",
      });

      queryClient.invalidateQueries({ queryKey: ['properties'] });
    } catch (error) {
      toast({
        title: "Error",
        description: "No se pudo restaurar la propiedad.",
        variant: "destructive",
      });
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-lg">Cargando propiedades...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">
            Gestiona el inventario de propiedades del sistema
          </p>
        </div>
        <Button 
          onClick={() => setShowBulkUpload(true)}
          className="gap-2"
        >
          <Upload className="h-4 w-4" />
          Carga Masiva
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Propiedades</CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número de propiedad, propietario, vista o tipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="activas">
                Propiedades Activas ({properties?.filter(p => p.activo).length || 0})
              </TabsTrigger>
              <TabsTrigger value="eliminadas">
                Propiedades Eliminadas ({properties?.filter(p => !p.activo).length || 0})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="activas" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Propietario</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Piso</TableHead>
                      <TableHead>M² Reales</TableHead>
                      <TableHead>Precio Lista</TableHead>
                      <TableHead>Vista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Disponibilidad</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-6">
                          {searchTerm ? "No se encontraron resultados." : "No hay propiedades activas."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProperties.map((property) => (
                        <TableRow key={property.id}>
                          <TableCell className="font-medium">{property.dueño}</TableCell>
                          <TableCell>{property.numero_propiedad}</TableCell>
                          <TableCell>{property.numero_piso}</TableCell>
                          <TableCell>{property.m2_reales} m²</TableCell>
                          <TableCell>{formatCurrency(property.precio_lista)}</TableCell>
                          <TableCell>{property.vista}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{property.tipo_propiedad}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{property.disponibilidad}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => setEditingProperty(property)}
                                className="h-8 w-8 p-0"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(property.id)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="eliminadas" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Propietario</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Piso</TableHead>
                      <TableHead>M² Reales</TableHead>
                      <TableHead>Precio Lista</TableHead>
                      <TableHead>Vista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Disponibilidad</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-6">
                          {searchTerm ? "No se encontraron resultados." : "No hay propiedades eliminadas."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProperties.map((property) => (
                        <TableRow key={property.id} className="opacity-60">
                          <TableCell className="font-medium">{property.dueño}</TableCell>
                          <TableCell>{property.numero_propiedad}</TableCell>
                          <TableCell>{property.numero_piso}</TableCell>
                          <TableCell>{property.m2_reales} m²</TableCell>
                          <TableCell>{formatCurrency(property.precio_lista)}</TableCell>
                          <TableCell>{property.vista}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{property.tipo_propiedad}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{property.disponibilidad}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleRestore(property.id)}
                              className="h-8 px-2 text-xs"
                            >
                              Restaurar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {editingProperty && (
        <EditPropertyDialog
          property={editingProperty}
          onClose={() => setEditingProperty(null)}
          onSuccess={() => {
            setEditingProperty(null);
            queryClient.invalidateQueries({ queryKey: ['properties'] });
          }}
        />
      )}

      <BulkUploadPropertiesDialog
        open={showBulkUpload}
        onClose={() => setShowBulkUpload(false)}
        onSuccess={() => {
          queryClient.invalidateQueries({ queryKey: ['properties'] });
        }}
      />
    </div>
  );
};

export default Propiedades;