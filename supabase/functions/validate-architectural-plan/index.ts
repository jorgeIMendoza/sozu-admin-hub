import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const { imageBase64 } = await req.json();
    if (!imageBase64) {
      return new Response(JSON.stringify({ error: "No image provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an image analysis assistant for a real estate platform. You analyze architectural floor plan images (planos arquitectónicos) of apartments/units.

Your task:
1. Determine if the image is a valid architectural floor plan (plano arquitectónico) showing the internal layout of a residential unit (rooms, bathroom, kitchen, balcony, etc.).
2. A valid architectural plan typically shows: walls, room divisions, doors, windows, measurements, room labels (recámara, baño, cocina, sala, etc.).
3. This is NOT a location/building floor plan (plano de ubicación) which shows multiple units on a building floor. This should be a detailed plan of a SINGLE unit or a few unit types.
4. If valid, return is_valid: true.
5. If not valid, explain why.

IMPORTANT: Return your analysis using the provided tool.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this image. Determine if it's a valid architectural floor plan (plano arquitectónico) showing the internal layout of a residential unit with rooms, measurements, and structural details. It should NOT be a building location plan showing multiple numbered units."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:image/png;base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "analyze_architectural_plan",
              description: "Return the analysis of an architectural floor plan image",
              parameters: {
                type: "object",
                properties: {
                  is_valid: {
                    type: "boolean",
                    description: "Whether the image is a valid architectural floor plan of a residential unit"
                  },
                  rejection_reason: {
                    type: "string",
                    description: "If not valid, explain why in Spanish"
                  },
                  detected_rooms: {
                    type: "array",
                    description: "List of detected rooms/spaces in the plan",
                    items: { type: "string" }
                  }
                },
                required: ["is_valid"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_architectural_plan" } }
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Payment required." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      if (response.status === 400) {
        return new Response(JSON.stringify({
          is_valid: false,
          rejection_reason: "La imagen no pudo ser procesada. Asegúrate de que sea una imagen válida de un plano arquitectónico.",
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data));

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("validate-architectural-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
