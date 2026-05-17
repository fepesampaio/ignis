import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.93.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Find ungraded submissions that are exactly 5 days old (between 5 and 6 days)
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);
    const sixDaysAgo = new Date();
    sixDaysAgo.setDate(sixDaysAgo.getDate() - 6);

    const { data: submissions, error } = await supabase
      .from("assignment_submissions")
      .select("id, content, assignment_id, user_id")
      .is("graded_at", null)
      .lte("submitted_at", fiveDaysAgo.toISOString())
      .gte("submitted_at", sixDaysAgo.toISOString());

    if (error) throw error;
    if (!submissions || submissions.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhuma submissão pendente para correção automática", count: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) throw new Error("OPENROUTER_API_KEY not configured");

    let gradedCount = 0;

    for (const sub of submissions) {
      try {
        // Call evaluate-paper logic inline
        const plainText = sub.content.replace(/<[^>]*>/g, "").trim();
        const wordCount = plainText.split(/\s+/).filter(Boolean).length;

        let score: number;
        let feedback: string;

        if (wordCount < 500 || wordCount > 1000) {
          score = 0;
          feedback =
            wordCount < 500
              ? `Trabalho rejeitado automaticamente: apenas ${wordCount} palavras (mínimo: 500). Reenvie com maior desenvolvimento.`
              : `Trabalho rejeitado automaticamente: ${wordCount} palavras (máximo: 1000). Reenvie de forma mais concisa.`;
        } else {
          const systemPrompt = `Você é um professor universitário brasileiro. Avalie o trabalho acadêmico nos critérios: Clareza (30%), Análise Crítica (40%), Gramática (20%), Originalidade (10%). Dê notas de 0 a 10 e um feedback curto (1-2 frases), informal e construtivo. Nunca cite trechos do texto. IMPORTANTE: é normal o trabalho abordar até três temas diferentes — não penalize por isso nem trate como fuga ao tema ou dispersão.`;

          const response = await fetch(
            "https://openrouter.ai/api/v1/chat/completions",
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${OPENROUTER_API_KEY}`,
                "Content-Type": "application/json",
                "HTTP-Referer": "https://fteosxivqodhnaikesht.supabase.co",
                "X-Title": "Plataforma Ignis Auto Grading",
              },
              body: JSON.stringify({
                model: "openai/gpt-oss-120b:free",
                messages: [
                  { role: "system", content: systemPrompt },
                  { role: "user", content: `Avalie:\n\n${plainText}` },
                ],
                tools: [
                  {
                    type: "function",
                    function: {
                      name: "submit_evaluation",
                      description: "Submete avaliação estruturada.",
                      parameters: {
                        type: "object",
                        properties: {
                          clareza: { type: "number" },
                          analise: { type: "number" },
                          gramatica: { type: "number" },
                          originalidade: { type: "number" },
                          feedback: { type: "string" },
                        },
                        required: ["clareza", "analise", "gramatica", "originalidade", "feedback"],
                        additionalProperties: false,
                      },
                    },
                  },
                ],
                tool_choice: { type: "function", function: { name: "submit_evaluation" } },
              }),
            }
          );

          if (!response.ok) {
            console.error(`AI error for submission ${sub.id}: ${response.status}`);
            continue;
          }

          const data = await response.json();
          const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
          if (!toolCall) {
            console.error(`No tool call for submission ${sub.id}`);
            continue;
          }

          const evaluation = JSON.parse(toolCall.function.arguments);
          const clamp = (v: number) => Math.max(0, Math.min(10, Number(v) || 0));
          const c = clamp(evaluation.clareza);
          const a = clamp(evaluation.analise);
          const g = clamp(evaluation.gramatica);
          const o = clamp(evaluation.originalidade);

          // Convert weighted 0-10 score to assignment max_score scale
          const { data: assignment } = await supabase
            .from("assignments")
            .select("max_score")
            .eq("id", sub.assignment_id)
            .single();

          const notaFinal = c * 0.3 + a * 0.4 + g * 0.2 + o * 0.1;
          const maxScore = assignment?.max_score || 100;
          score = Number(((notaFinal / 10) * maxScore).toFixed(2));
          feedback = evaluation.feedback;
        }

        const { error: updateError } = await supabase
          .from("assignment_submissions")
          .update({
            score,
            feedback,
            graded_at: new Date().toISOString(),
            graded_by: null, // null indicates auto-graded
          })
          .eq("id", sub.id);

        if (updateError) {
          console.error(`Update error for ${sub.id}:`, updateError);
          continue;
        }

        gradedCount++;

        // Small delay to avoid rate limits
        await new Promise((r) => setTimeout(r, 2000));
      } catch (innerErr) {
        console.error(`Error grading ${sub.id}:`, innerErr);
      }
    }

    return new Response(
      JSON.stringify({ message: `${gradedCount} trabalhos corrigidos automaticamente`, count: gradedCount }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("auto-grade error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
