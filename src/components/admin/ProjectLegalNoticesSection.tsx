import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Plus, Trash2, GripVertical, Edit } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import {
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

const createLegalNoticeSchema = (existingNotices: LegalNotice[], editingId?: number) => z.object({
  contenido: z.string().min(1, "El contenido es requerido"),
  orden: z.string()
    .min(1, "El orden es requerido")
    .refine((val) => {
      const num = parseInt(val);
      return num >= 1 && num <= 5;
    }, "El orden debe estar entre 1 y 5")
    .refine((val) => {
      const num = parseInt(val);
      const isDuplicate = existingNotices.some(notice => 
        notice.orden === num && notice.id !== editingId
      );
      return !isDuplicate;
    }, "Ya existe un aviso legal con este orden"),
});

interface LegalNotice {
  id: number;
  contenido: string;
  orden: number;
  activo: boolean;
}

interface ProjectLegalNoticesSectionProps {
  projectId: number;
}

// Sortable Card Component
const SortableCard = ({ notice, onEdit, onDelete }: { 
  notice: LegalNotice; 
  onEdit: (notice: LegalNotice) => void; 
  onDelete: (id: number) => void; 
}) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
  } = useSortable({ id: notice.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <Card ref={setNodeRef} style={style} className="touch-none">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div {...attributes} {...listeners} className="cursor-grab active:cursor-grabbing">
              <GripVertical className="h-4 w-4 text-muted-foreground" />
            </div>
            <CardTitle className="text-sm">Orden {notice.orden}</CardTitle>
          </div>
          <div className="flex space-x-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onEdit(notice)}
            >
              <Edit className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDelete(notice.id)}
              className="text-red-600 hover:text-red-700"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">
          {notice.contenido}
        </p>
      </CardContent>
    </Card>
  );
};

export const ProjectLegalNoticesSection = ({ projectId }: ProjectLegalNoticesSectionProps) => {
  const [editingNotice, setEditingNotice] = useState<LegalNotice | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  // Query to fetch legal notices for the project
  const { data: legalNotices = [], isLoading } = useQuery({
    queryKey: ["legal-notices", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("avisos_legales")
        .select("*")
        .eq("id_proyecto", projectId)
        .eq("activo", true)
        .order("orden");
      
      if (error) throw error;
      return data;
    },
  });

  // Create dynamic schema with validation
  const legalNoticeSchema = createLegalNoticeSchema(legalNotices, editingNotice?.id);

  const form = useForm<z.infer<typeof legalNoticeSchema>>({
    resolver: zodResolver(legalNoticeSchema),
    defaultValues: {
      contenido: "",
      orden: "",
    },
  });

  // Update form when editing notice changes
  useEffect(() => {
    if (editingNotice) {
      form.reset({
        contenido: editingNotice.contenido,
        orden: editingNotice.orden.toString(),
      });
    }
  }, [editingNotice, form]);

  // Mutation to create a new legal notice
  const createMutation = useMutation({
    mutationFn: async (values: z.infer<typeof legalNoticeSchema>) => {
      if (legalNotices.length >= 5) {
        throw new Error("No se pueden agregar más de 5 avisos legales por proyecto");
      }
      
      const { data, error } = await supabase
        .from("avisos_legales")
        .insert({
          id_proyecto: projectId,
          contenido: values.contenido,
          orden: parseInt(values.orden),
        })
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-notices", projectId] });
      toast({
        title: "Aviso legal creado",
        description: "El aviso legal se ha creado exitosamente.",
      });
      form.reset({
        contenido: "",
        orden: "",
      });
      // Don't close dialog after creation
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Hubo un error al crear el aviso legal.",
        variant: "destructive",
      });
    },
  });

  // Mutation to update a legal notice
  const updateMutation = useMutation({
    mutationFn: async (values: z.infer<typeof legalNoticeSchema> & { id: number }) => {
      const { data, error } = await supabase
        .from("avisos_legales")
        .update({
          contenido: values.contenido,
          orden: parseInt(values.orden),
        })
        .eq("id", values.id)
        .select()
        .single();
      
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-notices", projectId] });
      toast({
        title: "Aviso legal actualizado",
        description: "El aviso legal se ha actualizado exitosamente.",
      });
      form.reset({
        contenido: "",
        orden: "",
      });
      setIsDialogOpen(false);
      setEditingNotice(null);
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Hubo un error al actualizar el aviso legal.",
        variant: "destructive",
      });
    },
  });

  // Mutation to delete a legal notice
  const deleteMutation = useMutation({
    mutationFn: async (noticeId: number) => {
      const { error } = await supabase
        .from("avisos_legales")
        .update({ activo: false })
        .eq("id", noticeId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-notices", projectId] });
      toast({
        title: "Aviso legal eliminado",
        description: "El aviso legal se ha eliminado exitosamente.",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Hubo un error al eliminar el aviso legal.",
        variant: "destructive",
      });
    },
  });

  // Mutation to update order via drag
  const updateOrderMutation = useMutation({
    mutationFn: async (updates: { id: number; orden: number }[]) => {
      const promises = updates.map(({ id, orden }) =>
        supabase
          .from("avisos_legales")
          .update({ orden })
          .eq("id", id)
      );
      
      const results = await Promise.all(promises);
      const errors = results.filter(result => result.error);
      
      if (errors.length > 0) {
        throw new Error("Error updating orders");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal-notices", projectId] });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Hubo un error al reordenar los avisos legales.",
        variant: "destructive",
      });
    },
  });

  const onSubmit = async (values: z.infer<typeof legalNoticeSchema>) => {
    if (editingNotice) {
      updateMutation.mutate({ ...values, id: editingNotice.id });
    } else {
      createMutation.mutate(values);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;

    if (active.id !== over?.id) {
      const oldIndex = legalNotices.findIndex((notice) => notice.id === active.id);
      const newIndex = legalNotices.findIndex((notice) => notice.id === over?.id);

      const newOrder = arrayMove(legalNotices, oldIndex, newIndex);
      
      // Update orders based on new positions
      const updates = newOrder.map((notice, index) => ({
        id: notice.id,
        orden: index + 1,
      }));

      updateOrderMutation.mutate(updates);
    }
  };

  const handleEdit = (notice: LegalNotice) => {
    setEditingNotice(notice);
    setIsDialogOpen(true);
  };

  const handleDelete = (noticeId: number) => {
    if (confirm("¿Está seguro de que desea eliminar este aviso legal?")) {
      deleteMutation.mutate(noticeId);
    }
  };

  const handleDialogClose = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open) {
      setEditingNotice(null);
      form.reset({
        contenido: "",
        orden: "",
      });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-4">Cargando avisos legales...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Avisos Legales del Proyecto</h3>
        <Dialog open={isDialogOpen} onOpenChange={handleDialogClose}>
          <DialogTrigger asChild>
            <Button 
              onClick={() => setIsDialogOpen(true)}
              disabled={legalNotices.length >= 5}
            >
              <Plus className="h-4 w-4 mr-2" />
              Agregar Aviso Legal
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingNotice ? "Editar Aviso Legal" : "Agregar Aviso Legal"}
              </DialogTitle>
            </DialogHeader>
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
                <FormField
                  control={form.control}
                  name="contenido"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Contenido</FormLabel>
                      <FormControl>
                        <Textarea 
                          placeholder="Ingrese el contenido del aviso legal" 
                          rows={5}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="orden"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Orden</FormLabel>
                      <FormControl>
                        <Input 
                          type="number" 
                          placeholder="Orden de aparición"
                          min={1}
                          max={5}
                          {...field} 
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="flex justify-end space-x-2">
                  <Button type="button" variant="outline" onClick={() => handleDialogClose(false)}>
                    Cancelar
                  </Button>
                  <Button 
                    type="submit" 
                    disabled={!editingNotice && legalNotices.length >= 5}
                  >
                    {editingNotice ? "Actualizar" : "Crear"}
                  </Button>
                </div>
              </form>
            </Form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="space-y-2">
        {legalNotices.length === 0 ? (
          <Card>
            <CardContent className="p-6 text-center text-muted-foreground">
              No hay avisos legales configurados para este proyecto.
            </CardContent>
          </Card>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={legalNotices.map(n => n.id)} strategy={verticalListSortingStrategy}>
              {legalNotices.map((notice) => (
                <SortableCard
                  key={notice.id}
                  notice={notice}
                  onEdit={handleEdit}
                  onDelete={handleDelete}
                />
              ))}
            </SortableContext>
          </DndContext>
        )}
      </div>
    </div>
  );
};