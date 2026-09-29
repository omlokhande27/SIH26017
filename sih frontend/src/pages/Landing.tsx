import { useState } from 'react';
import { Link } from 'react-router';
import {
  ArrowRight,
  ArrowDown,
  Activity,
  Radar,
  FileSearch,
  ListFilter,
  Zap,
  LineChart,
  ShieldCheck,
  ClipboardList,
  HardHat,
  Folders,
  Database,
  Brain,
  BookOpen,
  Landmark,
  Lock,
  MapPin,
  Shield,
  Menu,
  X,
} from 'lucide-react';

const navLinks = [
  { href: '#how-it-works', label: 'How It Works' },
  { href: '#roles', label: 'Built For' },
  { href: '#infrastructure', label: 'Infrastructure' },
  { href: '#security', label: 'Security' },
];

const stageSteps = [
  {
    number: '01',
    icon: Radar,
    title: 'Predict',
    description: 'Identify projects likely to experience delays.',
  },
  {
    number: '02',
    icon: FileSearch,
    title: 'Explain',
    description: 'Understand the factors driving the prediction.',
  },
  {
    number: '03',
    icon: ListFilter,
    title: 'Prioritize',
    description: 'Identify the most urgent interventions.',
  },
  {
    number: '04',
    icon: Zap,
    title: 'Act',
    description: 'Take corrective action and track the outcome.',
  },
  {
    number: '05',
    icon: LineChart,
    title: 'Track',
    description: 'Measure whether interventions improved project outcomes.',
  },
];

const roles = [
  {
    icon: ShieldCheck,
    title: 'Government Officers',
    description:
      'Portfolio-wide oversight, approval workflows, and escalation authority across every infrastructure project state and district.',
  },
  {
    icon: ClipboardList,
    title: 'Project Managers',
    description:
      'Day-to-day execution, field coordination, and action tracking against AI-generated risk insights.',
  },
  {
    icon: HardHat,
    title: 'Field Workers',
    description:
      'Submit parcel-level data — surveys, disputes, and compensation status — directly from the ground.',
  },
  {
    icon: Folders,
    title: 'Viewers / Auditors',
    description:
      'Read-only access to verify compliance, review interventions, and audit decisions with a complete trail.',
  },
];

const pipeline = [
  { number: '01', icon: Database, label: 'Project data', caption: 'Acquisition · Compensation', flow: 'Land acquisition data' },
  { number: '02', icon: Brain, label: 'AI prediction', caption: 'Delay forecast', flow: 'AI risk prediction' },
  { number: '03', icon: BookOpen, label: 'Explanation', caption: 'Driver analysis', flow: 'Explain why' },
  { number: '04', icon: Zap, label: 'Action', caption: 'Tracked outcome', flow: 'Take action' },
];

const stats = [
  { value: '128', label: 'Projects', note: 'Across 12 states' },
  { value: '18', label: 'High Risk', note: 'Needing attention' },
  { value: '143', label: 'Avg Predicted Delay', note: 'Days' },
  { value: '27', label: 'Pending Actions', note: '8 critical' },
];

const sectors = [
  { name: 'Highways', note: 'National highway expansions requiring large contiguous land parcels.', icon: Landmark },
  { name: 'Metro', note: 'Urban corridors with dense, high-value land and complex litigation.', icon: Landmark },
  { name: 'Rail', note: 'Long linear alignments spanning multiple states and districts.', icon: Landmark },
  { name: 'Roads', note: 'District and state roads facing boundary disputes and survey delays.', icon: MapPin },
  { name: 'Irrigation', note: 'Canal and reservoir projects with seasonal acquisition windows.', icon: MapPin },
];

export default function Landing() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-screen flex flex-col bg-brand-navy text-white">
      {/* ── Top Navigation ── */}
      <header className="sticky top-0 z-50 border-b border-white/10 bg-brand-navy/85 backdrop-blur-md">
        <div data-layout="navbar" className="relative mx-auto flex h-[76px] w-full max-w-[1280px] items-center justify-between gap-8 px-8">
          <a href="#top" className="group flex shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-primary transition-colors group-hover:bg-brand-secondary">
              <Shield className="h-5 w-5 text-brand-accent" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold tracking-[0.04em]">LANDGUARD AI</p>
              <p className="text-[10px] font-medium tracking-[0.18em] text-white/50">GOVERNMENT DECISION SUPPORT</p>
            </div>
          </a>

          <nav className="hidden items-center gap-9 text-sm font-medium text-white/70 lg:flex">
            {navLinks.map((link) => (
              <a
                key={link.label}
                href={link.href}
                className="transition-colors duration-200 hover:text-white"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <Link
              to="/login"
              className="hidden h-10 items-center gap-2 rounded-lg bg-brand-accent px-5 text-sm font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-secondary md:inline-flex"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>

            <button
              type="button"
              onClick={() => setMobileOpen((open) => !open)}
              aria-label={mobileOpen ? 'Close navigation' : 'Open navigation'}
              aria-expanded={mobileOpen}
              className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/15 text-white/80 transition-colors hover:bg-white/5 lg:hidden"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {mobileOpen && (
          <div className="border-t border-white/10 bg-brand-navy/95 px-8 pb-6 pt-3 lg:hidden">
            <nav className="flex flex-col gap-1">
              {navLinks.map((link) => (
                <a
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/5 hover:text-white"
                >
                  {link.label}
                </a>
              ))}
            </nav>
            <Link
              to="/login"
              className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand-accent px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-secondary"
            >
              Sign in
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        )}
      </header>

      {/* ── Hero ── */}
      <main id="top" className="flex-1">
        <section className="relative overflow-hidden">
          {/* Subtle grid backdrop */}
          <div
            className="pointer-events-none absolute inset-0 opacity-20"
            style={{
              backgroundImage:
                'linear-gradient(rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.05) 1px, transparent 1px)',
              backgroundSize: '56px 56px',
              maskImage: 'radial-gradient(ellipse at center, black 25%, transparent 78%)',
            }}
          />

          <div className="relative mx-auto grid w-full max-w-[1280px] grid-cols-1 items-center gap-y-16 px-8 py-16 sm:py-20 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] xl:gap-x-8 xl:py-28">
            {/* ── Left: headline copy ── */}
            <div data-layout="hero-copy" className="min-w-0">
              <p
                className="lg-rise inline-flex items-center gap-2 rounded-full border border-brand-accent/40 bg-brand-accent/10 px-4 py-1.5 text-xs font-semibold tracking-[0.08em] text-brand-accent"
                style={{ animationDelay: '0ms' }}
              >
                <Shield className="h-3.5 w-3.5" />
                AI-POWERED LAND ACQUISITION INTELLIGENCE
              </p>

              <h1
                className="lg-rise mt-6 max-w-[650px] text-[2.4rem] font-bold leading-[1.04] tracking-[-0.03em] text-white sm:text-5xl lg:text-6xl"
                style={{ animationDelay: '80ms' }}
              >
                Prevent project delays
                <br />
                before they
                <br />
                become{' '}
                <span className="bg-gradient-to-r from-brand-accent to-sky-300 bg-clip-text text-transparent">
                  critical.
                </span>
              </h1>

              <p
                className="lg-rise mt-7 max-w-[520px] text-lg leading-[1.6] text-blue-100/80"
                style={{ animationDelay: '160ms' }}
              >
                AI-powered decision support for monitoring land acquisition, identifying project risks, and taking
                action before delays escalate.
              </p>

              <div className="mt-9 flex flex-wrap items-center gap-4">
                <Link
                  to="/login"
                  className="lg-rise inline-flex h-12 items-center gap-2 rounded-lg bg-brand-accent px-7 text-base font-semibold text-white transition-all duration-300 hover:-translate-y-0.5 hover:bg-brand-secondary hover:shadow-lg"
                  style={{ animationDelay: '240ms' }}
                >
                  Sign in to workspace
                  <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href="#how-it-works"
                  className="lg-rise inline-flex h-12 items-center gap-2 rounded-lg border border-white/25 px-7 text-base font-medium text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-white/50 hover:bg-white/5"
                  style={{ animationDelay: '300ms' }}
                >
                  Explore How It Works
                </a>
              </div>
            </div>

            {/* ── Right: decision pipeline dashboard ── */}
            <div className="relative min-w-0">
              <div className="lg-rise pointer-events-none absolute -inset-10 rounded-[48px] bg-[radial-gradient(ellipse_at_center,rgba(59,130,184,0.16),transparent_70%)] blur-2xl" />

              <div
                data-layout="pipeline"
                className="lg-rise relative mx-auto w-full max-w-[560px] rounded-2xl border border-white/10 bg-white/[0.045] p-7 shadow-[0_24px_60px_-24px_rgba(0,0,0,0.55)] backdrop-blur-sm"
                style={{ animationDelay: '120ms' }}
              >
                {/* Panel header */}
                <div className="flex items-start justify-between gap-6">
                  <p className="pt-1 text-xs font-semibold uppercase tracking-[0.22em] text-white/55">
                    Decision pipeline
                  </p>
                  <div className="text-right">
                    <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-white/40">
                      Prediction confidence
                    </p>
                    <p className="mt-1 flex items-center justify-end gap-2">
                      <span className="text-2xl font-bold tabular-nums tracking-tight text-white">88%</span>
                      <span className="lg-live-badge inline-flex items-center gap-1.5 rounded-full bg-risk-low/15 px-2 py-0.5 text-[10px] font-semibold text-risk-low">
                        <span className="lg-pulse-dot h-1.5 w-1.5 rounded-full bg-risk-low" />
                        HIGH RISK
                      </span>
                    </p>
                  </div>
                </div>

                {/* Pipeline stages */}
                <div className="mt-6 flex flex-col">
                  {pipeline.map((step, i) => {
                    const Icon = step.icon;
                    return (
                      <div key={step.label}>
                        <div
                          className="group flex items-center gap-4 rounded-xl border border-white/10 bg-brand-navy/60 px-4 py-3.5 transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-accent/40 hover:bg-white/[0.06]"
                          style={{ animationDelay: `${260 + i * 130}ms` }}
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-accent/15">
                            <Icon className="h-5 w-5 text-brand-accent" />
                          </div>
                          <span className="w-7 shrink-0 font-mono text-xs font-semibold text-brand-accent/70">
                            {step.number}
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold">{step.label}</p>
                            <p className="truncate text-xs text-white/50">{step.caption}</p>
                          </div>
                          <span className="hidden shrink-0 text-[10px] font-medium uppercase tracking-[0.14em] text-white/35 sm:block">
                            {step.flow}
                          </span>
                          {i === pipeline.length - 1 && (
                            <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-risk-low/15 px-2 py-0.5 text-[10px] font-semibold text-risk-low">
                              <span className="lg-pulse-dot h-1.5 w-1.5 rounded-full bg-risk-low" />
                              LIVE
                            </span>
                          )}
                        </div>

                        {i < pipeline.length - 1 && (
                          <div className="flex h-7 items-center justify-center" aria-hidden="true">
                            <span
                              className="h-px w-10 bg-gradient-to-r from-transparent via-white/20 to-transparent"
                            />
                            <ArrowDown className="h-3.5 w-3.5 text-white/30" />
                            <span className="h-px w-10 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Micro flow strip */}
                <div className="mt-6 flex items-center justify-between gap-2 border-t border-white/10 pt-4 text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">
                  <span className="text-white/55">Data</span>
                  <span aria-hidden="true" className="text-white/20">→</span>
                  <span className="text-white/55">Risk</span>
                  <span aria-hidden="true" className="text-white/20">→</span>
                  <span className="text-white/55">Explain</span>
                  <span aria-hidden="true" className="text-white/20">→</span>
                  <span className="flex items-center gap-1.5 text-white/70">
                    <Activity className="h-3 w-3 text-risk-low" />
                    Act
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── Statistics band ── */}
        <section className="border-y border-white/10 bg-brand-navy/60">
          <div className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-8 py-10 md:grid-cols-4">
            {stats.map((stat) => (
              <div key={stat.label} className="flex flex-col items-center gap-1 px-4 text-center">
                <p className="text-4xl font-bold tracking-tight text-white">{stat.value}</p>
                <p className="text-sm font-medium text-white/70">{stat.label}</p>
                <p className="text-xs text-white/40">{stat.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── From prediction to action ── */}
        <section id="how-it-works" className="mx-auto max-w-7xl scroll-mt-20 px-8 py-20 lg:py-24">
          <div className="mb-12 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
            <div>
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-accent">
                How it works
              </p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">From prediction to action</h2>
            </div>
            <p className="max-w-md text-sm text-white/60 lg:justify-self-end">
              Every project moves through a single, auditable loop — forecast, understand, decide, act, and verify.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {stageSteps.map((step) => {
              const Icon = step.icon;
              return (
                <div
                  key={step.number}
                  className="group rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-all hover:-translate-y-1 hover:border-brand-accent/40 hover:bg-white/[0.06]"
                >
                  <p className="mb-4 font-mono text-sm font-semibold text-brand-accent/70">0{step.number}</p>
                  <Icon className="mb-4 h-7 w-7 text-brand-accent" />
                  <h3 className="mb-2 text-base font-semibold">{step.title}</h3>
                  <p className="text-sm leading-relaxed text-white/60">{step.description}</p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Built for infrastructure decision makers ── */}
        <section id="roles" className="border-y border-white/10 bg-brand-navy/60 scroll-mt-20">
          <div className="mx-auto max-w-7xl px-8 py-20 lg:py-24">
            <div className="mb-12">
              <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-accent">Built for</p>
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                Built for infrastructure decision makers
              </h2>
            </div>

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
              {roles.map((role) => {
                const Icon = role.icon;
                return (
                  <div
                    key={role.title}
                    className="rounded-xl border border-white/10 bg-white/[0.03] p-6 transition-colors hover:border-white/25"
                  >
                    <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-accent/15">
                      <Icon className="h-6 w-6 text-brand-accent" />
                    </div>
                    <h3 className="mb-2 text-base font-semibold">{role.title}</h3>
                    <p className="text-sm leading-relaxed text-white/60">{role.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Designed for Indian infrastructure ── */}
        <section id="infrastructure" className="mx-auto max-w-7xl scroll-mt-20 px-8 py-20 lg:py-24">
          <div className="mb-12">
            <p className="mb-2 text-xs font-semibold uppercase tracking-widest text-brand-accent">Infrastructure</p>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">Designed for Indian infrastructure</h2>
            <p className="mt-4 max-w-2xl text-white/60">
              Models and workflows built around the way land acquisition actually happens in Indian mega-projects.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {sectors.map((sector) => (
              <div key={sector.name} className="rounded-xl border border-white/10 bg-white/[0.03] p-6">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-brand-accent/15">
                  <sector.icon className="h-5 w-5 text-brand-accent" />
                </div>
                <h3 className="mb-2 text-base font-semibold">{sector.name}</h3>
                <p className="text-sm leading-relaxed text-white/60">{sector.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* ── Trust / architecture ── */}
        <section id="security" className="border-t border-white/10 scroll-mt-20">
          <div className="mx-auto max-w-7xl px-8 py-20 lg:py-24">
            <div className="mx-auto max-w-3xl text-center">
              <div className="mx-auto mb-6 flex h-14 w-14 items-center justify-center rounded-2xl border border-brand-accent/30 bg-brand-accent/10">
                <Lock className="h-7 w-7 text-brand-accent" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
                Your data stays behind your organization&apos;s secure backend architecture.
              </h2>
              <p className="mt-5 text-white/60">
                LandGuard AI is designed to operate within your governance boundary. Decisions are rooted in your own
                project data, and every prediction, explanation, and action is recorded in an auditable trail.
              </p>
              <div className="mt-8 grid gap-4 text-left sm:grid-cols-3">
                {[
                  ['Role-based access', 'Fine-grained permissions matched to officer, manager, worker, and auditor duties.'],
                  ['Complete audit trail', 'Every prediction, review, and action tracked with who and when.'],
                  ['Deploy in your boundary', 'Runs against your own data layer — not shared with external parties.'],
                ].map(([title, body]) => (
                  <div key={title} className="rounded-xl border border-white/10 bg-white/[0.03] p-5">
                    <h3 className="mb-1 text-sm font-semibold">{title}</h3>
                    <p className="text-sm text-white/55">{body}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* ── Footer ── */}
      <footer className="border-t border-white/10 bg-brand-navy">
        <div className="mx-auto grid max-w-7xl gap-10 px-8 py-14 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-primary">
                <Shield className="h-5 w-5 text-brand-accent" />
              </div>
              <div className="leading-tight">
                <p className="text-sm font-bold tracking-wide">LANDGUARD AI</p>
                <p className="text-[10px] tracking-widest text-white/50">GOVERNMENT DECISION SUPPORT</p>
              </div>
            </div>
            <p className="mt-4 max-w-xs text-sm text-white/55">
              Preventing project delays in land acquisition through AI-powered prediction, explanation, and action.
            </p>
          </div>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50">Platform</p>
            <ul className="space-y-2.5 text-sm text-white/70">
              {['Predict', 'Explain', 'Prioritize', 'Act', 'Track'].map((item) => (
                <li key={item}>
                  <a href="#how-it-works" className="transition-colors hover:text-white">{item}</a>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50">Company</p>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>
                <a href="mailto:contact@landguard.gov.in" className="transition-colors hover:text-white">Contact</a>
              </li>
              <li>
                <a href="#how-it-works" className="transition-colors hover:text-white">About</a>
              </li>
            </ul>
          </div>

          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-widest text-white/50">Legal</p>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>
                <a href="#" className="transition-colors hover:text-white">Privacy</a>
              </li>
              <li>
                <a href="#" className="transition-colors hover:text-white">Terms</a>
              </li>
            </ul>
          </div>
        </div>

        <div className="border-t border-white/10 px-8 py-5 text-center text-xs text-white/40">
          &copy; 2026 LandGuard AI · Demo environment with mock data · contact@landguard.gov.in
        </div>
      </footer>
    </div>
  );
}