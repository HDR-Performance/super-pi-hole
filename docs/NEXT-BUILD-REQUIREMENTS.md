# Next build: integrated Super Pi Hole

Recorded September 5, 2026 from the owner's explicit product direction. These are requirements, not shipped capabilities. The current deployed 0.2.0-test remains a companion with simulated custom policies.

## Product architecture

Deliver one installable Super Pi Hole application containing the stock Pi-hole DNS engine and administration interface, plus the Super Pi Hole UI and backend policy controller. Multiple containers inside one TrueNAS custom app are acceptable. The installation must not depend on a separately installed original Pi-hole app.

Super Pi Hole is the default administration experience. Provide a clearly labeled **Open original Pi-hole** button that opens the bundled stock interface in a new tab using the actual configured address. Both interfaces must operate on the same engine, not independent copies of settings.

Use the installed engine's version-matched API documentation and supported management interfaces; maintain an explicit feature/capability matrix for anything that needs more than the API. Do not represent an unimplemented control as working. Reference: [Pi-hole API documentation](https://docs.pi-hole.net/api/).

## Automatic live updates

Current finding: `components/live-pihole.tsx:849` defaults refresh to `manual`; the existing 30/60-second refresh is dashboard-only. This does not satisfy the desired live experience.

Requirements:

- Start dashboard automatic refresh by default. Proposed initial target: lightweight status/counters every five seconds, with heavier history reads less frequently; validate load before finalizing intervals.
- Add live query-log updates and refresh discovered-device state without full-page reloads.
- Preserve filters, scroll, selection and unfinished forms. Offer **Pause live updates** while investigating older records; do not prepend rows under the user's pointer unexpectedly.
- Show last successful update, updating/paused status and a clear stale/disconnected state. Never silently leave old values looking current.
- Avoid overlapping requests, cancel obsolete requests, back off on errors and pause unnecessary background-tab reads. Refresh immediately when returning to an active view.
- Persist the chosen refresh preference and distinguish it from DNS blocking controls.

Acceptance: a new query sent to the bundled engine appears in the UI within the documented refresh interval without pressing Refresh. Disconnecting the engine visibly marks data stale; reconnecting recovers without losing the user's filters.

## Discovered-device picker plus manual definitions

**Add device** must first offer a searchable, scrollable device picker, with a separate **Enter manually** option.

Each discovered entry should show the friendly name or hostname, available IP addresses, MAC when known, last seen, evidence source and existing group/profile assignment. Avoid duplicating one device solely because its address changed; handle multiple IPv4/IPv6 addresses and explicitly flag uncertain identity.

Build inventory from the full available Pi-hole network/client data, DHCP and neighbor information, with optional read-only router/switch integration where supported. The current top-ten DNS clients and configured client assignments are not a complete inventory. Label coverage honestly: devices hidden behind a forwarding router, offline devices, or devices never observed cannot be guaranteed to appear. Do not invent entries or call absence proof of disconnection.

Manual entry must support a friendly name and validated identifiers supported by the selected engine integration, with conflict/duplicate checks. Selecting a discovered device should populate editable fields. Separate **Discovered**, **Manually defined**, and **Example** records; example records must not populate a production device inventory by default.

Acceptance: select a discovered device and target a rule/profile without retyping its address; add a manual definition when discovery is unavailable; search and scroll a large inventory without freezing; show what will happen when an identity is already assigned elsewhere.

## Devices is a live inventory and per-device control center

Additional explicit owner requirement: the **Devices tab itself**, not only the Add device picker, must display the network inventory with automatic updates. Replace the current example-only review table in production. Aim to enumerate all devices visible to the configured discovery sources; show coverage limitations rather than claiming an incomplete list is the whole network.

### Main device list

- Searchable, sortable, scrollable inventory, with filters for group, family profile and observed status.
- Show friendly name, address, last seen, current filtering group/profile, and total/blocked/permitted DNS counts for the selected time range.
- Show online/offline only where supported by fresh reachability or lease/source evidence. Otherwise use **Recently observed**, **Last seen**, or **Unknown**; a quiet DNS client is not necessarily offline.
- Refresh rows without losing search, scroll, selection or an open device detail view. Show stale data and unavailable discovery sources explicitly.
- Keep discovered devices visible before any filtering profile is assigned. Manual definitions remain available for devices that cannot be discovered.

### Click a device: details and History

Clicking a row opens a device detail panel/page with a prominent **History** button/tab and profile controls. Also provide a direct History action on each row.

History must include:

- **All DNS requests**, **Blocked**, **Permitted**, and **Errors/other** filters, so failed or indeterminate requests are not counted as successfully allowed browsing.
- Date/time-range selection, domain search, paginated older records, and a live-follow mode that can be paused while inspecting history.
- Timestamp, exact requested domain, DNS record type, outcome, reply, and matched rule/list or blocking reason where the engine provides it. Missing explanations must say unavailable rather than inventing a cause.
- A compact activity chart and a summary of most-requested and most-blocked domains using the same time range as the table.
- A **Domains & services** summary with request counts, first/last request and allowed/blocked totals. Human-friendly service labels may supplement the exact hostname, but uncertain domain-to-service classification must be marked as inferred.
- Contextual **Allow domain** / **Block domain** actions, with explicit device/group scope, inheritance/conflict preview, confirmation and verified application through the controller.

Use **Domains requested** as the accurate label for the owner's requested website history. A DNS request is not proof of a deliberate website visit, an established connection, time on a site, or a full page URL. Background apps also request domains, cached lookups can conceal later use, and traffic bypassing this resolver is absent. Reference: [Pi-hole query records and outcome fields](https://docs.pi-hole.net/database/query-database/).

History must remain correctly scoped to identity: do not assign every historical query for a reused IP address to the device currently holding that address. Use time-bounded address associations where evidence exists; otherwise disclose address-based attribution and uncertainty. Display the available retention window and logging/privacy limitations. Never fill gaps with example history.

### Assign filtering groups and family profiles

From the device detail view, the administrator must be able to select a filtering group and/or family profile without leaving Devices. Support existing Pi-hole group membership semantics and one family profile per device; shared devices can use a shared family profile.

- Display current assignment and inherited category filters, website exceptions, schedules and privacy packs.
- Preview what changes, whether the device moves from another family profile, and any overlapping-rule conflicts before applying.
- Offer **Apply profile** with Pending, Applied, Failed and verification states, not a simulator-only Save badge.
- Apply through the same controller and bundled engine used by the rest of Super Pi Hole; refresh assignment and effective policy after successful read-back.
- Preserve the prior assignment on failure and provide retry/rollback information. Retain an administrative change record.

Acceptance: a newly observed client appears in Devices without manual refresh; clicking it opens only its attributable DNS history; blocked/permitted views agree with engine outcomes; older retained records can be paged; assigning a profile changes the actual DNS result for that device in a controlled test without changing an unrelated device. Include tests for multiple addresses, DHCP address reuse, stale discovery, shared profiles, failed writes and unavailable logging.

## Custom blocked-site page with text and media

Explicit owner requirement: when a browser attempts to open a blocked site, show a Super Pi Hole-designed page with administrator-customizable text and an optional image, animated GIF or video. Limit each uploaded media file to **200 MB**. This is a next-build requirement, not an existing feature.

Owner clarification: the block page and media must be served over **local-network HTTP only**, with no public hosting or WAN exposure. LAN browsers should be able to open the page directly when their network segment permits access. This hosting requirement is separate from automatic redirection of arbitrary blocked HTTPS sites; being on the LAN does not turn an HTTPS navigation into HTTP. Ordinary client DNS is also a separate protocol, not the HTTP page request.

### Page editor and presentation

- Add **Appearance > Blocked-site page** with title, message, theme colors, image/video selection, preview, save and reset-to-default controls. Use structured formatting, not administrator-supplied executable HTML or JavaScript.
- Provide a household default and optional group/family-profile overrides, with a clear inheritance preview. Resolve a template from a verified device/profile mapping; use the generic default when identity is uncertain.
- Example customizable message: **I see you found a blocked site! This website is restricted by your network settings.** Keep the default factual and clearly branded as Super Pi Hole, not as a message from the blocked website.
- Include an optional policy reason and **Request access** action, reusing the parental approval workflow once that workflow is actually enforced. Requesting access must never itself remove a block; approval requires an authorized administrator and validated device/domain scope.
- Keep the page responsive, keyboard-accessible and readable with media disabled. Offer image alternative text, captions/transcript support, playback controls, reduced-motion handling and a text-only fallback.
- Video options: poster frame, loop and muted autoplay. Always provide a Play/unmute control; audible autoplay cannot be guaranteed because browsers restrict it. See [browser autoplay behavior](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Autoplay).

### Broad media support and the 200 MB limit

- Interpret the requested limit explicitly as **200,000,000 bytes per source file** and use the same definition in the UI, API, tests and documentation. Accept exactly the limit; reject larger files server-side as well as client-side. Account separately for multipart request overhead and enforce aggregate request/storage quotas.
- Image targets: JPEG/JPG, PNG, GIF including animation, WebP and AVIF. Add BMP/TIFF/HEIC/HEIF import through validated conversion where supported by the packaged decoder; publish the tested matrix instead of promising every variant.
- Video targets: MP4/M4V, WebM and OGV, plus MOV, MKV and AVI imports through a bounded conversion pipeline. Detect the actual container/codecs; the filename extension alone does not establish browser playability.
- Produce browser-compatible playback derivatives, such as tested MP4 H.264/AAC and/or WebM renditions, where direct playback is not reliable. Preserve animation where supported, generate lightweight previews/posters, and show processing progress or actionable unsupported-format errors. See [browser media formats](https://developer.mozilla.org/en-US/docs/Web/Media/Guides/Formats).
- Store assets locally in persistent TrueNAS application storage; do not rely on third-party media embeds or tracking services. Stream with range-request support and lazy loading so a large file is not downloaded unnecessarily on every blocked lookup.
- Require administrator authentication for upload, replacement and deletion. Validate signatures/MIME and decoder output, use server-generated filenames and reject executable/active content. Do not serve uploaded HTML or raw SVG as page content. Apply strict content security policy and separate media serving from administrative endpoints.
- Stream uploads with a hard size limit; cap dimensions, decoded frame/pixel work, duration, conversion time, temporary storage and concurrent jobs. Run media processing with restricted privileges/resources so a compressed or malformed file cannot exhaust the DNS service. Clean up partial uploads and failed derivatives; replacing media must not destroy the previous working page before validation succeeds.

### Delivery constraints: DNS is not an HTTPS redirect

DNS returns addresses or DNS errors, not browser redirect responses. Returning a block-server IP can support an HTTP block page only when the request actually reaches a compatible HTTP listener. It does not provide a valid TLS certificate for an unrelated HTTPS hostname. HSTS and HTTPS-first behavior further prevent treating plain HTTP interception as universal browser redirection. Sources: [Pi-hole blocking modes](https://docs.pi-hole.net/ftldns/blockingmode/) and [HSTS/certificate behavior](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Strict-Transport-Security).

- Provide the customizable page and media at a dedicated LAN-only HTTP origin, with an administrator preview and a manually reachable help/access-request portal. Bind/restrict access to explicitly configured local interfaces/subnets; do not publish it through WAN forwarding or a cloud tunnel. Keep administrative authentication and controls separate from this page.
- An optional plain-HTTP block-page mode needs a dedicated listener/IP or routing arrangement that does not conflict with TrueNAS or expose the admin interface under arbitrary blocked Host headers. Do not redirect every non-browser/background request into a media download.
- For automatic HTTPS browser navigation to the page, design an explicitly installed browser companion/managed-browser integration that intercepts supported top-level navigations and opens our own page using the same effective policy. Verify browser/platform coverage, permissions, policy synchronization and privacy behavior. Do not claim HTTPS redirect support before that path is implemented and tested. DNS blocking must remain effective independently of the companion.
- Do not install interception certificates, weaken browser TLS validation, or promise certificate-free universal redirects from DNS alone. Such security changes are not part of this requirement or authorized by it.
- DNS events cannot reliably distinguish a deliberate page visit from an embedded image, advertisement or background app request. Do not automatically open new tabs merely because a blocked DNS query was logged. Preserve separate **DNS blocked** and **Block page shown** events, recording the latter only when actually observed.
- Do not expose family browsing history, names or administrative credentials on a generally reachable block page. Treat the requested hostname as untrusted input; escape it and derive policy explanations from validated decisions. Avoid URL query parameters carrying full browsing URLs or secrets; prevent open redirects, forged approvals and profile enumeration.

Acceptance: preview and actual supported browser delivery show the saved template; text-only, static image, animated GIF and video work across the documented browser matrix; exactly 200 MB is accepted and 200 MB plus one byte is rejected without exhausting memory/disk; malformed files fail safely; incompatible video codecs are converted or clearly rejected; autoplay refusal leaves usable controls; HTTPS/HSTS navigation is tested separately from HTTP and never presented as supported through DNS alone; the page cannot grant access without authorized approval or interrupt unrelated DNS traffic.

## Super Pi Hole has the final policy authority

This is backend policy ownership, not just a visual skin. The Super Pi Hole controller must own desired configuration for settings it manages, validate it, apply it to the bundled engine, read back actual state, and expose differences. The long-term scope is control of all Pi-hole features; track coverage explicitly until complete.

- Mark controller-owned settings **Managed by Super Pi Hole** and distinguish desired state from observed/applied state.
- Compile device rules, groups, schedules, parental settings and lists into supported engine behavior, respecting real Pi-hole rule precedence. Test allow/deny and overlapping-policy conflicts against actual DNS responses.
- Detect changes made through the stock GUI. Notify and audit the difference. For managed settings, restore the approved Super policy under an explicit documented reconciliation mode, unless an administrator deliberately imports the change or temporarily relinquishes management.
- Do not pretend polling gives instant or tamper-proof authority. Strict write precedence requires routing/restricting administration writes through a shared authorization/controller layer; unrestricted stock admin/root access can bypass it. Design and test this before claiming guaranteed final say.
- Provide a deliberate maintenance override with visible ownership status, expiry/resumption behavior and rollback. Avoid two controllers repeatedly overwriting each other.
- Preserve unmanaged advanced settings until the controller has explicit support and ownership for them. Never label unsupported feature enforcement as active.
- Keep a change log, configuration revision, backup and rollback path. Mark a policy **Applied** only after successful read-back; use DNS verification tests for the stronger **Verified** state.

Acceptance: edits in either UI are visible to the controller; managed-setting conflicts have deterministic, documented outcomes and an audit trail; restart restores approved policies; no policy reports success after a failed engine write.

## Immediate UI regressions to fix before packaging

1. Add-device and add-schedule actions fail silently on the NAS's HTTP origin. Replace insecure-context-incompatible record-ID generation and test both LAN HTTP and HTTPS/local development.
2. Reset scroll/focus when changing sections so headings and enforcement status stay visible.
3. Unify original-Pi-hole links and connection messaging across Live and Advanced views.
4. Add Clear all filters to the live query log and local explanations for locked controls.
5. Remove the production ambiguity between real devices/settings and simulation examples.

## Installation and migration gate

Ship container-build source and a TrueNAS custom-app YAML with persistent engine/controller data, health checks and a Web UI portal. Validate startup secrets before failing an installation obscurely. Back up the existing Pi-hole configuration, stage/import into separate storage, test the new engine, and perform a deliberate DNS-port/IP cutover with rollback. Do not bind two DNS engines to the same host address/port or stop the existing working resolver during an unrelated UI test.

No runtime, router, DNS or deployment changes were authorized or performed merely by recording these requirements.
