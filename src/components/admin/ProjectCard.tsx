import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MapPin, DollarSign } from "lucide-react";

interface ProjectCardProps {
  name: string;
  address: string;
  pricePerSqm: string;
  status: "Activo" | "Inactivo";
  type: string;
  category: string;
}

export const ProjectCard = ({ 
  name, 
  address, 
  pricePerSqm, 
  status, 
  type, 
  category 
}: ProjectCardProps) => {
  return (
    <Card className="transition-all duration-200 hover:shadow-md">
      <CardContent className="p-6">
        <div className="space-y-4">
          <div className="flex items-start justify-between">
            <div>
              <h3 className="font-semibold text-lg">{name}</h3>
              <div className="flex items-center text-sm text-muted-foreground mt-1">
                <MapPin className="h-4 w-4 mr-1" />
                {address}
              </div>
            </div>
            <Badge 
              variant={status === "Activo" ? "default" : "secondary"}
              className={status === "Activo" ? "bg-success text-success-foreground" : ""}
            >
              {status}
            </Badge>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center text-primary font-semibold">
              <DollarSign className="h-4 w-4 mr-1" />
              {pricePerSqm}
            </div>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex space-x-2">
              <Button variant="outline" size="sm">
                {type}
              </Button>
              <Button variant="outline" size="sm">
                {category}
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};