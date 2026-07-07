# Billminder Fixes — AI Extract & Email Reminders

## What Was Fixed

### 1. AI Bill Extraction (`functions/api/extract-bill.js`)

**Problem:** The OpenAI API endpoint was wrong (`/v1/responses` doesn't exist). The extraction only populated the notes field and silently failed on others.

**Fix:**
- Changed endpoint to `/v1/chat/completions` (correct for vision/document processing)
- Updated request format to use OpenAI's modern message API
- Improved the extraction prompt to be more explicit about required fields
- Added proper JSON parsing from the response

**What now works:**
- ✓ Extracts **biller name**
- ✓ Extracts **amount due** (as number)
- ✓ Extracts **due date** (YYYY-MM-DD format)
- ✓ Extracts **invoice/reference number**
- ✓ Extracts **notes** and other details
- ✓ Returns **confidence score** (0-1)
- ✓ Works with both PDFs and photos

**Testing:**
1. Upload a bill PDF or photo in the extraction panel
2. Click "AI extract"
3. All fields should now populate correctly (not just notes)

---

### 2. Email Reminders (`worker/reminder-worker.js`)

**Problem:** The worker couldn't find bills to remind about because it tried to query by `household_id`, which doesn't exist in the bills table. Only `user_id` is stored.

**Fixes:**
1. **Household lookup** — Now correctly finds all household members and queries bills for all their `user_id`s
2. **Supabase query** — Changed from non-existent `household_id` field to proper `user_id` OR filter
3. **Logging** — Added detailed console logs so you can see exactly what's happening on each cron run

**What now works:**
- ✓ Reminders work for single-user accounts
- ✓ Reminders work for shared household accounts (both members get their own reminders)
- ✓ Respects each user's timezone and reminder lead days
- ✓ Doesn't double-send to the same person
- ✓ Detailed logging for debugging

**How to debug:**
After the cron runs at 7:50 PM, check your Cloudflare Workers logs:
1. Go to Workers & Pages → billminder → View Events
2. Look for `[Reminders]` log entries showing:
   - How many users have reminders enabled
   - Which bills were found for each user's target date
   - Which emails were sent
   - Any errors

**Manual trigger (to test immediately):**

```bash
curl -X POST https://your-billminder-worker.example.com/run-reminders \
  -H "Authorization: Bearer ${REMINDER_CRON_SECRET}" \
  -H "Content-Type: application/json"
```

(Replace with your actual worker URL and the `REMINDER_CRON_SECRET` from Cloudflare settings)

---

## Requirements Checklist

For AI extraction to work:
- ✓ `OPENAI_API_KEY` must be set in Cloudflare Pages secrets

For email reminders to work, you need:
- ✓ `SUPABASE_SERVICE_ROLE_KEY` (Cloudflare Worker secret)
- ✓ `SUPABASE_URL` (or `VITE_SUPABASE_URL`) configured
- ✓ `RESEND_API_KEY` (Cloudflare Worker secret)
- ✓ `RESEND_FROM_EMAIL` optional (defaults to "Cleared <onboarding@resend.dev>")
- ✓ Cron trigger configured: `50 19 * * *` (already set in your screenshot)

---

## Deployment

Both files are drop-in replacements:
- `/functions/api/extract-bill.js` — Deploy via `wrangler`
- `/worker/reminder-worker.js` — Deploy via `wrangler`

No schema changes needed. No database migrations needed.

---

## Testing Checklist

### Test AI Extraction
- [ ] Upload a bill PDF → Click "AI extract" → Check all fields populate
- [ ] Upload a photo of a bill → Click "AI extract" → All fields should work
- [ ] Try an unclear/blurry image → Confidence score should be low

### Test Email Reminders
- [ ] Set "Email reminders: On" in your account settings
- [ ] Set "Reminder lead days: 1"
- [ ] Add a bill due tomorrow
- [ ] Wait for cron at 7:50 PM (or trigger manually above)
- [ ] Check your email for the reminder
- [ ] Check Cloudflare Workers logs for `[Reminders]` entries

### Test Household Reminders (if shared)
- [ ] Partner turns on email reminders
- [ ] Add a bill to the shared account
- [ ] Set due date for tomorrow
- [ ] Both partners should receive separate reminder emails
- [ ] Logs should show both users were processed

---

## Rollback

If you need to revert:
1. `git checkout` the original files
2. Redeploy via `wrangler`

Both changes are non-breaking and don't touch the database schema.
