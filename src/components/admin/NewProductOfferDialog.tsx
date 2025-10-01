import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NewProductOfferDialogProps {
  propertyId: number;
  currentBuyerData?: {
    nombre_legal: string;
    email: string;
    telefono: string;
    rfc?: string;
    curp?: string;
  } | null;
}

export function NewProductOfferDialog({ propertyId, currentBuyerData }: NewProductOfferDialogProps) {
  const [open, setOpen] = useState(false);
  const [useCurrentBuyer, setUseCurrentBuyer] = useState(true);
  const [showProspectSearch, setShowProspectSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [porcentajePagoInicial, setPorcentajePagoInicial] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  
  const [prospectData, setProspectData] = useState({
    tipo_persona: "Persona Física",
    nombre_completo: "",
    email: "",
    telefono: "",
    rfc: "",
    curp: ""
  });

  const { toast } = useToast();

  // Fetch active categories
  const { data: categories = [] } = useQuery({
    queryKey: ['categorias-productos-activas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categorias_producto')
        .select('*')
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
  });

  // Fetch products by category
  const { data: products = [] } = useQuery({
    queryKey: ['productos-por-categoria', selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return [];
      const { data, error } = await supabase
        .from('productos_servicios')
        .select('*')
        .eq('id_categoria', selectedCategory)
        .eq('activo', true)
        .order('nombre');
      if (error) throw error;
      return data || [];
    },
    enabled: !!selectedCategory,
  });

  // Fetch existing personas for search
  const { data: existingPersonas = [] } = useQuery({
    queryKey: ['personas-search', searchTerm],
    queryFn: async () => {
      if (searchTerm.length < 2) return [];
      const { data, error } = await supabase
        .from('personas')
        .select('*')
        .eq('activo', true)
        .or(`nombre_legal.ilike.%${searchTerm}%,email.ilike.%${searchTerm}%,rfc.ilike.%${searchTerm}%`)
        .limit(10);
      if (error) throw error;
      return data || [];
    },
    enabled: searchTerm.length >= 2 && showProspectSearch,
  });

  const handleCheckboxChange = (checked: boolean) => {
    setUseCurrentBuyer(checked);
    setShowProspectSearch(!checked);
    
    if (checked && currentBuyerData) {
      setProspectData({
        tipo_persona: "Persona Física",
        nombre_completo: currentBuyerData.nombre_legal,
        email: currentBuyerData.email,
        telefono: currentBuyerData.telefono,
        rfc: currentBuyerData.rfc || "",
        curp: currentBuyerData.curp || ""
      });
    } else {
      setProspectData({
        tipo_persona: "Persona Física",
        nombre_completo: "",
        email: "",
        telefono: "",
        rfc: "",
        curp: ""
      });
    }
  };

  const handleSelectExistingPerson = (persona: any) => {
    setProspectData({
      tipo_persona: persona.tipo_persona || "Persona Física",
      nombre_completo: persona.nombre_legal,
      email: persona.email,
      telefono: persona.telefono || "",
      rfc: persona.rfc || "",
      curp: persona.curp || ""
    });
    setSearchTerm("");
  };

  const handleSelectProductService = () => {
    // Validate form
    if (!porcentajePagoInicial || parseFloat(porcentajePagoInicial) <= 0 || parseFloat(porcentajePagoInicial) > 100) {
      toast({
        title: "Error",
        description: "El porcentaje de pago inicial debe estar entre 0 y 100",
        variant: "destructive",
      });
      return;
    }

    if (!prospectData.nombre_completo || !prospectData.email || !prospectData.telefono) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos obligatorios del comprador",
        variant: "destructive",
      });
      return;
    }

    setShowCategoryDialog(true);
  };

  const handleCategorySelect = (categoryId: number) => {
    setSelectedCategory(categoryId);
  };

  const handleProductSelect = async (productId: number) => {
    setSelectedProduct(productId);
    
    toast({
      title: "Producto/Servicio seleccionado",
      description: "Se ha registrado la oferta de producto/servicio",
    });

    // Close dialogs
    setShowCategoryDialog(false);
    setOpen(false);
    
    // Reset form
    setPorcentajePagoInicial("");
    setProspectData({
      tipo_persona: "Persona Física",
      nombre_completo: "",
      email: "",
      telefono: "",
      rfc: "",
      curp: ""
    });
    setUseCurrentBuyer(true);
    setShowProspectSearch(false);
    setSelectedCategory(null);
    setSelectedProduct(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button variant="ghost" size="sm" className="hover:bg-blue-50 hover:text-blue-600">
            <ShoppingCart className="h-4 w-4" />
          </Button>
        </DialogTrigger>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generar Oferta de Producto/Servicio</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Porcentaje de Pago Inicial */}
            <div className="space-y-2">
              <Label htmlFor="porcentaje-pago-inicial">Porcentaje de pago inicial (%)</Label>
              <Input
                id="porcentaje-pago-inicial"
                type="number"
                min="0"
                max="100"
                step="0.01"
                value={porcentajePagoInicial}
                onChange={(e) => setPorcentajePagoInicial(e.target.value)}
                placeholder="0.00"
              />
            </div>

            {/* Comprador Actual Checkbox */}
            <div className="flex items-center space-x-2">
              <Checkbox
                id="comprador-actual"
                checked={useCurrentBuyer}
                onCheckedChange={handleCheckboxChange}
              />
              <Label htmlFor="comprador-actual" className="cursor-pointer">
                Comprador actual
              </Label>
            </div>

            {/* Buscar Prospecto - Only shown if useCurrentBuyer is false */}
            {showProspectSearch && (
              <div className="space-y-2">
                <Label>Buscar Prospecto</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start">
                      Buscar por nombre...
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0">
                    <Command>
                      <CommandInput 
                        placeholder="Buscar por nombre..." 
                        value={searchTerm}
                        onValueChange={setSearchTerm}
                      />
                      <CommandEmpty>No se encontraron resultados.</CommandEmpty>
                      <CommandGroup>
                        {existingPersonas.map((persona: any) => (
                          <CommandItem
                            key={persona.id}
                            onSelect={() => handleSelectExistingPerson(persona)}
                          >
                            <div className="flex flex-col">
                              <span className="font-medium">{persona.nombre_legal}</span>
                              <span className="text-sm text-muted-foreground">{persona.email}</span>
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Información del Prospecto */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Información del Prospecto</h3>
              
              <div className="space-y-2">
                <Label htmlFor="tipo-persona">Tipo de Persona *</Label>
                <Select
                  value={prospectData.tipo_persona}
                  onValueChange={(value) => setProspectData({ ...prospectData, tipo_persona: value })}
                  disabled={useCurrentBuyer}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Persona Física">Persona Física</SelectItem>
                    <SelectItem value="Persona Moral">Persona Moral</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="nombre-completo">Nombre Completo *</Label>
                <Input
                  id="nombre-completo"
                  value={prospectData.nombre_completo}
                  onChange={(e) => setProspectData({ ...prospectData, nombre_completo: e.target.value })}
                  placeholder="Ingresa el nombre completo"
                  disabled={useCurrentBuyer}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email">Email *</Label>
                <Input
                  id="email"
                  type="email"
                  value={prospectData.email}
                  onChange={(e) => setProspectData({ ...prospectData, email: e.target.value })}
                  placeholder="Ingresa el email"
                  disabled={useCurrentBuyer}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="telefono">Teléfono *</Label>
                <Input
                  id="telefono"
                  value={prospectData.telefono}
                  onChange={(e) => setProspectData({ ...prospectData, telefono: e.target.value })}
                  placeholder="Ingresa el teléfono (10 dígitos obligatorios)"
                  disabled={useCurrentBuyer}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="rfc">RFC *</Label>
                <Input
                  id="rfc"
                  value={prospectData.rfc}
                  onChange={(e) => setProspectData({ ...prospectData, rfc: e.target.value })}
                  placeholder="Ingresa el RFC (Ej: ABC123456DEF)"
                  disabled={useCurrentBuyer}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="curp">CURP</Label>
                <Input
                  id="curp"
                  value={prospectData.curp}
                  onChange={(e) => setProspectData({ ...prospectData, curp: e.target.value })}
                  placeholder="Ingresa la CURP (Ej: ABCD123456HMNERR09)"
                  disabled={useCurrentBuyer}
                />
              </div>
            </div>

            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button onClick={handleSelectProductService}>
                Seleccionar producto/servicio
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Category and Product Selection Dialog */}
      <Dialog open={showCategoryDialog} onOpenChange={setShowCategoryDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              {!selectedCategory ? 'Seleccionar Categoría' : 'Seleccionar Producto/Servicio'}
            </DialogTitle>
          </DialogHeader>

          {!selectedCategory ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">Selecciona una categoría</p>
              <div className="grid grid-cols-2 gap-4">
                {categories.map((category: any) => (
                  <Button
                    key={category.id}
                    variant="outline"
                    className="h-20"
                    onClick={() => handleCategorySelect(category.id)}
                  >
                    {category.nombre}
                  </Button>
                ))}
              </div>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setShowCategoryDialog(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <Button variant="ghost" onClick={() => setSelectedCategory(null)}>
                ← Volver a categorías
              </Button>
              <p className="text-sm text-muted-foreground">Selecciona un producto/servicio</p>
              <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto">
                {products.map((product: any) => (
                  <Button
                    key={product.id}
                    variant="outline"
                    className="h-auto py-4 px-4 text-left flex flex-col items-start"
                    onClick={() => handleProductSelect(product.id)}
                  >
                    <span className="font-semibold">{product.nombre}</span>
                    {product.descripcion && (
                      <span className="text-sm text-muted-foreground mt-1">{product.descripcion}</span>
                    )}
                    {product.precio_lista && (
                      <span className="text-sm font-medium mt-2">
                        Precio: ${parseFloat(product.precio_lista).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </span>
                    )}
                  </Button>
                ))}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
