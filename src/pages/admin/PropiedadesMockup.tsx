import { useState } from "react";
import { Search, Edit, Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

// Mock data for now
const mockProperties = [
  {
    id: 1,
    dueño: "Juan Pérez García",
    numero_propiedad: "A-101",
    numero_piso: 1,
    m2_reales: 85.5,
    precio_lista: 2450000,
    clabe_stp: "646180157000000001",
    vista: "Mar",
    transaccion: "Venta",
    tipo_propiedad: "Departamento",
    disponibilidad: "Disponible",
    activo: true
  },
  {
    id: 2,
    dueño: "María López Martínez",
    numero_propiedad: "B-205",
    numero_piso: 2,
    m2_reales: 92.3,
    precio_lista: 2850000,
    clabe_stp: "646180157000000002",
    vista: "Ciudad",
    transaccion: "Venta",
    tipo_propiedad: "Departamento",
    disponibilidad: "Apartado",
    activo: true
  },
  {
    id: 3,
    dueño: "Carlos Rodríguez Silva",
    numero_propiedad: "C-301",
    numero_piso: 3,
    m2_reales: 78.9,
    precio_lista: 2200000,
    clabe_stp: "646180157000000003",
    vista: "Jardín",
    transaccion: "Venta",
    tipo_propiedad: "Departamento",
    disponibilidad: "Vendido",
    activo: false
  }
];

const Propiedades = () => {
  const [searchTerm, setSearchTerm] = useState("");
  const [activeTab, setActiveTab] = useState("activas");

  const filteredProperties = mockProperties.filter(property => {
    const matchesSearch = 
      property.numero_propiedad.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.dueño.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.vista.toLowerCase().includes(searchTerm.toLowerCase()) ||
      property.tipo_propiedad.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesTab = activeTab === "activas" ? property.activo : !property.activo;
    
    return matchesSearch && matchesTab;
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: 'MXN',
    }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Propiedades</h1>
          <p className="text-muted-foreground">
            Gestiona el inventario de propiedades del sistema
          </p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Lista de Propiedades</CardTitle>
          <div className="relative">
            <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Buscar por número de propiedad, propietario, vista o tipo..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8"
            />
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="activas">
                Propiedades Activas ({mockProperties.filter(p => p.activo).length})
              </TabsTrigger>
              <TabsTrigger value="eliminadas">
                Propiedades Eliminadas ({mockProperties.filter(p => !p.activo).length})
              </TabsTrigger>
            </TabsList>
            
            <TabsContent value="activas" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Propietario</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Piso</TableHead>
                      <TableHead>M² Reales</TableHead>
                      <TableHead>Precio Lista</TableHead>
                      <TableHead>Vista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Disponibilidad</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-6">
                          {searchTerm ? "No se encontraron resultados." : "No hay propiedades activas."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProperties.map((property) => (
                        <TableRow key={property.id}>
                          <TableCell className="font-medium">{property.dueño}</TableCell>
                          <TableCell>{property.numero_propiedad}</TableCell>
                          <TableCell>{property.numero_piso}</TableCell>
                          <TableCell>{property.m2_reales} m²</TableCell>
                          <TableCell>{formatCurrency(property.precio_lista)}</TableCell>
                          <TableCell>{property.vista}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{property.tipo_propiedad}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge 
                              variant={
                                property.disponibilidad === "Disponible" ? "default" :
                                property.disponibilidad === "Apartado" ? "secondary" : "destructive"
                              }
                            >
                              {property.disponibilidad}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex space-x-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => console.log('Edit', property.id)}
                                className="h-8 w-8 p-0"
                              >
                                <Edit className="h-4 w-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => console.log('Delete', property.id)}
                                className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>

            <TabsContent value="eliminadas" className="mt-4">
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Propietario</TableHead>
                      <TableHead>No. Propiedad</TableHead>
                      <TableHead>Piso</TableHead>
                      <TableHead>M² Reales</TableHead>
                      <TableHead>Precio Lista</TableHead>
                      <TableHead>Vista</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Disponibilidad</TableHead>
                      <TableHead>Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredProperties.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={9} className="text-center py-6">
                          {searchTerm ? "No se encontraron resultados." : "No hay propiedades eliminadas."}
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredProperties.map((property) => (
                        <TableRow key={property.id} className="opacity-60">
                          <TableCell className="font-medium">{property.dueño}</TableCell>
                          <TableCell>{property.numero_propiedad}</TableCell>
                          <TableCell>{property.numero_piso}</TableCell>
                          <TableCell>{property.m2_reales} m²</TableCell>
                          <TableCell>{formatCurrency(property.precio_lista)}</TableCell>
                          <TableCell>{property.vista}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{property.tipo_propiedad}</Badge>
                          </TableCell>
                          <TableCell>
                            <Badge variant="secondary">{property.disponibilidad}</Badge>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => console.log('Restore', property.id)}
                              className="h-8 px-2 text-xs"
                            >
                              Restaurar
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
};

export default Propiedades;