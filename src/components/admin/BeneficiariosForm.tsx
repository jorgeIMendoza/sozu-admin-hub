import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Beneficiario = {
  id: number;
  id_persona: number;
  id_parentesco: number;
  porcentaje_participacion: number;
  nombre_beneficiario: string;
  activo: boolean;
  parentesco?: {
    nombre: string;
  };
};

type Parentesco = {
  id: number;
  nombre: string;
};

interface BeneficiariosFormProps {
  personaId: number;
  personaNombre: string;
}

export function BeneficiariosForm({ personaId, personaNombre }: BeneficiariosFormProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBeneficiario, setEditingBeneficiario] = useState<Beneficiario | null>(null);
  const [nombreBeneficiario, setNombreBeneficiario] = useState("");
  const [idParentesco, setIdParentesco] = useState("");
  const [porcentajeParticipacion, setPorcentajeParticipacion] = useState("");
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch beneficiarios
  const { data: beneficiarios = [], isLoading } = useQuery({
    queryKey: ['beneficiarios', personaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beneficiarios')
        .select(`
          *,
          parentesco:parentescos(nombre)
        `)
        .eq('id_persona', personaId)
        .eq('activo', true)
        .order('nombre_beneficiario');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch parentescos
  const { data: parentescos = [] } = useQuery({
    queryKey: ['parentescos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('parentescos')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      return (data || []) as Parentesco[];
    },
  });

  // Create mutation
  const createMutation = useMutation({
    mutationFn: async (beneficiarioData: any) => {
      const { error } = await supabase
        .from('beneficiarios')
        .insert([beneficiarioData]);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiarios', personaId] });
      resetForm();
      setIsDialogOpen(false);
      toast({
        title: "Éxito",
        description: "Beneficiario creado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al crear el beneficiario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Update mutation
  const updateMutation = useMutation({
    mutationFn: async (beneficiarioData: any) => {
      const { error } = await supabase
        .from('beneficiarios')
        .update(beneficiarioData)
        .eq('id', editingBeneficiario?.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiarios', personaId] });
      resetForm();
      setIsDialogOpen(false);
      setEditingBeneficiario(null);
      toast({
        title: "Éxito",
        description: "Beneficiario actualizado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al actualizar el beneficiario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from('beneficiarios')
        .update({ activo: false })
        .eq('id', id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiarios', personaId] });
      toast({
        title: "Éxito",
        description: "Beneficiario eliminado correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: `Error al eliminar el beneficiario: ${error.message}`,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setNombreBeneficiario("");
    setIdParentesco("");
    setPorcentajeParticipacion("");
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nombreBeneficiario.trim() || !idParentesco || !porcentajeParticipacion) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos.",
        variant: "destructive",
      });
      return;
    }

    const porcentaje = parseFloat(porcentajeParticipacion);
    if (porcentaje <= 0 || porcentaje > 100) {
      toast({
        title: "Error",
        description: "El porcentaje debe ser mayor a 0 y máximo 100.",
        variant: "destructive",
      });
      return;
    }

    const beneficiarioData = {
      id_persona: personaId,
      nombre_beneficiario: nombreBeneficiario.trim(),
      id_parentesco: parseInt(idParentesco),
      porcentaje_participacion: porcentaje,
    };

    if (editingBeneficiario) {
      updateMutation.mutate(beneficiarioData);
    } else {
      createMutation.mutate(beneficiarioData);
    }
  };

  const handleEdit = (beneficiario: Beneficiario) => {
    setEditingBeneficiario(beneficiario);
    setNombreBeneficiario(beneficiario.nombre_beneficiario);
    setIdParentesco(beneficiario.id_parentesco.toString());
    setPorcentajeParticipacion(beneficiario.porcentaje_participacion.toString());
    setIsDialogOpen(true);
  };

  const handleDelete = (id: number) => {
    if (confirm('¿Estás seguro de que quieres eliminar este beneficiario?')) {
      deleteMutation.mutate(id);
    }
  };

  const totalPorcentaje = beneficiarios.reduce((sum, b) => sum + parseFloat(b.porcentaje_participacion.toString()), 0);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Beneficiarios de {personaNombre}</h3>
          <p className="text-sm text-muted-foreground">
            Total asignado: {totalPorcentaje.toFixed(2)}%
            {totalPorcentaje > 100 && (
              <span className="text-destructive ml-2">¡Excede el 100%!</span>
            )}
          </p>
        </div>
        <Button 
          onClick={() => {
            resetForm();
            setEditingBeneficiario(null);
            setIsDialogOpen(true);
          }}
          className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300"
        >
          <Plus className="w-4 h-4 mr-2" />
          Agregar Beneficiario
        </Button>
      </div>

      {beneficiarios.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No hay beneficiarios registrados
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Nombre</TableHead>
                <TableHead className="font-semibold">Parentesco</TableHead>
                <TableHead className="font-semibold">Porcentaje</TableHead>
                <TableHead className="font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {beneficiarios.map((beneficiario) => (
                <TableRow key={beneficiario.id} className="hover:bg-muted/30 transition-colors">
                  <TableCell className="font-medium">
                    {beneficiario.nombre_beneficiario}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {beneficiario.parentesco?.nombre || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {beneficiario.porcentaje_participacion}%
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-2 justify-end">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleEdit(beneficiario)}
                        className="hover:bg-primary/10 hover:border-primary transition-colors"
                      >
                        <Edit className="w-4 h-4" />
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => handleDelete(beneficiario.id)}
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

      {/* Dialog para agregar/editar beneficiario */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingBeneficiario ? 'Editar Beneficiario' : 'Nuevo Beneficiario'}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <Label htmlFor="nombreBeneficiario">Nombre del Beneficiario *</Label>
              <Input
                id="nombreBeneficiario"
                type="text"
                value={nombreBeneficiario}
                onChange={(e) => setNombreBeneficiario(e.target.value)}
                placeholder="Ingresa el nombre completo"
                required
              />
            </div>

            <div>
              <Label htmlFor="idParentesco">Parentesco *</Label>
              <Select value={idParentesco} onValueChange={setIdParentesco} required>
                <SelectTrigger>
                  <SelectValue placeholder="Selecciona el parentesco" />
                </SelectTrigger>
                <SelectContent>
                  {parentescos.map((parentesco) => (
                    <SelectItem key={parentesco.id} value={parentesco.id.toString()}>
                      {parentesco.nombre}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="porcentajeParticipacion">Porcentaje de Participación * (%)</Label>
              <Input
                id="porcentajeParticipacion"
                type="number"
                min="0.01"
                max="100"
                step="0.01"
                value={porcentajeParticipacion}
                onChange={(e) => setPorcentajeParticipacion(e.target.value)}
                placeholder="Ej: 25.50"
                required
              />
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => {
                  setIsDialogOpen(false);
                  resetForm();
                  setEditingBeneficiario(null);
                }}
              >
                Cancelar
              </Button>
              <Button 
                type="submit"
                disabled={createMutation.isPending || updateMutation.isPending}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary"
              >
                {editingBeneficiario ? 'Actualizar' : 'Crear'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}