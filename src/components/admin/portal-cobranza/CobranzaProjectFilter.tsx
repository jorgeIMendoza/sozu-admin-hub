import { useMemo, useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";

interface CobranzaProjectFilterOption {
  id: number;
  nombre: string;
}

interface CobranzaProjectFilterProps {
  projects: CobranzaProjectFilterOption[];
  value: number | null;
  onChange: (value: number | null) => void;
  allLabel?: string;
  className?: string;
  popoverClassName?: string;
  popoverAlign?: "start" | "center" | "end";
  searchThreshold?: number;
}

export function CobranzaProjectFilter({
  projects,
  value,
  onChange,
  allLabel = "Todos los proyectos",
  className,
  popoverClassName,
  popoverAlign = "start",
  searchThreshold = 10,
}: CobranzaProjectFilterProps) {
  const [open, setOpen] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((project) => project.id === value) ?? null,
    [projects, value]
  );

  if (projects.length <= searchThreshold) {
    return (
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}
        className={cn("sozu-filter-select", className)}
      >
        <option value="">{allLabel}</option>
        {projects.map((project) => (
          <option key={project.id} value={project.id}>
            {project.nombre}
          </option>
        ))}
      </select>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn("h-[38px] justify-between text-sm font-normal", className)}
        >
          <span className="truncate">{selectedProject?.nombre ?? allLabel}</span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn("w-[320px] p-0", popoverClassName)} align={popoverAlign}>
        <Command>
          <CommandInput placeholder="Buscar proyecto..." />
          <CommandList>
            <CommandEmpty>No se encontró el proyecto.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="__all__"
                onSelect={() => {
                  onChange(null);
                  setOpen(false);
                }}
              >
                <Check className={cn("mr-2 h-4 w-4", value === null ? "opacity-100" : "opacity-0")} />
                <span className="truncate">{allLabel}</span>
              </CommandItem>
              {projects.map((project) => (
                <CommandItem
                  key={project.id}
                  value={`${project.nombre} ${project.id}`}
                  onSelect={() => {
                    onChange(project.id);
                    setOpen(false);
                  }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === project.id ? "opacity-100" : "opacity-0")} />
                  <span className="truncate">{project.nombre}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}