import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { AlertCircle } from "lucide-react";

// Map country codes to phone prefixes
const COUNTRY_PHONE_PREFIXES: Record<string, string> = {
  'MX': '+52',
  'US': '+1',
  'CA': '+1',
};

interface PhoneDisplayProps {
  telefono?: string | null;
  clavePaisTelefono?: string | null;
  className?: string;
}

export function PhoneDisplay({ telefono, clavePaisTelefono, className = "" }: PhoneDisplayProps) {
  if (!telefono) {
    return <span className="text-muted-foreground">N/A</span>;
  }

  const prefix = clavePaisTelefono ? COUNTRY_PHONE_PREFIXES[clavePaisTelefono] : null;

  if (!prefix) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span className={`inline-flex items-center gap-1 ${className}`}>
            <AlertCircle className="h-3 w-3 text-destructive" />
            <span className="text-destructive">{telefono}</span>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <p>Falta código de país</p>
        </TooltipContent>
      </Tooltip>
    );
  }

  return (
    <span className={`text-muted-foreground ${className}`}>
      ({prefix}) {telefono}
    </span>
  );
}
