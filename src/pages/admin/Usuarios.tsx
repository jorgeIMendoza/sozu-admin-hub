import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Search } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Persona = {
  id: number;
  nombre: string | null;
  curp: string | null;
  url_documento_identificacion?: string | null;
};

export default function Usuarios() {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: personas = [] } = useQuery({
    queryKey: ['personas_fake'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('personas_fake' as any)
        .select('*')
        .order('id', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as Persona[];
    },
  });

  const deletePersonaMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('personas_fake' as any)
        .delete()
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['personas_fake'] });
      toast({
        title: "Éxito",
        description: "Usuario eliminado correctamente.",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: `Error al eliminar el usuario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const filteredPersonas = personas.filter(persona => 
    persona.nombre?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    persona.curp?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const handleNewPersona = () => {
    navigate('/admin/usuarios/nuevo');
  };

  const handleDeletePersona = (id: number) => {
    if (confirm('¿Estás seguro de que quieres eliminar este usuario?')) {
      deletePersonaMutation.mutate(id);
    }
  };

  return (
    <div className="container mx-auto py-6 px-4">
      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">
                Usuarios
              </CardTitle>
              <p className="text-muted-foreground mt-1">
                Gestiona la información de los usuarios
              </p>
            </div>
            <Button 
              onClick={handleNewPersona}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-6"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Usuario
            </Button>
          </div>
        </CardHeader>
        
        <CardContent className="p-6">
          <div className="mb-6">
            <div className="relative max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                type="text"
                placeholder="Buscar usuarios por nombre o CURP..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 border-border focus:ring-primary/20"
              />
            </div>
          </div>

          {filteredPersonas.length === 0 ? (
            <div className="text-center py-12">
              <div className="text-muted-foreground text-lg mb-2">
                No hay usuarios registrados
              </div>
              <p className="text-muted-foreground/80 mb-4">
                Agrega tu primer usuario para comenzar
              </p>
              <Button 
                onClick={handleNewPersona}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105"
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar Primer Usuario
              </Button>
            </div>
          ) : (
            <div className="border border-border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead className="font-semibold text-foreground">Avatar</TableHead>
                    <TableHead className="font-semibold text-foreground">Nombre</TableHead>
                    <TableHead className="font-semibold text-foreground">CURP</TableHead>
                    <TableHead className="font-semibold text-foreground">Documento</TableHead>
                    <TableHead className="font-semibold text-foreground text-right">Acciones</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPersonas.map((persona) => (
                    <TableRow key={persona.id} className="hover:bg-muted/30 transition-colors">
                      <TableCell>
                        <div className="flex items-center justify-center w-10 h-10 bg-primary/10 rounded-full">
                          <span className="text-primary font-semibold text-sm">
                            {persona.nombre?.charAt(0).toUpperCase() || 'A'}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-foreground">
                        {persona.nombre || 'Sin nombre'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {persona.curp || 'Sin CURP'}
                      </TableCell>
                      <TableCell>
                        {persona.url_documento_identificacion ? (
                          <img 
                            src={persona.url_documento_identificacion} 
                            alt="Documento de identificación"
                            className="w-12 h-8 object-cover rounded border hover:scale-110 transition-transform cursor-pointer"
                            onClick={() => window.open(persona.url_documento_identificacion, '_blank')}
                          />
                        ) : (
                          <span className="text-muted-foreground">Sin documento</span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button 
                            variant="outline" 
                            size="sm"
                            className="hover:bg-primary/10 hover:border-primary transition-colors"
                          >
                            Editar
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleDeletePersona(persona.id)}
                            className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                          >
                            Eliminar
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
    </div>
  );
}