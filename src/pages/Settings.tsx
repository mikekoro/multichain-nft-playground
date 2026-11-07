import { useState } from 'react';
import { get, set } from '../settings';
import { Code, CopyBtn, Input } from '../ui';

const SAMPLES_CMD = 'npm run samples -- https://host/samples';

export default function Settings() {
  const [base, setBase] = useState(get('meta.base'));
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">Stored in this browser.</p>
      </div>
      <section className="space-y-6 rounded-xl border bg-card p-6">
        <h2 className="text-base leading-5 font-semibold">Metadata</h2>
        <Input label="Sample base URL" value={base} onChange={(v) => { set('meta.base', v); setBase(v); }} mono
          placeholder="https://raw.githubusercontent.com/.../public/samples"
          hint="Leave blank to use this repo on GitHub. Wallets fetch these files directly, so the host has to be public." />
        <div>
          <h3 className="text-sm font-medium">Hosting the samples somewhere else</h3>
            <ol className="mt-2 space-y-2 pl-6 text-sm text-muted-foreground marker:font-mono marker:text-muted-foreground/60 list-decimal">
              <li className="pl-2">Copy <Code>public/samples/</Code> to any static host.</li>
              <li className="space-y-2 pl-2">
                <p>Regenerate the metadata with your URL:</p>
                <div className="flex items-center gap-2 rounded-lg border bg-sidebar py-1 pr-1 pl-4"><code className="min-w-0 flex-1 truncate font-mono text-sm text-foreground">{SAMPLES_CMD}</code><CopyBtn value={SAMPLES_CMD} label="Copy command" /></div>
              </li>
              <li className="pl-2">Paste the base URL into the field above.</li>
            </ol>
        </div>
        <footer className="space-y-1 border-t pt-6 text-sm text-muted-foreground">
          <p>RPC endpoints come from <Code>.env</Code>. Override them in <Code>.env.local</Code>.</p>
        </footer>
      </section>
    </div>
  );
}
