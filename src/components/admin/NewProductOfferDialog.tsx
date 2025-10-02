import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShoppingCart } from "lucide-react";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface NewProductOfferDialogProps {
  propertyId: number;
  property: any;
}

export function NewProductOfferDialog({ propertyId, property }: NewProductOfferDialogProps) {
  const [open, setOpen] = useState(false);
  const [useCurrentBuyer, setUseCurrentBuyer] = useState(true);
  const [showProspectSearch, setShowProspectSearch] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<number | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<number | null>(null);
  const [showCategoryDialog, setShowCategoryDialog] = useState(false);
  
  const [paymentScheme, setPaymentScheme] = useState({
    porcentaje_enganche: "",
    porcentaje_mensualidades: "",
    porcentaje_entrega: "",
    numero_mensualidades: "",
    porcentaje_descuento_aumento: ""
  });
  
  const [prospectData, setProspectData] = useState({
    tipo_persona: "Persona Física",
    razon_social: "",
    email: "",
    telefono: "",
    rfc: ""
  });

  const { toast } = useToast();

  // Fetch current buyer data
  const { data: currentBuyerData } = useQuery({
    queryKey: ['current-buyer', propertyId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('compradores')
        .select('personas!compradores_id_persona_fkey(*)')
        .eq('id_cuenta_cobranza', property.cuenta_cobranza_id)
        .eq('activo', true)
        .order('porcentaje_copropiedad', { ascending: false })
        .limit(1)
        .single();
      
      if (error) throw error;
      return data?.personas;
    },
    enabled: !!property.cuenta_cobranza_id,
  });

  // Update prospectData when currentBuyerData changes or useCurrentBuyer changes
  useEffect(() => {
    if (useCurrentBuyer && currentBuyerData) {
      setProspectData({
        tipo_persona: currentBuyerData.tipo_persona || "Persona Física",
        razon_social: currentBuyerData.nombre_legal || "",
        email: currentBuyerData.email || "",
        telefono: currentBuyerData.telefono || "",
        rfc: currentBuyerData.rfc || ""
      });
    } else if (!useCurrentBuyer) {
      setProspectData({
        tipo_persona: "Persona Física",
        razon_social: "",
        email: "",
        telefono: "",
        rfc: ""
      });
    }
  }, [useCurrentBuyer, currentBuyerData]);

  // Fetch active categories + add "Servicios" option
  const { data: categoriesData = [] } = useQuery({
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

  // Add "Servicios" as a special category
  const categories = [
    { id: -1, nombre: 'Servicios' },
    ...categoriesData
  ];

  // Fetch products/services by category
  const { data: products = [] } = useQuery({
    queryKey: ['productos-servicios-por-categoria', selectedCategory],
    queryFn: async () => {
      if (!selectedCategory) return [];
      
      // If "Servicios" category is selected (id = -1)
      if (selectedCategory === -1) {
        const { data, error } = await supabase
          .from('productos_servicios')
          .select('*')
          .eq('es_producto', false)
          .eq('activo', true)
          .order('nombre');
        if (error) throw error;
        return data || [];
      }
      
      // Otherwise, fetch by category
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
  };

  const handleSelectExistingPerson = (persona: any) => {
    setProspectData({
      tipo_persona: persona.tipo_persona || "Persona Física",
      razon_social: persona.nombre_legal,
      email: persona.email,
      telefono: persona.telefono || "",
      rfc: persona.rfc || ""
    });
    setSearchTerm("");
  };

  const handleSelectProductService = () => {
    // Validate payment scheme
    const eng = parseFloat(paymentScheme.porcentaje_enganche);
    const mens = parseFloat(paymentScheme.porcentaje_mensualidades);
    const ent = parseFloat(paymentScheme.porcentaje_entrega);
    const numMens = parseInt(paymentScheme.numero_mensualidades);

    if (!paymentScheme.porcentaje_enganche || eng <= 0 || eng > 100) {
      toast({
        title: "Error",
        description: "El porcentaje de enganche debe estar entre 0 y 100",
        variant: "destructive",
      });
      return;
    }

    if (!paymentScheme.porcentaje_mensualidades || mens < 0 || mens > 100) {
      toast({
        title: "Error",
        description: "El porcentaje de mensualidades debe estar entre 0 y 100",
        variant: "destructive",
      });
      return;
    }

    if (!paymentScheme.porcentaje_entrega || ent < 0 || ent > 100) {
      toast({
        title: "Error",
        description: "El porcentaje de entrega debe estar entre 0 y 100",
        variant: "destructive",
      });
      return;
    }

    if (!paymentScheme.numero_mensualidades || numMens <= 0) {
      toast({
        title: "Error",
        description: "El número de mensualidades debe ser mayor a 0",
        variant: "destructive",
      });
      return;
    }

    const total = eng + mens + ent;
    if (Math.abs(total - 100) > 0.01) {
      toast({
        title: "Error",
        description: `La suma de los porcentajes debe ser 100%. Actualmente es ${total.toFixed(2)}%`,
        variant: "destructive",
      });
      return;
    }

    if (!prospectData.razon_social || !prospectData.email || !prospectData.telefono || !prospectData.rfc) {
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
    setPaymentScheme({
      porcentaje_enganche: "",
      porcentaje_mensualidades: "",
      porcentaje_entrega: "",
      numero_mensualidades: "",
      porcentaje_descuento_aumento: ""
    });
    setProspectData({
      tipo_persona: "Persona Física",
      razon_social: "",
      email: "",
      telefono: "",
      rfc: ""
    });
    setUseCurrentBuyer(true);
    setShowProspectSearch(false);
    setSelectedCategory(null);
    setSelectedProduct(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogTrigger asChild>
                <Button variant="ghost" size="sm" className="hover:bg-blue-50 hover:text-blue-600">
                  <ShoppingCart className="h-4 w-4" />
                </Button>
              </DialogTrigger>
            </TooltipTrigger>
            <TooltipContent>
              <p>Generar oferta de productos/servicios</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Generar Oferta de Producto/Servicio</DialogTitle>
          </DialogHeader>

          <div className="space-y-6">
            {/* Esquema de Pago Personalizado */}
            <div className="space-y-4">
              <h3 className="text-lg font-semibold">Esquema de Pago Personalizado</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="porcentaje-enganche">Porcentaje Enganche (%) *</Label>
                  <Input
                    id="porcentaje-enganche"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={paymentScheme.porcentaje_enganche}
                    onChange={(e) => setPaymentScheme({ ...paymentScheme, porcentaje_enganche: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="porcentaje-mensualidades">Porcentaje Mensualidades (%) *</Label>
                  <Input
                    id="porcentaje-mensualidades"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={paymentScheme.porcentaje_mensualidades}
                    onChange={(e) => setPaymentScheme({ ...paymentScheme, porcentaje_mensualidades: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="porcentaje-entrega">Porcentaje Entrega (%) *</Label>
                  <Input
                    id="porcentaje-entrega"
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={paymentScheme.porcentaje_entrega}
                    onChange={(e) => setPaymentScheme({ ...paymentScheme, porcentaje_entrega: e.target.value })}
                    placeholder="0.00"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="numero-mensualidades">Número de Mensualidades *</Label>
                  <Input
                    id="numero-mensualidades"
                    type="number"
                    min="1"
                    step="1"
                    value={paymentScheme.numero_mensualidades}
                    onChange={(e) => setPaymentScheme({ ...paymentScheme, numero_mensualidades: e.target.value })}
                    placeholder="12"
                  />
                </div>

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="porcentaje-descuento-aumento">Porcentaje Descuento/Aumento (%)</Label>
                  <Input
                    id="porcentaje-descuento-aumento"
                    type="number"
                    step="0.01"
                    value={paymentScheme.porcentaje_descuento_aumento}
                    onChange={(e) => setPaymentScheme({ ...paymentScheme, porcentaje_descuento_aumento: e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
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
                <Popover open={searchTerm.length >= 2}>
                  <PopoverTrigger asChild>
                    <Input
                      placeholder="Buscar por nombre, email o RFC..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                  </PopoverTrigger>
                  <PopoverContent className="w-[400px] p-0" align="start">
                    <Command>
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
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="tipo-persona">Tipo de Persona *</Label>
                  <Select
                    value={prospectData.tipo_persona}
                    onValueChange={(value) => setProspectData({ ...prospectData, tipo_persona: value })}
                    disabled={useCurrentBuyer}
                  >
                    <SelectTrigger id="tipo-persona">
                      <SelectValue>
                        {prospectData.tipo_persona || "Selecciona tipo de persona"}
                      </SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Persona Física">Persona Física</SelectItem>
                      <SelectItem value="Persona Moral">Persona Moral</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="razon-social">
                    {prospectData.tipo_persona === "Persona Física" ? "Nombre completo *" : "Razón Social *"}
                  </Label>
                  <Input
                    id="razon-social"
                    value={prospectData.razon_social}
                    onChange={(e) => setProspectData({ ...prospectData, razon_social: e.target.value })}
                    placeholder={prospectData.tipo_persona === "Persona Física" ? "Ingresa el nombre completo" : "Ingresa la razón social"}
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

                <div className="space-y-2 col-span-2">
                  <Label htmlFor="rfc">RFC *</Label>
                  <Input
                    id="rfc"
                    value={prospectData.rfc}
                    onChange={(e) => setProspectData({ ...prospectData, rfc: e.target.value })}
                    placeholder="Ingresa el RFC (Ej: ABC123456DEF)"
                    disabled={useCurrentBuyer}
                  />
                </div>
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
