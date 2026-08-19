# Kameleon stakeholder pilot — operations runbook

Covers the three things that must be operable during the evaluation and are
not enforced by code: monitoring retention, honouring a removal request, and
purging everything at the end.

---

## 1. Retention monitoring

The sweep runs hourly at `/api/cron/testimonial-retention` and does four things
in order: finalize stalled uploads, expire abandoned intents, delete provider
assets, record submission-level purges. It returns counts and logs one summary
line per run.

### Daily check

```sql
-- Overdue deletions. Anything here is a retention SLA breach: the media was
-- due for deletion and is still at the provider.
select s.id,
       s.media_purge_after,
       now() - s.media_purge_after as overdue_by,
       s.environment_marker,
       count(a.id) filter (where a.deleted_at is null) as undeleted_assets
from public.testimonial_submissions s
left join public.testimonial_provider_assets a
       on a.submission_id = s.id and a.provider_asset_id is not null
where s.media_purge_after is not null
  and s.media_purge_after < now() - interval '24 hours'
  and s.media_deleted_at is null
group by s.id
order by s.media_purge_after;
```

**Expected result: zero rows.** One row means the sweep is not running, is
failing, or is running in the wrong environment.

```sql
-- Poison rows: assets a sweep keeps failing to delete.
select a.id, a.provider, a.environment_marker, a.deletion_attempt_count,
       a.last_deletion_attempt_at, a.deletion_status
from public.testimonial_provider_assets a
where a.deleted_at is null
  and a.provider_asset_id is not null
  and a.deletion_attempt_count >= 10
order by a.deletion_attempt_count desc;
```

Almost always an asset deleted by hand in the Cloudflare dashboard; the next
404 settles it as `not_found`. Investigate rather than delete the ledger row —
the row is the record that the asset existed.

```sql
-- Stalled uploads the backstop has not resolved.
select a.submission_id, a.provider, a.reserved_at, now() - a.reserved_at as age
from public.testimonial_provider_assets a
join public.testimonial_submissions s on s.id = a.submission_id
where s.upload_status = 'initiated'
  and a.attached_at is not null and a.superseded_at is null
  and a.failed_at is null and a.deleted_at is null
  and a.reserved_at < now() - interval '2 hours'
order by a.reserved_at;
```

### Manual invocation

```bash
curl -s -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $CRON_SECRET" \
  https://<host>/api/cron/testimonial-retention
```

`401` wrong or missing secret · `503` no `CRON_SECRET`, or incomplete
Cloudflare deletion configuration · `405` anything other than GET.

Against a protected Preview deployment, add
`-H "x-vercel-protection-bypass: $VERCEL_AUTOMATION_BYPASS_SECRET"` **as well
as** the bearer, not instead of it.

---

## 2. Honouring a removal or deletion request

Intake is the published privacy contact.

**Identification.** Visitors are anonymous; there is no login proving
ownership. Available linkages, strongest first: the `experience_users` row
(email / phone / display name) → `testimonial_submissions.experience_user_id`;
the caption text plus approximate date; the Gallery item they point at.

None of these is authentication, so the standard is deliberately asymmetric:

- **Remove on a plausible request.** If wrong, an item disappears and the
  record survives — low harm.
- **Disclose nothing about a submission without far stronger proof.** If wrong,
  you have handed one person another person's data — high harm.

**Act.** In the moderation dashboard: **Remove**, with reason
`Withdrawn by the person who submitted it`. That reason shortens the retention
window from 30 days to the next sweep. Use
`Submitter was not 18 or older` for an age problem — same immediate purge, and
it is the correct audit record.

The item leaves the Gallery immediately; the trigger clears `published_at` and
the Gallery view requires it.

**Record.** The moderation note takes an internal ticket reference. **Never
paste the requester's email or phone into it** — the note is retained
indefinitely and is not the place to duplicate contact data.

**Confirm and verify.** Reply in the same channel. After the next sweep:

```sql
select media_deleted_at, provider_deletion_status, published_at, moderation_status
from public.testimonial_submissions where id = :submission_id;
```

`media_deleted_at` set and `provider_deletion_status` recorded means the media
is gone at Cloudflare, not merely scheduled.

---

## 3. Evaluation-end purge

Run when the pilot closes. Order matters: schedule everything, let the sweep do
the deleting, then verify. **Do not delete rows by hand at Cloudflare** — the
ledger would never learn about it and the records would stay open for ever.

**Step 1 — close capture.** Database first (instant, no deploy):

```sql
update public.experiences set testimonial_capture_enabled = false
where slug = 'kameleon';
```

Then unset `KAMELEON_TESTIMONIAL_CAPTURE_ENABLED` in Vercel and redeploy.

**Step 2 — deactivate the consent version**, so no new submission can resolve
one even if a gate is reopened by mistake:

```sql
update public.consent_document_versions set is_active = false where is_active;
```

**Step 3 — schedule every remaining submission for purge.** Approved
submissions have no expiry by design, so this is the statement that ends the
evaluation's retention:

```sql
-- Trusted tier only. Sets the purge date; deletes nothing itself.
update public.testimonial_submissions
   set media_purge_after = now()
 where media_deleted_at is null
   and environment_marker = 'production';
```

**Step 4 — let the sweep run**, or invoke it manually until it drains. It is
batched at 50, so a large evaluation takes several runs. Repeat until:

```sql
select count(*) as undeleted
from public.testimonial_provider_assets
where provider_asset_id is not null and deleted_at is null;
-- expect 0

select count(*) as unpurged
from public.testimonial_submissions
where media_deleted_at is null and environment_marker = 'production';
-- expect 0
```

**Step 5 — verify at the provider**, not only in the database:

```
GET /accounts/{account}/images/v2   -> expect an empty list for the evaluation
GET /accounts/{account}/stream      -> expect zero videos
```

**Step 6 — what deliberately survives.** The submission rows remain: caption,
consent version, attestations and timestamps are the consent audit record, and
the Privacy Notice says so in those words. Only the media is deleted. If the
rows themselves are ever to be removed, that is a separate decision with its
own retention basis, and `experience_users` contact data is separate again — no
timeline for it is declared anywhere, which is a policy question, not a code
gap.
