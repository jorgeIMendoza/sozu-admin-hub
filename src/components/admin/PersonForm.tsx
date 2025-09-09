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
  const [isApiProcessing, setIsApiProcessing] = useState(false);
  const { toast } = useToast();

  const handleCameraCapture = async () => {
    try {
      setIsProcessing(true);
      toast({
        title: "Activando cámara",
        description: "Preparando la cámara para tomar la foto...",
      });

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Cámara no disponible en este navegador');
      }

      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } 
      });

      // Create video and canvas elements
      const video = document.createElement('video');
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d')!;
      
      video.srcObject = stream;
      video.autoplay = true;
      video.playsInline = true;
      video.muted = true;

      // Create modal
      const modal = document.createElement('div');
      modal.innerHTML = `
        <div style="position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.95); z-index: 9999; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 20px;">
          <video id="camera-video" autoplay playsinline muted style="max-width: 90%; max-height: 60%; border: 3px solid white; border-radius: 12px;"></video>
          <div style="margin-top: 30px; display: flex; gap: 20px;">
            <button id="capture-btn" style="padding: 15px 30px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: 600;">📷 Tomar Foto</button>
            <button id="cancel-btn" style="padding: 15px 30px; background: #dc3545; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: 600;">❌ Cancelar</button>
          </div>
        </div>
      `;
      
      document.body.appendChild(modal);
      const modalVideo = document.getElementById('camera-video') as HTMLVideoElement;
      modalVideo.srcObject = stream;

      const cleanup = () => {
        stream.getTracks().forEach(track => track.stop());
        document.body.removeChild(modal);
        setIsProcessing(false);
      };

      // Wait for video to load
      await new Promise<void>((resolve) => {
        modalVideo.onloadedmetadata = () => {
          modalVideo.play();
          resolve();
        };
      });

      // Capture button handler
      document.getElementById('capture-btn')!.onclick = async () => {
        try {
          // Set canvas size to match video
          canvas.width = modalVideo.videoWidth;
          canvas.height = modalVideo.videoHeight;
          
          // Draw video frame to canvas
          context.drawImage(modalVideo, 0, 0);
          
          // Convert to blob
          canvas.toBlob(async (blob) => {
            if (blob) {
              cleanup();
              await processImage(blob);
            }
          }, 'image/jpeg', 0.9);
          
        } catch (error) {
          console.error('Capture error:', error);
          toast({
            title: "Error",
            description: "Error al capturar la imagen.",
            variant: "destructive",
          });
        }
      };

      // Cancel button handler
      document.getElementById('cancel-btn')!.onclick = cleanup;

      // ESC key handler
      const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          cleanup();
          document.removeEventListener('keydown', handleEsc);
        }
      };
      document.addEventListener('keydown', handleEsc);

    } catch (error) {
      console.error('Camera error:', error);
      toast({
        title: "Error de cámara",
        description: "No se pudo acceder a la cámara. Intenta subir una imagen.",
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
      setIsApiProcessing(true);
      
      toast({
        title: "Procesando documento",
        description: "Extrayendo datos del documento...",
      });
      
      // Process with external API
      const formData = new FormData();
      formData.append('image', imageFile, 'documento.jpg');
      
      console.log('Enviando imagen a la API...');
      
      const response = await fetch('https://automatizacion-n8n.fbqqbe.easypanel.host/webhook/process-ine', {
        method: 'POST',
        body: formData,
      });
      
      console.log('Estado de respuesta de API:', response.status);
      
      if (!response.ok) {
        throw new Error(`Error HTTP: ${response.status}`);
      }
      
      const responseText = await response.text();
      console.log('Respuesta cruda:', responseText);
      
      if (!responseText?.trim()) {
        throw new Error('La API no devolvió datos');
      }
      
      const result = JSON.parse(responseText);
      console.log('Respuesta parseada:', result);
      
      // Handle API response format
      if (result?.ok && result?.data) {
        const data = result.data;
        if (data.nombres && data.apellidos && data.curp) {
          const fullName = `${data.nombres} ${data.apellidos}`;
          setNombre(fullName);
          setCurp(data.curp);
          
          // Create blob URL for image preview
          const imageUrl = URL.createObjectURL(imageFile);
          setDocumentImageUrl(imageUrl);
          
          toast({
            title: "¡Documento procesado!",
            description: "Los datos se extrajeron correctamente.",
          });
        } else {
          throw new Error('Datos incompletos en la respuesta');
        }
      } else if (result?.nombre && result?.curp) {
        // Handle alternative response format
        setNombre(result.nombre);
        setCurp(result.curp);
        
        const imageUrl = URL.createObjectURL(imageFile);
        setDocumentImageUrl(imageUrl);
        
        toast({
          title: "¡Documento procesado!",
          description: "Los datos se extrajeron correctamente.",
        });
      } else {
        throw new Error('Formato de respuesta no reconocido');
      }
      
    } catch (error) {
      console.error('Error procesando imagen:', error);
      const errorMessage = error instanceof Error ? error.message : 'Error desconocido';
      toast({
        title: "Error",
        description: `Error al procesar el documento: ${errorMessage}`,
        variant: "destructive",
      });
    } finally {
      setIsApiProcessing(false);
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
                disabled={isProcessing || isApiProcessing}
                className="flex-1"
              >
                <Camera className="w-4 h-4 mr-2" />
                {isProcessing ? 'Procesando...' : 'Tomar Foto'}
              </Button>
              
              <Label htmlFor="file-upload" className="flex-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessing || isApiProcessing}
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
                  disabled={isProcessing || isApiProcessing}
                />
              </Label>
            </div>
            <p className="text-sm text-muted-foreground mt-1">
              Toma una foto o sube una imagen del documento de identificación para extraer automáticamente los datos.
            </p>
            {isApiProcessing && (
              <div className="mt-3 flex items-center space-x-2">
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary"></div>
                <span className="text-sm text-primary">Procesando documento...</span>
              </div>
            )}
            {documentImageUrl && !isApiProcessing && (
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
          <Button type="submit" disabled={isLoading || isProcessing || isApiProcessing}>
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