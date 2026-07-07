const DEFAULT_MODEL = "gpt-4-turbo";
const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({ error: "AI extraction is not configured. Add OPENAI_API_KEY as a Cloudflare Pages secret." }, 500);
  }

  const formData = await request.formData();
  const file = formData.get("pdf");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: "Upload a PDF or photo of the bill." }, 400);
  }

  if (file.size > 50 * 1024 * 1024) {
    return jsonResponse({ error: "File is larger than the 50 MB limit." }, 400);
  }

  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;
  const mime = file.type || "application/pdf";
  const isImage = mime.startsWith("image/");

  // Prepare the content for the API call
  let imageContent;
  if (isImage) {
    imageContent = {
      type: "image_url",
      image_url: {
        url: `data:${mime};base64,${base64}`,
        detail: "high"
      }
    };
  } else {
    // For PDFs, use base64 directly with pdf_url format
    imageContent = {
      type: "image_url",
      image_url: {
        url: `data:${mime};base64,${base64}`,
        detail: "high"
      }
    };
  }

  const prompt = `Extract bill payment details from this document or photo. Return ONLY a JSON object with these fields:
{
  "biller": "string (company/person name)",
  "amount_due": number (numeric amount, 0 if not found),
  "due_date": "YYYY-MM-DD format, empty string if not found",
  "invoice_number": "string or empty",
  "reference": "string or empty",
  "notes": "string - any other relevant details found",
  "confidence": 0 to 1 (how confident you are in the extraction)
}
Return ONLY valid JSON, no markdown or extra text.`;

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: "user",
          content: [imageContent, { type: "text", text: prompt }]
        }
      ],
      max_tokens: 500,
      temperature: 0
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    return jsonResponse({ error: payload?.error?.message || "OpenAI extraction failed." }, response.status);
  }

  // Extract JSON from the response
  const text = payload?.choices?.[0]?.message?.content || "";
  const parsed = safeJson(text);
  
  if (!parsed) {
    return jsonResponse({ error: "OpenAI did not return valid bill JSON." }, 502);
  }

  return jsonResponse({
    biller: parsed.biller || "",
    amountDue: Number(parsed.amount_due || 0),
    dueDate: parsed.due_date || "",
    invoiceNumber: parsed.invoice_number || "",
    reference: parsed.reference || "",
    notes: parsed.notes || "",
    confidence: Number(parsed.confidence || 0)
  });
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders
  });
}
