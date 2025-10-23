import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Edit, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";

type Beneficiario = {
  id: number;
  id_persona: number;
  id_parentesco: number;
  porcentaje_participacion: number;
  nombre_beneficiario: string;
  email?: string;
  telefono?: string;
  activo: boolean;
  parentesco?: {
    nombre: string;
  };
};

type TempBeneficiario = {
  id: number | string; // puede ser temporal con string
  id_persona: number;
  id_parentesco: number;
  porcentaje_participacion: number;
  nombre_beneficiario: string;
  email?: string;
  telefono?: string;
  activo: boolean;
  isNew?: boolean;
  isModified?: boolean;
};

type Parentesco = {
  id: number;
  nombre: string;
};

interface BeneficiariosFormProps {
  personaId: number;
  personaNombre: string;
  isReadOnly?: boolean;
}

export function BeneficiariosForm({ personaId, personaNombre, isReadOnly = false }: BeneficiariosFormProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBeneficiario, setEditingBeneficiario] = useState<TempBeneficiario | null>(null);
  const [nombreBeneficiario, setNombreBeneficiario] = useState("");
  const [idParentesco, setIdParentesco] = useState("");
  const [porcentajeParticipacion, setPorcentajeParticipacion] = useState("");
  const [email, setEmail] = useState("");
  const [telefono, setTelefono] = useState("");
  const [tempBeneficiarios, setTempBeneficiarios] = useState<TempBeneficiario[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [deletingBeneficiario, setDeletingBeneficiario] = useState<TempBeneficiario | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch beneficiarios
  const { data: beneficiarios = [], isLoading } = useQuery({
    queryKey: ['beneficiarios', personaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('beneficiarios')
        .select('*')
        .eq('id_persona', personaId)
        .eq('activo', true)
        .order('nombre_beneficiario');
      
      if (error) throw error;
      return data || [];
    },
  });

  // Initialize temp beneficiarios when data loads
  useEffect(() => {
    if (beneficiarios.length > 0 && tempBeneficiarios.length === 0) {
      setTempBeneficiarios(
        beneficiarios.map(b => ({
          ...b,
          isNew: false,
          isModified: false
        }))
      );
    }
  }, [beneficiarios]);

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

  // Save all changes mutation
  const saveAllMutation = useMutation({
    mutationFn: async () => {
      // First validate that percentages sum to 100
      const total = tempBeneficiarios.reduce((sum, b) => sum + b.porcentaje_participacion, 0);
      if (Math.abs(total - 100) > 0.01) {
        throw new Error(`Los porcentajes deben sumar exactamente 100%. Total actual: ${total.toFixed(2)}%`);
      }

      // Separate operations
      const toCreate = tempBeneficiarios.filter(b => b.isNew);
      const toUpdate = tempBeneficiarios.filter(b => !b.isNew && b.isModified && typeof b.id === 'number');
      const toDelete = beneficiarios.filter(b => !tempBeneficiarios.find(tb => tb.id === b.id));

      // Execute all operations
      if (toCreate.length > 0) {
        const { error: createError } = await supabase
          .from('beneficiarios')
          .insert(toCreate.map(b => ({
            id_persona: b.id_persona,
            nombre_beneficiario: b.nombre_beneficiario,
            id_parentesco: b.id_parentesco,
            porcentaje_participacion: b.porcentaje_participacion,
            email: b.email || null,
            telefono: b.telefono || null,
          })));
        if (createError) throw createError;
      }

      if (toUpdate.length > 0) {
        for (const beneficiario of toUpdate) {
          const { error: updateError } = await supabase
            .from('beneficiarios')
            .update({
              nombre_beneficiario: beneficiario.nombre_beneficiario,
              id_parentesco: beneficiario.id_parentesco,
              porcentaje_participacion: beneficiario.porcentaje_participacion,
              email: beneficiario.email || null,
              telefono: beneficiario.telefono || null,
            })
            .eq('id', beneficiario.id as number);
          if (updateError) throw updateError;
        }
      }

      if (toDelete.length > 0) {
        const { error: deleteError } = await supabase
          .from('beneficiarios')
          .delete()
          .in('id', toDelete.map(b => b.id));
        if (deleteError) throw deleteError;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['beneficiarios', personaId] });
      setHasChanges(false);
      toast({
        title: "Éxito",
        description: "Cambios guardados correctamente.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setNombreBeneficiario("");
    setIdParentesco("");
    setPorcentajeParticipacion("");
    setEmail("");
    setTelefono("");
  };

  const recalculatePercentages = (beneficiarios: TempBeneficiario[]) => {
    if (beneficiarios.length === 0) return beneficiarios;
    const equalPercentage = 100 / beneficiarios.length;
    return beneficiarios.map(b => ({
      ...b,
      porcentaje_participacion: parseFloat(equalPercentage.toFixed(2)),
      isModified: !b.isNew
    }));
  };

  const handleSubmit = () => {
    if (!nombreBeneficiario.trim() || !idParentesco) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos.",
        variant: "destructive",
      });
      return;
    }

    // Validar email si se proporciona
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      toast({
        title: "Error",
        description: "Por favor ingresa un correo electrónico válido.",
        variant: "destructive",
      });
      return;
    }

    const wasEditing = editingBeneficiario !== null;

    if (editingBeneficiario) {
      // Update existing beneficiario
      const updated = tempBeneficiarios.map(b =>
        b.id === editingBeneficiario.id
          ? {
              ...b,
              nombre_beneficiario: nombreBeneficiario.trim(),
              id_parentesco: parseInt(idParentesco),
              porcentaje_participacion: parseFloat(porcentajeParticipacion) || 0,
              email: email.trim() || undefined,
              telefono: telefono.trim() || undefined,
              isModified: true
            }
          : b
      );
      setTempBeneficiarios(updated);
    } else {
      // Add new beneficiario
      const newBeneficiario: TempBeneficiario = {
        id: `temp_${Date.now()}`,
        id_persona: personaId,
        nombre_beneficiario: nombreBeneficiario.trim(),
        id_parentesco: parseInt(idParentesco),
        porcentaje_participacion: 0,
        email: email.trim() || undefined,
        telefono: telefono.trim() || undefined,
        activo: true,
        isNew: true
      };
      
      // Recalculate percentages for all beneficiarios
      const updatedList = recalculatePercentages([...tempBeneficiarios, newBeneficiario]);
      setTempBeneficiarios(updatedList);
    }

    setHasChanges(true);
    resetForm();
    setEditingBeneficiario(null);
    setIsDialogOpen(false);
  };

  const handleEdit = (beneficiario: TempBeneficiario) => {
    setEditingBeneficiario(beneficiario);
    setNombreBeneficiario(beneficiario.nombre_beneficiario);
    setIdParentesco(beneficiario.id_parentesco.toString());
    setPorcentajeParticipacion(beneficiario.porcentaje_participacion.toString());
    setEmail(beneficiario.email || "");
    setTelefono(beneficiario.telefono || "");
    setIsDialogOpen(true);
  };

  const handleDelete = (beneficiario: TempBeneficiario) => {
    setDeletingBeneficiario(beneficiario);
  };

  const confirmDelete = () => {
    if (!deletingBeneficiario) return;
    
    const filtered = tempBeneficiarios.filter(b => b.id !== deletingBeneficiario.id);
    const recalculated = recalculatePercentages(filtered);
    setTempBeneficiarios(recalculated);
    setHasChanges(true);
    setDeletingBeneficiario(null);
  };

  const handlePercentageChange = (id: number | string, newPercentage: number) => {
    const updated = tempBeneficiarios.map(b =>
      b.id === id
        ? { ...b, porcentaje_participacion: newPercentage, isModified: !b.isNew }
        : b
    );
    setTempBeneficiarios(updated);
    setHasChanges(true);
  };

  const totalPorcentaje = tempBeneficiarios.reduce((sum, b) => sum + b.porcentaje_participacion, 0);
  const getParentescoName = (id: number) => parentescos.find(p => p.id === id)?.nombre || '-';

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div>
          <h3 className="text-lg font-medium">Beneficiarios de {personaNombre}</h3>
          <p className="text-sm text-muted-foreground">
            Total asignado: {totalPorcentaje.toFixed(2)}%
            {Math.abs(totalPorcentaje - 100) > 0.01 && (
              <span className={totalPorcentaje > 100 ? "text-destructive ml-2" : "text-warning ml-2"}>
                {totalPorcentaje > 100 ? "¡Excede el 100%!" : "¡Debe sumar 100%!"}
              </span>
            )}
            {hasChanges && (
              <span className="text-primary ml-2">• Cambios pendientes</span>
            )}
          </p>
        </div>
        {!isReadOnly && (
          <div className="flex gap-2">
            <Button 
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                resetForm();
                setEditingBeneficiario(null);
                setIsDialogOpen(true);
              }}
              className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300"
            >
              <Plus className="w-4 h-4 mr-2" />
              Agregar Beneficiario
            </Button>
            {hasChanges && (
              <Button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  saveAllMutation.mutate();
                }}
                disabled={saveAllMutation.isPending}
                className="bg-gradient-to-r from-accent to-accent-glow hover:from-accent-glow hover:to-accent"
              >
                <Save className="w-4 h-4 mr-2" />
                Guardar Cambios
              </Button>
            )}
          </div>
        )}
      </div>

      {tempBeneficiarios.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No hay beneficiarios registrados
        </div>
      ) : (
        <div className="border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="font-semibold">Nombre</TableHead>
                <TableHead className="font-semibold">Email</TableHead>
                <TableHead className="font-semibold">Teléfono</TableHead>
                <TableHead className="font-semibold">Parentesco</TableHead>
                <TableHead className="font-semibold">Porcentaje (%)</TableHead>
                <TableHead className="font-semibold text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {tempBeneficiarios.map((beneficiario) => (
                <TableRow 
                  key={beneficiario.id} 
                  className={`hover:bg-muted/30 transition-colors ${
                    beneficiario.isNew ? 'bg-accent/10' : 
                    beneficiario.isModified ? 'bg-warning/10' : ''
                  }`}
                >
                  <TableCell className="font-medium">
                    {beneficiario.nombre_beneficiario}
                    {beneficiario.isNew && (
                      <span className="ml-2 text-xs bg-accent text-accent-foreground px-1 rounded">NUEVO</span>
                    )}
                    {beneficiario.isModified && (
                      <span className="ml-2 text-xs bg-warning text-warning-foreground px-1 rounded">MODIFICADO</span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {beneficiario.email || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {beneficiario.telefono || '-'}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {getParentescoName(beneficiario.id_parentesco)}
                  </TableCell>
                  <TableCell>
                    <Input
                      type="number"
                      min="0"
                      max="100"
                      step="0.01"
                      value={beneficiario.porcentaje_participacion}
                      onChange={(e) => handlePercentageChange(beneficiario.id, parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-sm"
                      disabled={isReadOnly}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    {!isReadOnly && (
                      <div className="flex gap-2 justify-end">
                         <Button 
                           type="button"
                           variant="outline" 
                           size="sm"
                           onClick={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             handleEdit(beneficiario);
                           }}
                           className="hover:bg-primary/10 hover:border-primary transition-colors"
                         >
                           <Edit className="h-4 w-4" />
                         </Button>
                         <Button 
                           type="button"
                           variant="outline" 
                           size="sm"
                           onClick={(e) => {
                             e.preventDefault();
                             e.stopPropagation();
                             handleDelete(beneficiario);
                           }}
                           className="hover:bg-destructive/10 hover:border-destructive hover:text-destructive transition-colors"
                         >
                           <Trash2 className="w-4 h-4" />
                         </Button>
                      </div>
                    )}
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
          
          <div className="space-y-4">
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
              <Label htmlFor="email">Correo Electrónico</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="correo@ejemplo.com"
              />
            </div>

            <div>
              <Label htmlFor="telefono">Teléfono</Label>
              <Input
                id="telefono"
                type="tel"
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="Número de teléfono"
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
                placeholder="Se calculará automáticamente"
                disabled={!editingBeneficiario}
                required={editingBeneficiario !== null}
              />
              {!editingBeneficiario && (
                <p className="text-sm text-muted-foreground mt-1">
                  El porcentaje se calculará automáticamente al agregar (100/{tempBeneficiarios.length + 1} = {(100 / (tempBeneficiarios.length + 1)).toFixed(2)}% para cada uno)
                </p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button 
                type="button" 
                variant="outline" 
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDialogOpen(false);
                  resetForm();
                  setEditingBeneficiario(null);
                }}
              >
                Cancelar
              </Button>
              <Button 
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  handleSubmit();
                }}
                className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary"
              >
                {editingBeneficiario ? 'Actualizar' : 'Agregar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* AlertDialog para confirmar eliminación */}
      <AlertDialog open={!!deletingBeneficiario} onOpenChange={() => setDeletingBeneficiario(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar beneficiario?</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas eliminar a <strong>{deletingBeneficiario?.nombre_beneficiario}</strong> como beneficiario? 
              Esta acción no se puede deshacer y los porcentajes se redistribuirán automáticamente entre los beneficiarios restantes.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}