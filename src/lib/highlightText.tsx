export function highlightText(text: string, searchTerm: string): React.ReactNode {
  if (!searchTerm.trim()) return text;
  
  const escapedTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escapedTerm})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, index) => {
    if (part.toLowerCase() === searchTerm.toLowerCase()) {
      return (
        <mark key={index} className="bg-primary/20 text-foreground font-semibold px-0.5 rounded">
          {part}
        </mark>
      );
    }
    return part;
  });
}
