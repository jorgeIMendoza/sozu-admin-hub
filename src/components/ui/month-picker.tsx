import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

interface MonthPickerProps {
  value: Date | null;
  onChange: (date: Date | null) => void;
  className?: string;
}

const MONTHS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

function MonthPicker({ value, onChange, className }: MonthPickerProps) {
  const [view, setView] = React.useState<"months" | "years">("months");
  const [displayYear, setDisplayYear] = React.useState<number>(
    value?.getFullYear() || new Date().getFullYear()
  );
  const [yearRangeStart, setYearRangeStart] = React.useState<number>(
    Math.floor((value?.getFullYear() || new Date().getFullYear()) / 12) * 12
  );

  const selectedYear = value?.getFullYear();
  const selectedMonth = value?.getMonth();

  // Vista de años
  if (view === "years") {
    const years = Array.from({ length: 12 }, (_, i) => yearRangeStart + i);
    
    return (
      <div className={cn("p-3 pointer-events-auto min-w-[280px]", className)}>
        <div className="flex justify-between items-center mb-4">
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setYearRangeStart(yearRangeStart - 12)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <div className="text-sm font-medium">
            {yearRangeStart} - {yearRangeStart + 11}
          </div>
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7"
            onClick={() => setYearRangeStart(yearRangeStart + 12)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {years.map((year) => (
            <Button
              key={year}
              variant={year === displayYear ? "default" : "ghost"}
              className="h-10 text-sm"
              onClick={() => {
                setDisplayYear(year);
                setView("months");
              }}
            >
              {year}
            </Button>
          ))}
        </div>
      </div>
    );
  }

  // Vista de meses
  return (
    <div className={cn("p-3 pointer-events-auto min-w-[280px]", className)}>
      <div className="flex justify-between items-center mb-4">
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setDisplayYear(displayYear - 1)}
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          className="text-sm font-medium hover:bg-accent"
          onClick={() => setView("years")}
        >
          {displayYear}
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="h-7 w-7"
          onClick={() => setDisplayYear(displayYear + 1)}
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MONTHS.map((monthName, index) => {
          const isSelected = selectedYear === displayYear && selectedMonth === index;
          return (
            <Button
              key={index}
              variant={isSelected ? "default" : "ghost"}
              className="h-10 text-sm"
              onClick={() => {
                onChange(new Date(displayYear, index, 1));
              }}
            >
              {monthName}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

MonthPicker.displayName = "MonthPicker";

export { MonthPicker };
