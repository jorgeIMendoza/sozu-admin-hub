import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type RepresentanteLegal = {
  nombre_legal: string;
  email: string;
  telefono: string;
  clave_pais_telefono: string;
  rfc?: string;
};

interface PublicRepresentanteLegalFormProps {
  initialData?: RepresentanteLegal;
  onSave: (data: RepresentanteLegal) => void;
  onCancel: () => void;
}

export function PublicRepresentanteLegalForm({
  initialData,
  onSave,
  onCancel,
}: PublicRepresentanteLegalFormProps) {
  const [formData, setFormData] = useState<RepresentanteLegal>({
    nombre_legal: initialData?.nombre_legal || "",
    email: initialData?.email || "",
    telefono: initialData?.telefono || "",
    clave_pais_telefono: initialData?.clave_pais_telefono || "MX",
    rfc: initialData?.rfc || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.nombre_legal.trim()) {
      return;
    }

    if (!formData.email.trim() || !formData.email.includes('@')) {
      return;
    }

    if (!formData.telefono.trim() || formData.telefono.length !== 10) {
      return;
    }

    onSave(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="rep_nombre">
          Nombre Completo <span className="text-destructive">*</span>
        </Label>
        <Input
          id="rep_nombre"
          value={formData.nombre_legal}
          onChange={(e) => setFormData(prev => ({ ...prev, nombre_legal: e.target.value }))}
          placeholder="Nombre completo del representante"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rep_email">
          Email <span className="text-destructive">*</span>
        </Label>
        <Input
          id="rep_email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData(prev => ({ ...prev, email: e.target.value }))}
          placeholder="email@ejemplo.com"
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rep_telefono">
          Teléfono <span className="text-destructive">*</span>
        </Label>
        <div className="flex gap-2">
          <Select
            value={formData.clave_pais_telefono}
            onValueChange={(value) => setFormData(prev => ({ ...prev, clave_pais_telefono: value }))}
          >
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="MX">🇲🇽 +52</SelectItem>
              <SelectItem value="US">🇺🇸 +1</SelectItem>
            </SelectContent>
          </Select>
          <Input
            id="rep_telefono"
            value={formData.telefono}
            onChange={(e) => {
              const value = e.target.value.replace(/\D/g, '').slice(0, 10);
              setFormData(prev => ({ ...prev, telefono: value }));
            }}
            placeholder="10 dígitos"
            className="flex-1"
            required
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="rep_rfc">
          RFC <span className="text-muted-foreground text-sm">(opcional)</span>
        </Label>
        <Input
          id="rep_rfc"
          value={formData.rfc}
          onChange={(e) => setFormData(prev => ({ ...prev, rfc: e.target.value.toUpperCase() }))}
          placeholder="RFC del representante"
          maxLength={13}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <Button type="button" variant="outline" onClick={onCancel} className="flex-1">
          Cancelar
        </Button>
        <Button type="submit" className="flex-1">
          Guardar
        </Button>
      </div>
    </form>
  );
}
