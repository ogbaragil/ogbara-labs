const DEFAULT_SUPABASE_URL =
  "https://qfjudxzxyvqraogwskwc.supabase.co";

export default {
  /**
   * Runs automatically from the Cloudflare Cron Trigger.
   */
  async scheduled(controller, env, ctx) {
    const runDate = new Date(
      controller.scheduledTime || Date.now()
    );

    ctx.waitUntil(runReminders(env, runDate));
  },

  /**
   * Allows manual testing at:
   *
   * https://YOUR-WORKER.workers.dev/run-reminders
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/") {
      return jsonResponse({
        ok: true,
        service: "Cleared reminder worker",
        timestamp: new Date().toISOString()
      });
    }

    if (url.pathname !== "/run-reminders") {
      return jsonResponse(
        {
          error: "Not found."
        },
        404
      );
    }

    /**
     * Optional protection for manual runs.
     *
     * If REMINDER_CRON_SECRET exists in Cloudflare,
     * the request must contain:
     *
     * Authorization: Bearer YOUR_SECRET
     */
    if (env.REMINDER_CRON_SECRET) {
      const expected =
        `Bearer ${env.REMINDER_CRON_SECRET}`;

      const received =
        request.headers.get("Authorization");

      if (received !== expected) {
        return jsonResponse(
          {
            error: "Unauthorized."
          },
          401
        );
      }
    }

    try {
      const result = await runReminders(
        env,
        new Date()
      );

      return jsonResponse(result);
    } catch (error) {
      console.error(
        "[Reminders] Manual run failed:",
        error
      );

      return jsonResponse(
        {
          ok: false,
          error:
            error?.message ||
            "Reminder run failed."
        },
        500
      );
    }
  }
};


/* ============================================================
   MAIN REMINDER PROCESS
   ============================================================ */

async function runReminders(env, runDate) {
  validateConfig(env);

  console.log(
    `[Reminders] Starting reminder run at ${runDate.toISOString()}`
  );

  /**
   * Find all users who have enabled email reminders.
   */
  const settings = await supabaseFetch(
    env,
    "/rest/v1/user_settings" +
      "?email_reminders=eq.true" +
      "&select=user_id,email,first_name,reminder_lead_days,timezone"
  ).then(readJsonResponse);

  console.log(
    `[Reminders] Found ${settings.length} user(s) with reminders enabled`
  );

  let sent = 0;
  let skipped = 0;

  const errors = [];

  for (const setting of settings) {
    try {
      const leadDays =
        Number(setting.reminder_lead_days || 0);

      const timezone =
        setting.timezone ||
        "Australia/Melbourne";

      const userLocalDate =
        localDateString(runDate, timezone);

      const targetDate =
        addDaysToDateString(
          userLocalDate,
          leadDays
        );

      console.log(
        [
          `[Reminders] Checking user: ${setting.email}`,
          `User ID: ${setting.user_id}`,
          `Timezone: ${timezone}`,
          `Today locally: ${userLocalDate}`,
          `Lead days: ${leadDays}`,
          `Looking for bills due: ${targetDate}`
        ].join(" | ")
      );

      const bills = await fetchDueBills(
        env,
        setting.user_id,
        targetDate
      );

      console.log(
        `[Reminders] ${setting.email}: found ${bills.length} eligible bill(s)`
      );

      for (const bill of bills) {
        const reminderKey =
          createReminderKey(
            setting.email,
            bill,
            leadDays
          );

        const existingReminderKeys =
          Array.isArray(bill.reminded_for)
            ? bill.reminded_for
            : [];

        if (
          existingReminderKeys.includes(
            reminderKey
          )
        ) {
          console.log(
            `[Reminders] Skipping ${bill.biller}: already sent to ${setting.email}`
          );

          skipped += 1;
          continue;
        }

        console.log(
          `[Reminders] Sending ${bill.biller} reminder to ${setting.email}`
        );

        /**
         * Mark first to reduce duplicate sends if the Worker
         * is retried unexpectedly.
         */
        await markBillReminded(
          env,
          bill,
          reminderKey
        );

        try {
          const resendResult =
            await sendReminderEmail(
              env,
              setting,
              bill,
              leadDays
            );

          sent += 1;

          console.log(
            `[Reminders] Email sent successfully. Resend ID: ${
              resendResult?.id || "unknown"
            }`
          );
        } catch (sendError) {
          /**
           * Email failed.
           *
           * Remove the reminder marker so the next Worker
           * run can retry.
           */
          await unmarkBillReminded(
            env,
            bill,
            reminderKey
          ).catch((rollbackError) => {
            console.error(
              "[Reminders] Could not roll back reminder marker:",
              rollbackError
            );
          });

          throw sendError;
        }
      }
    } catch (error) {
      console.error(
        `[Reminders] Error for ${setting.email}:`,
        error
      );

      errors.push({
        userId: setting.user_id,
        email: setting.email,
        message:
          error?.message ||
          "Reminder processing failed."
      });
    }
  }

  const result = {
    ok: errors.length === 0,
    runAt: runDate.toISOString(),
    usersChecked: settings.length,
    sent,
    skipped,
    errors
  };

  console.log(
    `[Reminders] Finished. Sent=${sent}, Skipped=${skipped}, Errors=${errors.length}`
  );

  return result;
}


/* ============================================================
   BILL LOOKUP
   ============================================================ */

async function fetchDueBills(
  env,
  userId,
  dueDate
) {
  /**
   * Check whether this person belongs to a shared household.
   */
  const householdId =
    await getUserHouseholdId(
      env,
      userId
    );

  let query;

  if (householdId) {
    /**
     * User is part of a shared household.
     *
     * Include:
     *
     * 1. Bills directly belonging to the user.
     * 2. Bills assigned to the shared household.
     *
     * IMPORTANT:
     * PostgREST OR syntax is:
     *
     * column.eq.value
     *
     * NOT:
     *
     * column=eq.value
     */
    const filter =
      `or=(` +
      `user_id.eq.${encodeURIComponent(userId)},` +
      `household_id.eq.${encodeURIComponent(householdId)}` +
      `)`;

    query =
      `/rest/v1/bills?${filter}` +
      `&status=eq.unpaid` +
      `&due_date=eq.${encodeURIComponent(dueDate)}` +
      `&select=*`;
  } else {
    /**
     * Single-user account.
     */
    query =
      `/rest/v1/bills` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&status=eq.unpaid` +
      `&due_date=eq.${encodeURIComponent(dueDate)}` +
      `&select=*`;
  }

  console.log(
    `[Reminders] Bill query: ${query}`
  );

  return supabaseFetch(
    env,
    query
  ).then(readJsonResponse);
}


async function getUserHouseholdId(
  env,
  userId
) {
  const query =
    `/rest/v1/household_members` +
    `?user_id=eq.${encodeURIComponent(userId)}` +
    `&select=household_id` +
    `&limit=1`;

  const response =
    await supabaseFetch(
      env,
      query
    );

  const rows =
    await readJsonResponse(response);

  return rows[0]?.household_id || null;
}


/* ============================================================
   SEND EMAIL THROUGH RESEND
   ============================================================ */

async function sendReminderEmail(
  env,
  setting,
  bill,
  leadDays
) {
  const to = String(
    setting.email || ""
  ).trim();

  if (!isEmail(to)) {
    throw new Error(
      `Invalid reminder email address: ${to}`
    );
  }

  /**
   * Optional testing restriction.
   *
   * Remove RESEND_ALLOWED_TO from Cloudflare once
   * unrestricted sending is wanted.
   */
  if (
    env.RESEND_ALLOWED_TO &&
    to.toLowerCase() !==
      env.RESEND_ALLOWED_TO
        .trim()
        .toLowerCase()
  ) {
    throw new Error(
      `Recipient ${to} is blocked by RESEND_ALLOWED_TO.`
    );
  }

  const dueText =
    leadDays === 0
      ? "due today"
      : leadDays === 1
        ? "due tomorrow"
        : `due in ${leadDays} days`;

  const amount =
    formatMoney(
      Number(bill.amount || 0)
    );

  const firstName =
    String(
      setting.first_name || ""
    ).trim();

  const greeting =
    firstName
      ? `Hi ${firstName},`
      : "Hi,";

  const subject =
    `${bill.biller} bill ${dueText}`;

  const textBody = [
    greeting,
    "",
    `Just a reminder that your ${bill.biller} bill is ${dueText}.`,
    "",
    `Amount: ${amount}`,
    `Due date: ${formatDateForEmail(bill.due_date)}`,
    bill.reference
      ? `Reference: ${bill.reference}`
      : "",
    "",
    "This reminder was sent by Cleared."
  ]
    .filter(
      (line) => line !== ""
    )
    .join("\n");

  const htmlBody = `
    <!doctype html>
    <html>
      <body
        style="
          margin:0;
          padding:0;
          background:#f5f5f3;
          font-family:Arial,Helvetica,sans-serif;
          color:#222222;
        "
      >
        <div
          style="
            max-width:560px;
            margin:0 auto;
            padding:32px 16px;
          "
        >
          <div
            style="
              background:#ffffff;
              border:1px solid #e7e7e3;
              border-radius:16px;
              padding:28px;
            "
          >
            <div
              style="
                font-size:13px;
                font-weight:700;
                letter-spacing:0.08em;
                text-transform:uppercase;
                margin-bottom:18px;
              "
            >
              Cleared
            </div>

            <p
              style="
                font-size:16px;
                line-height:1.6;
                margin:0 0 16px;
              "
            >
              ${escapeHtml(greeting)}
            </p>

            <h1
              style="
                font-size:24px;
                line-height:1.3;
                margin:0 0 12px;
              "
            >
              ${escapeHtml(bill.biller)} bill ${escapeHtml(dueText)}
            </h1>

            <p
              style="
                color:#666666;
                font-size:15px;
                line-height:1.6;
                margin:0 0 24px;
              "
            >
              Here is your upcoming bill reminder.
            </p>

            <div
              style="
                background:#f7f7f5;
                border-radius:12px;
                padding:18px;
              "
            >
              <p
                style="
                  margin:0 0 10px;
                  font-size:15px;
                "
              >
                <strong>Amount:</strong>
                ${escapeHtml(amount)}
              </p>

              <p
                style="
                  margin:0;
                  font-size:15px;
                "
              >
                <strong>Due date:</strong>
                ${escapeHtml(
                  formatDateForEmail(
                    bill.due_date
                  )
                )}
              </p>

              ${
                bill.reference
                  ? `
                    <p
                      style="
                        margin:10px 0 0;
                        font-size:15px;
                      "
                    >
                      <strong>Reference:</strong>
                      ${escapeHtml(
                        bill.reference
                      )}
                    </p>
                  `
                  : ""
              }
            </div>

            <p
              style="
                color:#888888;
                font-size:12px;
                line-height:1.5;
                margin:24px 0 0;
              "
            >
              This reminder was sent automatically by Cleared.
            </p>
          </div>
        </div>
      </body>
    </html>
  `;

  const response = await fetch(
    "https://api.resend.com/emails",
    {
      method: "POST",

      headers: {
        Authorization:
          `Bearer ${env.RESEND_API_KEY}`,

        "Content-Type":
          "application/json"
      },

      body: JSON.stringify({
        from:
          env.RESEND_FROM_EMAIL,

        to: [to],

        subject,

        text: textBody,

        html: htmlBody
      })
    }
  );

  const result =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    console.error(
      "[Reminders] Resend rejected email:",
      JSON.stringify(result)
    );

    throw new Error(
      result?.message ||
      result?.error ||
      `Resend email failed with HTTP ${response.status}.`
    );
  }

  return result;
}


/* ============================================================
   REMINDER TRACKING
   ============================================================ */

function createReminderKey(
  email,
  bill,
  leadDays
) {
  return [
    "email",
    String(email || "")
      .trim()
      .toLowerCase(),

    bill.due_date,

    String(leadDays)
  ].join(":");
}


async function markBillReminded(
  env,
  bill,
  reminderKey
) {
  const existing =
    Array.isArray(bill.reminded_for)
      ? bill.reminded_for
      : [];

  const remindedFor =
    Array.from(
      new Set([
        ...existing,
        reminderKey
      ])
    );

  bill.reminded_for =
    remindedFor;

  const response =
    await supabaseFetch(
      env,
      `/rest/v1/bills?id=eq.${encodeURIComponent(bill.id)}`,
      {
        method: "PATCH",

        headers: {
          Prefer: "return=minimal"
        },

        body: JSON.stringify({
          reminded_for: remindedFor,
          updated_at:
            new Date().toISOString()
        })
      }
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Could not mark bill as reminded: ${text}`
    );
  }
}


async function unmarkBillReminded(
  env,
  bill,
  reminderKey
) {
  const remindedFor =
    (
      Array.isArray(bill.reminded_for)
        ? bill.reminded_for
        : []
    ).filter(
      (key) =>
        key !== reminderKey
    );

  bill.reminded_for =
    remindedFor;

  const response =
    await supabaseFetch(
      env,
      `/rest/v1/bills?id=eq.${encodeURIComponent(bill.id)}`,
      {
        method: "PATCH",

        headers: {
          Prefer: "return=minimal"
        },

        body: JSON.stringify({
          reminded_for: remindedFor,
          updated_at:
            new Date().toISOString()
        })
      }
    );

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `Could not remove reminder marker: ${text}`
    );
  }
}


/* ============================================================
   CONFIGURATION
   ============================================================ */

function validateConfig(env) {
  if (!getServiceRoleKey(env)) {
    throw new Error(
      "Missing Supabase service role secret. Add SUPABASE_SERVICE_ROLE_KEY to this Worker."
    );
  }

  if (!env.RESEND_API_KEY) {
    throw new Error(
      "Missing RESEND_API_KEY."
    );
  }

  if (!env.RESEND_FROM_EMAIL) {
    throw new Error(
      "Missing RESEND_FROM_EMAIL."
    );
  }

  if (!getSupabaseUrl(env)) {
    throw new Error(
      "Missing Supabase URL."
    );
  }
}


function getServiceRoleKey(env) {
  /**
   * Supports either variable name.
   *
   * Recommended:
   * SUPABASE_SERVICE_ROLE_KEY
   */
  return (
    env.SUPABASE_SERVICE_ROLE_KEY ||
    env.SUPABASE_SERVICE_ROLE ||
    ""
  );
}


function getSupabaseUrl(env) {
  return (
    env.VITE_SUPABASE_URL ||
    env.SUPABASE_URL ||
    DEFAULT_SUPABASE_URL
  ).replace(/\/+$/, "");
}


/* ============================================================
   SUPABASE HELPERS
   ============================================================ */

function supabaseFetch(
  env,
  path,
  options = {}
) {
  const supabaseUrl =
    getSupabaseUrl(env);

  const key =
    getServiceRoleKey(env);

  return fetch(
    `${supabaseUrl}${path}`,
    {
      ...options,

      headers: {
        apikey: key,

        Authorization:
          `Bearer ${key}`,

        "Content-Type":
          "application/json",

        ...(options.headers || {})
      }
    }
  );
}


async function readJsonResponse(
  response
) {
  const payload =
    await response
      .json()
      .catch(() => null);

  if (!response.ok) {
    console.error(
      "[Reminders] Supabase error:",
      JSON.stringify(payload)
    );

    throw new Error(
      payload?.message ||
      payload?.error ||
      payload?.hint ||
      `Supabase request failed with HTTP ${response.status}.`
    );
  }

  return payload || [];
}


/* ============================================================
   DATE HELPERS
   ============================================================ */

function localDateString(
  date,
  timezone
) {
  const parts =
    new Intl.DateTimeFormat(
      "en-CA",
      {
        timeZone:
          timezone ||
          "Australia/Melbourne",

        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }
    ).formatToParts(date);

  const values =
    Object.fromEntries(
      parts.map(
        (part) => [
          part.type,
          part.value
        ]
      )
    );

  return (
    `${values.year}-` +
    `${values.month}-` +
    `${values.day}`
  );
}


function addDaysToDateString(
  value,
  days
) {
  const [
    year,
    month,
    day
  ] = value
    .split("-")
    .map(Number);

  const date =
    new Date(
      Date.UTC(
        year,
        month - 1,
        day
      )
    );

  date.setUTCDate(
    date.getUTCDate() +
    Number(days || 0)
  );

  return date
    .toISOString()
    .slice(0, 10);
}


function formatDateForEmail(
  value
) {
  if (!value) {
    return "";
  }

  const [
    year,
    month,
    day
  ] = value
    .split("-")
    .map(Number);

  return new Intl.DateTimeFormat(
    "en-AU",
    {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Australia/Melbourne"
    }
  ).format(
    new Date(
      Date.UTC(
        year,
        month - 1,
        day,
        12
      )
    )
  );
}


/* ============================================================
   GENERAL HELPERS
   ============================================================ */

function formatMoney(value) {
  return new Intl.NumberFormat(
    "en-AU",
    {
      style: "currency",
      currency: "AUD"
    }
  ).format(value);
}


function isEmail(value) {
  return (
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  ).test(value);
}


function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}


function jsonResponse(
  payload,
  status = 200
) {
  return new Response(
    JSON.stringify(
      payload,
      null,
      2
    ),
    {
      status,

      headers: {
        "Content-Type":
          "application/json",

        "Cache-Control":
          "no-store"
      }
    }
  );
}
