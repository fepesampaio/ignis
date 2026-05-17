import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function countWords(text: string): number {
  const clean = text.replace(/<[^>]*>/g, "").trim();
  if (!clean) return 0;
  return clean.split(/\s+/).filter(Boolean).length;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { text } = await req.json();
    if (!text || typeof text !== "string") {
      return new Response(
        JSON.stringify({ error: "Campo 'text' é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const wordCount = countWords(text);
    if (wordCount < 500 || wordCount > 1000) {
      return new Response(
        JSON.stringify({
          error: "word_count_invalid",
          wordCount,
          rejectionFeedback:
            wordCount < 500
              ? `O trabalho possui apenas ${wordCount} palavras. O mínimo exigido é de 500 palavras. Por favor, revise e reenvie o trabalho com maior desenvolvimento dos argumentos.`
              : `O trabalho possui ${wordCount} palavras, excedendo o limite máximo de 1000 palavras. Por favor, revise e sintetize o conteúdo.`,
        }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OPENROUTER_API_KEY = Deno.env.get("OPENROUTER_API_KEY");
    if (!OPENROUTER_API_KEY) {
      throw new Error("OPENROUTER_API_KEY is not configured");
    }

    const plainText = text.replace(/<[^>]*>/g, "").trim();

    const systemPrompt = `Você é um professor universitário brasileiro. Avalie o trabalho acadêmico do aluno nos seguintes critérios, atribuindo uma nota de 0 a 10 para cada um:

- Clareza (peso 30%): organização das ideias, coesão textual, facilidade de compreensão.
- Análise Crítica (peso 40%): profundidade da argumentação, uso de referências, capacidade de reflexão.
- Gramática (peso 20%): correção ortográfica, concordância, pontuação.
- Originalidade (peso 10%): criatividade, abordagem diferenciada do tema.

IMPORTANTE: É perfeitamente normal e esperado que o trabalho aborde até três temas ou tópicos diferentes dentro da mesma proposta. NÃO penalize o aluno por isso, nem considere como falta de foco, dispersão ou fuga ao tema. Trate a abordagem multitemática como característica válida do trabalho acadêmico.

Dê também um feedback curto (1–2 frases), em linguagem informal e amigável. 
- Se o trabalho for bom, elogie naturalmente sem exageros.
- Se precisar de melhoria, sugira de forma construtiva.
- NUNCA cite trechos do texto do aluno.
- NUNCA use frases genéricas como "bom trabalho" ou "precisa melhorar".
- Seja específico no feedback.`;

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://fteosxivqodhnaikesht.supabase.co",
          "X-Title": "Plataforma Ignis AI Evaluation",
        },
        body: JSON.stringify({
          model: "openai/gpt-oss-120b:free",
          messages: [
            { role: "system", content: systemPrompt },
            {
              role: "user",
              content: `Avalie o seguinte trabalho acadêmico:\n\n${plainText}`,
            },
          ],
          tools: [
            {
              type: "function",
              function: {
                name: "submit_evaluation",
                description:
                  "Submete a avaliação estruturada do trabalho acadêmico.",
                parameters: {
                  type: "object",
                  properties: {
                    clareza: {
                      type: "number",
                      description: "Nota de 0 a 10 para Clareza",
                    },
                    analise: {
                      type: "number",
                      description: "Nota de 0 a 10 para Análise Crítica",
                    },
                    gramatica: {
                      type: "number",
                      description: "Nota de 0 a 10 para Gramática",
                    },
                    originalidade: {
                      type: "number",
                      description: "Nota de 0 a 10 para Originalidade",
                    },
                    feedback: {
                      type: "string",
                      description:
                        "Feedback curto (1-2 frases) informal e construtivo",
                    },
                  },
                  required: [
                    "clareza",
                    "analise",
                    "gramatica",
                    "originalidade",
                    "feedback",
                  ],
                  additionalProperties: false,
                },
              },
            },
          ],
          tool_choice: {
            type: "function",
            function: { name: "submit_evaluation" },
          },
        }),
      }
    );

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns instantes." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de IA esgotados. Entre em contato com o administrador." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("Erro ao comunicar com a IA");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("IA não retornou avaliação estruturada");
    }

    const evaluation = JSON.parse(toolCall.function.arguments);

    const clamp = (v: number) => Math.max(0, Math.min(10, Number(v) || 0));
    const clareza = clamp(evaluation.clareza);
    const analise = clamp(evaluation.analise);
    const gramatica = clamp(evaluation.gramatica);
    const originalidade = clamp(evaluation.originalidade);

    const notaFinal = Number(
      (clareza * 0.3 + analise * 0.4 + gramatica * 0.2 + originalidade * 0.1).toFixed(2)
    );
    const situacao = notaFinal >= 7 ? "Aprovado" : "Reprovado";

    return new Response(
      JSON.stringify({
        wordCount,
        clareza,
        analise,
        gramatica,
        originalidade,
        notaFinal,
        situacao,
        feedback: evaluation.feedback,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("evaluate-paper error:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Erro desconhecido",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
