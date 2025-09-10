import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Camera, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface PersonFormProps {
  onSubmit: (data: any) => void;
  initialData?: any;
  isLoading?: boolean;
  onCancel: () => void;
  entityType?: 'legal' | 'client' | 'representative' | 'user';
}

export function PersonForm({ onSubmit, initialData, isLoading, onCancel, entityType = 'user' }: PersonFormProps) {
  const [nombre, setNombre] = useState(initialData?.nombre || initialData?.nombre_legal || '');
  const [curp, setCurp] = useState(initialData?.curp || '');
  const [email, setEmail] = useState(initialData?.email || '');
  const [telefono, setTelefono] = useState(initialData?.telefono || '');
  const [rfc, setRfc] = useState(initialData?.rfc || '');
  const [nombreComercial, setNombreComercial] = useState(initialData?.nombre_comercial || '');
  const [tipoPersona, setTipoPersona] = useState(initialData?.tipo_persona || (entityType === 'legal' ? 'pm' : 'pf'));
  const [documentImageUrl, setDocumentImageUrl] = useState(initialData?.url_documento_identificacion || '');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isApiProcessing, setIsApiProcessing] = useState(false);
  const { toast } = useToast();

  const handleCameraCapture = async () => {
    try {
      setIsProcessing(true);
      
      // Prevent the parent dialog from closing by stopping any propagation
      const originalOnOpenChange = (window as any).__dialogOnOpenChange;
      (window as any).__dialogOnOpenChange = null;
      
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

      // Create modal overlay that won't interfere with parent dialog
      const modalOverlay = document.createElement('div');
      modalOverlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0,0,0,0.95);
        z-index: 99999;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 20px;
      `;
      
      const modalContent = document.createElement('div');
      modalContent.innerHTML = `
        <video id="camera-video" autoplay playsinline muted style="max-width: 90%; max-height: 60%; border: 3px solid white; border-radius: 12px;"></video>
        <div style="margin-top: 30px; display: flex; gap: 20px;">
          <button type="button" id="capture-btn" style="padding: 15px 30px; background: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: 600; user-select: none;">📷 Tomar Foto</button>
          <button type="button" id="cancel-btn" style="padding: 15px 30px; background: #dc3545; color: white; border: none; border-radius: 8px; cursor: pointer; font-size: 18px; font-weight: 600; user-select: none;">❌ Cancelar</button>
        </div>
      `;
      
      modalOverlay.appendChild(modalContent);
      
      // Prevent all events from bubbling to avoid closing parent dialog
      modalOverlay.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
      });
      
      modalOverlay.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Escape') {
          cleanup();
        }
      });
      
      document.body.appendChild(modalOverlay);
      const modalVideo = document.getElementById('camera-video') as HTMLVideoElement;
      modalVideo.srcObject = stream;

      const cleanup = () => {
        try {
          stream.getTracks().forEach(track => track.stop());
          if (document.body.contains(modalOverlay)) {
            document.body.removeChild(modalOverlay);
          }
          // Restore the original dialog handler
          (window as any).__dialogOnOpenChange = originalOnOpenChange;
        } catch (error) {
          console.error('Error during cleanup:', error);
        }
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
      const captureBtn = document.getElementById('capture-btn')! as HTMLButtonElement;
      const cancelBtn = document.getElementById('cancel-btn')! as HTMLButtonElement;
      
      captureBtn.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        
        // Disable button to prevent double clicks
        captureBtn.disabled = true;
        captureBtn.style.opacity = '0.6';
        captureBtn.innerText = '📷 Capturando...';
        
        try {
          console.log('Capturing image...');
          
          // Set canvas size to match video
          canvas.width = modalVideo.videoWidth;
          canvas.height = modalVideo.videoHeight;
          
          // Draw video frame to canvas
          context.drawImage(modalVideo, 0, 0);
          
          // Convert to blob and process immediately
          canvas.toBlob(async (blob) => {
            if (blob) {
              console.log('Image captured, closing camera and processing...');
              // Close camera modal first
              cleanup();
              // Process image after camera is closed - this will update the main form
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
          cleanup();
        }
      });

      // Cancel button handler
      cancelBtn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
      });

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
    // Clear the input so the same file can be selected again if needed
    event.target.value = '';
  };

  const processImage = async (imageFile: Blob) => {
    try {
      setIsApiProcessing(true);
      
      toast({
        title: "Procesando documento",
        description: "Extrayendo datos del documento...",
      });
      
      // Upload image to Supabase Storage first
      const fileExt = 'jpg';
      const fileName = `documento_${Date.now()}.${fileExt}`;
      
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('documentos')
        .upload(fileName, imageFile, {
          contentType: 'image/jpeg',
          upsert: false
        });

      if (uploadError) {
        console.error('Error uploading image:', uploadError);
        throw new Error('Error al subir la imagen');
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('documentos')
        .getPublicUrl(fileName);

      const publicUrl = urlData.publicUrl;
      setDocumentImageUrl(publicUrl);
      
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
    
    // Validate based on entity type
    const isLegalEntity = entityType === 'legal';
    const isClient = entityType === 'client';
    const isRepresentative = entityType === 'representative';
    
    if (!nombre.trim() || !email.trim()) {
      toast({
        title: "Error",
        description: "Por favor completa todos los campos requeridos (nombre y email).",
        variant: "destructive",
      });
      return;
    }
    
    if (!isLegalEntity && !curp.trim()) {
      toast({
        title: "Error",
        description: "La CURP es requerida para personas físicas.",
        variant: "destructive",
      });
      return;
    }
    
    const formData: any = {
      nombre_legal: nombre.trim(),
      email: email.trim(),
      telefono: telefono.trim() || null,
      tipo_persona: tipoPersona,
      activo: true,
    };
    
    // Add specific fields based on entity type
    if (isLegalEntity) {
      formData.nombre_comercial = nombreComercial.trim() || null;
      formData.rfc = rfc.trim() || null;
    } else {
      formData.curp = curp.trim();
    }
    
    // For backwards compatibility with user form
    if (entityType === 'user') {
      onSubmit({
        nombre: nombre.trim(),
        curp: curp.trim(),
        url_documento_identificacion: documentImageUrl || undefined,
      });
    } else {
      onSubmit(formData);
    }
  };

  const getTitle = () => {
    switch (entityType) {
      case 'legal': return 'Entidad Legal';
      case 'client': return 'Cliente';
      case 'representative': return 'Representante Legal';
      default: return 'Usuario';
    }
  };

  const isLegalEntity = entityType === 'legal';
  const isUser = entityType === 'user';

  return (
    <Card className="p-6">
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4">
          <div>
            <Label htmlFor="nombre">
              {isLegalEntity ? 'Razón Social *' : 'Nombre Completo *'}
            </Label>
            <Input
              id="nombre"
              type="text"
              value={nombre}
              onChange={(e) => setNombre(e.target.value)}
              placeholder={isLegalEntity ? "Ingresa la razón social" : "Ingresa el nombre completo"}
              readOnly={isUser}
              className={isUser ? "bg-muted" : ""}
            />
          </div>

          {isLegalEntity && (
            <div>
              <Label htmlFor="nombreComercial">Nombre Comercial</Label>
              <Input
                id="nombreComercial"
                type="text"
                value={nombreComercial}
                onChange={(e) => setNombreComercial(e.target.value)}
                placeholder="Ingresa el nombre comercial (opcional)"
              />
            </div>
          )}

          <div>
            <Label htmlFor="email">Email *</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Ingresa el email"
            />
          </div>

          <div>
            <Label htmlFor="telefono">Teléfono</Label>
            <Input
              id="telefono"
              type="tel"
              value={telefono}
              onChange={(e) => setTelefono(e.target.value)}
              placeholder="Ingresa el teléfono"
            />
          </div>

          {!isUser && !isLegalEntity && (
            <div>
              <Label htmlFor="curp">CURP *</Label>
              <Input
                id="curp"
                type="text"
                value={curp}
                onChange={(e) => setCurp(e.target.value)}
                placeholder="Ingresa la CURP"
              />
            </div>
          )}

          {isLegalEntity && (
            <div>
              <Label htmlFor="rfc">RFC</Label>
              <Input
                id="rfc"
                type="text"
                value={rfc}
                onChange={(e) => setRfc(e.target.value)}
                placeholder="Ingresa el RFC"
              />
            </div>
          )}
          
          {isUser && (
            <>
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
                className="flex-1 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white border-blue-500 hover:border-blue-600 shadow-lg transition-all duration-300 hover:scale-105 font-semibold"
              >
                <Camera className="w-4 h-4 mr-2" />
                {isProcessing ? 'Procesando...' : 'Tomar Foto'}
              </Button>
              
              <Label htmlFor="file-upload" className="flex-1">
                <Button
                  type="button"
                  variant="outline"
                  disabled={isProcessing || isApiProcessing}
                  className="w-full bg-gradient-to-r from-green-500 to-green-600 hover:from-green-600 hover:to-green-700 text-white border-green-500 hover:border-green-600 shadow-lg transition-all duration-300 hover:scale-105 font-semibold"
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
            </>
          )}
        </div>
        
        <div className="flex gap-2 pt-4">
          <Button 
            type="submit" 
            disabled={isLoading || isProcessing || isApiProcessing}
            className="bg-gradient-to-r from-primary to-primary-glow hover:from-primary-glow hover:to-primary shadow-elegant transition-all duration-300 hover:scale-105 font-semibold px-8"
          >
            {isLoading ? 'Guardando...' : initialData ? 'Actualizar' : 'Crear'}
          </Button>
          <Button 
            type="button" 
            variant="outline" 
            onClick={onCancel}
            className="hover:bg-muted/50 transition-colors font-semibold px-8"
          >
            Cancelar
          </Button>
        </div>
      </form>
    </Card>
  );
}