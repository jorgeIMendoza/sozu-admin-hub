import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { description, amenityName } = await req.json();

    if (!description || !amenityName) {
      return new Response(
        JSON.stringify({ error: "La descripción y nombre de la amenidad son requeridos" }),
        { 
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('Generando icono para amenidad:', amenityName, 'con descripción:', description);

    const openaiApiKey = Deno.env.get('OPENAI_API_KEY');
    if (!openaiApiKey) {
      throw new Error('OpenAI API key no configurada');
    }

    // Generate icon using OpenAI DALL-E
    const prompt = `Create a simple, clean, modern icon for "${amenityName}". ${description}. Style: minimalist, flat design, single color on transparent background, suitable for a real estate amenity. Size should be optimized for use as a small icon.`;

    console.log('Prompt para OpenAI:', prompt);

    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'dall-e-3',
        prompt: prompt,
        size: '1024x1024',
        quality: 'standard',
        n: 1,
        response_format: 'b64_json'
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('Error de OpenAI:', error);
      throw new Error(`Error de OpenAI: ${error.error?.message || 'Error desconocido'}`);
    }

    const data = await response.json();
    const imageData = data.data[0].b64_json;

    console.log('Imagen generada exitosamente');

    // Upload to Supabase Storage
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Convert base64 to blob
    const binaryString = atob(imageData);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }

    const fileName = `amenity-icons/${amenityName.toLowerCase().replace(/\s+/g, '-')}-${Date.now()}.png`;
    
    console.log('Subiendo archivo:', fileName);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('documentos')
      .upload(fileName, bytes, {
        contentType: 'image/png',
        upsert: false
      });

    if (uploadError) {
      console.error('Error subiendo archivo:', uploadError);
      throw new Error(`Error subiendo archivo: ${uploadError.message}`);
    }

    console.log('Archivo subido exitosamente:', uploadData);

    // Get public URL
    const { data: urlData } = supabase.storage
      .from('documentos')
      .getPublicUrl(fileName);

    const publicUrl = urlData.publicUrl;

    console.log('URL pública generada:', publicUrl);

    return new Response(
      JSON.stringify({ 
        success: true, 
        iconUrl: publicUrl,
        message: 'Icono generado y subido exitosamente'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    console.error('Error en generate-amenity-icon:', error);
    return new Response(
      JSON.stringify({ 
        error: error.message,
        success: false
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});