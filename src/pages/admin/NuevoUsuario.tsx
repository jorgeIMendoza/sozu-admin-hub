import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { PersonForm } from "@/components/admin/PersonForm";

export default function NuevoUsuario() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const createPersonaMutation = useMutation({
    mutationFn: async (data: { nombre: string; curp: string; url_documento_identificacion?: string }) => {
      const { data: result, error } = await supabase
        .from('personas_fake' as any)
        .insert([data])
        .select()
        .single();

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      toast({
        title: "Éxito",
        description: "Usuario creado correctamente.",
      });
      queryClient.invalidateQueries({ queryKey: ['personas_fake'] });
      navigate('/admin/usuarios');
    },
    onError: (error) => {
      console.error('Error creating persona:', error);
      toast({
        title: "Error",
        description: "Error al crear el usuario.",
        variant: "destructive",
      });
    },
  });

  const handleSubmit = (data: { nombre: string; curp: string; url_documento_identificacion?: string }) => {
    createPersonaMutation.mutate(data);
  };

  const handleCancel = () => {
    navigate('/admin/usuarios');
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-4xl">
      <div className="mb-6">
        <Button
          variant="ghost"
          onClick={() => navigate('/admin/usuarios')}
          className="mb-4 hover:bg-muted/50 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-2" />
          Volver a Usuarios
        </Button>
        
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">
            Agregar Usuario
          </h1>
          <p className="text-muted-foreground mt-2">
            Completa la información del nuevo usuario
          </p>
        </div>
      </div>

      <Card className="border-border shadow-lg">
        <CardHeader className="border-b border-border bg-muted/30">
          <CardTitle className="text-xl font-semibold">
            Información del Usuario
          </CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <PersonForm
            onSubmit={handleSubmit}
            isLoading={createPersonaMutation.isPending}
            onCancel={handleCancel}
          />
        </CardContent>
      </Card>
    </div>
  );
}