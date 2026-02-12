import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const FROM_EMAIL = Deno.env.get("FROM_EMAIL") || "notifications@yourdomain.com";

const ALLOWED_ORIGIN = Deno.env.get("ALLOWED_ORIGIN") || "https://headsup-network.vercel.app";

const corsHeaders = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { recipientId, senderFirstName, senderLastName } = await req.json();

    if (!recipientId || !senderFirstName || !senderLastName) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sanitize sender names to prevent HTML injection in email
    const escapeHtml = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
    const safeSenderFirst = escapeHtml(String(senderFirstName).slice(0, 50));
    const safeSenderLast = escapeHtml(String(senderLastName).slice(0, 50));

    // Get recipient's email from profiles table
    const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
    
    const { data: recipient, error: fetchError } = await supabase
      .from("profiles")
      .select("email, first_name")
      .eq("id", recipientId)
      .single();

    if (fetchError || !recipient?.email) {
      return new Response(
        JSON.stringify({ error: "Recipient not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Send email via SendGrid
    const emailResponse = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
      },
      body: JSON.stringify({
        personalizations: [
          {
            to: [{ email: recipient.email }],
          },
        ],
        from: {
          email: FROM_EMAIL,
          name: "HeadsUp",
        },
        subject: `${safeSenderFirst} ${safeSenderLast} wants to connect on HeadsUp!`,
        content: [
          {
            type: "text/html",
            value: `
              <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                <h2 style="color: #000; margin-bottom: 24px;">New Connection Request</h2>
                <p style="font-size: 16px; color: #333;">Hi ${recipient.first_name},</p>
                <p style="font-size: 16px; color: #333;">
                  <strong>${safeSenderFirst} ${safeSenderLast}</strong> would like to connect with you on HeadsUp!
                </p>
                <p style="font-size: 16px; color: #333;">
                  Log in to accept their invitation and start networking through poker.
                </p>
                <a href="https://headsup-network.vercel.app" 
                   style="display: inline-block; background: #000; color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 8px; margin-top: 20px; font-weight: bold;">
                  View Request
                </a>
                <p style="margin-top: 32px; color: #888; font-size: 14px;">
                  — The HeadsUp Team
                </p>
              </div>
            `,
          },
        ],
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("SendGrid error: status", emailResponse.status);
      return new Response(
        JSON.stringify({ error: "Failed to send email" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error:", error);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});