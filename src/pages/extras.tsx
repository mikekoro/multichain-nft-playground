// Chain-specific tabs: XRPL offers, EVM and Soroban contracts.
import { useEffect, useState, type ReactNode } from 'react';
import { FileCode, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import * as x from '../chains/xrpl';
import * as e from '../chains/evm';
import * as so from '../chains/soroban';
import { MAINNET } from '../settings';
import type { Chain, Result } from '../pure';
import { validAddress } from '../validate';
import { Code, CopyBtn, EmptyRow, ExtLink, IconBtn, Input, Loading, Mono, StatusLine, useAction, useTracked } from '../ui';
import { META } from '../chainMeta';
import type { ExtraTab } from './ChainPage';

const errText = (err: any) => String(err?.message ?? err);

/** The panel header used by every table here: title, description, a refresh icon and a count. */
function Panel({ title, description, count, onRefresh, loading, action, children }: { title: string; description?: ReactNode; count?: number; onRefresh?: () => void; loading?: boolean; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
        {(onRefresh || action) && <CardAction className={cn('flex items-center gap-1', !action && '-mr-2')}>
          {count !== undefined && <span className="text-sm text-muted-foreground tabular-nums">{count}</span>}
          {onRefresh && <IconBtn label={`Refresh ${title.toLowerCase()}`} icon={RefreshCw} onClick={onRefresh} className={cn(loading && '[&_svg]:animate-spin')} />}
          {action}
        </CardAction>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}
const Framed = ({ children }: { children: ReactNode }) => <div className="overflow-hidden rounded-lg border"><Table className="table-fixed">{children}</Table></div>;
const Err = ({ text }: { text: string }) => text ? <p className="text-sm text-destructive">{text}</p> : null;

// ── XRPL offers ───────────────────────────────────────────────────────────────────────────────
function XrplOffers({ recipient }: { recipient: string }) {
  const [mine, setMine] = useState<x.Offer[] | null>(null);
  const [incoming, setIncoming] = useState<x.Offer[] | null>(null);
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [isBusy, run] = useTracked();
  const refresh = () => {
    setLoading(true);
    Promise.all([x.myOffers(), x.incomingOffers()]).then(([m, i]) => { setMine(m); setIncoming(i); setErr(''); }).catch((er) => setErr(errText(er))).finally(() => setLoading(false));
  };
  useEffect(refresh, []);
  const table = (rows: x.Offer[] | null, who: 'From' | 'To', action: (o: x.Offer) => ReactNode) =>
    <Framed>
        <TableHeader className="bg-muted/30"><TableRow><TableHead className="w-32 pl-3">Offer</TableHead><TableHead>NFT</TableHead><TableHead className="hidden sm:table-cell">{who}</TableHead><TableHead className="w-32"><span className="sr-only">Action</span></TableHead></TableRow></TableHeader>
        <TableBody>{!rows?.length ? <EmptyRow cols={4}>{rows ? 'No offers' : err ? 'Could not read the ledger' : <Loading>Reading the ledger...</Loading>}</EmptyRow> : rows.map((o) => (
          <TableRow key={o.index}>
            <TableCell className="pl-3"><div className="font-medium capitalize">{o.kind}</div><div className="text-xs text-muted-foreground tabular-nums">{o.amount}</div></TableCell>
            <TableCell><Mono value={o.nftId} /><div><Mono value={o.index} className="text-muted-foreground" head={4} tail={4} /></div></TableCell>
            <TableCell className="hidden sm:table-cell">{who === 'From' ? <Mono value={o.owner} /> : o.destination ? <Mono value={o.destination} /> : <span className="text-muted-foreground">anyone</span>}</TableCell>
            <TableCell className="pr-3 text-right">{action(o)}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Framed>;
  return (
    <>
      <Err text={err} />
      <Panel title="Offers to me" description="Sell offers aimed at the playground wallet, and bids on what it holds." count={incoming?.length} onRefresh={refresh} loading={loading}>
        {table(incoming, 'From', (o) => <Button size="sm" variant="outline" disabled={isBusy(o.index)} onClick={() => run(o.index, 'accept offer', () => x.accept(o), refresh)}>Accept</Button>)}
      </Panel>
      <Panel title="My open offers" description="Each open offer locks 0.2 XRP of reserve until it is accepted or cancelled." count={mine?.length} onRefresh={refresh} loading={loading}>
        {table(mine, 'To', (o) => <Button size="sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={isBusy(o.index)} onClick={() => run(o.index, 'cancel offer', () => x.cancel(o.index), refresh)}>Cancel</Button>)}
      </Panel>
      <div className="grid items-start gap-6 md:grid-cols-2"><BidCard recipient={recipient} onDone={refresh} /><AcceptCard onDone={refresh} /></div>
      <p className="text-xs text-muted-foreground">Spare unactivated address (offers to it fail with tecNO_DST): <code className="font-mono break-all">{x.spare}</code></p>
    </>
  );
}

function BidCard({ recipient, onDone }: { recipient: string; onDone: () => void }) {
  const [id, setId] = useState('');
  const [xrp, setXrp] = useState('1');
  const [status, run, busy] = useAction();
  const ok = validAddress('xrpl', recipient);
  useEffect(() => { if (status && status.kind !== 'busy') onDone(); }, [status]);
  return (
    <Card>
      <CardHeader><CardTitle>Bid on the recipient's NFT</CardTitle><CardDescription>A buy offer the recipient wallet must accept.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <Input label="NFTokenID" value={id} onChange={setId} mono />
        <div className="flex items-end gap-4">
          <Input className="flex-1" label="Bid (XRP)" type="number" min={0} step="any" value={xrp} onChange={setXrp} />
          <Button disabled={busy || !id || !ok} onClick={() => run(() => x.buyOffer(id.trim(), recipient, xrp))}>{busy && <Loader2 className="animate-spin" />}Bid</Button>
        </div>
        <StatusLine status={status} txUrl={META.xrpl.tx} />
      </CardContent>
    </Card>
  );
}

function AcceptCard({ onDone }: { onDone: () => void }) {
  const [idx, setIdx] = useState('');
  const [status, run, busy] = useAction();
  useEffect(() => { if (status && status.kind !== 'busy') onDone(); }, [status]);
  return (
    <Card>
      <CardHeader><CardTitle>Accept by offer index</CardTitle><CardDescription>For a sell offer whose NFT is not listed here.</CardDescription></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-end gap-4">
          <Input className="flex-1" label="Sell offer index" value={idx} onChange={setIdx} mono />
          <Button disabled={busy || !idx} onClick={() => run(() => x.accept({ index: idx.trim(), kind: 'sell', nftId: '', amount: '', owner: '' }))}>{busy && <Loader2 className="animate-spin" />}Accept</Button>
        </div>
        <StatusLine status={status} txUrl={META.xrpl.tx} />
      </CardContent>
    </Card>
  );
}

// ── Contracts (EVM, Soroban) ──────────────────────────────────────────────────────────────────
type ContractRow = { name: string; note?: string; address: string; explorer: (a: string) => string; deploy: () => Promise<string | Result> };

function Contracts({ title, description, rows, footer }: { title: string; description: ReactNode; rows: ContractRow[]; footer?: ReactNode }) {
  const [isBusy, run] = useTracked();
  const [, bump] = useState(0);
  return (
    <Panel title={title} description={description}>
      <Framed>
        <TableHeader className="bg-muted/30"><TableRow><TableHead className="pl-3">Contract</TableHead><TableHead className="w-32">Status</TableHead><TableHead className="hidden w-[38%] sm:table-cell">Address</TableHead><TableHead className="w-32"><span className="sr-only">Action</span></TableHead></TableRow></TableHeader>
        <TableBody>{rows.map((r) => (
          <TableRow key={r.name}>
            <TableCell className="py-2.5 pl-3"><div className="flex min-w-0 items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-md border bg-muted/50"><FileCode className="size-4 text-muted-foreground" /></div>
              <div className="min-w-0"><div className="truncate font-medium">{r.name}</div>{r.note && <div className="truncate text-xs text-muted-foreground">{r.note}</div>}</div>
            </div></TableCell>
            <TableCell>{r.address ? <span className="text-success">Deployed</span> : <span className="text-muted-foreground">Not deployed</span>}</TableCell>
            <TableCell className="hidden sm:table-cell">{r.address ? <Mono value={r.address} className="text-sm" /> : <span className="text-muted-foreground">—</span>}</TableCell>
            <TableCell className="pr-3 text-right">{!r.address
              ? <Button size="sm" variant="outline" disabled={isBusy(r.name)} onClick={() => { if (!MAINNET || confirm(`Deploy ${r.name} on mainnet with real funds?`)) run(r.name, `deploy ${r.name}`, r.deploy, () => bump((n) => n + 1)); }}>{isBusy(r.name) && <Loader2 className="animate-spin" />}Deploy</Button>
              : <div className="-mr-2 flex items-center justify-end gap-0.5"><CopyBtn value={r.address} label="Copy address" /><ExtLink href={r.explorer(r.address)} /></div>}</TableCell>
          </TableRow>
        ))}</TableBody>
      </Framed>
      {footer && <footer className="-mt-1 max-w-[75%] text-xs leading-relaxed text-muted-foreground">{footer}</footer>}
    </Panel>
  );
}

const EVM_CONTRACTS: [e.ContractName, string][] = [['PlaygroundNFT', 'ERC-721'], ['Playground1155', 'ERC-1155'], ['PunkLike', 'non-standard'], ['NoopNFT', 'no-op transfer']];
const EvmContracts = () => (
  <Contracts title="Contracts" description={<>Test contracts on {e.chains[e.chainKey()].name}. Minting a type deploys its contract on first use.</>}
    rows={EVM_CONTRACTS.map(([name, note]) => ({ name, note, address: e.contractOf(name), explorer: (a) => `${e.chains[e.chainKey()].blockExplorers?.default.url}/address/${a}`, deploy: () => e.deployNamed(name) }))} />
);
const StellarContracts = () => (
  <Contracts title="Soroban contracts" description="One PlaygroundNft contract per variant. Deploy here or on the first mint; a wallet may need the C... address to add the collection."
    rows={(['standard', 'soulbound'] as const).map((v) => ({ name: v === 'standard' ? 'Standard' : 'Soulbound', note: v === 'standard' ? 'transferable, burnable' : 'transfer panics (#300)', address: so.contractOf(v), explorer: so.explorer, deploy: () => so.deploy(v) }))}
    footer={<>The first deploy uploads the contract code ({MAINNET ? '~14.4 XLM on mainnet' : '~6 XLM on testnet'}, once); the second reuses it.
      Rebuild the contract with <Code>npm run build:soroban</Code> (Docker).</>} />
);

export const EXTRAS: Record<Chain, ExtraTab[]> = {
  xrpl: [{ label: 'Offers', render: ({ recipient }) => <XrplOffers recipient={recipient} /> }],
  evm: [{ label: 'Contracts', render: () => <EvmContracts /> }],
  solana: [],
  stellar: [{ label: 'Contracts', render: () => <StellarContracts /> }],
};
