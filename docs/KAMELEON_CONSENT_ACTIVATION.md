# Activating the stakeholder evaluation consent version

`create_testimonial_intent` resolves the consent version from
`public.consent_document_versions` and **fails closed** when no row is active.
That is the last gate before capture can work: until a row is inserted and
activated, no submission can be created at all, whatever the feature flags say.

## Preconditions — all four, in order

1. **The notices are deployed and reachable over HTTPS.** The registry CHECK
   requires both URLs to match `^https://[^space/]+\.[^space/]+(/|$)`, so a
   relative path, `http://`, or a host with no dot is refused. Confirm both
   return 200 to a signed-out browser in a private window:

   ```
   https://<production-host>/legal/kameleon-evaluation-terms
   https://<production-host>/legal/kameleon-evaluation-privacy
   ```

   They sit outside `/experience/kameleon`, so the stakeholder access gate does
   not cover them. That is deliberate — a consent document only the
   already-admitted can read is not a consent document.

2. **The operator is confirmed.** The notices say "Plotabl" with no legal
   suffix, because Plotabl's registered form is not confirmed and inventing one
   would be stating a fact about a legal entity that nobody has verified. If
   Plotabl is registered as an LLC or corporation, add the suffix to
   `lib/legal/evaluation-notices.ts`, redeploy, and issue a NEW version rather
   than editing this one — see step 4.

3. **The contact address is monitored.** `plotablstudio@gmail.com` is the only
   route a participant has for a take-down request, and the notice commits to
   acknowledging within three working days.

4. **You have read both pages as published.** Not as reviewed in a diff — as
   they render.

## The activation statement

One row, one statement. Run as the trusted tier (SQL Editor):

```sql
insert into public.consent_document_versions
  (version, terms_url, privacy_url, published_at, is_active)
values
  ('2026-08-19.evaluation.v1',
   'https://<production-host>/legal/kameleon-evaluation-terms',
   'https://<production-host>/legal/kameleon-evaluation-privacy',
   now(),
   true);
```

`version` must equal `EVALUATION_CONSENT_VERSION` in
`lib/legal/evaluation-notices.ts` exactly. It is stored on every submission and
is immutable afterwards.

A partial unique index permits **one** active row, so activating a second
version without deactivating the first raises `23505` rather than quietly
creating an ambiguity.

Verify:

```sql
select version, is_active, published_at, terms_url, privacy_url
from public.consent_document_versions order by created_at desc;

select public.active_consent_version();   -- expect the version string
```

## Then, and only then, open the gates

Order matters: the environment flag needs a deploy, the database flag does not.
Open the deployment gate first so that flipping the database row is the single
moment capture becomes live.

```
1. Vercel → Production → KAMELEON_TESTIMONIAL_CAPTURE_ENABLED = true → redeploy
2. update public.experiences set testimonial_capture_enabled = true
     where slug = 'kameleon';
```

**The database flag is the emergency shutoff.** It takes effect on the next
request with no deploy. The environment flag is the deliberate gate and needs a
redeploy, so it is not the thing to reach for in a hurry.

## Issuing a new version later

Never edit an activated version's text or URLs. Submissions consented under it,
and the record has to keep meaning what it meant.

1. Change the pages and bump `EVALUATION_CONSENT_VERSION`.
2. Deploy.
3. `update public.consent_document_versions set is_active = false where is_active;`
4. Insert the new row with `is_active = true`.

Both statements in one transaction, or the single-active index will reject the
insert.
