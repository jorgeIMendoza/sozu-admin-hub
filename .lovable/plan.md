

# Fix: Google Calendar 403 "requiredAccessLevel" Error

## Root Cause

In `supabase/functions/agendar-capacitacion/index.ts`, the Google access token is generated **once** at line 564 using DWD (Domain-Wide Delegation) with `dwdSubject = calendarId` (derived from the initial/default config).

When a `config_id` is provided in the schedule action (line 1000-1009), `scheduleCalendarId` changes to a different calendar owner's email. But the token was already generated impersonating the **original** calendar owner — so the Service Account lacks write access to the new calendar.

```text
Line 563-564:  token = getAccessToken(sa, calendarId)     ← token for default calendar
Line 1009:     scheduleCalendarId = cfgData.calendario_email  ← different calendar!
Line 1158:     createCalendarEvent(token, scheduleCalendarId)  ← FAILS: token ≠ calendar
```

## Fix

After resolving `scheduleCalendarId` in the schedule action (around line 1009), regenerate the token if the calendar changed:

```javascript
// After line ~1014 (after scheduleCitaNombre is set)
if (scheduleCalendarId !== calendarId) {
  const newDwdSubject = scheduleCalendarId;
  token = await getAccessToken(sa, newDwdSubject);
  console.log(`[auth] Token re-generated with DWD subject: ${newDwdSubject} (schedule calendar differs from default)`);
}
```

This requires changing `token` from `const` to `let` at line 564.

## Changes Summary

**File**: `supabase/functions/agendar-capacitacion/index.ts`

1. **Line 564**: Change `const token` to `let token`
2. **After line ~1042** (after config_id block resolves `scheduleCalendarId`): Add token regeneration when `scheduleCalendarId !== calendarId`

Two lines of logic change, minimal risk.

