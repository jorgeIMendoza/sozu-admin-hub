import * as React from "react";
import { cn } from "@/lib/utils";

interface CurrencyInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value: number;
  onChange: (value: number) => void;
  decimals?: number;
}

const CurrencyInput = React.forwardRef<HTMLInputElement, CurrencyInputProps>(
  ({ className, value, onChange, decimals = 2, ...props }, ref) => {
    // Format the display value with the specified decimals
    const formatDisplay = (numValue: number): string => {
      const divisor = Math.pow(10, decimals);
      const formatted = (numValue / divisor).toFixed(decimals);
      // Add thousand separators
      const parts = formatted.split('.');
      parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      return parts.join('.');
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      const key = e.key;
      
      // Allow navigation keys
      if (['Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) {
        return;
      }

      // Allow Ctrl+V, Ctrl+C, Ctrl+A, Cmd+V, Cmd+C, Cmd+A (for paste/copy/select all)
      if ((e.ctrlKey || e.metaKey) && ['v', 'c', 'a', 'x'].includes(key.toLowerCase())) {
        return; // Let the paste event handle it
      }

      // Prevent default for all other keys
      e.preventDefault();

      if (key === 'Backspace') {
        // Remove last digit
        const newValue = Math.floor(value / 10);
        onChange(newValue);
      } else if (key === 'Delete') {
        // Clear all
        onChange(0);
      } else if (/^\d$/.test(key)) {
        // Add digit to the right
        const digit = parseInt(key, 10);
        const newValue = value * 10 + digit;
        // Limit to prevent overflow (max ~999,999,999.99)
        if (newValue <= 99999999999) {
          onChange(newValue);
        }
      }
    };

    const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
      e.preventDefault();
      const pastedText = e.clipboardData.getData('text').trim();
      
      // Try to parse as a formatted number (e.g., "7,142,580.00" or "7142580.00")
      const cleanedText = pastedText.replace(/,/g, ''); // Remove thousand separators
      const parsedNumber = parseFloat(cleanedText);
      
      if (!isNaN(parsedNumber)) {
        // Convert to cents/integer representation
        const divisor = Math.pow(10, decimals);
        const newValue = Math.round(parsedNumber * divisor);
        if (newValue <= 99999999999) {
          onChange(newValue);
        }
      }
    };

    return (
      <input
        type="text"
        inputMode="numeric"
        className={cn(
          "flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm text-right",
          className
        )}
        ref={ref}
        value={formatDisplay(value)}
        onKeyDown={handleKeyDown}
        onPaste={handlePaste}
        onChange={() => {}} // Controlled via onKeyDown
        {...props}
      />
    );
  }
);

CurrencyInput.displayName = "CurrencyInput";

export { CurrencyInput };
