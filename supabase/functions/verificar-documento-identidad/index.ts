import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface VerificationRequest {
  imageUrl: string;
  expectedType: "ine_frente" | "ine_reverso" | "pasaporte";
  selfieUrl?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageUrl, expectedType, selfieUrl } =
      (await req.json()) as VerificationRequest;

    if (!imageUrl || !expectedType) {
      return new Response(
        JSON.stringify({ error: "imageUrl and expectedType are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Download image and convert to base64
    const fetchImage = async (url: string) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to fetch image: ${url}`);
      const buf = await res.arrayBuffer();
      const bytes = new Uint8Array(buf);
      // Convert to base64 in chunks to avoid call stack overflow
      let binary = "";
      const chunkSize = 8192;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        const chunk = bytes.subarray(i, i + chunkSize);
        binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
      }
      const base64 = btoa(binary);
      const contentType = res.headers.get("content-type") || "image/jpeg";
      return { base64, contentType };
    };

    const docImage = await fetchImage(imageUrl);

    // Build messages with images
    const userContent: any[] = [];

    // Document image
    userContent.push({
      type: "image_url",
      image_url: {
        url: `data:${docImage.contentType};base64,${docImage.base64}`,
      },
    });

    // Selfie image if provided
    if (selfieUrl) {
      const selfieImage = await fetchImage(selfieUrl);
      userContent.push({
        type: "image_url",
        image_url: {
          url: `data:${selfieImage.contentType};base64,${selfieImage.base64}`,
        },
      });
    }

    // Text instruction
    const typeDescriptions: Record<string, string> = {
      ine_frente:
        "la parte FRONTAL de una credencial INE/IFE mexicana. Extrae: nombre completo, CURP, clave de elector, fecha de nacimiento, sexo (H o M), domicilio, sección electoral, vigencia (año inicio - año fin), año de registro.",
      ine_reverso:
        "el REVERSO de una credencial INE/IFE mexicana. Extrae el número de identificación CIC de la primera línea del MRZ (los dígitos después de 'IDMEX', antes de los <<). Ejemplo: si la línea dice 'IDMEX2098573390<<2370069...' el CIC es '2098573390'. También valida el formato MRZ (3 líneas), confirma nombre, fecha de nacimiento y sexo desde el MRZ. Busca presencia de código de barras y QR.",
      pasaporte:
        "un PASAPORTE mexicano. Extrae: nombre completo, CURP, fecha de nacimiento, sexo, número de pasaporte, vigencia. Valida formato MRZ.",
    };

    let textPrompt = `Analiza esta imagen. Se espera que sea ${typeDescriptions[expectedType]}.

Verifica la autenticidad del documento buscando señales como: formato oficial, tipografía correcta, colores institucionales, presencia de hologramas/elementos de seguridad, código de barras/QR.

Si el documento está vencido (la vigencia ya pasó), indícalo.
Si NO es un documento de identidad válido o es una foto de pantalla/fotocopia, recházalo con razón.`;

    if (selfieUrl) {
      textPrompt += `\n\nTambién se proporciona una selfie (segunda imagen). Compara el rostro de la selfie con la foto del documento de identidad y determina si es la misma persona. Evalúa la similitud facial.`;
    }

    userContent.push({ type: "text", text: textPrompt });

    // Tool definition for structured output
    const tools = [
      {
        type: "function",
        function: {
          name: "verify_identity_document",
          description:
            "Retorna los resultados de verificación del documento de identidad",
          parameters: {
            type: "object",
            properties: {
              is_valid_document: {
                type: "boolean",
                description: "Si la imagen contiene un documento de identidad válido y auténtico",
              },
              document_type: {
                type: "string",
                enum: ["ine_frente", "ine_reverso", "pasaporte", "otro", "no_documento"],
                description: "Tipo de documento detectado",
              },
              confidence: {
                type: "number",
                description: "Nivel de confianza de 0 a 100",
              },
              full_name: {
                type: ["string", "null"],
                description: "Nombre completo extraído del documento",
              },
              curp: {
                type: ["string", "null"],
                description: "CURP extraído (18 caracteres)",
              },
              clave_elector: {
                type: ["string", "null"],
                description: "Clave de elector extraída",
              },
              fecha_nacimiento: {
                type: ["string", "null"],
                description: "Fecha de nacimiento en formato DD/MM/YYYY",
              },
              sexo: {
                type: ["string", "null"],
                enum: ["H", "M", null],
                description: "Sexo: H (hombre) o M (mujer)",
              },
              domicilio: {
                type: ["string", "null"],
                description: "Domicilio completo extraído",
              },
              vigencia: {
                type: ["string", "null"],
                description: "Vigencia del documento (ej: '2020 - 2030')",
              },
              numero_identificacion: {
                type: ["string", "null"],
                description:
                  "Número CIC del INE (extraído del MRZ del reverso) o número de pasaporte",
              },
              is_expired: {
                type: ["boolean", "null"],
                description: "Si el documento ya venció",
              },
              authenticity_signals: {
                type: "array",
                items: { type: "string" },
                description:
                  "Señales de autenticidad detectadas (ej: 'Formato oficial INE', 'QR presente')",
              },
              rejection_reason: {
                type: ["string", "null"],
                description: "Razón de rechazo si no es válido",
              },
              face_match: {
                type: ["boolean", "null"],
                description: "Si el rostro de la selfie coincide con el del documento",
              },
              face_match_confidence: {
                type: ["number", "null"],
                description: "Confianza del match facial de 0 a 100",
              },
              face_match_reason: {
                type: ["string", "null"],
                description: "Explicación del resultado del match facial",
              },
            },
            required: [
              "is_valid_document",
              "document_type",
              "confidence",
              "authenticity_signals",
            ],
            additionalProperties: false,
          },
        },
      },
    ];

    const response = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-3-flash-preview",
          messages: [
            {
              role: "system",
              content:
                "Eres un experto verificador de documentos de identidad mexicanos (INE y Pasaporte). Analiza imágenes con precisión y extrae datos estructurados. Responde SIEMPRE usando la herramienta verify_identity_document. Fecha actual: " +
                new Date().toISOString().split("T")[0],
            },
            { role: "user", content: userContent },
          ],
          tools,
          tool_choice: {
            type: "function",
            function: { name: "verify_identity_document" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Límite de solicitudes excedido. Intenta en unos momentos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA agotados." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "Error del servicio de verificación" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await response.json();

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "verify_identity_document") {
      console.error("Unexpected AI response:", JSON.stringify(data));
      return new Response(
        JSON.stringify({ error: "Respuesta inesperada del verificador" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("verificar-documento-identidad error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Error desconocido",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
