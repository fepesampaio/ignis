import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.2";
import { JWT } from "npm:google-auth-library@9.15.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type PushPayload = {
  notificationId?: string;
  userId?: string;
  title?: string;
  message?: string;
  type?: string;
  route?: string;
  relatedId?: string | null;
  relatedType?: string | null;
};

const firebaseServiceAccount = {
  project_id: Deno.env.get("FIREBASE_PROJECT_ID") ?? "",
  client_email: Deno.env.get("FIREBASE_CLIENT_EMAIL") ?? "",
  private_key: (() => {
    const base64Value = Deno.env.get("FIREBASE_PRIVATE_KEY_BASE64");
    if (base64Value) {
      return new TextDecoder().decode(
        Uint8Array.from(atob(base64Value.replace(/\s+/g, "")), (c) => c.charCodeAt(0)),
      );
    }

    return (Deno.env.get("FIREBASE_PRIVATE_KEY") ?? "")
      .replace(/^['"]|['"]$/g, "")
      .replace(/\\n/g, "\n");
  })(),
};

const getAccessToken = async () => {
  if (!firebaseServiceAccount) {
    throw new Error("Firebase service account not configured");
  }

  if (
    !firebaseServiceAccount.project_id ||
    !firebaseServiceAccount.client_email ||
    !firebaseServiceAccount.private_key
  ) {
    throw new Error("Missing FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL or FIREBASE_PRIVATE_KEY");
  }

  const client = new JWT({
    email: firebaseServiceAccount.client_email,
    key: firebaseServiceAccount.private_key,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const { access_token } = await client.authorize();
  if (!access_token) {
    throw new Error("Failed to obtain Firebase access token");
  }

  return access_token;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const payload = (await req.json()) as PushPayload;

    if (!payload.userId || !payload.title || !payload.message) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required payload fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const { data: tokens, error: tokenError } = await supabase
      .from("device_push_tokens")
      .select("id, push_token")
      .eq("user_id", payload.userId)
      .eq("is_active", true);

    if (tokenError) throw tokenError;
    if (!tokens?.length) {
      return new Response(
        JSON.stringify({ success: true, sent: 0, reason: "No active push tokens" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const accessToken = await getAccessToken();
    const endpoint = `https://fcm.googleapis.com/v1/projects/${firebaseServiceAccount.project_id}/messages:send`;

    let sent = 0;
    let disabled = 0;

    for (const token of tokens) {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: {
            token: token.push_token,
            notification: {
              title: payload.title,
              body: payload.message,
            },
            data: {
              notificationId: payload.notificationId ?? "",
              route: payload.route ?? "/notifications",
              type: payload.type ?? "",
              relatedId: payload.relatedId ?? "",
              relatedType: payload.relatedType ?? "",
            },
            android: {
              priority: "high",
              notification: {
                channel_id: "default",
                default_sound: true,
              },
            },
          },
        }),
      });

      if (response.ok) {
        sent += 1;
        continue;
      }

      const errorData = await response.json().catch(() => null);
      const errorCode = errorData?.error?.details?.[0]?.errorCode ?? errorData?.error?.status;

      if (errorCode === "UNREGISTERED" || errorCode === "INVALID_ARGUMENT") {
        await supabase
          .from("device_push_tokens")
          .update({ is_active: false, updated_at: new Date().toISOString() })
          .eq("id", token.id);
        disabled += 1;
      }
    }

    return new Response(
      JSON.stringify({ success: true, sent, disabled }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (error) {
    console.error("dispatch-notification-push error:", error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
