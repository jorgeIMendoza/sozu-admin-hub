import React from "react";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { FileText } from "lucide-react";

const formSchema = z.object({
  id_persona_lead: z.string().min(1, "Debe seleccionar un lead"),
  id_esquema_pago_seleccionado: z.string().optional(),
  id_producto: z.string().optional(),
});

type FormData = z.infer<typeof formSchema>;

interface NewOfferDialogProps {
  propertyId: number;
  propertyNumber: string;
}

export function NewOfferDialog({ propertyId, propertyNumber }: NewOfferDialogProps) {
  const [open, setOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const form = useForm<FormData>({
    resolver: zodResolver(formSchema),
  });

  // Fetch property details with project information
  const { data: propertyDetails } = useQuery({
    queryKey: ["property-details", propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("propiedades")
        .select(`
          id,
          numero_propiedad,
          entidades_relacionadas!id_entidad_relacionada_dueno(
            proyectos!id_proyecto(
              nombre
            )
          )
        `)
        .eq("id", propertyId)
        .single();
      
      if (error) throw error;
      return data;
    },
  });

  // Fetch potential leads (personas)
  const { data: leads } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("personas")
        .select("id, nombre_legal, email")
        .eq("activo", true)
        .order("nombre_legal");
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch payment schemes
  const { data: paymentSchemes } = useQuery({
    queryKey: ["payment-schemes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("esquemas_pago")
        .select("id, nombre")
        .eq("activo", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("productos_servicios")
        .select("id, nombre")
        .eq("activo", true)
        .eq("es_producto", true)
        .order("nombre");
      
      if (error) throw error;
      return data || [];
    },
  });

  const createOfferMutation = useMutation({
    mutationFn: async (data: FormData) => {
      const { error } = await supabase
        .from("ofertas")
        .insert({
          id_propiedad: propertyId,
          id_persona_lead: parseInt(data.id_persona_lead),
          id_esquema_pago_seleccionado: data.id_esquema_pago_seleccionado 
            ? parseInt(data.id_esquema_pago_seleccionado) 
            : null,
          id_producto: data.id_producto ? parseInt(data.id_producto) : null,
          fecha_generacion: new Date().toISOString(),
        });

      if (error) throw error;
    },
    onSuccess: () => {
      toast({
        title: "Oferta creada",
        description: `La oferta para la propiedad ${propertyNumber} ha sido generada exitosamente.`,
      });
      queryClient.invalidateQueries({ queryKey: ["properties"] });
      setOpen(false);
      form.reset();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: "No se pudo generar la oferta. Inténtalo de nuevo.",
        variant: "destructive",
      });
      console.error("Error creating offer:", error);
    },
  });

  const onSubmit = (data: FormData) => {
    createOfferMutation.mutate(data);
  };

  const projectName = propertyDetails?.entidades_relacionadas?.proyectos?.nombre;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700"
          title="Generar oferta"
        >
          <FileText className="h-4 w-4" />
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Generar Oferta</DialogTitle>
          <p className="text-sm text-muted-foreground">
            Crear una nueva oferta para la propiedad {propertyNumber}
            {projectName && ` del proyecto ${projectName}`}
          </p>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <FormField
              control={form.control}
              name="id_persona_lead"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Lead/Cliente *</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar lead" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {leads?.map((lead) => (
                        <SelectItem key={lead.id} value={lead.id.toString()}>
                          {lead.nombre_legal} - {lead.email}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_esquema_pago_seleccionado"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Esquema de Pago (Opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar esquema de pago" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {paymentSchemes?.map((scheme) => (
                        <SelectItem key={scheme.id} value={scheme.id.toString()}>
                          {scheme.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="id_producto"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Producto/Servicio (Opcional)</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar producto" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {products?.map((product) => (
                        <SelectItem key={product.id} value={product.id.toString()}>
                          {product.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex justify-end space-x-2 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={createOfferMutation.isPending}
              >
                {createOfferMutation.isPending ? "Generando..." : "Generar Oferta"}
              </Button>
            </div>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}