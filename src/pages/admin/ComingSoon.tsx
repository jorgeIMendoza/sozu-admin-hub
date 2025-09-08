import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Construction, ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

interface ComingSoonProps {
  title: string;
  description?: string;
}

const ComingSoon = ({ title, description }: ComingSoonProps) => {
  return (
    <div className="space-y-6">
      <Link to="/admin" className="inline-flex items-center text-primary hover:text-primary-hover">
        <ArrowLeft className="h-4 w-4 mr-2" />
        Volver al Dashboard
      </Link>

      <Card className="max-w-md mx-auto">
        <CardContent className="text-center p-8">
          <Construction className="h-16 w-16 mx-auto text-muted-foreground mb-4" />
          <h1 className="text-2xl font-bold mb-2">{title}</h1>
          <p className="text-muted-foreground mb-6">
            {description || "Esta sección está en desarrollo y estará disponible próximamente."}
          </p>
          <Button asChild className="bg-primary hover:bg-primary-hover">
            <Link to="/admin">Volver al Dashboard</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ComingSoon;