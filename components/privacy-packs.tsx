'use client';
import { useState } from 'react';
import { Monitor, Tv, ArrowUpRight } from 'lucide-react';
import catalog from '@/config/blocklist-presets.json';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { Input } from './ui/input';
import type { Pending } from './live-pihole';

export function PrivacyPacks({
  locked = true,
  groups = [],
  subscribed = [],
  confirm,
}: {
  locked?: boolean;
  groups?: { id: number; name: string; enabled: boolean }[];
  subscribed?: string[];
  confirm?: (p: Pending) => void;
}) {
  const [selected, setSelected] = useState<number[]>([]);
  const valid =
    selected.length > 0 &&
    selected.every((id) => groups.some((g) => g.id === id && g.enabled));
  return (
    <section className="panel sph-privacy">
      <div>
        <span className="eyebrow">LESS REPORTING. MORE CHOICE.</span>
        <h2>Device privacy packs</h2>
        <p>
          Target Windows and LG telemetry without applying a strict
          device-specific list to the whole household.
        </p>
      </div>
      <div className="nc-two">
        {catalog.presets
          .filter((p) => ['windows-telemetry', 'lg-telemetry'].includes(p.id))
          .map((p) => {
            const source = catalog.sources.find((s) => s.id === p.sources[0])!;
            const Icon = p.id === 'windows-telemetry' ? Monitor : Tv;
            const exists = subscribed.includes(source.url);
            return (
              <article className="sph-privacy-card" key={p.id}>
                <div className="section-head">
                  <Icon size={28} />
                  <span className="badge">Opt-in · strict</span>
                </div>
                <h3>{p.name}</h3>
                <p>{p.note}</p>
                <p className="nc-helper">
                  {source.purpose}. HaGeZi’s balanced tiers already include a
                  subset of native trackers; this pack extends coverage and can
                  introduce overlap.
                </p>
                <label htmlFor={source.id}>Pi-hole subscription URL</label>
                <Input
                  id={source.id}
                  value={source.url}
                  readOnly
                  onFocus={(e) => e.currentTarget.select()}
                />
                <a href={source.url} target="_blank" rel="noreferrer">
                  Inspect current upstream list <ArrowUpRight size={15} />
                </a>
                {confirm ? (
                  <Button
                    disabled={locked || !valid || exists}
                    onClick={() =>
                      confirm({
                        title: `Subscribe to ${p.name}?`,
                        description: `Add ${source.url} as an enabled blocking list for these existing Pi-hole groups only: ${selected.map((id) => groups.find((g) => g.id === id)?.name).join(', ')}. ${p.note} You must run Update Gravity in the original Pi-hole and verify the download. This does not enable DNS blocking, change client assignments, or guarantee privacy.`,
                        body: {
                          action: 'privacy-list-add',
                          sourceId: source.id,
                          groups: selected,
                        },
                      })
                    }
                  >
                    {exists
                      ? 'Already subscribed — review in Pi-hole'
                      : 'Review subscription'}
                  </Button>
                ) : (
                  <p className="nc-helper">
                    Install from Live Pi-hole → Lists after connecting and
                    deliberately unlocking live changes, or add this URL in the
                    original Pi-hole.
                  </p>
                )}
              </article>
            );
          })}
      </div>
      {confirm && (
        <fieldset className="sph-groups">
          <legend>
            Apply to existing Pi-hole groups (none selected by default)
          </legend>
          {groups.map((group) => (
            <label key={group.id}>
              <Checkbox
                disabled={!group.enabled || locked}
                checked={selected.includes(group.id)}
                onCheckedChange={(checked) =>
                  setSelected((old) =>
                    checked
                      ? [...new Set([...old, group.id])]
                      : old.filter((id) => id !== group.id),
                  )
                }
              />
              {group.name}
              {!group.enabled && ' (disabled)'}
            </label>
          ))}
          {!groups.length && (
            <p>
              Load or create device-specific groups in the original Pi-hole
              first.
            </p>
          )}
        </fieldset>
      )}
      <p className="nc-helper">
        These groups are real Pi-hole groups, not simulator device groups.
        Verify Windows PCs or TVs are assigned correctly before subscribing.
        Manage existing subscriptions and rollback in the original Pi-hole. No
        automatic gravity update or list download is performed by this
        interface.
      </p>
      <details>
        <summary>Pair DNS filtering with device privacy settings</summary>
        <ul>
          <li>
            Windows: review Settings → Privacy & security → Diagnostics &
            feedback. Turn off optional diagnostic data if appropriate.
            Availability of further controls depends on edition and management
            policy. Do not blanket-block Microsoft, Azure, authentication or
            update domains.
          </li>
          <li>
            LG: review the TV’s Live Plus, viewing-information agreements,
            voice-data consent and advertising settings. Menus vary by model and
            region; review them again after firmware changes.
          </li>
          <li>
            Hard-coded IPs, encrypted DNS, cached records and shared service
            endpoints can bypass or limit DNS filtering. A blocked query does
            not prove a payload was uploaded, and unrecognized domains are not
            proof of wrongdoing.
          </li>
        </ul>
        <a
          href="https://learn.microsoft.com/en-us/windows/privacy/configure-windows-diagnostic-data-in-your-organization"
          target="_blank"
          rel="noreferrer"
        >
          Microsoft diagnostic-data documentation
        </a>{' '}
        ·{' '}
        <a
          href="https://github.com/hagezi/dns-blocklists"
          target="_blank"
          rel="noreferrer"
        >
          HaGeZi list scope and compatibility notes
        </a>
      </details>
    </section>
  );
}
