import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PersonForm } from "@/components/admin/PersonForm";

type EntidadLegal = {
  id: number;
  nombre_legal: string;
  nombre_comercial?: string;
  email: string;
  telefono?: string;
  rfc?: string;
  activo: boolean;
};

export default function EntidadesLegales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingEntity, setEditingEntity] = useState<EntidadLegal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: entidades = [], isLoading } = useQuery({
    queryKey: ['entidades_legales'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('tipo_persona', 'pm')
        .eq('activo', true)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      return (data || []) as EntidadLegal[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { error } = await supabase
        .from('personas')
        .insert([{ ...personData, tipo_persona: 'pm' }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Entidad legal creada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear la entidad legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { error } = await supabase
        .from('personas')
        .update(personData)
        .eq('id', editingEntity?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      setIsEditDialogOpen(false);
      setEditingEntity(null);
      toast({
        title: "Éxito",
        description: "Entidad legal actualizada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar la entidad legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('personas')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['entidades_legales'] });
      toast({
        title: "Éxito",
        description: "Entidad legal eliminada correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar la entidad legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredEntidades = entidades.filter(entidad => 
    entidad.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entidad.nombre_comercial?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    entidad.rfc?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (entidad: EntidadLegal) => {
    setEditingEntity(entidad);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de que quieres eliminar esta entidad legal?')) {
      deleteMutation.mutate(id);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Entidades Legales
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de las entidades legales (personas morales)
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Entidad Legal
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar por nombre, RFC..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-border focus:ring-primary/20"
              />
            </div>
          </div>

          {filteredEntidades.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground text-lg mb-2">
                No hay entidades legales registradas
              </div>
              <p className="text-muted-foreground/80 mb-4">
                Agrega tu primera entidad legal para comenzar
              </p>
              <Button 
                onClick={() => setIsNewDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Primera Entidad Legal
              </Button>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-foreground">Razón Social</TableHead>
                    <TableHead className="font-semibold text-foreground">Nombre Comercial</TableHead>
                    <TableHead className="font-semibold text-foreground">RFC</TableHead>
                    <TableHead className="font-semibold text-foreground">Email</TableHead>
                    <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
                    <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredEntidades.map((entidad) => (
                    <TableRow key={entidad.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium text-foreground">
                        {entidad.nombre_legal}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entidad.nombre_comercial || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entidad.rfc || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entidad.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {entidad.telefono || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(entidad)}
                            className="hover:bg-primary/10 hover:border-primary transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDelete(entidad.id)}
                            className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Dialog para nueva entidad legal */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva Entidad Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="legal"
          />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar entidad legal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Entidad Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            initialData={editingEntity}
            onSubmit={(data) => updateMutation.mutate(data)}
            isLoading={updateMutation.isPending}
            onCancel={() => {
              setIsEditDialogOpen(false);
              setEditingEntity(null);
            }}
            entityType="legal"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}