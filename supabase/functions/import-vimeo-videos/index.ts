import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface VimeoVideo {
  uri: string;
  name: string;
  duration: number;
  link: string;
  player_embed_url: string;
  pictures?: { sizes?: { link: string }[] };
}

interface ImportRequest {
  folderId: string;
  subjectId: string;
  courseId: string;
  startOrderIndex?: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const vimeoToken = Deno.env.get("VIMEO_ACCESS_TOKEN");

    if (!vimeoToken) {
      throw new Error("VIMEO_ACCESS_TOKEN is required");
    }

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No authorization header");
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      throw new Error("Invalid token");
    }

    const userId = claimsData.claims.sub;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleError || roleData?.role !== "admin") {
      throw new Error("Unauthorized: Only admins can import videos");
    }

    const { folderId, subjectId, courseId, startOrderIndex = 0 }: ImportRequest = await req.json();

    if (!folderId || !subjectId || !courseId) {
      throw new Error("folderId, subjectId, and courseId are required");
    }

    console.log(`Fetching videos from Vimeo folder: ${folderId}`);

    // Fetch all videos from the folder with pagination
    const allVideos: VimeoVideo[] = [];
    let nextUrl: string | null = `https://api.vimeo.com/me/projects/${folderId}/videos?per_page=100&sort=alphabetical&direction=asc&fields=uri,name,duration,link,player_embed_url`;

    while (nextUrl) {
      console.log(`Fetching from Vimeo: ${nextUrl}`);

      const vimeoResponse = await fetch(nextUrl, {
        headers: {
          "Authorization": `Bearer ${vimeoToken}`,
          "Accept": "application/vnd.vimeo.*+json;version=3.4",
        },
      });

      if (!vimeoResponse.ok) {
        const errorText = await vimeoResponse.text();
        console.error("Vimeo API error:", errorText);
        throw new Error(`Failed to fetch videos from Vimeo: ${vimeoResponse.status} - ${errorText}`);
      }

      const vimeoData = await vimeoResponse.json();
      const pageVideos: VimeoVideo[] = vimeoData.data || [];

      console.log(`Found ${pageVideos.length} videos on this page (total so far: ${allVideos.length + pageVideos.length})`);

      allVideos.push(...pageVideos);

      // Check for next page
      nextUrl = vimeoData.paging?.next
        ? `https://api.vimeo.com${vimeoData.paging.next}`
        : null;
    }

    console.log(`Total videos fetched: ${allVideos.length}`);

    if (allVideos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum vídeo encontrado na pasta",
          imported: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Extract video ID from URI and build embed URL
    const lessonsToInsert = allVideos.map((video, index) => {
      const videoId = video.uri.split("/").pop();
      const minutes = Math.floor(video.duration / 60);
      const seconds = video.duration % 60;

      return {
        title: video.name,
        description: `Duração: ${minutes}min ${seconds}s`,
        video_url: `https://player.vimeo.com/video/${videoId}`,
        course_id: courseId,
        subject_id: subjectId,
        order_index: startOrderIndex + index,
        is_active: true,
        release_after_days: 0,
      };
    });

    const { data: insertedLessons, error: insertError } = await supabase
      .from("lessons")
      .insert(lessonsToInsert)
      .select();

    if (insertError) {
      console.error("Error inserting lessons:", insertError);
      throw new Error("Failed to insert lessons");
    }

    console.log(`Successfully imported ${insertedLessons.length} lessons from Vimeo`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${insertedLessons.length} aulas importadas do Vimeo com sucesso!`,
        imported: insertedLessons.length,
        lessons: insertedLessons,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error importing Vimeo videos:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
