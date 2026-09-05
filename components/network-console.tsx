'use client';
import {
  Shield,
  Globe2,
  Monitor,
  CalendarClock,
  Activity,
  Settings2,
  UsersRound,
  ListFilter,
  Save,
  Bell,
  ArrowUpRight,
  FlaskConical,
  Radio,
  LogOut,
} from 'lucide-react';
import {
  Sidebar,
  SidebarProvider,
  SidebarHeader,
  SidebarContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarInset,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import { ParentalControls } from './parental-controls';
import {
  ReviewProvider,
  useReview,
  Header,
  Toggle,
  Empty,
  api,
} from './review-context';
import { CountriesPanel, DevicesPanel, SchedulesPanel } from './network-panels';
import {
  ActivityPanel,
  BlocklistsPanel,
  SettingsPanel,
  EventTable,
} from './activity-panels';
import catalog from '@/config/blocklist-presets.json';
import { LivePihole } from './live-pihole';
import { useSession } from './session-gate';
const navigation = [
  ['Live Pi-hole', Radio],
  ['Overview', Shield],
  ['Parental Controls', UsersRound],
  ['Countries', Globe2],
  ['Devices', Monitor],
  ['Schedules', CalendarClock],
  ['Blocklists', ListFilter],
  ['Activity', Activity],
  ['Advanced Pi-hole', Settings2],
] as const;
function Console() {
  const session = useSession();
  const r = useReview(),
    { state, section, setSection } = r;
  const { setOpenMobile } = useSidebar();
  const alerts = r.events.filter((e) => e.notification && !e.acknowledged);
  return (
    <>
      <Sidebar>
        <SidebarHeader className="brand">
          <Shield />
          <span>
            Super Pi Hole<small>Family & smart-home privacy</small>
          </span>
        </SidebarHeader>
        <SidebarContent>
          <SidebarMenu>
            {navigation.map(([label, Icon]) => (
              <SidebarMenuItem key={label}>
                <SidebarMenuButton
                  isActive={section === label}
                  onClick={() => {
                    setSection(label);
                    setOpenMobile(false);
                    window.scrollTo({ top: 0, behavior: 'instant' });
                  }}
                >
                  <Icon />
                  <span>{label}</span>
                  {label === 'Activity' && alerts.length > 0 && (
                    <span className="nc-count">{alerts.length}</span>
                  )}
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
          <div className="nc-sidebar-note">
            <span className="nc-status-dot" /> {session.mode === 'server-test' ? 'Server test · 0.2.0' : 'Local review build'}
            <small>Live DNS and policy review are separate</small>
          </div>
        </SidebarContent>
      </Sidebar>
      <SidebarInset>
        <header className="topbar">
          <SidebarTrigger />
          <span className="nc-top-title">Home network</span>
          <span className="badge amber">{section === 'Live Pi-hole' ? 'Pi-hole API' : 'Policy simulator'}</span>
          {session.mode === 'server-test' && <Button variant="ghost" aria-label="Sign out" onClick={session.logout}><LogOut /></Button>}
          <Button
            variant="ghost"
            aria-label={`Notifications: ${alerts.length} unread`}
            onClick={() => setSection('Activity')}
          >
            <Bell />
            {alerts.length > 0 && alerts.length}
          </Button>
          <Button
            disabled={!r.ready || r.busy || !r.dirty}
            onClick={r.saveClick}
          >
            <Save />
            {r.busy ? 'Working…' : r.dirty ? 'Save changes' : 'Saved locally'}
          </Button>
        </header>
        <main className="workspace nc-workspace">
          {session.synthetic && <div className="nc-review-strip"><FlaskConical /><strong>Synthetic test server. All DNS clients, queries, and live-control actions on this page are fabricated test data.</strong></div>}
          {section !== 'Live Pi-hole' && <div className="nc-review-strip">
            <FlaskConical />
            <span>
              Policy review: these custom settings and synthetic tests do not control
              live DNS. Use Live Pi-hole for connected statistics and original controls.
            </span>
          </div>}
          <output className="pc-feedback" aria-live="polite">
            {r.message}
          </output>
          {r.error && (
            <div className="pc-error" role="alert">
              {r.error}
              {!r.ready && (
                <Button
                  variant="outline"
                  onClick={() =>
                    r.perform(async () => {
                      r.accept(await api('state'));
                      r.setMessage('Local settings loaded.');
                    })
                  }
                >
                  Retry connection
                </Button>
              )}
            </div>
          )}
          {section === 'Live Pi-hole' ? <LivePihole /> : !r.ready ? (
            <section className="panel">
              <h1>Connecting to the local review service</h1>
              <p>
                Review settings stay in this app's database. Loading them does not change live DNS.
              </p>
            </section>
          ) : (
            <>
              {section === 'Overview' && (
                <>
                  <Header
                    title="Your network, under your control."
                    description="Choose a device, set its policy, then test the result."
                  >
                    <Button onClick={() => setSection('Activity')}>
                      <FlaskConical />
                      Test a policy
                    </Button>
                  </Header>
                  <div className="stats">
                    <article>
                      <span>Review devices</span>
                      <strong>{state.devices.length}</strong>
                      <small>Named and grouped</small>
                    </article>
                    <article>
                      <span>Family profiles</span>
                      <strong>{state.parental.profiles.length}</strong>
                      <small>Shared across every view</small>
                    </article>
                    <article>
                      <span>Selected countries</span>
                      <strong>{state.countries.blocked.length}</strong>
                      <small>
                        {state.countries.enabled
                          ? 'Country evaluation on'
                          : 'Country evaluation off'}
                      </small>
                    </article>
                    <article>
                      <span>Synthetic tests</span>
                      <strong>{r.events.length}</strong>
                      <small>
                        {
                          r.events.filter((e) => e.decision.action === 'block')
                            .length
                        }{' '}
                        would block · not live traffic
                      </small>
                    </article>
                  </div>
                  <div className="nc-two">
                    <section className="panel">
                      <div className="section-head">
                        <h2>Protection plan</h2>
                        <Shield className="nc-accent" />
                      </div>
                      <Toggle
                        label="Evaluate review policies"
                        checked={state.evaluationEnabled}
                        onChange={(evaluationEnabled) =>
                          r.change({ ...state, evaluationEnabled })
                        }
                        description="Pauses only the simulator, never your live Pi-hole."
                      />
                      <div className="nc-summary-line">
                        <span>Network blocklist preset</span>
                        <strong>
                          {
                            catalog.presets.find(
                              (p) => p.id === state.lists.preset,
                            )?.name
                          }
                        </strong>
                      </div>
                      <div className="nc-summary-line">
                        <span>Website rules</span>
                        <strong>{state.rules.length}</strong>
                      </div>
                      <div className="nc-summary-line">
                        <span>Website schedules</span>
                        <strong>
                          {
                            state.schedules.filter((s) => s.window.enabled)
                              .length
                          }{' '}
                          enabled
                        </strong>
                      </div>
                      <Button
                        variant="outline"
                        onClick={() => setSection('Blocklists')}
                      >
                        Review blocklist defaults <ArrowUpRight />
                      </Button>
                    </section>
                    <section className="panel">
                      <div className="section-head">
                        <h2>Device groups</h2>
                        <Button
                          variant="ghost"
                          onClick={() => setSection('Devices')}
                        >
                          Manage <ArrowUpRight />
                        </Button>
                      </div>
                      {state.groups.map((g) => (
                        <div className="nc-summary-line" key={g.id}>
                          <strong>{g.name}</strong>
                          <span>
                            {
                              state.devices.filter((d) => d.groupId === g.id)
                                .length
                            }{' '}
                            devices
                          </span>
                        </div>
                      ))}
                    </section>
                  </div>
                  <section className="panel">
                    <div className="section-head">
                      <h2>Recent policy tests</h2>
                      <Button
                        variant="ghost"
                        onClick={() => setSection('Activity')}
                      >
                        View activity
                      </Button>
                    </div>
                    {r.events.length ? (
                      <EventTable rows={r.events.slice(0, 5)} />
                    ) : (
                      <Empty>
                        No tests yet. The policy tester evaluates saved settings
                        without making a DNS request.
                      </Empty>
                    )}
                  </section>
                </>
              )}
              <div hidden={section !== 'Parental Controls'}>
                <ParentalControls
                  value={state.parental}
                  devices={state.devices}
                  timezone={state.settings.timezone}
                  onChange={(parental) =>
                    r.change({
                      ...state,
                      parental,
                      lists: {
                        ...state.lists,
                        parentalProfiles: state.lists.parentalProfiles.filter(
                          (id) => parental.profiles.some((p) => p.id === id),
                        ),
                      },
                    })
                  }
                  onSave={async () => {
                    await r.save();
                  }}
                />
              </div>
              {section === 'Countries' && <CountriesPanel />}
              {section === 'Devices' && <DevicesPanel />}
              {section === 'Schedules' && <SchedulesPanel />}
              {section === 'Blocklists' && <BlocklistsPanel />}
              {section === 'Activity' && <ActivityPanel />}
              {section === 'Advanced Pi-hole' && <SettingsPanel />}
            </>
          )}
        </main>
      </SidebarInset>
    </>
  );
}
export function NetworkConsole() {
  return (
    <ReviewProvider>
      <SidebarProvider>
        <Console />
      </SidebarProvider>
    </ReviewProvider>
  );
}
