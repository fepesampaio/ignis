import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface BunnyVideo {
  guid: string;
  title: string;
  length: number;
  status: number;
  views: number;
  dateUploaded: string;
  thumbnailFileName: string;
}

interface ImportRequest {
  collectionId: string;
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
    const bunnyApiKey = Deno.env.get("BUNNY_API_KEY");
    const bunnyLibraryId = Deno.env.get("BUNNY_LIBRARY_ID");

    if (!bunnyApiKey || !bunnyLibraryId) {
      throw new Error("BUNNY_API_KEY and BUNNY_LIBRARY_ID are required");
    }

    // Verify the requesting user is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      throw new Error("No authorization header");
    }

    // Create client with user's auth context for getClaims
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await supabaseAuth.auth.getClaims(token);
    if (claimsError || !claimsData?.claims) {
      throw new Error("Invalid token");
    }

    const userId = claimsData.claims.sub;

    // Service role client for database operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if requesting user is admin
    const { data: roleData, error: roleError } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (roleError || roleData?.role !== "admin") {
      throw new Error("Unauthorized: Only admins can import videos");
    }

    const { collectionId, subjectId, courseId, startOrderIndex = 0 }: ImportRequest = await req.json();

    if (!collectionId || !subjectId || !courseId) {
      throw new Error("collectionId, subjectId, and courseId are required");
    }

    console.log(`Fetching videos from Bunny collection: ${collectionId}`);

    // Fetch all videos with pagination
    const allVideos: BunnyVideo[] = [];
    let currentPage = 1;
    let totalItems = 0;
    const itemsPerPage = 100;

    do {
      console.log(`Fetching page ${currentPage} from Bunny...`);
      
      const bunnyResponse = await fetch(
        `https://video.bunnycdn.com/library/${bunnyLibraryId}/videos?collection=${collectionId}&page=${currentPage}&itemsPerPage=${itemsPerPage}&orderBy=date`,
        {
          headers: {
            "AccessKey": bunnyApiKey,
            "Accept": "application/json",
          },
        }
      );

      if (!bunnyResponse.ok) {
        const errorText = await bunnyResponse.text();
        console.error("Bunny API error:", errorText);
        throw new Error(`Failed to fetch videos from Bunny: ${bunnyResponse.status}`);
      }

      const bunnyData = await bunnyResponse.json();
      const pageVideos: BunnyVideo[] = bunnyData.items || [];
      totalItems = bunnyData.totalItems || 0;
      
      console.log(`Page ${currentPage}: Found ${pageVideos.length} videos (total: ${totalItems})`);
      
      allVideos.push(...pageVideos);
      currentPage++;
      
    } while (allVideos.length < totalItems);

    console.log(`Total videos fetched: ${allVideos.length}`);

    if (allVideos.length === 0) {
      return new Response(
        JSON.stringify({
          success: true,
          message: "Nenhum vídeo encontrado na collection",
          imported: 0,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sort videos by title to maintain order
    allVideos.sort((a, b) => a.title.localeCompare(b.title, 'pt-BR', { numeric: true }));

    // Create lessons for each video
    const lessonsToInsert = allVideos.map((video, index) => ({
      title: video.title,
      description: `Duração: ${Math.floor(video.length / 60)}min ${video.length % 60}s`,
      video_url: `https://iframe.mediadelivery.net/embed/${bunnyLibraryId}/${video.guid}?autoplay=false`,
      course_id: courseId,
      subject_id: subjectId,
      order_index: startOrderIndex + index,
      is_active: true,
      release_after_days: 0,
    }));

    const { data: insertedLessons, error: insertError } = await supabase
      .from("lessons")
      .insert(lessonsToInsert)
      .select();

    if (insertError) {
      console.error("Error inserting lessons:", insertError);
      throw new Error("Failed to insert lessons");
    }

    console.log(`Successfully imported ${insertedLessons.length} lessons`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `${insertedLessons.length} aulas importadas com sucesso!`,
        imported: insertedLessons.length,
        lessons: insertedLessons,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Error importing videos:", error);
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
