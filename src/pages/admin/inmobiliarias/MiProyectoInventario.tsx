import { useParams, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Building2, Loader2, ArrowLeft, BedDouble, Bath, ShowerHead, Maximize2, DollarSign, FileText, ChevronLeft, ChevronRight } from "lucide-react";
import { useState, useMemo } from "react";
import { toast } from "sonner";

const PAGE_SIZE = 30;

const MiProyectoInventario = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const projectId = parseInt(id || "0", 10);
  const [page, setPage] = useState(0);
  const [selectedProperty, setSelectedProperty] = useState<any>(null);

  const { data: projectData, isLoading } = useQuery({
    queryKey: ["mi-proyecto-inventario", projectId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("proyectos")
        .select(`
          id, nombre,
          edificios!fk_edificios_proyecto (
            id, nombre,
            edificios_modelos!fk_edificios_modelos_edificio (
              id,
              modelos!fk_edificios_modelos_modelo (
                id, nombre, numero_recamaras, numero_completo_banos, numero_medio_bano
              ),
              propiedades!fk_propiedades_edificio_modelo (
                id, numero, piso, precio_lista, m2_interiores, m2_exteriores,
                id_estatus_disponibilidad,
                estatus_disponibilidad:id_estatus_disponibilidad (nombre)
              )
            )
          )
        `)
        .eq("id", projectId)
        .eq("activo", true)
        .single();

      if (error) throw error;
      return data;
    },
    enabled: projectId > 0,
  });

  // Flatten available properties
  const availableProperties = useMemo(() => {
    if (!projectData) return [];
    const props: any[] = [];
    projectData.edificios?.forEach((e: any) => {
      e.edificios_modelos?.forEach((em: any) => {
        em.propiedades?.forEach((p: any) => {
          if (p.id_estatus_disponibilidad === 2) {
            props.push({
              ...p,
              edificio_nombre: e.nombre,
              modelo_nombre: em.modelos?.nombre,
              recamaras: em.modelos?.numero_recamaras,
              banos: em.modelos?.numero_completo_banos,
              medio_bano: em.modelos?.numero_medio_bano,
              m2_total: (p.m2_interiores || 0) + (p.m2_exteriores || 0),
            });
          }
        });
      });
    });
    // Shuffle with a seeded random (using project id for consistency within session)
    for (let i = props.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [props[i], props[j]] = [props[j], props[i]];
    }
    return props;
  }, [projectData]);

  const totalPages = Math.ceil(availableProperties.length / PAGE_SIZE);
  const pageProperties = availableProperties.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const formatPrice = (price: number) =>
    new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", minimumFractionDigits: 2 }).format(price);

  const handleGenerateOffer = (property: any) => {
    toast.info("Función de generar oferta próximamente disponible");
    // TODO: Integrate with offer generation workflow
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-10">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/admin/inmobiliarias/proyectos/${projectId}`)} className="gap-1 text-primary">
          <ArrowLeft className="h-4 w-4" /> Volver
        </Button>
      </div>

      <div className="px-1 space-y-1">
        <h1 className="text-xl font-bold text-foreground">Inventario Disponible</h1>
        <p className="text-sm text-muted-foreground">
          {projectData?.nombre} — {availableProperties.length} unidades disponibles
        </p>
      </div>

      {/* Properties Grid */}
      {availableProperties.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Building2 className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p>No hay propiedades disponibles en este proyecto</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 px-1">
            {pageProperties.map((prop: any) => (
              <Card
                key={prop.id}
                className="overflow-hidden cursor-pointer hover:shadow-md transition-shadow border"
                onClick={() => setSelectedProperty(prop)}
              >
                <CardContent className="p-4 space-y-3">
                  {/* Header */}
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="font-semibold text-foreground">{prop.numero || `Unidad ${prop.id}`}</h4>
                      <p className="text-xs text-muted-foreground">{prop.edificio_nombre} • {prop.modelo_nombre}</p>
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 text-[10px]">
                      Disponible
                    </Badge>
                  </div>

                  {/* Stats */}
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                    {prop.m2_total > 0 && (
                      <span className="flex items-center gap-1">
                        <Maximize2 className="h-3 w-3" /> {prop.m2_total.toFixed(1)} m²
                      </span>
                    )}
                    {prop.recamaras > 0 && (
                      <span className="flex items-center gap-1">
                        <BedDouble className="h-3 w-3" /> {prop.recamaras}
                      </span>
                    )}
                    {prop.banos > 0 && (
                      <span className="flex items-center gap-1">
                        <Bath className="h-3 w-3" /> {prop.banos}
                      </span>
                    )}
                    {prop.medio_bano > 0 && (
                      <span className="flex items-center gap-1">
                        <ShowerHead className="h-3 w-3" /> ½ {prop.medio_bano}
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  {prop.precio_lista > 0 && (
                    <div className="flex items-center gap-1 text-sm font-semibold text-foreground">
                      <DollarSign className="h-3.5 w-3.5" />
                      {formatPrice(prop.precio_lista)}
                    </div>
                  )}

                  {/* Piso */}
                  {prop.piso && (
                    <p className="text-xs text-muted-foreground">Piso {prop.piso}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 pt-4">
              <Button
                variant="outline"
                size="sm"
                disabled={page === 0}
                onClick={() => setPage(p => p - 1)}
              >
                <ChevronLeft className="h-4 w-4 mr-1" /> Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages - 1}
                onClick={() => setPage(p => p + 1)}
              >
                Siguiente <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          )}
        </>
      )}

      {/* Property Detail Dialog */}
      <Dialog open={!!selectedProperty} onOpenChange={(open) => !open && setSelectedProperty(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedProperty?.numero || `Unidad ${selectedProperty?.id}`}</DialogTitle>
          </DialogHeader>
          {selectedProperty && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Edificio</p>
                  <p className="font-medium text-sm">{selectedProperty.edificio_nombre}</p>
                </div>
                <div className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">Modelo</p>
                  <p className="font-medium text-sm">{selectedProperty.modelo_nombre}</p>
                </div>
                {selectedProperty.piso && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Piso</p>
                    <p className="font-medium text-sm">{selectedProperty.piso}</p>
                  </div>
                )}
                {selectedProperty.m2_total > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Superficie</p>
                    <p className="font-medium text-sm">{selectedProperty.m2_total.toFixed(2)} m²</p>
                  </div>
                )}
                {selectedProperty.m2_interiores > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Interior</p>
                    <p className="font-medium text-sm">{selectedProperty.m2_interiores.toFixed(2)} m²</p>
                  </div>
                )}
                {selectedProperty.m2_exteriores > 0 && (
                  <div className="bg-muted/50 rounded-lg p-3 text-center">
                    <p className="text-xs text-muted-foreground">Exterior</p>
                    <p className="font-medium text-sm">{selectedProperty.m2_exteriores.toFixed(2)} m²</p>
                  </div>
                )}
              </div>

              <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
                {selectedProperty.recamaras > 0 && (
                  <span className="flex items-center gap-1"><BedDouble className="h-4 w-4" /> {selectedProperty.recamaras} recámara{selectedProperty.recamaras > 1 ? "s" : ""}</span>
                )}
                {selectedProperty.banos > 0 && (
                  <span className="flex items-center gap-1"><Bath className="h-4 w-4" /> {selectedProperty.banos} baño{selectedProperty.banos > 1 ? "s" : ""}</span>
                )}
                {selectedProperty.medio_bano > 0 && (
                  <span className="flex items-center gap-1"><ShowerHead className="h-4 w-4" /> {selectedProperty.medio_bano} medio baño</span>
                )}
              </div>

              {selectedProperty.orientacion?.nombre && (
                <p className="text-sm text-muted-foreground">Orientación: {selectedProperty.orientacion.nombre}</p>
              )}
              {selectedProperty.vistas?.nombre && (
                <p className="text-sm text-muted-foreground">Vista: {selectedProperty.vistas.nombre}</p>
              )}

              {selectedProperty.precio_lista > 0 && (
                <div className="bg-primary/5 rounded-lg p-4 text-center">
                  <p className="text-xs text-muted-foreground">Precio de Lista</p>
                  <p className="text-xl font-bold text-foreground">{formatPrice(selectedProperty.precio_lista)}</p>
                </div>
              )}

              <Button className="w-full gap-2" size="lg" onClick={() => handleGenerateOffer(selectedProperty)}>
                <FileText className="h-5 w-5" />
                Generar Oferta
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MiProyectoInventario;
