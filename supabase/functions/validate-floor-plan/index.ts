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
            content: `You are an image analysis assistant for a real estate platform. You analyze floor plan images (planos de ubicación) of apartment buildings.

Your task:
1. Determine if the image is a valid floor plan showing apartment/unit layouts with numbered units.
2. If valid, extract the unit numbers and their approximate polygon regions as percentage coordinates (0-100) relative to the image dimensions.
3. IMPORTANT: Unit numbers must use zero-padded 2-digit format for numeric values (e.g., "01", "02", "03" instead of "1", "2", "3"). Alphanumeric unit numbers like "PH" should remain as-is.

IMPORTANT: Return your analysis using the provided tool.`
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Analyze this floor plan image. Determine if it's a valid floor plan showing numbered apartment units. If valid, extract each unit number and its bounding polygon coordinates as percentages (0-100) of image width/height. The polygon should outline each unit area."
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
              name: "analyze_floor_plan",
              description: "Return the analysis of a floor plan image",
              parameters: {
                type: "object",
                properties: {
                  is_valid: {
                    type: "boolean",
                    description: "Whether the image is a valid floor plan with numbered units"
                  },
                  rejection_reason: {
                    type: "string",
                    description: "If not valid, explain why"
                  },
                  units: {
                    type: "array",
                    description: "Array of detected units with their regions",
                    items: {
                      type: "object",
                      properties: {
                        unit_number: {
                          type: "string",
                          description: "The unit/apartment number shown in the plan. Use zero-padded 2-digit format for numeric values (e.g., '01', '02'). Alphanumeric like 'PH' stays as-is."
                        },
                        polygon: {
                          type: "array",
                          description: "Array of [x, y] percentage coordinates forming the polygon boundary of this unit",
                          items: {
                            type: "array",
                            items: { type: "number" }
                          }
                        }
                      },
                      required: ["unit_number", "polygon"]
                    }
                  }
                },
                required: ["is_valid"],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "analyze_floor_plan" } }
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
      // For 400 errors (e.g. image not processable), return as invalid instead of throwing
      if (response.status === 400) {
        return new Response(JSON.stringify({
          is_valid: false,
          rejection_reason: "La imagen no pudo ser procesada. Asegúrate de que sea una imagen válida de un plano de ubicación.",
          units: [],
        }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log("AI response:", JSON.stringify(data));

    // Extract tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call in AI response");
    }

    const result = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("validate-floor-plan error:", e);
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
