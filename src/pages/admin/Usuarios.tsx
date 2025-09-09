import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PersonForm } from "@/components/admin/PersonForm";

type Persona = {
  id: number;
  nombre: string | null;
  curp: string | null;
  url_documento_identificacion?: string | null;
};

export default function Usuarios() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingPersona, setEditingPersona] = useState<Persona | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: personas = [], isLoading } = useQuery({
    queryKey: ['personas_fake'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas_fake' as any)
        .select('*')
        .order('id', { ascending: false });
      
      if (error) {
        throw error;
      }
      
      return (data || []).map((item: any) => ({
        id: item.id,
        nombre: item.nombre || '',
        curp: item.curp || '',
        url_documento_identificacion: item.url_documento_identificacion
      })) as Persona[];
    },
  });

  const createPersonaMutation = useMutation({
    mutationFn: async (newPersona: { nombre: string; curp: string; url_documento_identificacion?: string }) => {
      const { data, error } = await supabase
        .from('personas_fake' as any)
        .insert([newPersona])
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas_fake'] });
      toast({
        title: "Éxito",
        description: "Persona creada correctamente.",
      });
      setIsDialogOpen(false);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al crear la persona: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const updatePersonaMutation = useMutation({
    mutationFn: async ({ id, ...updates }: { id: number } & Partial<Persona>) => {
      const { data, error } = await supabase
        .from('personas_fake' as any)
        .update(updates)
        .eq('id', id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas_fake'] });
      toast({
        title: "Éxito",
        description: "Persona actualizada correctamente.",
      });
      setIsDialogOpen(false);
      setEditingPersona(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al actualizar la persona: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (formData: { nombre: string; curp: string; url_documento_identificacion?: string }) => {
    if (editingPersona) {
      updatePersonaMutation.mutate({ id: editingPersona.id, ...formData });
    } else {
      createPersonaMutation.mutate(formData);
    }
  };

  const handleNewPersona = () => {
    setEditingPersona(null);
    setIsDialogOpen(true);
  };

  const handleEditPersona = (persona: Persona) => {
    setEditingPersona(persona);
    setIsDialogOpen(true);
  };

  const handleCloseDialog = () => {
    setIsDialogOpen(false);
    setEditingPersona(null);
  };

  const filteredPersonas = personas.filter(persona =>
    (persona.nombre || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
    (persona.curp || '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold">Usuarios</h1>
        <Button onClick={handleNewPersona}>
          <Plus className="w-4 h-4 mr-2" />
          Nueva Persona
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Personas</CardTitle>
          <div className="flex items-center space-x-2">
            <Search className="w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por nombre o CURP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-4">Cargando...</div>
          ) : filteredPersonas.length === 0 ? (
            <div className="text-center py-4 text-muted-foreground">
              No se encontraron personas
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>CURP</TableHead>
                  <TableHead>Documento</TableHead>
                  <TableHead>Acciones</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredPersonas.map((persona) => (
                  <TableRow key={persona.id}>
                    <TableCell className="font-medium">{persona.nombre}</TableCell>
                    <TableCell>{persona.curp}</TableCell>
                    <TableCell>
                      {persona.url_documento_identificacion ? (
                        <img 
                          src={persona.url_documento_identificacion} 
                          alt="Documento"
                          className="w-12 h-8 object-cover rounded border cursor-pointer"
                          onClick={() => window.open(persona.url_documento_identificacion, '_blank')}
                        />
                      ) : (
                        <span className="text-muted-foreground">Sin documento</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleEditPersona(persona)}
                      >
                        Editar
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {editingPersona ? 'Editar Persona' : 'Nueva Persona'}
            </DialogTitle>
          </DialogHeader>
          <PersonForm
            onSubmit={handleSubmit}
            initialData={editingPersona || undefined}
            isLoading={createPersonaMutation.isPending || updatePersonaMutation.isPending}
            onCancel={handleCloseDialog}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}