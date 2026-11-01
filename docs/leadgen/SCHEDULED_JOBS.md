# Scheduled jobs

What has to run on a clock, where it runs, and how to set it up. Written for whoever operates PrimeStreet,
not only for whoever wrote it.

## What runs

One authenticated endpoint does all of it: `GET /api/cron`, with `Authorization: Bearer $CRON_SECRET`.

| | What it does | How often it needs to run |
|---|---|---|
**Lead notification** | emails a business that it has a job, for anything assigned but never notified | **hourly** — a lead is worth less every hour it sits |
**Chasing** | one reminder to a business that has said nothing about a job after 4 hours — opening the dashboard is not an answer | hourly |
**Escalation** | after 24 hours with **no word** from the business: take the job back, refund the credit, reassign it, tell both businesses | hourly |
**Telling the customer** | after 6 hours with nobody assigned: email them honestly, once | hourly |
**Low-balance warnings** | tells a business before, and when, its credits run out — once per run of being low | hourly (it rides on the same pass) |
**Lifecycle automations** | only the marketing rules an administrator has switched on, each capped and de-duplicated | daily |
**Search housekeeping** | prunes search rows whose document is gone | daily |

The lead work is **transactional and is not gated on the automation toggles**. A business that has paid for a
job must be told it has one whether or not anybody has enabled a marketing rule.

Everything in the route is idempotent: what has already been sent is recorded in a column
(`LeadAssignment.notifiedAt`, `.remindedAt`, `JobRequest.customerNotifiedAt`, `CreditAccount.lowWarnedAt`, `.zeroWarnedAt`, `LeadAssignment.respondedAt`), so a cron that fires twice —
or two crons firing at once — sends nothing twice.

## Why Supabase and not only Vercel

Vercel cron on the current plan gives **one run a day**, which is fine for the daily work and useless for
leads: a customer would wait up to 24 hours for us to notice nobody had been told. Supabase runs `pg_cron` in
the database, with `pg_net` to make the HTTP call, on whatever schedule we ask for.

So: **hourly from Supabase**, and the daily Vercel cron can stay as a belt-and-braces second caller. Both hit
the same idempotent endpoint, so two callers is not a problem.

## Setting it up

In the Supabase SQL editor, once:

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;
```

Then store the secret where the job can read it but a `pg_dump` of the public schema will not carry it
around, and schedule the call:

```sql
-- Vault, so the bearer token is not sitting in plain text in a cron definition.
select vault.create_secret('<the value of CRON_SECRET>', 'primestreet_cron_secret');

select cron.schedule(
  'primestreet-leads-hourly',
  '7 * * * *',               -- seven minutes past, to stay off the top-of-hour crowd
  $$
  select net.http_get(
    url     := 'https://primestreet.uk/api/cron',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'primestreet_cron_secret')
    ),
    timeout_milliseconds := 30000
  );
  $$
);
```

Checks worth running after:

```sql
select jobid, jobname, schedule, active from cron.job;
select jobid, status, start_time, end_time from cron.job_run_details order by start_time desc limit 10;
```

`net.http_get` returns immediately with a request id; the response lands in `net._http_response`. A 404 from
our side means the bearer token is wrong or `CRON_SECRET` is not set in the deployment — the route answers
404 either way, deliberately, so an attacker cannot tell which.

To change the schedule, `cron.unschedule('primestreet-leads-hourly')` and schedule it again.

## The thresholds, and where they live

`src/lib/lead-notify.ts`:

```
REMIND_AFTER_HOURS       = 4
ESCALATE_AFTER_HOURS     = 24
TELL_CUSTOMER_AFTER_HOURS = 6
```

They are constants rather than settings on purpose: each one is quoted to somebody in an email ("if nobody
opens it within 24 hours…"), so changing one means changing wording, and that should be a deliberate edit
rather than a slider somebody nudges.

## What is not scheduled yet

**Retention deletion.** `LEAD_ROUTING_AND_PRIVACY.md` §5 sets out the schedule — 90 days for an unassigned
lead, 12 months for contact details on an assigned one. That is a policy and not yet a job. It belongs here,
as a separate `pg_cron` entry, and it needs a decision on anonymising rather than deleting the commercial
record first.
