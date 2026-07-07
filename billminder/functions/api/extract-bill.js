const DEFAULT_MODEL = "gpt-4.1-mini";
const MAX_FILE_BYTES = 50 * 1024 * 1024;

const jsonHeaders = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store"
};

const BILL_SCHEMA = {
  type: "object",
  properties: {
    biller: {
      type: "string",
      description: "The company, organisation, council, insurer, landlord, or person issuing the bill."
    },
    amount_due: {
      type: "number",
      description: "The current total amount that must be paid for this bill. Use 0 only when no amount due can be identified."
    },
    due_date: {
      type: "string",
      description: "The payment due date in YYYY-MM-DD format, or an empty string when no due date is present."
    },
    invoice_number: {
      type: "string",
      description: "Invoice or bill number, or an empty string when not present."
    },
    reference: {
      type: "string",
      description: "The most useful payment/account reference such as BPAY reference, customer reference, account number, or invoice reference."
    },
    category: {
      type: "string",
      enum: [
        "utilities",
        "utilities_water",
        "utilities_gas",
        "telecom",
        "insurance",
        "subscriptions",
        "housing",
        "health",
        "other"
      ]
    },
    notes: {
      type: "string",
      description: "Short useful context only, such as billing period, direct-debit status, or ambiguity."
    },
    confidence: {
      type: "number",
      description: "Overall extraction confidence from 0 to 1."
    }
  },
  required: [
    "biller",
    "amount_due",
    "due_date",
    "invoice_number",
    "reference",
    "category",
    "notes",
    "confidence"
  ],
  additionalProperties: false
};

export async function onRequestPost({ request, env }) {
  if (!env.OPENAI_API_KEY) {
    return jsonResponse({
      error: "AI extraction is not configured. Add OPENAI_API_KEY as a Cloudflare Pages secret and redeploy."
    }, 500);
  }

  let formData;
  try {
    formData = await request.formData();
  } catch {
    return jsonResponse({ error: "The upload could not be read." }, 400);
  }

  const file = formData.get("pdf") || formData.get("file");
  if (!file || typeof file.arrayBuffer !== "function") {
    return jsonResponse({ error: "Upload a PDF or photo of the bill." }, 400);
  }

  if (!file.size) {
    return jsonResponse({ error: "The uploaded file is empty." }, 400);
  }

  if (file.size > MAX_FILE_BYTES) {
    return jsonResponse({ error: "File is larger than the 50 MB limit." }, 400);
  }

  const mime = String(file.type || "").toLowerCase();
  const fileName = sanitizeFilename(file.name || (mime.startsWith("image/") ? "bill-image" : "bill.pdf"));
  const isImage = mime.startsWith("image/");
  const isPdf = mime === "application/pdf" || /\.pdf$/i.test(fileName);

  if (!isImage && !isPdf) {
    return jsonResponse({ error: "Only PDF files and bill photos are supported." }, 400);
  }

  const bytes = await file.arrayBuffer();
  const base64 = arrayBufferToBase64(bytes);
  const model = env.OPENAI_MODEL || DEFAULT_MODEL;

  const documentInput = isPdf
    ? {
        type: "input_file",
        filename: fileName.endsWith(".pdf") ? fileName : `${fileName}.pdf`,
        file_data: `data:application/pdf;base64,${base64}`,
        detail: "high"
      }
    : {
        type: "input_image",
        image_url: `data:${mime || "image/jpeg"};base64,${base64}`,
        detail: "high"
      };

  const prompt = `Extract the payment details for the current bill shown in the attached document.

Rules:
- Identify the CURRENT amount due, not a previous balance, total annual cost, usage charge, credit, or minimum payment unless that is explicitly the only amount payable.
- Identify the CURRENT payment due date. Australian bills often use DD/MM/YYYY; convert the result to YYYY-MM-DD.
- For reference, prefer a BPAY reference or payment reference. Otherwise use customer reference, account number, or invoice number.
- If the bill is already fully paid or has a zero balance, amount_due may be 0 and explain that briefly in notes.
- Do not invent missing values. Use empty strings where the schema allows them.
- Keep notes short and factual.`;

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model,
      store: false,
      max_output_tokens: 800,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            documentInput
          ]
        }
      ],
      text: {
        format: {
          type: "json_schema",
          name: "bill_extraction",
          strict: true,
          schema: BILL_SCHEMA
        }
      }
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const message = payload?.error?.message || `OpenAI extraction failed with status ${response.status}.`;
    return jsonResponse({ error: message }, response.status);
  }

  const text = extractResponseText(payload);
  const parsed = safeJson(text);

  if (!parsed) {
    return jsonResponse({ error: "OpenAI returned a response, but it did not contain valid bill data." }, 502);
  }

  return jsonResponse({
    biller: stringValue(parsed.biller),
    amountDue: numberValue(parsed.amount_due),
    dueDate: normalizeIsoDate(parsed.due_date),
    invoiceNumber: stringValue(parsed.invoice_number),
    reference: stringValue(parsed.reference),
    category: stringValue(parsed.category) || "other",
    notes: stringValue(parsed.notes),
    confidence: clamp(numberValue(parsed.confidence), 0, 1)
  });
}

function extractResponseText(payload) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }

  for (const item of payload?.output || []) {
    if (item?.type !== "message") continue;
    for (const part of item.content || []) {
      if (part?.type === "output_text" && typeof part.text === "string") {
        return part.text.trim();
      }
    }
  }

  return "";
}

function safeJson(value) {
  if (!value) return null;
  const cleaned = String(value)
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    try {
      return JSON.parse(cleaned.slice(start, end + 1));
    } catch {
      return null;
    }
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

function sanitizeFilename(value) {
  return String(value || "bill.pdf")
    .replace(/[\\/:*?"<>|\u0000-\u001F]/g, "-")
    .slice(0, 160) || "bill.pdf";
}

function stringValue(value) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function normalizeIsoDate(value) {
  const text = stringValue(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : "";
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: jsonHeaders
  });
}
