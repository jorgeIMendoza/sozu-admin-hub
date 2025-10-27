import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Users, FileCheck, Eye, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

interface Documento {
  id: number;
  tipo: string;
  url: string;
  fecha: string;
}

interface Comprador {
  id_persona: number;
  nombre_legal: string;
  rfc: string | null;
  curp: string | null;
  tipo_persona: 'PF' | 'PM';
  porcentaje_copropiedad: number;
  email: string | null;
  telefono: string | null;
  documentos: Documento[];
}

interface CompradoresConDocumentosDialogProps {
  cuentaCobranzaId: number;
  fetchCompradores: (cuentaId: number) => Promise<Comprador[]>;
  triggerButtonText?: string;
}

export function CompradoresConDocumentosDialog({ 
  cuentaCobranzaId, 
  fetchCompradores,
  triggerButtonText = "Ver compradores"
}: CompradoresConDocumentosDialogProps) {
  const [open, setOpen] = useState(false);

  const { data: compradores = [], isLoading } = useQuery({
    queryKey: ['compradores-documentos', cuentaCobranzaId],
    queryFn: () => fetchCompradores(cuentaCobranzaId),
    enabled: open,
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Users className="h-4 w-4 mr-1" />
          {triggerButtonText}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Compradores - CC-{cuentaCobranzaId.toString().padStart(6, '0')}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : compradores.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No hay compradores registrados
          </div>
        ) : (
          <div className="space-y-6">
            {compradores.map((comprador, idx) => (
              <Card key={comprador.id_persona}>
                <CardHeader>
                  <CardTitle className="text-base flex items-center justify-between">
                    <span>{comprador.nombre_legal}</span>
                    <Badge variant={comprador.tipo_persona === 'PM' ? 'secondary' : 'default'}>
                      {comprador.tipo_persona === 'PM' ? 'Persona Moral (PM)' : 'Persona Física (PF)'}
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                    <div>
                      <span className="text-muted-foreground">RFC:</span>
                      <p className="font-medium">{comprador.rfc || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">CURP:</span>
                      <p className="font-medium">{comprador.curp || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">% Copropiedad:</span>
                      <p className="font-medium">{comprador.porcentaje_copropiedad}%</p>
                    </div>
                    {comprador.email && (
                      <div>
                        <span className="text-muted-foreground">Email:</span>
                        <p className="font-medium text-xs">{comprador.email}</p>
                      </div>
                    )}
                    {comprador.telefono && (
                      <div>
                        <span className="text-muted-foreground">Teléfono:</span>
                        <p className="font-medium">{comprador.telefono}</p>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div>
                    <h4 className="font-semibold mb-2 flex items-center gap-2">
                      <FileCheck className="h-4 w-4" />
                      Documentos Verificados
                    </h4>
                    {comprador.documentos?.length > 0 ? (
                      <div className="border rounded-lg">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Tipo</TableHead>
                              <TableHead>Fecha</TableHead>
                              <TableHead className="text-right">Acción</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {comprador.documentos.map((doc) => (
                              <TableRow key={doc.id}>
                                <TableCell>{doc.tipo}</TableCell>
                                <TableCell>
                                  {format(new Date(doc.fecha), 'dd/MM/yyyy', { locale: es })}
                                </TableCell>
                                <TableCell className="text-right">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => window.open(doc.url, '_blank')}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        No hay documentos verificados
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
