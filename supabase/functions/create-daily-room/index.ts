import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { gameId } = await req.json()

    if (!gameId) {
      return new Response(
        JSON.stringify({ error: 'gameId is required' }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const DAILY_API_KEY = Deno.env.get('DAILY_API_KEY')

    if (!DAILY_API_KEY) {
      return new Response(
        JSON.stringify({ error: 'Daily API key not configured' }),
        {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    const roomName = `headsup-${gameId}`;

    // First, try to get existing room
    const checkResponse = await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      }
    });

    // If room exists and is not expired, return it
    if (checkResponse.ok) {
      const existingRoom = await checkResponse.json();
      const now = Math.floor(Date.now() / 1000);

      // Check if room is still valid (not expired)
      if (!existingRoom.config?.exp || existingRoom.config.exp > now) {
        console.log('Reusing existing room:', roomName);
        return new Response(
          JSON.stringify({ url: existingRoom.url }),
          {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          }
        );
      } else {
        // Room expired, delete it first
        console.log('Deleting expired room:', roomName);
        await fetch(`https://api.daily.co/v1/rooms/${roomName}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${DAILY_API_KEY}`
          }
        });
      }
    }

    // Create new room
    console.log('Creating new room:', roomName);
    const response = await fetch('https://api.daily.co/v1/rooms', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${DAILY_API_KEY}`
      },
      body: JSON.stringify({
        name: roomName,
        privacy: 'public',
        properties: {
          enable_chat: false,
          enable_screenshare: false,
          enable_recording: false,
          max_participants: 2, // Heads-up game only
          exp: Math.floor(Date.now() / 1000) + 7200 // 2 hours (reduced from 4)
        }
      })
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Failed to create room:', data);
      return new Response(
        JSON.stringify({ error: data.error || 'Failed to create room' }),
        {
          status: response.status,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    return new Response(
      JSON.stringify({ url: data.url }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    )
  }
})
