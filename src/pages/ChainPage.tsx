import { useEffect, useId, useState, type ReactNode } from 'react';
import { toast } from 'sonner';
import { ChevronRight, CircleAlert, CircleCheck, Ellipsis, Loader2, Lock, Pencil, RefreshCw, Send, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { META, OWNED, evmLogo, fmtBal, low, readback, readbackAll, refreshBalance, refreshHeld, useBalance, useHeld, useRows, type Row } from '../chainMeta';
import * as e from '../chains/evm';
import * as x from '../chains/xrpl';
import * as s from '../chains/solana';
import { inventory, useInventory, type TestNft } from '../inventory';
import { transferFee, type Chain, type Result } from '../pure';
import { TYPES, typeOf } from '../registry';
import { fetchMeta, get, MAINNET, metaBase, set, type Meta } from '../settings';
import type { ChainState } from '../types';
import { validAddress } from '../validate';
import { Balance, ChainLogo, copy, CopyBtn, EmptyRow, ExtLink, HolderText, IconBtn, Input, Loading, Mono, RecipientDialog, SendDialog, short, StatusLine, Thumb, UriField, useAction, useTracked } from '../ui';

export type ExtraTab = { label: string; render: (o: { chain: Chain; recipient: string }) => ReactNode };

export default function ChainPage({ chain, extra = [] }: { chain: Chain; extra?: ExtraTab[] }) {
  const m = META[chain];
  const [recipient, setRecipientState] = useState(get(`recipient.${chain}`));
  const setRecipient = (v: string) => { set(`recipient.${chain}`, v); setRecipientState(v); };
  const [net, setNet] = useState(e.chainKey());
  const r = recipient.trim();
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-6">
      <div className="flex h-8 flex-wrap items-center gap-3">
        <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight"><ChainLogo src={m.logo} className="size-7" />{m.label}</h1>
        {chain === 'evm'
          ? <Select value={net} onValueChange={(v) => { set('evm.chain', v); setNet(v); refreshBalance('evm'); refreshHeld('evm', true); }}>
              <SelectTrigger size="sm" aria-label="EVM network"><SelectValue /></SelectTrigger>
              <SelectContent>{Object.entries(e.chains).map(([k, c]) => <SelectItem key={k} value={k}><ChainLogo src={evmLogo(k)} />{c.name}</SelectItem>)}</SelectContent>
            </Select>
          : <Badge variant="outline" className="rounded-full font-normal text-muted-foreground">{m.network()}</Badge>}
      </div>
        <div key={net} className="grid max-w-full min-w-0 justify-items-end text-sm">
          <WalletLine chain={chain} />
          <RecipientLine chain={chain} value={recipient} onChange={setRecipient} />
        </div>
      </div>
      <Tabs key={net} defaultValue="nfts" className="-mt-5 gap-6">
        <TabsList variant="line" className="w-full justify-start gap-6 border-b pb-0 group-data-[orientation=horizontal]/tabs:h-10">
          <TabsTrigger value="nfts" className="flex-none px-0">NFTs</TabsTrigger>
          {extra.map((t) => <TabsTrigger key={t.label} value={t.label} className="flex-none px-0">{t.label}</TabsTrigger>)}
        </TabsList>
        <TabsContent value="nfts" className="space-y-6"><MintCard chain={chain} recipient={r} onView={setOpenId} /><NftsCard chain={chain} recipient={r} openId={openId} setOpenId={setOpenId} /></TabsContent>
        {extra.map((t) => <TabsContent key={t.label} value={t.label} className="space-y-6">{t.render({ chain, recipient: r })}</TabsContent>)}
      </Tabs>
    </div>
  );
}

/** Header line 1: the playground wallet as a quick reference. Copy, QR and funding live on the Overview card. */
function WalletLine({ chain }: { chain: Chain }) {
  const m = META[chain];
  const bal = useBalance(chain);
  const isLow = low(bal, m.need);
  return (
    <div className="flex h-8 max-w-full min-w-0 items-center gap-2">
      <Mono value={m.address()} className="text-sm" />
      <span className="text-muted-foreground/60">·</span>
      {bal === undefined ? <Skeleton className="h-4 w-20" /> : <Balance value={fmtBal(bal)} low={isLow} />}
      {isLow && <span className="text-muted-foreground">recommended {m.need} {m.unit}</span>}
      <IconBtn label="Refresh balance" icon={RefreshCw} onClick={() => refreshBalance(chain)} className="-mr-2" />
    </div>
  );
}

/** Header line 2: the recipient (the wallet under test); the pencil opens the editor dialog. */
function RecipientLine({ chain, value, onChange }: { chain: Chain; value: string; onChange: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const r = value.trim();
  return (
    <div className="flex h-6 items-center gap-2">
      <span className="text-muted-foreground">Recipient</span>
      {r ? <Mono value={r} className={cn('text-sm', !validAddress(chain, r) && 'text-destructive')} />
        : <span className="flex items-center gap-1.5"><TriangleAlert className="size-4 text-warning" aria-hidden /><button type="button" className="underline underline-offset-4" onClick={() => setEditing(true)}>Set recipient</button></span>}
      <IconBtn label="Edit recipient" icon={Pencil} onClick={() => setEditing(true)} className="-my-1 -mr-2" />
      {editing && <RecipientDialog chain={chain} label={META[chain].label} value={r} onSave={onChange} onClose={() => setEditing(false)} />}
    </div>
  );
}

type Progress = { label: string; state: 'busy' | 'ok' | 'err' | 'skip'; msg: string };
const PROGRESS_ICON = { busy: Loader2, ok: CircleCheck, err: CircleAlert, skip: CircleAlert };

function MintCard({ chain, recipient, onView }: { chain: Chain; recipient: string; onView: (id: string) => void }) {
  const types = TYPES.filter((t) => t.chain === chain);
  const items = useInventory();
  const [typeKey, setTypeKey] = useState(types[0].key);
  const [uri, setUri] = useState(`${metaBase()}/1.json`);
  const [name, setName] = useState('');
  const [to, setTo] = useState<'self' | 'recipient'>('self');
  const [status, run, busy] = useAction();
  const [progress, setProgress] = useState<Progress[]>([]);
  const [allBusy, setAllBusy] = useState(false);
  const [minted, setMinted] = useState<string>();
  const type = typeOf(typeKey)!;
  const rOk = validAddress(chain, recipient);
  const noMeta = type.key === 'soroban.nometa';
  const autoName = () => `${type.label} #${items.filter((n) => n.type === type.key).length + 1}`;
  const destId = useId();

  const mintAll = async () => {
    if (MAINNET && !confirm(`Mint ${types.length} NFTs on mainnet with real funds?`)) return;
    setAllBusy(true);
    const rows: Progress[] = types.map((t) => ({ label: t.label, state: 'busy', msg: 'waiting' }));
    const put = (i: number, p: Partial<Progress>) => { rows[i] = { ...rows[i], ...p }; setProgress([...rows]); };
    setProgress([...rows]);
    for (const [i, t] of types.entries()) {
      put(i, { msg: 'minting...' });
      try { const res = await t.mint({ to: 'recipient', uri: `${metaBase()}/${(i % 6) + 1}.json`, name: `${t.label} (all)` }); put(i, { state: res.status === 'confirmed' ? 'ok' : 'err', msg: `${res.status}: ${res.message}` }); }
      catch (err: any) { put(i, { state: 'err', msg: `error: ${err?.message ?? err}` }); }
    }
    setAllBusy(false);
  };

  return (
    <Card>
      <CardHeader className="max-sm:grid-cols-1!">
        <CardTitle>Mint</CardTitle>
        <CardDescription>One test NFT of a type a wallet must handle differently.</CardDescription>
        <CardAction className="flex items-center gap-2 max-sm:col-start-1 max-sm:row-span-1 max-sm:row-start-3 max-sm:mt-2 max-sm:justify-self-start">
          <Button size="sm" variant="outline" disabled={!rOk || allBusy} onClick={mintAll}>
            {allBusy && <Loader2 className="animate-spin" />}Mint all {types.length} to recipient</Button>
        </CardAction>
      </CardHeader>
      <CardContent className="space-y-6">
        {progress.length > 0 && (
          <ul className="divide-y rounded-lg border text-sm" aria-label="Mint all progress">
            {progress.map((p) => { const Icon = PROGRESS_ICON[p.state]; return (
              <li key={p.label} className="flex items-start gap-3 px-3 py-2">
                <Icon className={cn('mt-0.5 size-4 shrink-0', p.state === 'busy' ? (p.msg === 'waiting' ? 'text-muted-foreground' : 'animate-spin text-muted-foreground') : p.state === 'ok' ? 'text-success' : 'text-destructive')} />
                <span className="w-40 shrink-0 font-medium">{p.label}</span><span className="min-w-0 flex-1 truncate text-muted-foreground" title={p.msg}>{p.msg}</span>
              </li>); })}
          </ul>
        )}
        <fieldset className="min-w-0">
          <legend className="mb-2 text-sm font-medium text-muted-foreground">Type</legend>
          <RadioGroup value={typeKey} onValueChange={setTypeKey} className="grid gap-2 sm:grid-cols-2">
            {types.map((t) => (
              <Label key={t.key} className="cursor-pointer items-start gap-3 rounded-lg border p-3 font-normal transition-colors hover:bg-accent/40 has-[[data-state=checked]]:border-primary/50 has-[[data-state=checked]]:bg-accent/40">
                <RadioGroupItem value={t.key} className="mt-0.5" />
                <span className="grid gap-1 leading-normal">
                  <span className="text-sm font-medium">{t.label.replace(/^Soroban: /, '')}</span>
                  <span className="line-clamp-2 text-xs text-muted-foreground" title={t.why}>{t.why}</span>
                </span>
              </Label>
            ))}
          </RadioGroup>
        </fieldset>
        <UriField uri={noMeta ? '' : uri} setUri={setUri} disabled={noMeta} />
        <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Name" value={name} onChange={setName} placeholder={autoName()} />
          <div className="grid gap-2">
            <Label htmlFor={destId}>Destination</Label>
            <Select value={to} onValueChange={(v: typeof to) => setTo(v)}>
              <SelectTrigger id={destId} className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="self">Playground wallet</SelectItem>
                <SelectItem value="recipient" disabled={!rOk}>Recipient{chain === 'xrpl' ? ' (mint, then offer)' : ''}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-4">
          <Button disabled={busy || (!uri && !noMeta) || (to === 'recipient' && !rOk)} onClick={() => run(async () => { setMinted(undefined); const res = await type.mint({ to, uri, name: name || autoName() }); setMinted(res.nft?.id); return res; })}>
            {busy && <Loader2 className="animate-spin" />}Mint {type.label}</Button>
          <StatusLine status={status} txUrl={(h) => META[chain].tx(h)} action={minted && <Button size="xs" variant="outline" className="-my-1 shrink-0" onClick={() => onView(minted)}>View</Button>} />
        </div>
        </div>
        {chain === 'xrpl' && <XrplCustomMint uri={uri} onDone={() => refreshHeld('xrpl')} />}
      </CardContent>
    </Card>
  );
}

/** The ad-hoc XLS-20 mint: any flags, taxon and fee. Not logged; it shows up in the NFTs table as untracked. */
function XrplCustomMint({ uri, onDone }: { uri: string; onDone: () => void }) {
  const [transferable, setTransferable] = useState(true);
  const [taxon, setTaxon] = useState('0');
  const [fee, setFee] = useState('0');
  const [status, run, busy] = useAction();
  const id = useId();
  const feeBad = !(Number(fee) >= 0 && Number(fee) <= 50);
  const taxonBad = !(Number.isInteger(+taxon) && +taxon >= 0);
  useEffect(() => { if (status && status.kind !== 'busy') onDone(); }, [status]);
  return (
    <section className="space-y-6 border-t pt-6">
      <div className="space-y-1">
        <h3 className="text-base leading-5 font-semibold">Advanced: custom flags</h3>
        <p className="text-sm text-muted-foreground">Uses the metadata above. Not logged: the result shows in the NFTs table below as untracked.</p>
      </div>
      <div className="space-y-4">
        <div className="grid items-end gap-4 sm:grid-cols-3">
          <Input label="Taxon" value={taxon} onChange={setTaxon} type="number" min={0} step={1} error={taxonBad ? 'A whole number, 0 or more' : undefined} />
          <Input label="Transfer fee %" value={fee} onChange={setFee} type="number" min={0} max={50} step={0.001} error={feeBad ? '0 to 50' : undefined} />
          <div className="flex h-9 items-center gap-2"><Checkbox id={id} checked={transferable} onCheckedChange={(v) => setTransferable(v === true)} /><Label htmlFor={id}>Transferable</Label></div>
        </div>
        <div>
          <Button variant="secondary" disabled={busy || !uri || feeBad || taxonBad} onClick={() => run(() => x.mint({ uri, flags: transferable ? 8 : 0, taxon: Number(taxon), transferFee: transferable && Number(fee) > 0 ? transferFee(Number(fee)) : undefined }))}>
            {busy && <Loader2 className="animate-spin" />}Mint with these flags</Button>
        </div>
        <StatusLine status={status} txUrl={META.xrpl.tx} />
      </div>
    </section>
  );
}

// ── NFTs: the wallet's on-chain listing merged with the local mint log, one row per NFT id (useRows) ─────
/** An untracked NFT's transfer (the old holdings actions). XRPL: a sell offer, priced or a gift. */
const sendHeld = (chain: Chain, id: string, to: string, priceXrp: string) =>
  chain === 'xrpl' ? x.sellOffer(id, to, priceXrp) : chain === 'evm' ? e.send(id.split(':')[1], to) : s.send(id, to);
const heldExplorer = (chain: Chain, id: string) => chain === 'xrpl' ? `${x.explorerBase}/nft/${id}`
  : chain === 'evm' ? `${e.chains[e.chainKey()].blockExplorers?.default.url}/token/${id.split(':')[0]}?a=${id.split(':')[1]}`
  : `https://explorer.solana.com/address/${id}${s.cluster}`;
/** A malformed id (hand-edited storage) must not take the page down with it. */
const explorerOf = (r: Row) => { try { return r.nft ? typeOf(r.nft.type)?.explorer(r.nft) : heldExplorer(r.chain, r.id); } catch { return undefined; } };
/** Sends only make sense from the playground wallet; "unknown" may still be here. */
const isHeld = (r: Row) => r.holder === 'playground' || r.holder === 'unknown';
/** The minted name, else the metadata's, else the short id (untracked rows must be told apart). */
function useName(r: Row) {
  const [meta, setMeta] = useState<Meta>({});
  useEffect(() => { if (!r.nft) fetchMeta(r.held?.uri).then(setMeta); }, [r.nft, r.held?.uri]);
  return r.nft?.name ?? meta.name ?? r.held?.name ?? `NFT ${short(r.id.split(':').pop()!)}`;
}

const FILTERS = [['all', 'All'], ['playground', 'In wallet'], ['recipient', 'At recipient'], ['other', 'Elsewhere'], ['untracked', 'Untracked']] as const;
type Filter = (typeof FILTERS)[number][0];
const matches = (r: Row, f: Filter) => f === 'all' || (f === 'untracked' ? !r.nft : r.holder === f);
type Dialog = { row: Row; to: string; title: string };

function NftsCard({ chain, recipient, openId, setOpenId }: { chain: Chain; recipient: string; openId: string | null; setOpenId: (id: string | null) => void }) {
  const rows = useRows(chain);
  const { list: held, err: heldErr } = useHeld(chain);
  const [filter, setFilter] = useState<Filter>('all');
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [offers, setOffers] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(0);
  const [isBusy, run] = useTracked();
  const xrpl = chain === 'xrpl';
  const track = (p: Promise<unknown>) => { setLoading((n) => n + 1); p.finally(() => setLoading((n) => n - 1)); };
  const loadOffers = () => { if (xrpl) track(x.myOffers().then((o) => setOffers(new Set(o.filter((f) => f.kind === 'sell').map((f) => f.nftId))), () => {})); };
  const loadHeld = () => { track(refreshHeld(chain)); loadOffers(); };
  const refreshAll = () => {
    loadHeld();
    track(readbackAll(chain));
  };
  const logCount = rows.filter((r) => r.nft).length;
  // Sends accepted in the recipient wallet change holders without any playground action: re-read on open and when the window regains focus.
  useEffect(() => { refreshAll(); window.addEventListener('focus', refreshAll); return () => window.removeEventListener('focus', refreshAll); }, [logCount]);

  const shown = rows.filter((r) => matches(r, filter));
  const count = (f: Filter) => rows.filter((r) => matches(r, f)).length;
  const rOk = validAddress(chain, recipient);

  const act = (nft: TestNft, label: string, fn: () => Promise<Result>) =>
    run(nft.id, label, async () => { const res = await fn(); inventory.log(nft.id, label, res); return res; }, () => { readback(nft)?.catch(() => {}); loadHeld(); });
  const send = (r: Row, to: string, o: { priceXrp: string; amount?: string }) => {
    const who = to === recipient ? 'recipient' : to === x.spare ? 'unfunded spare' : short(to);
    const label = xrpl ? `offer to ${who}${Number(o.priceXrp) > 0 ? ` for ${o.priceXrp} XRP` : ''}` : `send to ${who}`;
    if (r.nft) { const nft = r.nft; act(nft, label, () => typeOf(nft.type)!.transfer(nft, to, o)); }
    else run(r.id, label, () => sendHeld(chain, r.id, to, o.priceXrp), loadHeld);
  };
  // XRPL offers can carry a price, so "Offer to recipient" asks for it; elsewhere it is one click.
  const toRecipient = (r: Row) => xrpl ? setDialog({ row: r, to: recipient, title: 'Offer to recipient' }) : send(r, recipient, { priceXrp: '0', amount: r.nft?.amount });
  const sendTo = (r: Row) => setDialog({ row: r, to: '', title: xrpl ? 'Offer to address' : 'Send to address' });
  const actions: RowActions = { toRecipient, sendTo, send, act, open: setOpenId, isBusy, rOk, offers, sendLabel: xrpl ? 'Offer to recipient' : 'Send to recipient' };
  const opened = rows.find((r) => r.id === openId);
  const reading = held === null && !!OWNED[chain] && !heldErr;

  return (
    <Card>
      <CardHeader>
        <CardTitle>NFTs</CardTitle>
        <CardDescription>NFTs in this wallet, plus every NFT minted here, wherever it went.</CardDescription>
        <CardAction className="-mr-2"><IconBtn label="Re-read the wallet and every holder" icon={RefreshCw} onClick={refreshAll} className={cn(loading > 0 && '[&_svg]:animate-spin')} /></CardAction>
      </CardHeader>
      <CardContent className="space-y-4">
        {rows.length > 0 && (
          <ToggleGroup type="single" variant="outline" size="sm" spacing={0} className="max-w-full overflow-x-auto" value={filter} onValueChange={(f: Filter) => f && setFilter(f)} aria-label="Filter by where the NFT is">
            {FILTERS.map(([f, label]) => <ToggleGroupItem key={f} value={f} data-count={count(f)} className="px-2.5 whitespace-nowrap focus-visible:border-input focus-visible:bg-accent focus-visible:ring-0 data-[count=0]:text-muted-foreground">{label}<span className="text-muted-foreground tabular-nums">{count(f)}</span></ToggleGroupItem>)}
          </ToggleGroup>
        )}
        {heldErr && <p className="text-sm text-destructive">Could not read the wallet: {heldErr}</p>}
        {(
            <div className="overflow-hidden rounded-lg border">
              <Table className="table-fixed">
                <TableHeader className="bg-muted/30"><TableRow>
                  <TableHead className="pl-3">NFT</TableHead>
                  <TableHead className="hidden w-36 sm:table-cell">Where</TableHead>
                  <TableHead className="hidden w-[34%] md:table-cell">Details</TableHead>
                  <TableHead className="w-12 sm:w-20"><span className="sr-only">Actions</span></TableHead>
                </TableRow></TableHeader>
                <TableBody>{shown.length ? shown.map((r) => <NftRow key={r.id} row={r} {...actions} />)
                  : <EmptyRow cols={4}>{rows.length ? 'Nothing here. Try another filter.' : reading ? <Loading>Reading the wallet...</Loading> : `No NFTs on ${META[chain].label} yet. Mint one above.`}</EmptyRow>}</TableBody>
              </Table>
            </div>
          )}
      </CardContent>
      {opened && <DetailSheet row={opened} onClose={() => setOpenId(null)} {...actions} />}
      {dialog && <SendDialog chain={chain} title={dialog.title} initialTo={dialog.to} price={xrpl} amount={dialog.row.nft?.amount} onClose={() => setDialog(null)}
        onSend={(to, o) => send(dialog.row, to, o)} />}
    </Card>
  );
}

type RowActions = { toRecipient: (r: Row) => void; sendTo: (r: Row) => void; send: (r: Row, to: string, o: { priceXrp: string; amount?: string }) => void;
  act: (n: TestNft, label: string, fn: () => Promise<Result>) => void; open: (id: string) => void; isBusy: (id: string) => boolean; rOk: boolean; offers: Set<string>; sendLabel: string };

/** The XRPL flags line, muted; NON-transferable gets a lock, not red (red is for failures). */
const Note = ({ note }: { note?: string }) => note ? <span className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground" title={note}>{/NON-transferable/.test(note) && <Lock className="size-3 shrink-0" aria-label="Non-transferable" />}<span className="truncate">{note}</span></span> : null;
/** A type key the registry no longer knows: a muted badge, not the raw key. */
const UnknownType = () => <span className="text-muted-foreground">unknown type</span>;
/** Holder badge plus an "Offer open" badge for XRPL NFTs with a sell offer waiting. */
function Where({ row, offers }: { row: Row; offers: Set<string> }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2 text-sm">
      <HolderText holder={row.holder} />
      {offers.has(row.id) && <Tooltip><TooltipTrigger asChild><span tabIndex={0} className="text-muted-foreground">· Offer open</span></TooltipTrigger><TooltipContent>Waiting for the receiver to accept. See Offers.</TooltipContent></Tooltip>}
    </span>
  );
}

function NftRow({ row, ...a }: { row: Row } & RowActions) {
  const name = useName(row);
  const type = row.nft && typeOf(row.nft.type);
  const busy = a.isBusy(row.id);
  const last = row.nft?.log[0];
  const held = isHeld(row);
  return (
    <TableRow className="group cursor-pointer" onClick={() => a.open(row.id)}>
      <TableCell className="py-2.5 pl-3">
        <div className="flex min-w-0 items-center gap-3">
          <Thumb uri={row.nft?.uri ?? row.held?.uri} />
          <div className="min-w-0 space-y-0.5">
            <button type="button" className="block max-w-full truncate text-left font-medium hover:underline" onClick={(ev) => { ev.stopPropagation(); a.open(row.id); }}>{name}</button>
            <div className="flex min-w-0 items-center gap-2">
              {!row.nft ? <span className="truncate text-xs text-muted-foreground">untracked</span>
                : type ? <span className="truncate text-xs text-muted-foreground">{type.label}{row.nft.amount && ` · ×${row.nft.amount}`}</span> : <UnknownType />}
              <span className="sm:hidden"><HolderText holder={row.holder} /></span>
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="hidden sm:table-cell"><Where row={row} offers={a.offers} /></TableCell>
      <TableCell className="hidden md:table-cell">{last
        ? <span className="block truncate text-xs text-muted-foreground" title={`${last.action} → ${last.result}`}>{last.action} → {last.result}</span>
        : row.held?.note ? <Note note={row.held.note} /> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
      <TableCell className="pr-3" onClick={(ev) => ev.stopPropagation()}>
        <div className="-mr-2 flex items-center justify-end gap-0.5">
          {held && <IconBtn label={a.sendLabel} icon={busy ? Loader2 : Send} className={cn('hidden sm:inline-flex', busy && '[&_svg]:animate-spin')}
            disabled={busy || (row.nft && !type) || !a.rOk} why={!a.rOk ? 'Set a recipient above' : undefined} onClick={() => a.toRecipient(row)} />}
          <RowMenu row={row} name={name} {...a} />
        </div>
      </TableCell>
    </TableRow>
  );
}

function RowMenu({ row, name, toRecipient, sendTo, send, act, open, isBusy, rOk, sendLabel }: { row: Row; name: string } & RowActions) {
  const nft = row.nft;
  const type = nft && typeOf(nft.type);
  const busy = isBusy(row.id) || (!!nft && !type);
  const off = busy || !isHeld(row);
  const href = explorerOf(row);
  const forget = (n: TestNft) => { inventory.remove(n.id); toast('Forgotten', { description: name, action: { label: 'Undo', onClick: () => inventory.add(n) } }); };
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label={`Actions for ${name}`}><Ellipsis /></Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuItem className="sm:hidden" disabled={off || !rOk} onSelect={() => toRecipient(row)}>{sendLabel}</DropdownMenuItem>
        <DropdownMenuItem disabled={off} onSelect={() => sendTo(row)}>{row.chain === 'xrpl' ? 'Offer to address...' : 'Send to address...'}</DropdownMenuItem>
        {row.chain === 'xrpl' && <DropdownMenuItem disabled={off} onSelect={() => send(row, x.spare, { priceXrp: '0' })}>Offer to unfunded spare</DropdownMenuItem>}
        {nft && Object.entries(type?.extra ?? {}).map(([k, fn]) => { const risky = /burn|claw/i.test(k); return (
          <DropdownMenuItem key={k} disabled={busy} variant={risky ? 'destructive' : 'default'}
            onSelect={() => { if (!risky || confirm(`${k} ${name}? This cannot be undone.`)) act(nft, k, () => fn(nft)); }}>{k}</DropdownMenuItem>); })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => copy(row.id)}>Copy ID</DropdownMenuItem>
        {href && <DropdownMenuItem asChild><a href={href} target="_blank" rel="noreferrer">Open in explorer</a></DropdownMenuItem>}
        <DropdownMenuItem onSelect={() => open(row.id)}>Details</DropdownMenuItem>
        {nft && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => forget(nft)}>Forget</DropdownMenuItem></>}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const KV = ({ rows }: { rows: [string, ReactNode][] }) => (
  <dl className="divide-y rounded-lg border">
    {rows.map(([k, v]) => <div key={k} className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-center sm:grid-cols-[7.5rem_minmax(0,1fr)] gap-3 px-3 py-2 text-sm"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v}</dd></div>)}
  </dl>
);
const IdCell = ({ value, href }: { value: string; href?: string }) => <span className="-my-1.5 flex items-center"><Mono value={value} head={10} tail={8} className="mr-1" /><CopyBtn value={value} />{href && <ExtLink href={href} />}</span>;
const json = (v: unknown) => JSON.stringify(v, (_, x) => (typeof x === 'bigint' ? String(x) : x), 2);
const time = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function DetailSheet({ row, onClose, toRecipient, sendTo, isBusy, rOk, offers, sendLabel }: { row: Row; onClose: () => void } & RowActions) {
  const name = useName(row);
  const type = row.nft && typeOf(row.nft.type);
  const busy = isBusy(row.id) || (!!row.nft && !type) || !isHeld(row);
  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full gap-0 sm:max-w-lg">
        <SheetHeader className="flex-row items-center gap-4 border-b p-6 pr-12">
          <Thumb uri={row.nft?.uri ?? row.held?.uri} className="size-16" />
          <div className="min-w-0 space-y-2">
            <SheetTitle className="truncate text-base leading-5">{name}</SheetTitle>
            <div className="flex flex-wrap items-center gap-x-2 text-sm">{!row.nft ? <span className="text-muted-foreground">untracked</span> : type ? <span className="text-muted-foreground">{type.label}</span> : <UnknownType />}<span className="text-muted-foreground">·</span><Where row={row} offers={offers} /></div>
            <SheetDescription className="sr-only">Details{row.nft && ', on-chain readback and activity'} for this NFT.</SheetDescription>
          </div>
        </SheetHeader>
        {row.nft ? <TrackedBody nft={row.nft} holder={row.holder} /> : (
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            <p className="text-sm text-muted-foreground">The playground wallet holds this NFT, but it was not minted from a type here, so it has no readback or activity.</p>
            <KV rows={[
              ['ID', <IdCell value={row.id} href={explorerOf(row)} />],
              ['Network', row.chain === 'evm' ? META.evm.network() : `${META[row.chain].label} ${META[row.chain].network()}`],
              ['Metadata', row.held?.uri ? <span className="font-mono text-xs break-all">{row.held.uri}</span> : <span className="text-muted-foreground">none</span>],
              ...(row.held?.note ? [['Flags', <Note note={row.held.note} />] as [string, ReactNode]] : []),
            ]} />
          </div>
        )}
        <SheetFooter className="flex-row items-center gap-2 border-t p-6">
          {!isHeld(row) ? <p className="flex-1 text-sm text-muted-foreground">Not in this wallet, so it cannot be sent from here.</p> : <>
          <Button className="flex-1" disabled={busy || !rOk} onClick={() => toRecipient(row)}>{isBusy(row.id) ? <Loader2 className="animate-spin" /> : <Send />}{sendLabel}</Button>
          <Button className="flex-1" variant="outline" disabled={busy} onClick={() => sendTo(row)}>{row.chain === 'xrpl' ? 'Offer to address...' : 'Send to address...'}</Button></>}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

function TrackedBody({ nft, holder }: { nft: TestNft; holder: Row['holder'] }) {
  const type = typeOf(nft.type);
  const m = META[nft.chain];
  const [state, setState] = useState<ChainState | null>(null);
  useEffect(() => {
    setState(null);
    const p = readback(nft);
    if (!p) { setState({ holder: 'unknown', raw: null, fields: { error: `unknown type ${nft.type}` } }); return; }
    p.then(setState).catch((err) => setState({ holder: 'unknown', raw: String(err), fields: { error: String(err?.message ?? err) } }));
  }, [nft.id]);
  return (
    <Tabs defaultValue="overview" className="min-h-0 flex-1 gap-6 overflow-y-auto p-6">
      <TabsList variant="line" className="w-full justify-start gap-6 border-b pb-0 group-data-[orientation=horizontal]/tabs:h-9">
        <TabsTrigger value="overview" className="flex-none px-0">Overview</TabsTrigger>
        <TabsTrigger value="chain" className="flex-none px-0">On-chain</TabsTrigger>
        <TabsTrigger value="activity" className="flex-none px-0">Activity</TabsTrigger>
      </TabsList>
      <TabsContent value="overview" className="space-y-4">
        {type && <p className="text-sm text-muted-foreground">{type.why}</p>}
        <KV rows={[
          ['ID', <IdCell value={nft.id} href={explorerOf({ id: nft.id, chain: nft.chain, nft, holder: nft.holder })} />],
          ['Network', nft.chain === 'evm' ? e.chains[nft.network]?.name ?? nft.network : `${m.label} ${nft.network}`],
          ['Minted', time(nft.mintedAt)],
          ['Mint tx', <IdCell value={nft.mintTx} href={m.tx(nft.mintTx, nft.network)} />],
          ['Holder', <span className="flex flex-wrap items-center gap-2"><HolderText holder={holder} />{nft.holderAddress ? <IdCell value={nft.holderAddress} /> : <span className="text-xs text-muted-foreground">Address not read yet; see On-chain</span>}</span>],
          ...(nft.amount ? [['Amount', `×${nft.amount}`] as [string, ReactNode]] : []),
        ]} />
      </TabsContent>
      <TabsContent value="chain" className="space-y-4">
        {!state ? <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-9 w-full" />)}</div> : <>
          <KV rows={[
            ['holder', <HolderText holder={state.holder} />],
            ...Object.entries(state.fields).map(([k, v]): [string, ReactNode] => [k, k === 'transferable' && v === false ? <span className="text-destructive">false</span>
              : typeof v === 'string' && v.length > 24 && !/\s/.test(v) ? <IdCell value={v} /> : <span className={cn(typeof v !== 'string' && 'font-mono text-xs')}>{String(v)}</span>]),
          ]} />
          <div className="space-y-2"><div className="text-sm font-medium">Raw</div>
            <ScrollArea className="h-56 rounded-lg border bg-muted/30"><pre className="p-3 font-mono text-xs break-all whitespace-pre-wrap">{json(state.raw)}</pre></ScrollArea></div>
        </>}
        {nft.secrets && <Secrets secrets={nft.secrets} />}
      </TabsContent>
      <TabsContent value="activity">
        {nft.log.length === 0 ? <p className="text-sm text-muted-foreground">No activity yet.</p> : (
          <ol className="relative ml-1.5 space-y-5 border-l pl-5">
            {nft.log.map((l, i) => (
              <li key={i} className="relative">
                <span className={cn('absolute top-1.5 -left-[25px] size-2 rounded-full ring-4 ring-background', /^confirmed/.test(l.result) ? 'bg-success' : /^(failed|refused)/.test(l.result) ? 'bg-destructive' : 'bg-muted-foreground')} />
                <div className="flex flex-wrap items-baseline justify-between gap-x-3"><span className="text-sm font-medium">{l.action}</span><time className="text-xs text-muted-foreground tabular-nums">{time(l.at)}</time></div>
                <p className="text-xs break-words text-muted-foreground">{l.result}</p>
                {l.tx && <div className="mt-1 text-muted-foreground"><IdCell value={l.tx} href={m.tx(l.tx, nft.network)} /></div>}
              </li>
            ))}
          </ol>
        )}
      </TabsContent>
    </Tabs>
  );
}

function Secrets({ secrets }: { secrets: Record<string, string> }) {
  const [open, setOpen] = useState(false);
  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild><Button variant="ghost" size="sm" className="-ml-2 text-muted-foreground"><ChevronRight className={cn('transition-transform', open && 'rotate-90')} />Test secrets</Button></CollapsibleTrigger>
      <CollapsibleContent><pre className="mt-2 rounded-lg border bg-muted/30 p-3 font-mono text-xs break-all whitespace-pre-wrap">{json(secrets)}</pre></CollapsibleContent>
    </Collapsible>
  );
}
