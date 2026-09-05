'use client';
import { useState } from 'react';
import { recordId } from '@/lib/record-id';
import {
  Bell,
  FlaskConical,
  Download,
  RefreshCw,
  ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  useReview,
  api,
  nowInput,
  Field,
  TextField,
  Choice,
  Toggle,
  Header,
  Empty,
  ResultBadge,
} from './review-context';
import type { ReviewEvent } from './review-context';
import { RuleEditor, ConfirmAction } from './network-panels';
import type { Confirmation } from './network-panels';
import type {
  Rule,
  Scenario,
  NetworkDecision,
  NetworkState,
} from '@/lib/network-policy';
import { validateNetwork } from '@/lib/network-policy';
import { categories } from '@/lib/parental-policy';
import { countries, countryName } from '@/lib/countries';
import { inspectListContent, inspectListUrl } from '@/lib/blocklist-health';
import catalog from '@/config/blocklist-presets.json';
import { PrivacyPacks } from './privacy-packs';
export function EventTable({ rows }: { rows: ReviewEvent[] }) {
  const r = useReview();
  const [rule, setRule] = useState<Rule | null>(null);
  return (
    <>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Device / domain</TableHead>
            <TableHead>Assumed country</TableHead>
            <TableHead>Decision</TableHead>
            <TableHead>Reason</TableHead>
            <TableHead>Website rule</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((e) => (
            <TableRow key={e.id}>
              <TableCell>
                <strong>
                  {r.state.devices.find((d) => d.id === e.scenario.deviceId)
                    ?.name ?? 'Removed device'}
                </strong>
                <code>{e.scenario.domain}</code>
                <small>{new Date(e.createdAt).toLocaleString()}</small>
              </TableCell>
              <TableCell>
                {countryName(e.scenario.country)}
                <small>{e.scenario.country} · test input</small>
              </TableCell>
              <TableCell>
                <ResultBadge action={e.decision.action} />
              </TableCell>
              <TableCell className="nc-reason">
                <span className="nc-source">{e.decision.source}</span>
                <p>{e.decision.reason}</p>
              </TableCell>
              <TableCell>
                <div className="nc-row-actions">
                  {(['allow', 'block'] as const).map((action) => (
                    <Button
                      key={action}
                      variant="outline"
                      disabled={
                        !r.state.devices.some(
                          (d) => d.id === e.scenario.deviceId,
                        )
                      }
                      onClick={() => {
                        r.setError('');
                        setRule({
                          id: recordId(),
                          domain: e.scenario.domain,
                          action,
                          target: { type: 'device', id: e.scenario.deviceId },
                          enabled: true,
                        });
                      }}
                    >
                      {action === 'allow' ? 'Allow domain' : 'Block domain'}
                    </Button>
                  ))}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <RuleEditor value={rule} onChange={setRule} />
    </>
  );
}
export function ActivityPanel() {
  const r = useReview(),
    { state } = r;
  const [query, setQuery] = useState(''),
    [deviceFilter, setDeviceFilter] = useState(r.focusDevice),
    [actionFilter, setActionFilter] = useState('all');
  const [scenario, setScenario] = useState<Scenario>({
      deviceId: state.devices.some((d) => d.id === r.focusDevice)
        ? r.focusDevice
        : (state.devices.find((d) => d.id === 'printer')?.id ??
          state.devices[0]?.id ??
          ''),
      domain: 'telemetry.example',
      country: 'US',
      category: 'unknown',
      at: nowInput(),
      feedMatch: false,
    }),
    [decision, setDecision] = useState<NetworkDecision | null>(null);
  const alerts = r.events.filter((e) => e.notification && !e.acknowledged),
    filtered = r.events.filter(
      (e) =>
        (deviceFilter === 'all' || e.scenario.deviceId === deviceFilter) &&
        (actionFilter === 'all' || e.decision.action === actionFilter) &&
        [
          e.scenario.domain,
          e.decision.reason,
          e.decision.source,
          countryName(e.scenario.country),
        ]
          .join(' ')
          .toLowerCase()
          .includes(query.toLowerCase()),
    );
  const update = (patch: Partial<Scenario>) => {
    setScenario({ ...scenario, ...patch });
    setDecision(null);
  };
  return (
    <>
      <Header
        title="Activity & policy testing"
        description="See which rule makes the decision—and why."
      />
      {alerts.length > 0 && (
        <section className="panel nc-alert">
          <div className="section-head">
            <h2>
              <Bell /> {alerts.length} country-policy notifications
            </h2>
            <Button
              variant="outline"
              onClick={() =>
                r.perform(async () => {
                  const result = await api('acknowledge', {});
                  r.setEvents(result.events);
                  r.setMessage('Country-test notifications acknowledged.');
                })
              }
            >
              Acknowledge notifications
            </Button>
          </div>
          <p>
            Synthetic tests matched blocked locations. These are not observed
            external connections.
          </p>
          {alerts.slice(0, 3).map((e) => (
            <p key={e.id}>
              <code>{e.scenario.domain}</code> ·{' '}
              {countryName(e.scenario.country)} ·{' '}
              {state.devices.find((d) => d.id === e.scenario.deviceId)?.name ??
                'Removed device'}
            </p>
          ))}
        </section>
      )}
      <section className="panel nc-network-tester">
        <h2>
          <FlaskConical /> Test the complete policy
        </h2>
        <p className="nc-helper">
          Changes are saved before testing. Country, category, and feed-match
          values are assumptions, not detected information.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            r.setBusy(true);
            r.perform(async () => {
              try {
                setDecision(await r.test(scenario));
              } finally {
                r.setBusy(false);
              }
            });
          }}
        >
          <div className="nc-form-grid">
            <Choice
              label="Test device"
              value={scenario.deviceId}
              options={state.devices.map((d) => ({
                value: d.id,
                label: d.name,
              }))}
              onChange={(deviceId) => update({ deviceId })}
            />
            <TextField
              label="Test domain"
              id="network-test-domain"
              value={scenario.domain}
              onChange={(domain) => update({ domain })}
            />
            <Choice
              label="Assumed answer country"
              value={scenario.country}
              options={[
                { value: 'ZZ', label: 'Unknown location' },
                ...countries.map((c) => ({
                  value: c.code,
                  label: `${c.name} (${c.code})`,
                })),
              ]}
              onChange={(country) => update({ country })}
            />
            <Choice
              label="Assumed content category"
              value={scenario.category}
              options={[
                { value: 'unknown', label: 'Unknown / not classified' },
                ...categories.map((c) => ({ value: c.id, label: c.name })),
              ]}
              onChange={(category) =>
                update({ category: category as Scenario['category'] })
              }
            />
            <TextField
              label="Test time (UTC)"
              id="network-test-at"
              value={scenario.at}
              type="datetime-local"
              onChange={(at) => update({ at })}
            />
            <Toggle
              label="Assume a feed match"
              checked={scenario.feedMatch}
              onChange={(feedMatch) => update({ feedMatch })}
            />
          </div>
          <div className="nc-row-actions">
            <Button type="submit" disabled={r.busy || !state.devices.length}>
              <FlaskConical />
              {r.dirty ? 'Save & run test' : 'Run policy test'}
            </Button>
            <Button
              variant="ghost"
              type="button"
              onClick={() => update({ at: nowInput() })}
            >
              Use current time
            </Button>
          </div>
        </form>
        {decision && (
          <section
            aria-label="Network policy result"
            aria-live="polite"
            className={'pc-result ' + decision.action}
          >
            <ResultBadge action={decision.action} />
            <strong>Last saved-policy test · {decision.source}</strong>
            <p>{decision.reason}</p>
            {decision.restrictions.length > 0 && (
              <p>{decision.restrictions.join(' · ')}</p>
            )}
          </section>
        )}
      </section>
      <section className="panel">
        <div className="section-head">
          <h2>Saved synthetic activity</h2>
          <span className="badge">No live traffic</span>
        </div>
        <div className="nc-toolbar">
          <TextField
            label="Search test activity"
            id="activity-search"
            value={query}
            placeholder="Domain, country, or reason…"
            onChange={setQuery}
          />
          <Choice
            label="Activity device"
            value={deviceFilter}
            options={[
              { value: 'all', label: 'All devices' },
              ...state.devices.map((d) => ({ value: d.id, label: d.name })),
            ]}
            onChange={setDeviceFilter}
          />
          <Choice
            label="Activity result"
            value={actionFilter}
            options={[
              { value: 'all', label: 'All results' },
              { value: 'block', label: 'Would block' },
              { value: 'allow', label: 'Would allow' },
              { value: 'restricted', label: 'Allowed with restrictions' },
            ]}
            onChange={setActionFilter}
          />
        </div>
        {filtered.length ? (
          <EventTable rows={filtered} />
        ) : (
          <Empty>
            {state.settings.retentionDays === 0
              ? 'History is disabled. Test results are shown above but are not stored.'
              : 'No tests match these filters. Run a policy test above.'}
          </Empty>
        )}
      </section>
    </>
  );
}
export function BlocklistsPanel() {
  const r = useReview(),
    { state } = r;
  const [url, setUrl] = useState(''),
    [body, setBody] = useState(''),
    [health, setHealth] = useState('');
  return (
    <>
      <Header
        title="Curated blocklists"
        description="One clear baseline, optional family packs, and checks you can understand."
      />
      <div className="nc-preset-grid">
        {catalog.presets
          .filter((p) =>
            ['balanced', 'privacy', 'compatibility'].includes(p.id),
          )
          .map((p) => (
            <section
              className={
                'panel nc-preset ' +
                (state.lists.preset === p.id ? 'selected' : '')
              }
              key={p.id}
            >
              <span className="badge">
                {p.id === 'balanced'
                  ? 'Recommended default'
                  : p.id === 'privacy'
                    ? 'Stronger privacy'
                    : 'Alternative baseline'}
              </span>
              <h2>{p.name}</h2>
              <p>{p.note}</p>
              <ul>
                {p.sources.map((id) => (
                  <li key={id}>
                    {catalog.sources.find((s) => s.id === id)?.name}
                  </li>
                ))}
              </ul>
              <Button
                variant={state.lists.preset === p.id ? 'default' : 'outline'}
                aria-pressed={state.lists.preset === p.id}
                onClick={() =>
                  r.change({
                    ...state,
                    lists: {
                      ...state.lists,
                      preset: p.id as NetworkState['lists']['preset'],
                    },
                  })
                }
              >
                {state.lists.preset === p.id
                  ? 'Selected preset'
                  : 'Choose ' + p.name}
              </Button>
            </section>
          ))}
      </div>
      <section className="panel">
        <h2>Parental content pack</h2>
        <p>
          HaGeZi NSFW + Gambling for selected profiles. Separate from social
          schedules and SafeSearch.
        </p>
        <div className="nc-check-row">
          {state.parental.profiles.map((p) => (
            <label key={p.id}>
              <Checkbox
                aria-label={`Content pack for ${p.name}`}
                checked={state.lists.parentalProfiles.includes(p.id)}
                onCheckedChange={(checked) =>
                  r.change({
                    ...state,
                    lists: {
                      ...state.lists,
                      parentalProfiles: checked
                        ? [...state.lists.parentalProfiles, p.id]
                        : state.lists.parentalProfiles.filter(
                            (v) => v !== p.id,
                          ),
                    },
                  })
                }
              />
              {p.name}
            </label>
          ))}
        </div>
        <p className="nc-helper">
          Feeds are not ingested by this review engine. Tests use explicitly
          supplied category/feed-match assumptions; no coverage guarantee is
          implied.
        </p>
      </section>
      <PrivacyPacks />
      <section className="panel">
        <h2>List health inspector</h2>
        <p>
          Paste a source URL and sample contents. No remote download is
          performed.
        </p>
        <TextField
          label="List URL"
          id="list-url"
          value={url}
          placeholder="https://provider.example/list.txt"
          onChange={setUrl}
        />
        <Field label="Downloaded list contents" id="list-contents">
          <Textarea
            id="list-contents"
            rows={6}
            value={body}
            placeholder={'! DNS-compatible example\n||ads.example^'}
            onChange={(e) => setBody(e.target.value)}
          />
        </Field>
        <Button
          onClick={() => {
            const address = inspectListUrl(url),
              content = inspectListContent(body);
            setHealth(
              `${address.accepted && content.accepted ? 'Pass' : 'Needs review'} — ${address.reason} ${'suggestedRawUrl' in address ? 'Suggested URL: ' + address.suggestedRawUrl + '. ' : ''}${content.reason} ${content.ruleCount} supported rules; ${content.invalidLines} unsupported lines; ${content.duplicates} duplicates. ${content.warnings.join(' ')}`,
            );
          }}
        >
          Inspect list
        </Button>
        {health && (
          <output className="nc-inspection" aria-live="polite">
            {health}
          </output>
        )}
      </section>
      <section className="panel">
        <h2>Source catalog</h2>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Source</TableHead>
              <TableHead>Purpose</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {catalog.sources.map((s) => (
              <TableRow key={s.id}>
                <TableCell>
                  <a href={s.project} target="_blank" rel="noreferrer">
                    {s.name} ↗
                  </a>
                  <small className="nc-url">{s.url}</small>
                </TableCell>
                <TableCell className="nc-reason">{s.purpose}</TableCell>
                <TableCell>
                  <span className="badge">Catalog only</span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </section>
    </>
  );
}
export function SettingsPanel() {
  const r = useReview(),
    { state } = r;
  const [text, setText] = useState(''),
    [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  let safeLink: string | undefined;
  try {
    const url = new URL(state.settings.piholeUrl);
    if (
      ['http:', 'https:'].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash
    )
      safeLink = url.href;
  } catch {
    /* Invalid draft links are not navigable. */
  }
  return (
    <>
      <Header
        title="Settings & original Pi-hole"
        description="Keep the full upstream interface available while our edition grows."
      />
      <div className="nc-two">
        <section className="panel">
          <h2>Original administration</h2>
          <TextField
            label="Pi-hole administration URL"
            id="pihole-link"
            value={state.settings.piholeUrl}
            onChange={(piholeUrl) =>
              r.change({ ...state, settings: { ...state.settings, piholeUrl } })
            }
          />
          <p>
            Query logs, DHCP, local DNS, upstream resolvers, Teleporter backups,
            and advanced FTL settings remain in the original interface.
          </p>
          <a
            className="nc-link-button"
            href={safeLink}
            target="_blank"
            rel="noreferrer"
          >
            Open original Pi-hole <ArrowUpRight />
          </a>
          <p className="nc-helper">
            This is a link only. No live API connection or write access is
            enabled.
          </p>
        </section>
        <section className="panel">
          <h2>Review preferences</h2>
          <TextField
            label="Default schedule time zone"
            id="default-timezone"
            value={state.settings.timezone}
            onChange={(timezone) =>
              r.change({ ...state, settings: { ...state.settings, timezone } })
            }
          />
          <p className="nc-helper">
            New profiles and schedules use this zone. Existing schedules keep
            their own time zones.
          </p>
          <Toggle
            label="Country-test notifications"
            checked={state.settings.notifications}
            onChange={(notifications) =>
              r.change({
                ...state,
                settings: { ...state.settings, notifications },
              })
            }
          />
          <Choice
            label="Synthetic activity retention"
            value={String(state.settings.retentionDays)}
            options={[
              { value: '0', label: 'Do not retain test activity' },
              { value: '7', label: '7 days (up to 200 tests)' },
              { value: '30', label: '30 days (up to 200 tests)' },
            ]}
            onChange={(v) =>
              r.change({
                ...state,
                settings: {
                  ...state.settings,
                  retentionDays: Number(v) as 0 | 7 | 30,
                },
              })
            }
          />
          <p className="nc-helper">
            Saving “Do not retain” removes saved synthetic events. Pi-hole log
            retention is unchanged.
          </p>
        </section>
      </div>
      <section className="panel">
        <h2>Backup & restore review settings</h2>
        <p>
          Settings are stored in this app's SQLite database. The last
          ten saves are retained for undo.
        </p>
        <p className="nc-helper">
          Revision {r.revision} · last saved{' '}
          {r.savedAt ? new Date(r.savedAt).toLocaleString() : 'not yet'}
        </p>
        <div className="nc-row-actions">
          <Button variant="outline" onClick={r.exportState}>
            <Download />
            Export review settings
          </Button>
          <Button
            variant="outline"
            disabled={!r.canRestore || r.busy}
            onClick={() =>
              setConfirmation({
                title: 'Restore the previous saved configuration?',
                description:
                  'This replaces review settings and unsaved edits. Export first if needed. Synthetic history and live Pi-hole are unaffected.',
                action: () => {
                  r.perform(async () => {
                    r.accept(await api('restore', { revision: r.revision }));
                    r.setMessage(
                      'Previous settings restored as a new local revision.',
                    );
                  });
                },
              })
            }
          >
            <RefreshCw />
            Restore previous save
          </Button>
        </div>
        <Field label="Import review JSON" id="import-settings">
          <Textarea
            id="import-settings"
            rows={4}
            value={text}
            placeholder="Paste an exported Super Pi Hole review configuration"
            onChange={(e) => setText(e.target.value)}
          />
        </Field>
        <Button
          variant="outline"
          disabled={!text.trim()}
          onClick={() =>
            r.perform(() => {
              const imported = validateNetwork(JSON.parse(text));
              setConfirmation({
                title: 'Load imported review settings?',
                description:
                  'This replaces the unsaved configuration. Nothing is written to the database until you save.',
                action: () => {
                  r.change(imported);
                  setText('');
                },
              });
            })
          }
        >
          Validate & import
        </Button>
      </section>
      <section className="panel nc-release-gates">
        <h2>Server release gates</h2>
        <p>
          The standalone test server adds administrator sign-in and original
          Pi-hole API features in Live Pi-hole. Custom parental/country policies
          are still simulations. Resolver/GeoIP integration, category-feed
          ingestion, family roles, and real enforcement tests remain required.
          Never expose the development preview or this test release to the Internet.
        </p>
        <p>
          The TrueNAS package runs alongside an existing Pi-hole with separate
          storage and a separate web port. Installing it does not change DNS or
          apply the policy simulator's saved settings.
        </p>
      </section>
      <ConfirmAction
        value={confirmation}
        onClose={() => setConfirmation(null)}
      />
    </>
  );
}
