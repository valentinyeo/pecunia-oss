# @pecunia/reports

Saved reports, owned by one profile. A report is a title and a plain-text body, kept with the instant it was created and the instant it last changed.

## What it guarantees

- **One owner per profile.** Only a profile's owner may save, read, list or delete its reports. A viewer or a stranger gets `Forbidden`, the same answer for a report that exists and one that does not.
- **The store filters.** Every store call takes the acting profile and never returns a row owned by another profile, so a mistake in the service cannot leak a report.
- **The body is text.** It is stored as plain text and returned as plain text. This package never parses it as HTML or markdown, and the screen must render it as text.
- **Lists are newest first.** Ordered by `updatedAt` descending, then by `id` ascending, so the order is the same on every read.
- **Replace keeps history.** Saving an id that already exists in the same profile keeps its `createdAt` and moves it to the newest position. A replace raises an `updatedAt` earlier than the kept `createdAt` up to it, so a stored report always satisfies `ReportSchema`.
- **Instants are ordered.** `createdAt` and `updatedAt` are branded `Instant` values in epoch milliseconds, and a report is refused when `updatedAt` comes before `createdAt`.

Access comes from `@pecunia/access`: `authorize` establishes membership, and this package requires the `owner` role on the profile for all four calls, including reads.

## Parsing

`ReportDraftSchema` is the boundary: plain strings in, branded `Report` out. `parseReportDraft` names the field it refused (`title`, `body` or `id`) in an `InvalidReport`.

A title is 1 to 120 characters after trimming, with no control characters. A body holds at most 200 000 characters and is kept verbatim. Ids are 1 to 64 characters and unique inside a profile.

## Store

`ReportStore` is the port. Every call takes the acting profile and filters on it, so a mistake in the service cannot reach another profile's row. `save` refuses a report whose owner is not the acting profile, so a replace can never overwrite a row in another profile. `delete` returns the report it removed as an `Option`, which lets the service answer `ReportNotFound` from the same call that did the work instead of reading first. `memoryReportStoreLayer` is the in-memory adapter for tests and local runs; a Cloudflare D1 adapter comes later and implements the same four calls.
