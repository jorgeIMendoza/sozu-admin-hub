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

type RepresentanteLegal = {
  id: number;
  nombre_legal: string;
  email: string;
  telefono?: string;
  curp?: string;
  activo: boolean;
  representado?: {
    id: number;
    nombre_legal: string;
  };
};

export default function RepresentantesLegales() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingRepresentant, setEditingRepresentant] = useState<RepresentanteLegal | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: representantes = [], isLoading } = useQuery({
    queryKey: ['representantes_legales'],
    queryFn: async () => {
      // Por ahora mostramos personas físicas que podrían ser representantes legales
      // En el futuro se podría crear una relación específica
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('tipo_persona', 'pf')
        .eq('activo', true)
        .order('nombre_legal', { ascending: true });
      
      if (error) throw error;
      return (data || []) as RepresentanteLegal[];
    },
  });

  const createMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { error } = await supabase
        .from('personas')
        .insert([{ ...personData, tipo_persona: 'pf' }]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      setIsNewDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Representante legal creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el representante legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async (personData: any) => {
      const { error } = await supabase
        .from('personas')
        .update(personData)
        .eq('id', editingRepresentant?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      setIsEditDialogOpen(false);
      setEditingRepresentant(null);
      toast({
        title: "Éxito",
        description: "Representante legal actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el representante legal: ${error.message}`,
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
      queryClient.invalidateQueries({ queryKey: ['representantes_legales'] });
      toast({
        title: "Éxito",
        description: "Representante legal eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el representante legal: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredRepresentantes = representantes.filter(representante => 
    representante.nombre_legal?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    representante.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    representante.curp?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleEdit = (representante: RepresentanteLegal) => {
    setEditingRepresentant(representante);
    setIsEditDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de que quieres eliminar este representante legal?')) {
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
                Representantes Legales
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los representantes legales
              </p>
            </div>
            <Button 
              onClick={() => setIsNewDialogOpen(true)}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Representante Legal
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar por nombre, email, CURP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-border focus:ring-primary/20"
              />
            </div>
          </div>

          {filteredRepresentantes.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground text-lg mb-2">
                No hay representantes legales registrados
              </div>
              <p className="text-muted-foreground/80 mb-4">
                Agrega tu primer representante legal para comenzar
              </p>
              <Button 
                onClick={() => setIsNewDialogOpen(true)}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Primer Representante Legal
              </Button>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-foreground">Nombre Completo</TableHead>
                    <TableHead className="font-semibold text-foreground">Email</TableHead>
                    <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
                    <TableHead className="font-semibold text-foreground">CURP</TableHead>
                    <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRepresentantes.map((representante) => (
                    <TableRow key={representante.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell className="font-medium text-foreground">
                        {representante.nombre_legal}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {representante.email}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {representante.telefono || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {representante.curp || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleEdit(representante)}
                            className="hover:bg-primary/10 hover:border-primary transition-colors"
                          >
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDelete(representante.id)}
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

      {/* Dialog para nuevo representante legal */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nuevo Representante Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={(data) => createMutation.mutate(data)}
            isLoading={createMutation.isPending}
            onCancel={() => setIsNewDialogOpen(false)}
            entityType="representative"
          />
        </DialogContent>
      </Dialog>

      {/* Dialog para editar representante legal */}
      <Dialog open={isEditDialogOpen} onOpenChange={setIsEditDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Editar Representante Legal</DialogTitle>
          </DialogHeader>
          <PersonForm
            initialData={editingRepresentant}
            onSubmit={(data) => updateMutation.mutate(data)}
            isLoading={updateMutation.isPending}
            onCancel={() => {
              setIsEditDialogOpen(false);
              setEditingRepresentant(null);
            }}
            entityType="representative"
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}