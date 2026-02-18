import * as React from "react";
import { ChevronsUpDown, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";

interface MultiSelectFilterProps {
  values: string[];
  onValuesChange: (values: string[]) => void;
  options: string[];
  placeholder?: string;
  emptyText?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

export function MultiSelectFilter({
  values,
  onValuesChange,
  options,
  placeholder = "Seleccionar...",
  emptyText = "No se encontraron resultados.",
  searchPlaceholder = "Buscar...",
  disabled = false,
  className,
  icon,
}: MultiSelectFilterProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");

  const filteredOptions = React.useMemo(() => {
    if (!search.trim()) return options.slice(0, 100);
    const searchLower = search.toLowerCase().trim();
    return options.filter(option => 
      option.toLowerCase().includes(searchLower)
    ).slice(0, 100);
  }, [options, search]);

  const handleToggle = (option: string) => {
    if (values.includes(option)) {
      onValuesChange(values.filter(v => v !== option));
    } else {
      onValuesChange([...values, option]);
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onValuesChange([]);
  };

  const displayText = React.useMemo(() => {
    if (values.length === 0) return placeholder;
    if (values.length === 1) {
      const val = values[0];
      return val.length > 25 ? val.substring(0, 22) + "..." : val;
    }
    return `${values.length} seleccionados`;
  }, [values, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full justify-between",
            values.length === 0 && "text-muted-foreground",
            className
          )}
          disabled={disabled}
        >
          <span className="flex items-center gap-2 truncate text-left">
            {icon}
            {displayText}
          </span>
          <div className="flex items-center gap-1 ml-2 shrink-0">
            {values.length > 0 && (
              <Badge variant="secondary" className="h-5 px-1.5 text-xs">
                {values.length}
              </Badge>
            )}
            {values.length > 0 && (
              <X 
                className="h-3 w-3 opacity-50 hover:opacity-100 cursor-pointer" 
                onClick={handleClear}
              />
            )}
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[300px] p-0" align="start">
        <div className="flex flex-col">
          {/* Search input - only show when more than 10 options */}
          {options.length > 10 && (
            <div className="flex items-center border-b px-3 py-2">
              <Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />
              <Input
                placeholder={searchPlaceholder}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 border-0 p-0 focus-visible:ring-0 focus-visible:ring-offset-0"
              />
            </div>
          )}
          
          {/* Selected items badges */}
          {values.length > 0 && (
            <div className="flex flex-wrap gap-1.5 p-2.5 border-b max-h-[80px] overflow-y-auto">
              {values.map((value) => (
                <Badge 
                  key={value} 
                  variant="secondary" 
                  className="text-xs cursor-pointer hover:bg-destructive/10 px-2.5 py-1 gap-1.5"
                  onClick={() => handleToggle(value)}
                >
                  {value.length > 20 ? value.substring(0, 17) + "..." : value}
                  <X className="h-3 w-3" />
                </Badge>
              ))}
            </div>
          )}
          
          {/* Options list - color highlight instead of checkboxes */}
          <ScrollArea className="max-h-[250px]">
            {filteredOptions.length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              <div className="p-1">
                {filteredOptions.map((option) => {
                  const isSelected = values.includes(option);
                  return (
                    <div
                      key={option}
                      onClick={() => handleToggle(option)}
                      className={cn(
                        "relative flex cursor-pointer select-none items-center rounded-md px-3 py-2 text-sm transition-colors",
                        isSelected
                          ? "bg-primary text-primary-foreground font-medium"
                          : "hover:bg-accent hover:text-accent-foreground"
                      )}
                    >
                      <span className="truncate flex-1">{option}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </ScrollArea>

          {/* Footer */}
          {values.length > 0 && (
            <div className="border-t p-2">
              <Button 
                variant="ghost" 
                size="sm" 
                className="w-full text-xs"
                onClick={() => onValuesChange([])}
              >
                Limpiar selección
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
