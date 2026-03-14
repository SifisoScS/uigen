/**
 * Seed script — creates two demo lineage chains in Neon:
 *
 *   AuthForm family
 *     auth-v1   AuthForm v1.0.0        (base: email + password + submit)
 *       └─ auth-v2   AuthForm Dark v1.1.0   (dark mode toggle)
 *            └─ auth-v3   AuthForm Dark + OAuth v1.2.0 (Google OAuth + loading state)
 *
 *   PricingCard family
 *     price-v1  PricingCard v1.0.0     (base: 3-tier cards)
 *       └─ price-v2  PricingCard Toggle v1.1.0 (monthly/annual toggle)
 *            └─ price-v3  PricingCard Annual v1.2.0 (annual savings callout + CTA)
 *
 * Run:
 *   npx tsx scripts/seed-artifacts.ts
 */

import { createHash } from "crypto";
import { PrismaClient } from "../src/generated/prisma/index.js";

const prisma = new PrismaClient();

// ── helpers ───────────────────────────────────────────────────────────────────

function filesHash(filesData: string): string {
  const parsed = JSON.parse(filesData) as Record<string, unknown>;
  const entries: { path: string; content: string }[] = [];
  function walk(node: unknown) {
    if (!node || typeof node !== "object") return;
    const n = node as Record<string, unknown>;
    if (n.type === "file" && typeof n.path === "string") {
      entries.push({ path: n.path, content: String(n.content ?? "") });
    }
    if (n.children && typeof n.children === "object") {
      for (const child of Object.values(n.children as object)) walk(child);
    }
  }
  walk(parsed);
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return createHash("sha256")
    .update(entries.map((e) => `${e.path}:${e.content}`).join("\n"))
    .digest("hex");
}

function makeFilesData(files: Record<string, string>): string {
  // Build the tree structure the VFS serialize() / computeFilesHash walk expects
  const root: Record<string, unknown> = {
    type: "directory",
    name: "/",
    path: "/",
    children: {} as Record<string, unknown>,
  };
  const children = root.children as Record<string, unknown>;

  for (const [filePath, content] of Object.entries(files)) {
    const parts = filePath.replace(/^\//, "").split("/");
    if (parts.length === 1) {
      children[parts[0]] = {
        type: "file",
        name: parts[0],
        path: `/${parts[0]}`,
        content,
      };
    } else {
      // nested — e.g. components/AuthForm.tsx
      const dirName = parts[0];
      if (!children[dirName]) {
        children[dirName] = {
          type: "directory",
          name: dirName,
          path: `/${dirName}`,
          children: {} as Record<string, unknown>,
        };
      }
      const dir = children[dirName] as { children: Record<string, unknown> };
      dir.children[parts[1]] = {
        type: "file",
        name: parts[1],
        path: `/${parts[0]}/${parts[1]}`,
        content,
      };
    }
  }
  return JSON.stringify(root);
}

function buildManifest(opts: {
  id: string;
  name: string;
  description: string;
  version: string;
  projectId: string;
  branchName: string;
  parentArtifactId: string | null;
  tags: string[];
  fHash: string;
}) {
  return {
    id: opts.id,
    name: opts.name,
    description: opts.description,
    version: opts.version,
    projectId: opts.projectId,
    branchName: opts.branchName,
    releasedAt: new Date().toISOString(),
    releasedBy: "seed-script",
    parentArtifactId: opts.parentArtifactId,
    governancePolicy: {
      policyType: "HUMAN_ONLY",
      policyHash: createHash("sha256").update("HUMAN_ONLY").digest("hex"),
    },
    filesHash: opts.fHash,
    previewImageUrl: null,
    registryTags: opts.tags,
  };
}

// ── AuthForm family ───────────────────────────────────────────────────────────

const AUTH_APP = `import { useState } from 'react';
import { AuthForm } from '@/components/AuthForm';

export default function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-violet-950 to-slate-900 flex items-center justify-center p-4">
      <AuthForm onSubmit={(e, p) => console.log(e, p)} />
    </div>
  );
}`;

const AUTH_FORM_V1 = `import { useState, FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';

interface Props { onSubmit: (email: string, password: string) => void; }

export function AuthForm({ onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); onSubmit(email, password); };

  return (
    <div className="w-full max-w-sm bg-white/5 border border-white/10 rounded-2xl p-8 shadow-2xl">
      <h1 className="text-2xl font-bold text-white mb-6 text-center">Create account</h1>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required
            placeholder="you@example.com"
            className="w-full h-10 px-3 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-violet-500/60 transition-all" />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-300 mb-1.5">Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required
              placeholder="••••••••"
              className="w-full h-10 px-3 pr-10 rounded-lg bg-white/5 border border-white/10 text-white placeholder:text-slate-500 text-sm focus:outline-none focus:border-violet-500/60 transition-all" />
            <button type="button" onClick={() => setShowPw(v => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white transition-colors">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" className="w-full h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors">
          Sign up
        </button>
      </form>
    </div>
  );
}`;

const AUTH_FORM_V2 = `import { useState, FormEvent } from 'react';
import { Eye, EyeOff, Moon, Sun } from 'lucide-react';

interface Props { onSubmit: (email: string, password: string) => void; }

export function AuthForm({ onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [dark, setDark] = useState(true);

  const handleSubmit = (e: FormEvent) => { e.preventDefault(); onSubmit(email, password); };

  const card = dark
    ? 'bg-white/5 border-white/10 text-white'
    : 'bg-white border-gray-200 text-gray-900';
  const input = dark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-violet-500/60'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-violet-500';
  const btn = dark
    ? 'bg-violet-600 hover:bg-violet-500 text-white'
    : 'bg-violet-600 hover:bg-violet-700 text-white';

  return (
    <div className={\`w-full max-w-sm border rounded-2xl p-8 shadow-2xl transition-colors \${card}\`}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create account</h1>
        <button onClick={() => setDark(v => !v)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors" aria-label="Toggle dark mode">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 opacity-70">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
            className={\`w-full h-10 px-3 rounded-lg border text-sm focus:outline-none transition-all \${input}\`} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 opacity-70">Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
              className={\`w-full h-10 px-3 pr-10 rounded-lg border text-sm focus:outline-none transition-all \${input}\`} />
            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" className={\`w-full h-10 rounded-lg font-semibold text-sm transition-colors \${btn}\`}>Sign up</button>
      </form>
    </div>
  );
}`;

const AUTH_FORM_V3 = `import { useState, FormEvent } from 'react';
import { Eye, EyeOff, Moon, Sun, Loader2 } from 'lucide-react';

interface Props { onSubmit: (email: string, password: string) => void; }

export function AuthForm({ onSubmit }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [dark, setDark] = useState(true);
  const [loading, setLoading] = useState(false);
  const [oauthLoading, setOauthLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise(r => setTimeout(r, 800));
    onSubmit(email, password);
    setLoading(false);
  };

  const handleGoogle = async () => {
    setOauthLoading(true);
    await new Promise(r => setTimeout(r, 1000));
    console.log('Google OAuth flow');
    setOauthLoading(false);
  };

  const card = dark ? 'bg-white/5 border-white/10 text-white' : 'bg-white border-gray-200 text-gray-900';
  const input = dark
    ? 'bg-white/5 border-white/10 text-white placeholder:text-slate-500 focus:border-violet-500/60'
    : 'bg-gray-50 border-gray-300 text-gray-900 placeholder:text-gray-400 focus:border-violet-500';
  const divider = dark ? 'border-white/10 text-slate-400' : 'border-gray-200 text-gray-400';

  return (
    <div className={\`w-full max-w-sm border rounded-2xl p-8 shadow-2xl transition-colors \${card}\`}>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Create account</h1>
        <button onClick={() => setDark(v => !v)} className="p-1.5 rounded-lg hover:bg-white/10 transition-colors">
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
      </div>

      {/* Google OAuth */}
      <button onClick={handleGoogle} disabled={oauthLoading || loading}
        className={\`w-full h-10 rounded-lg border font-medium text-sm mb-4 flex items-center justify-center gap-2 transition-colors disabled:opacity-50 \${dark ? 'border-white/10 hover:bg-white/5' : 'border-gray-200 hover:bg-gray-50'}\`}>
        {oauthLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : (
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
        )}
        Continue with Google
      </button>

      <div className={\`flex items-center gap-3 mb-4 \${divider}\`}>
        <div className="flex-1 border-t" /><span className="text-xs">or</span><div className="flex-1 border-t" />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-xs font-medium mb-1.5 opacity-70">Email</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} required placeholder="you@example.com"
            className={\`w-full h-10 px-3 rounded-lg border text-sm focus:outline-none transition-all \${input}\`} />
        </div>
        <div>
          <label className="block text-xs font-medium mb-1.5 opacity-70">Password</label>
          <div className="relative">
            <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} required placeholder="••••••••"
              className={\`w-full h-10 px-3 pr-10 rounded-lg border text-sm focus:outline-none transition-all \${input}\`} />
            <button type="button" onClick={() => setShowPw(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 opacity-60 hover:opacity-100 transition-opacity">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>
        <button type="submit" disabled={loading || oauthLoading}
          className="w-full h-10 rounded-lg bg-violet-600 hover:bg-violet-500 text-white font-semibold text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}
          Sign up
        </button>
      </form>
    </div>
  );
}`;

// ── PricingCard family ────────────────────────────────────────────────────────

const PRICING_APP_V1 = `import { PricingCards } from '@/components/PricingCards';

export default function App() {
  return (
    <div className="min-h-screen bg-white flex items-start justify-center py-16 px-4">
      <PricingCards />
    </div>
  );
}`;

const PRICING_CARDS_V1 = `import { Check } from 'lucide-react';

const PLANS = [
  { name: 'Starter', price: '$0',  features: ['3 projects','1 GB storage','Community support'], cta: 'Get started free', highlight: false },
  { name: 'Pro',     price: '$29', features: ['Unlimited projects','50 GB storage','Priority support','Custom domain'], cta: 'Start free trial', highlight: true  },
  { name: 'Enterprise', price: '$99', features: ['Unlimited everything','SSO & SAML','Dedicated support','SLA guarantee'], cta: 'Contact sales', highlight: false },
];

export function PricingCards() {
  return (
    <div className="w-full max-w-5xl">
      <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-12">Simple, transparent pricing</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map(p => (
          <div key={p.name} className={\`rounded-3xl border-2 p-8 flex flex-col \${p.highlight ? 'border-indigo-500 shadow-2xl shadow-indigo-100 scale-105' : 'border-gray-100 shadow-md'}\`}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{p.name}</h3>
            <p className="text-4xl font-extrabold text-gray-900 mb-6">{p.price}<span className="text-sm font-normal text-gray-400">/mo</span></p>
            <ul className="space-y-3 flex-1 mb-8">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check className="h-4 w-4 text-indigo-500 flex-shrink-0" />{f}
                </li>
              ))}
            </ul>
            <button className={\`w-full h-12 rounded-xl text-sm font-semibold transition-all \${p.highlight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-900'}\`}>{p.cta}</button>
          </div>
        ))}
      </div>
    </div>
  );
}`;

const PRICING_APP_V2 = `import { useState } from 'react';
import { PricingCards } from '@/components/PricingCards';

export default function App() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  return (
    <div className="min-h-screen bg-white flex items-start justify-center py-16 px-4">
      <div className="w-full max-w-5xl">
        {/* Billing toggle */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(['monthly','annual'] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)}
                className={\`px-5 py-2 rounded-lg text-sm font-semibold transition-all \${billing === b ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}\`}>
                {b.charAt(0).toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>
        </div>
        <PricingCards billing={billing} />
      </div>
    </div>
  );
}`;

const PRICING_CARDS_V2 = `import { Check } from 'lucide-react';

const PLANS = [
  { name: 'Starter', monthly: '$0',  annual: '$0',  features: ['3 projects','1 GB storage','Community support'], cta: 'Get started free', highlight: false },
  { name: 'Pro',     monthly: '$29', annual: '$23', features: ['Unlimited projects','50 GB storage','Priority support','Custom domain'], cta: 'Start free trial', highlight: true  },
  { name: 'Enterprise', monthly: '$99', annual: '$79', features: ['Unlimited everything','SSO & SAML','Dedicated support','SLA guarantee'], cta: 'Contact sales', highlight: false },
];

interface Props { billing: 'monthly' | 'annual'; }

export function PricingCards({ billing }: Props) {
  return (
    <div className="w-full max-w-5xl">
      <h1 className="text-4xl font-extrabold text-center text-gray-900 mb-12">Simple, transparent pricing</h1>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map(p => (
          <div key={p.name} className={\`rounded-3xl border-2 p-8 flex flex-col \${p.highlight ? 'border-indigo-500 shadow-2xl shadow-indigo-100 scale-105' : 'border-gray-100 shadow-md'}\`}>
            <h3 className="text-lg font-bold text-gray-900 mb-1">{p.name}</h3>
            <p className="text-4xl font-extrabold text-gray-900 mb-1">
              {billing === 'monthly' ? p.monthly : p.annual}
              {p.monthly !== '$0' && <span className="text-sm font-normal text-gray-400">/mo</span>}
            </p>
            {billing === 'annual' && p.monthly !== '$0' && (
              <p className="text-xs text-emerald-600 font-medium mb-4">Billed annually</p>
            )}
            <ul className="space-y-3 flex-1 mb-8 mt-4">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2 text-sm text-gray-600">
                  <Check className="h-4 w-4 text-indigo-500 flex-shrink-0" />{f}
                </li>
              ))}
            </ul>
            <button className={\`w-full h-12 rounded-xl text-sm font-semibold transition-all \${p.highlight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-900'}\`}>{p.cta}</button>
          </div>
        ))}
      </div>
    </div>
  );
}`;

const PRICING_APP_V3 = `import { useState } from 'react';
import { PricingCards } from '@/components/PricingCards';

export default function App() {
  const [billing, setBilling] = useState<'monthly' | 'annual'>('annual');
  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50/60 to-white flex items-start justify-center py-16 px-4">
      <div className="w-full max-w-5xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-extrabold text-gray-900">Plans for every team</h1>
          <p className="mt-3 text-gray-500">Start free. Upgrade when you're ready.</p>
        </div>
        {/* Billing toggle with savings badge */}
        <div className="flex justify-center mb-10">
          <div className="inline-flex items-center gap-1 bg-gray-100 p-1 rounded-xl">
            {(['monthly','annual'] as const).map(b => (
              <button key={b} onClick={() => setBilling(b)}
                className={\`px-5 py-2 rounded-lg text-sm font-semibold transition-all flex items-center gap-2 \${billing === b ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}\`}>
                {b.charAt(0).toUpperCase() + b.slice(1)}
                {b === 'annual' && <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">−20%</span>}
              </button>
            ))}
          </div>
        </div>
        <PricingCards billing={billing} />
        {billing === 'annual' && (
          <p className="text-center text-sm text-emerald-600 mt-6 font-medium">
            🎉 You're saving up to $240/year with annual billing
          </p>
        )}
      </div>
    </div>
  );
}`;

const PRICING_CARDS_V3 = `import { Check, Zap } from 'lucide-react';

const PLANS = [
  {
    name: 'Starter', monthly: '$0', annual: '$0', monthlyNum: 0, annualNum: 0,
    description: 'Perfect for side projects.',
    features: ['3 projects','1 GB storage','Community support','Basic analytics'],
    cta: 'Get started free', highlight: false,
  },
  {
    name: 'Pro', monthly: '$29', annual: '$23', monthlyNum: 29, annualNum: 23,
    description: 'For growing teams shipping fast.',
    badge: 'Most popular',
    features: ['Unlimited projects','50 GB storage','Priority support','Advanced analytics','Custom domain','Team seats (5)'],
    cta: 'Start free trial', highlight: true,
  },
  {
    name: 'Enterprise', monthly: '$99', annual: '$79', monthlyNum: 99, annualNum: 79,
    description: 'For large orgs with advanced needs.',
    features: ['Unlimited everything','SSO & SAML','Dedicated support','SLA guarantee','Custom contracts','Unlimited seats'],
    cta: 'Contact sales', highlight: false,
  },
];

interface Props { billing: 'monthly' | 'annual'; }

export function PricingCards({ billing }: Props) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
      {PLANS.map(p => {
        const price = billing === 'annual' ? p.annual : p.monthly;
        const saving = billing === 'annual' && p.monthlyNum > 0
          ? Math.round((p.monthlyNum - p.annualNum) * 12)
          : 0;

        return (
          <div key={p.name} className={\`relative rounded-3xl border-2 p-8 flex flex-col \${p.highlight ? 'border-indigo-500 shadow-2xl shadow-indigo-100 scale-105 bg-white' : 'border-gray-100 shadow-md bg-white'}\`}>
            {p.badge && (
              <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                <span className="px-3 py-1 bg-indigo-600 text-white text-xs font-bold rounded-full">{p.badge}</span>
              </div>
            )}
            <div className="mb-4">
              <h3 className="text-lg font-bold text-gray-900">{p.name}</h3>
              <p className="text-xs text-gray-500 mt-0.5">{p.description}</p>
            </div>
            <div className="mb-6">
              <span className="text-4xl font-extrabold text-gray-900">{price}</span>
              {p.monthlyNum > 0 && <span className="text-gray-400 text-sm ml-1">/mo</span>}
              {saving > 0 && (
                <div className="mt-1 inline-flex items-center gap-1 text-xs text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full">
                  <Zap className="h-3 w-3" /> Save \${saving}/yr
                </div>
              )}
            </div>
            <ul className="space-y-3 flex-1 mb-8">
              {p.features.map(f => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-gray-600">
                  <Check className="h-4 w-4 text-indigo-500 flex-shrink-0" />{f}
                </li>
              ))}
            </ul>
            <button className={\`w-full h-12 rounded-xl text-sm font-semibold transition-all \${p.highlight ? 'bg-indigo-600 hover:bg-indigo-700 text-white' : 'border border-gray-200 hover:bg-gray-50 text-gray-900'}\`}>
              {p.cta}
            </button>
          </div>
        );
      })}
    </div>
  );
}`;

// ── seed ──────────────────────────────────────────────────────────────────────

async function seed() {
  console.log("Clearing any previous seed artifacts...");
  await prisma.publicArtifact.deleteMany({
    where: { projectId: { in: ["seed-auth", "seed-pricing"] } },
  });

  const now = new Date();
  const t = (offset: number) => new Date(now.getTime() + offset * 1000);

  // ── AuthForm chain ──────────────────────────────────────────────────────────

  const authV1Data = makeFilesData({
    "App.tsx": AUTH_APP,
    "components/AuthForm.tsx": AUTH_FORM_V1,
  });
  const authV1 = await prisma.publicArtifact.create({
    data: {
      id: "seed-auth-v1",
      projectId: "seed-auth",
      branchName: "release/v1.0",
      version: "1.0.0",
      name: "AuthForm",
      description: "Clean sign-up form with email, password, show/hide toggle, and submit button.",
      manifest: buildManifest({
        id: "seed-auth-v1", name: "AuthForm", description: "Clean sign-up form with email, password, show/hide toggle, and submit button.",
        version: "1.0.0", projectId: "seed-auth", branchName: "release/v1.0",
        parentArtifactId: null, tags: ["auth", "form", "ui"],
        fHash: filesHash(authV1Data),
      }),
      filesData: authV1Data,
      authorId: null,
      remixCount: 2,
      parentArtifactId: null,
      createdAt: t(-300),
    },
  });
  console.log("✓ Created", authV1.name, authV1.version, authV1.id);

  const authV2Data = makeFilesData({
    "App.tsx": AUTH_APP,
    "components/AuthForm.tsx": AUTH_FORM_V2,
  });
  const authV2 = await prisma.publicArtifact.create({
    data: {
      id: "seed-auth-v2",
      projectId: "seed-auth",
      branchName: "release/v1.1",
      version: "1.1.0",
      name: "AuthForm Dark",
      description: "Adds a dark/light mode toggle with variant-class theming throughout the form.",
      manifest: buildManifest({
        id: "seed-auth-v2", name: "AuthForm Dark", description: "Adds a dark/light mode toggle with variant-class theming throughout the form.",
        version: "1.1.0", projectId: "seed-auth", branchName: "release/v1.1",
        parentArtifactId: "seed-auth-v1", tags: ["auth", "form", "dark-mode", "ui"],
        fHash: filesHash(authV2Data),
      }),
      filesData: authV2Data,
      authorId: null,
      remixCount: 1,
      parentArtifactId: "seed-auth-v1",
      createdAt: t(-200),
    },
  });
  console.log("✓ Created", authV2.name, authV2.version, authV2.id);

  const authV3Data = makeFilesData({
    "App.tsx": AUTH_APP,
    "components/AuthForm.tsx": AUTH_FORM_V3,
  });
  const authV3 = await prisma.publicArtifact.create({
    data: {
      id: "seed-auth-v3",
      projectId: "seed-auth",
      branchName: "release/v1.2",
      version: "1.2.0",
      name: "AuthForm Dark + OAuth",
      description: "Extends the dark-mode form with a Google OAuth button, loading spinner, and async submit state.",
      manifest: buildManifest({
        id: "seed-auth-v3", name: "AuthForm Dark + OAuth", description: "Extends the dark-mode form with a Google OAuth button, loading spinner, and async submit state.",
        version: "1.2.0", projectId: "seed-auth", branchName: "release/v1.2",
        parentArtifactId: "seed-auth-v2", tags: ["auth", "form", "oauth", "dark-mode", "ui"],
        fHash: filesHash(authV3Data),
      }),
      filesData: authV3Data,
      authorId: null,
      remixCount: 0,
      parentArtifactId: "seed-auth-v2",
      createdAt: t(-100),
    },
  });
  console.log("✓ Created", authV3.name, authV3.version, authV3.id);

  // ── PricingCard chain ───────────────────────────────────────────────────────

  const priceV1Data = makeFilesData({
    "App.tsx": PRICING_APP_V1,
    "components/PricingCards.tsx": PRICING_CARDS_V1,
  });
  const priceV1 = await prisma.publicArtifact.create({
    data: {
      id: "seed-price-v1",
      projectId: "seed-pricing",
      branchName: "release/v1.0",
      version: "1.0.0",
      name: "PricingCard",
      description: "Three-tier pricing cards (Starter / Pro / Enterprise) with feature lists and CTA buttons.",
      manifest: buildManifest({
        id: "seed-price-v1", name: "PricingCard", description: "Three-tier pricing cards with feature lists and CTA buttons.",
        version: "1.0.0", projectId: "seed-pricing", branchName: "release/v1.0",
        parentArtifactId: null, tags: ["pricing", "marketing", "cards"],
        fHash: filesHash(priceV1Data),
      }),
      filesData: priceV1Data,
      authorId: null,
      remixCount: 2,
      parentArtifactId: null,
      createdAt: t(-280),
    },
  });
  console.log("✓ Created", priceV1.name, priceV1.version, priceV1.id);

  const priceV2Data = makeFilesData({
    "App.tsx": PRICING_APP_V2,
    "components/PricingCards.tsx": PRICING_CARDS_V2,
  });
  const priceV2 = await prisma.publicArtifact.create({
    data: {
      id: "seed-price-v2",
      projectId: "seed-pricing",
      branchName: "release/v1.1",
      version: "1.1.0",
      name: "PricingCard Toggle",
      description: "Adds a monthly/annual billing toggle; prices swap dynamically with 'billed annually' note.",
      manifest: buildManifest({
        id: "seed-price-v2", name: "PricingCard Toggle", description: "Adds a monthly/annual billing toggle.",
        version: "1.1.0", projectId: "seed-pricing", branchName: "release/v1.1",
        parentArtifactId: "seed-price-v1", tags: ["pricing", "marketing", "billing", "toggle"],
        fHash: filesHash(priceV2Data),
      }),
      filesData: priceV2Data,
      authorId: null,
      remixCount: 1,
      parentArtifactId: "seed-price-v1",
      createdAt: t(-180),
    },
  });
  console.log("✓ Created", priceV2.name, priceV2.version, priceV2.id);

  const priceV3Data = makeFilesData({
    "App.tsx": PRICING_APP_V3,
    "components/PricingCards.tsx": PRICING_CARDS_V3,
  });
  const priceV3 = await prisma.publicArtifact.create({
    data: {
      id: "seed-price-v3",
      projectId: "seed-pricing",
      branchName: "release/v1.2",
      version: "1.2.0",
      name: "PricingCard Annual Savings",
      description: "Highlights annual savings per plan ($/yr badge), hero gradient background, and savings callout footer.",
      manifest: buildManifest({
        id: "seed-price-v3", name: "PricingCard Annual Savings", description: "Annual savings badges and savings callout.",
        version: "1.2.0", projectId: "seed-pricing", branchName: "release/v1.2",
        parentArtifactId: "seed-price-v2", tags: ["pricing", "marketing", "billing", "annual", "savings"],
        fHash: filesHash(priceV3Data),
      }),
      filesData: priceV3Data,
      authorId: null,
      remixCount: 0,
      parentArtifactId: "seed-price-v2",
      createdAt: t(-80),
    },
  });
  console.log("✓ Created", priceV3.name, priceV3.version, priceV3.id);

  console.log("\nSeed complete.");
  console.log("  AuthForm chain:    /lineage/seed-auth-v1");
  console.log("  PricingCard chain: /lineage/seed-price-v1");
  console.log("  Registry:          /registry");
}

seed()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
