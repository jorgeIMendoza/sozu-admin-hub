import { useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Trash2, Upload, FileText, ExternalLink, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ProjectBrochuresSectionProps {
  projectId: number;
}

export const ProjectBrochuresSection = ({ projectId }: ProjectBrochuresSectionProps) => {
  const [isUploading, setIsUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: brochures, isLoading } = useQuery({
    queryKey: ["project-brochures", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("documentos")
        .select("*")
        .eq("id_proyecto", projectId)
        .eq("id_tipo_documento", 30)
        .eq("activo", true)
        .order("fecha_creacion", { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate PDF file type
    if (file.type !== "application/pdf") {
      toast({
        title: "Error",
        description: "Solo se permiten archivos PDF",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    try {
      // Upload file to storage
      const fileExt = "pdf";
      const fileName = `${projectId}_${Date.now()}.${fileExt}`;
      const filePath = `brochures/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("documentos")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from("documentos")
        .getPublicUrl(filePath);

      // Save document record
      const { error: insertError } = await supabase
        .from("documentos")
        .insert({
          id_proyecto: projectId,
          url: publicUrl,
          id_tipo_documento: 30,
          id_estatus_verificacion: 2, // 2 = Validado
        });

      if (insertError) throw insertError;

      toast({
        title: "Brochure cargado",
        description: "El archivo PDF se ha cargado exitosamente.",
      });

      queryClient.invalidateQueries({ queryKey: ["project-brochures", projectId] });
    } catch (error) {
      console.error("Error uploading brochure:", error);
      toast({
        title: "Error",
        description: "Hubo un error al cargar el brochure.",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      event.target.value = "";
    }
  };

  const handleDelete = async (documentId: number) => {
    try {
      const { error } = await supabase
        .from("documentos")
        .update({ activo: false })
        .eq("id", documentId);

      if (error) throw error;

      toast({
        title: "Brochure eliminado",
        description: "El brochure se ha eliminado exitosamente.",
      });

      queryClient.invalidateQueries({ queryKey: ["project-brochures", projectId] });
    } catch (error) {
      console.error("Error deleting brochure:", error);
      toast({
        title: "Error",
        description: "Hubo un error al eliminar el brochure.",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return <div className="flex justify-center py-4">Cargando brochures...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold">Brochures del Proyecto</h3>
        <div>
          <input
            type="file"
            id="brochure-upload"
            accept="application/pdf"
            onChange={handleFileUpload}
            className="hidden"
            disabled={isUploading}
          />
          <label htmlFor="brochure-upload">
            <Button
              type="button"
              variant="outline"
              disabled={isUploading}
              onClick={() => document.getElementById("brochure-upload")?.click()}
            >
              <Upload className="h-4 w-4 mr-2" />
              {isUploading ? "Cargando..." : "Cargar PDF"}
            </Button>
          </label>
        </div>
      </div>

      {brochures && brochures.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {brochures.map((brochure) => (
            <div key={brochure.id} className="border rounded-lg p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-8 w-8 text-primary" />
                <div>
                  <p className="text-sm font-medium">Brochure #{brochure.id}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(brochure.fecha_creacion).toLocaleDateString('es-MX')}
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setPreviewUrl(brochure.url)}
                >
                  <Eye className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => window.open(brochure.url, "_blank")}
                >
                  <ExternalLink className="h-4 w-4" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="text-red-600 hover:text-red-700"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>¿Estás seguro?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Esta acción eliminará el brochure. Esta acción no se puede deshacer.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(brochure.id)}>
                        Eliminar
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="text-center py-8 text-muted-foreground">
          No hay brochures cargados para este proyecto
        </div>
      )}

      <Dialog open={!!previewUrl} onOpenChange={() => setPreviewUrl(null)}>
        <DialogContent className="max-w-4xl h-[80vh]">
          <DialogHeader>
            <DialogTitle>Vista previa del brochure</DialogTitle>
          </DialogHeader>
          <div className="flex-1 w-full h-full">
            {previewUrl && (
              <iframe
                src={previewUrl}
                className="w-full h-full border-0"
                title="PDF Preview"
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};
