import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PersonFormProps {
  onSubmit: (data: { nombre: string; curp: string; url_documento_identificacion?: string }) => void;
  initialData?: { nombre: string; curp: string; url_documento_identificacion?: string };
  isLoading?: boolean;
  onCancel: () => void;
}

export function PersonForm({ onSubmit, initialData, isLoading, onCancel }: PersonFormProps) {
  const [nombre, setNombre] = useState(initialData?.nombre || '');
  const [curp, setCurp] = useState(initialData?.curp || '');
  const [documentImageUrl, setDocumentImageUrl] = useState(initialData?.url_documento_identificacion || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const { toast } = useToast();

  const handleCameraCapture = async () => {
    try {
      setIsProcessing(true);
      toast({
        title: "Activando cámara",
        description: "Preparando la cámara para tomar la foto...",
      });

      // Create a simple camera interface
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      
      if (!context) {
        throw new Error('No se pudo crear el contexto del canvas');
      }

      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });
      
      video.srcObject = stream;
      video.play();
      
      // Create a modal-like overlay for camera
      const overlay = document.createElement('div');
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.9);
        z-index: 9999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      `;
      
      video.style.cssText = `
        max-width: 90%;
        max-height: 70%;
        border: 2px solid white;
      `;
      
      const buttonContainer = document.createElement('div');
      buttonContainer.style.cssText = `
        margin-top: 20px;
        display: flex;
        gap: 10px;
      `;
      
      const captureBtn = document.createElement('button');
      captureBtn.textContent = 'Tomar Foto';
      captureBtn.style.cssText = `
        padding: 10px 20px;
        background: #007bff;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      `;
      
      const cancelBtn = document.createElement('button');
      cancelBtn.textContent = 'Cancelar';
      cancelBtn.style.cssText = `
        padding: 10px 20px;
        background: #6c757d;
        color: white;
        border: none;
        border-radius: 5px;
        cursor: pointer;
      `;
      
      buttonContainer.appendChild(captureBtn);
      buttonContainer.appendChild(cancelBtn);
      overlay.appendChild(video);
      overlay.appendChild(buttonContainer);
      document.body.appendChild(overlay);
      
      const cleanup = () => {
        stream.getTracks().forEach(track => track.stop());
        document.body.removeChild(overlay);
        setIsProcessing(false);
      };
      
      captureBtn.onclick = () => {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        
        canvas.toBlob(async (blob) => {
          cleanup();
          if (blob) {
            await processImage(blob);
          }
        }, 'image/jpeg', 0.8);
      };
      
      cancelBtn.onclick = cleanup;
      
    } catch (error) {
      console.error('Error accessing camera:', error);
      toast({
        title: "Error",
        description: "No se pudo acceder a la cámara. Intenta subir una imagen desde tus archivos.",
        variant: "destructive",
      });
      setIsProcessing(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      await processImage(file);
    }
  };

  const processImage = async (imageFile: Blob) => {
    try {
      setIsProcessing(true);
      
      // Process with external API
      const formData = new FormData();
      formData.append('image', imageFile, 'documento.jpg');
      
      console.log('Sending image to API...');
      
      const response = await fetch('https://automatizacion-n8n.fbqqbe.easypanel.host/webhook/process-ine', {
        method: 'POST',
        body: formData,
      });
      
      console.log('API Response status:', response.status);
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const responseText = await response.text();
      console.log('Raw response:', responseText);
      
      if (!responseText || responseText.trim() === '') {
        throw new Error('La API no devolvió ningún dato');
      }
      
      let result;
      try {
        result = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON Parse Error:', parseError);
        throw new Error('La respuesta de la API no es JSON válido');
      }
      
      console.log('Parsed API Response:', result);
      
      if (result && result.ok && result.data) {
        const data = result.data;
        if (data.nombres && data.apellidos && data.curp) {
          const fullName = `${data.nombres} ${data.apellidos}`;
          setNombre(fullName);
          setCurp(data.curp);
          
          // Create a blob URL for the image
          const imageUrl = URL.createObjectURL(imageFile);
          setDocumentImageUrl(imageUrl);
          
          toast({
            title: "Documento procesado",
            description: "Los datos se han extraído exitosamente del documento.",
          });
        } else {
          toast({
            title: "Advertencia",
            description: "No se pudieron extraer todos los datos del documento.",
            variant: "destructive",
          });
        }
      } else {
        toast({
          title: "Advertencia", 
          description: "No se encontraron datos en la respuesta de la API.",
          variant: "destructive",
        });
      }
      
    } catch (error) {
      console.error('Error processing image:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast({
        title: "Error",
        description: `Error al procesar el documento: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!nombre.trim() || !curp.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos.",
        variant: "destructive",
      });
      return;
    }
    
    onSubmit({
      nombre: nombre.trim(),
      curp: curp.trim(),
      url_documento_identificacion: documentImageUrl || undefined,
    });
  };

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="nombre">Nombre *</Label>
            <Input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder="Ingresa el nombre completo"
              readOnly
              className="bg-muted"
            />
          </div>
          
          <div>
            <Label htmlFor="curp">CURP *</Label>
            <Input
              id="curp"
              type="text"
              value={curp}
              onChange={(e) => setCurp(e.target.value)}
              placeholder="Ingresa la CURP"
              readOnly
              className="bg-muted"
            />
          </div>
          
          <div>
            <Label>Documento de Identificación</Label>
            <div className="flex gap-2 mt-2">
              <Button
                type="button"
                variant="outline"
                onClick={handleCameraCapture}
                disabled={isProcessing}
                className="flex-1"
              >
                <Camera className="w-4 h-4 mr-2" />
                {isProcessing ? 'Procesando...' : 'Tomar Foto'}
              </Button>
              
              <Label htmlFor="file-upload" className="flex-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessing}
                  className="w-full"
                  asChild
                >
                  <span>
                    <Upload className="w-4 h-4 mr-2" />
                    Subir Archivo
                  </span>
                </Button>
                <input
                  id="file-upload"
                  type="file"
                  accept="image/*"
                  onChange={handleFileUpload}
                  className="hidden"
                  disabled={isProcessing}
                />
              </Label>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Toma una foto o sube una imagen del documento de identificación para extraer automáticamente los datos.
            </p>
            {documentImageUrl && (
              <div className="mt-3">
                <img 
                  src={documentImageUrl} 
                  alt="Documento de identificación" 
                  className="w-24 h-16 object-cover rounded border"
                />
              </div>
            )}
          </div>
        </div>
        
        <div className="flex gap-2 pt-4">
          <Button type="submit" disabled={isLoading || isProcessing}>
            {isLoading ? 'Guardando...' : initialData ? 'Actualizar' : 'Confirmar'}
          </Button>
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}