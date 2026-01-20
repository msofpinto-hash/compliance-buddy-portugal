import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// VIES SOAP API endpoint
const VIES_URL = "https://ec.europa.eu/taxation_customs/vies/services/checkVatService";

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { nipc } = await req.json();

    if (!nipc) {
      return new Response(
        JSON.stringify({ error: "NIPC é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean NIPC - remove spaces and non-numeric chars
    const cleanNipc = nipc.replace(/\D/g, '');

    if (cleanNipc.length !== 9) {
      return new Response(
        JSON.stringify({ error: "NIPC deve ter 9 dígitos" }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Looking up NIPC: ${cleanNipc}`);

    // Build SOAP request for VIES
    const soapRequest = `<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:urn="urn:ec.europa.eu:taxud:vies:services:checkVat:types">
   <soapenv:Header/>
   <soapenv:Body>
      <urn:checkVat>
         <urn:countryCode>PT</urn:countryCode>
         <urn:vatNumber>${cleanNipc}</urn:vatNumber>
      </urn:checkVat>
   </soapenv:Body>
</soapenv:Envelope>`;

    const response = await fetch(VIES_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml;charset=UTF-8',
        'SOAPAction': '',
      },
      body: soapRequest,
    });

    const responseText = await response.text();
    console.log("VIES Response:", responseText);

    // Parse the SOAP response
    const validMatch = responseText.match(/<valid>(\w+)<\/valid>/);
    const nameMatch = responseText.match(/<name>([^<]*)<\/name>/);
    const addressMatch = responseText.match(/<address>([^<]*)<\/address>/);

    const isValid = validMatch ? validMatch[1].toLowerCase() === 'true' : false;
    const name = nameMatch ? nameMatch[1].trim() : null;
    const address = addressMatch ? addressMatch[1].trim() : null;

    // Check for SOAP fault
    if (responseText.includes('soap:Fault') || responseText.includes('INVALID_INPUT')) {
      const faultMatch = responseText.match(/<faultstring>([^<]*)<\/faultstring>/);
      const faultMessage = faultMatch ? faultMatch[1] : 'Erro desconhecido';
      
      console.log("VIES Fault:", faultMessage);
      
      return new Response(
        JSON.stringify({ 
          valid: false, 
          error: `VIES: ${faultMessage}`,
          nipc: cleanNipc 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!isValid) {
      return new Response(
        JSON.stringify({ 
          valid: false, 
          message: "NIPC não encontrado no sistema VIES",
          nipc: cleanNipc 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format the address - VIES returns addresses with newlines
    // Improve formatting: normalize spaces, clean up line breaks, capitalize properly
    let formattedAddress = null;
    if (address) {
      formattedAddress = address
        // Decode HTML entities
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        // Clean up whitespace and newlines
        .replace(/\s+/g, ' ')
        .replace(/\n+/g, ', ')
        .replace(/,\s*,/g, ',')
        .replace(/\s*,\s*/g, ', ')
        // Remove trailing/leading commas
        .replace(/^,\s*/, '')
        .replace(/,\s*$/, '')
        .trim();
    }

    console.log(`Found: ${name} - ${formattedAddress}`);

    return new Response(
      JSON.stringify({
        valid: true,
        nipc: cleanNipc,
        name: name || null,
        address: formattedAddress || null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Erro desconhecido";
    console.error("Error in VIES lookup:", errorMessage);
    
    return new Response(
      JSON.stringify({ 
        error: "Erro ao consultar VIES. Tente novamente mais tarde.",
        details: errorMessage 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
