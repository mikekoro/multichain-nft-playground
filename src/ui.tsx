import { useEffect, useId, useState, type ReactNode } from 'react';
import qrcode from 'qrcode-generator';
import { toast } from 'sonner';
import { Check, CircleAlert, CircleCheck, Copy, ExternalLink, ImageOff, Loader2, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input as UiInput } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TableCell, TableRow } from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { fetchMeta, metaBase, type Meta } from './settings';
import type { Chain, Holder, Result } from './pure';
import { addressError, validAddress } from './validate';

/** Middle ellipsis: rHEgQx...393zq. */
export const short = (s: string, head = 6, tail = 5) => (s.length > head + tail + 3 ? `${s.slice(0, head)}...${s.slice(-tail)}` : s);
export const copy = (text: string) => navigator.clipboard.writeText(text).then(() => toast('Copied'), () => toast.error('Copy failed'));

/** Address / ID / hash: mono, middle-truncated, full value on hover. */
export const Mono = ({ value, head, tail, className }: { value: string; head?: number; tail?: number; className?: string }) =>
  <span title={value} className={cn('font-mono text-xs whitespace-nowrap', className)}>{short(value, head, tail)}</span>;

/** Icon-only button with a tooltip; `href` makes it an external link. `why`: the tooltip while disabled. */
export function IconBtn({ label, icon: Icon, onClick, href, disabled, why, className }: { label: string; icon: LucideIcon; onClick?: () => void; href?: string; disabled?: boolean; why?: string; className?: string }) {
  const btn = (
    <Button variant="ghost" size="icon-sm" aria-label={label} disabled={disabled} onClick={(ev) => { ev.stopPropagation(); onClick?.(); }} className={cn('text-muted-foreground hover:text-foreground', className)} asChild={!!href}>
      {href ? <a href={href} target="_blank" rel="noreferrer"><Icon /></a> : <Icon />}
    </Button>
  );
  return (
    <Tooltip>
      {/* A disabled button gets no pointer events, so the span carries the hover. */}
      <TooltipTrigger asChild>{disabled ? <span className="inline-flex">{btn}</span> : btn}</TooltipTrigger>
      <TooltipContent>{disabled && why ? why : label}</TooltipContent>
    </Tooltip>
  );
}
export const CopyBtn = ({ value, label = 'Copy' }: { value: string; label?: string }) => <IconBtn label={label} icon={Copy} onClick={() => copy(value)} />;
export const ExtLink = ({ href, label = 'Open in explorer' }: { href: string; label?: string }) => <IconBtn label={label} icon={ExternalLink} href={href} />;

/** Labelled input. `error`: shown under the field and marks it aria-invalid. `valid`: a check at the right edge. */
export function Input({ value, onChange, placeholder, label, hint, type = 'text', error, valid, mono, min, max, step, className }: { value: string; onChange: (v: string) => void; placeholder?: string; label?: string; hint?: ReactNode; type?: string; error?: string; valid?: boolean; mono?: boolean; min?: number; max?: number; step?: number | 'any'; className?: string }) {
  const id = useId();
  return (
    <div className={cn('grid gap-2', className)}>
      {label && <Label htmlFor={id}>{label}</Label>}
      <div className="relative">
        {/* Addresses, URIs and amounts, never credentials: keep password managers out. */}
        <UiInput id={id} type={type} autoComplete="off" data-1p-ignore data-lpignore="true" data-bwignore min={min} max={max} step={step} value={value} placeholder={placeholder} aria-label={label ? undefined : placeholder} aria-invalid={!!error || undefined}
          aria-describedby={error || hint ? `${id}-d` : undefined} onChange={(ev) => onChange(ev.target.value)} className={cn(mono && 'font-mono text-xs md:text-xs', valid && 'pr-8')} />
        {valid && <Check aria-label="valid" className="absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-success" />}
      </div>
      {(error || hint) && <p id={`${id}-d`} className={cn('text-xs', error ? 'text-destructive' : 'text-muted-foreground')}>{error ?? hint}</p>}
    </div>
  );
}

/** A recipient-style address field: validated with the chain's SDK, a check when valid. */
export const AddressInput = ({ chain, value, onChange, label, hint, placeholder }: { chain: Chain; value: string; onChange: (v: string) => void; label: string; hint?: ReactNode; placeholder?: string }) =>
  <Input label={label} value={value} onChange={onChange} mono placeholder={placeholder} hint={hint} error={addressError(chain, value)} valid={validAddress(chain, value.trim())} />;

export const Code = ({ children }: { children: ReactNode }) => <code className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs whitespace-nowrap text-foreground">{children}</code>;

/** A table's empty or loading state: one full-width row under the headers, never a separate block. */
export const EmptyRow = ({ cols, children }: { cols: number; children: ReactNode }) => (
  <TableRow className="hover:bg-transparent"><TableCell colSpan={cols} className="py-8 text-center text-muted-foreground">{children}</TableCell></TableRow>
);
export const Loading = ({ children }: { children: ReactNode }) => <span className="inline-flex items-center gap-2"><Loader2 className="size-4 animate-spin" />{children}</span>;

/** A formatted balance ("110.98 XRP"): number and unit at the same size, the unit light and muted. Anything else ("unfunded ...", "error: ...") as-is. */
export function Balance({ value, low, className }: { value: string; low?: boolean; className?: string }) {
  const [, num, unit] = value.match(/^([\d.,]+) (\S+)$/) ?? [];
  if (!num) return <span title={value} className={cn('max-w-64 min-w-0 truncate text-sm', value.startsWith('error') ? 'text-destructive' : 'text-muted-foreground')}>{value}</span>;
  return (
    <span title={value} className={cn('font-mono font-medium tracking-tight whitespace-nowrap tabular-nums', low && 'text-destructive', className)}>
      {num} <span className="font-light text-muted-foreground">{unit}</span>
    </span>
  );
}

/** Red is for failures only: "Elsewhere" is a normal result of a send. */
const HOLDER: Record<Holder, string> = { playground: 'text-foreground', recipient: 'text-success', other: 'text-muted-foreground', unknown: 'text-warning' };
/** Plain words for where an NFT is; never "playground"/"other" in the UI. */
export const HOLDER_LABEL: Record<Holder, string> = { playground: 'In wallet', recipient: 'At recipient', other: 'Elsewhere', unknown: 'Unknown' };
/** Status as plain coloured text, never a badge. */
export const HolderText = ({ holder }: { holder: Holder }) => <span className={HOLDER[holder]}>{HOLDER_LABEL[holder]}</span>;

/** A chain or network logo from public/chains/. Decorative: the label next to it names the chain. */
export const ChainLogo = ({ src, className }: { src: string; className?: string }) => <img src={src} alt="" className={cn('size-4 shrink-0 rounded-full', className)} />;

type Kind = 'ok' | 'err' | 'busy';
type Status = { text: string; kind: Kind; tx?: string } | null;
const kindOf = (r: string | Result): Kind => typeof r === 'string'
  ? (/\btec[A-Z_]+|not submitted|failed|refused|reverted/i.test(r) ? 'err' : 'ok')
  : r.status === 'confirmed' ? 'ok' : 'err';
const textOf = (r: string | (Result & { nftId?: string })) => typeof r === 'string' ? r : `${r.status}: ${r.message}${r.nftId ? ` · NFTokenID ${r.nftId}` : ''}`;

/** One in-flight action per form. Errors are shown, never swallowed. A Result's status picks the colour. */
export function useAction(): [Status, (fn: () => Promise<string | Result>) => void, boolean] {
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const run = (fn: () => Promise<string | Result>) => {
    setBusy(true); setStatus({ text: 'Working...', kind: 'busy' });
    Promise.resolve().then(fn).then((r) => setStatus({ text: textOf(r), kind: kindOf(r), tx: typeof r === 'string' ? undefined : r.tx }))
      .catch((err) => setStatus({ text: `failed: ${err?.message ?? err}`, kind: 'err' }))
      .finally(() => setBusy(false));
  };
  return [status, run, busy];
}

const ICON: Record<Kind, LucideIcon> = { ok: CircleCheck, err: CircleAlert, busy: Loader2 };
export const StatusLine = ({ status, txUrl, action }: { status: Status; txUrl?: (h: string) => string; action?: ReactNode }) => {
  if (!status) return null;
  const Icon = ICON[status.kind];
  return (
    <div role="status" className={cn('flex items-start gap-2 rounded-md border px-3 py-2 text-xs', status.kind === 'err' ? 'border-destructive/30 bg-destructive/5 text-destructive' : status.kind === 'ok' ? 'border-success/30 bg-success/5 text-success' : 'text-muted-foreground')}>
      <Icon className={cn('mt-px size-4 shrink-0', status.kind === 'busy' && 'animate-spin')} />
      <p className="min-w-0 flex-1 break-words">{status.text}</p>
      {status.tx && <span className="-my-1.5 flex shrink-0 items-center text-muted-foreground"><Mono value={status.tx} className="mr-1" />
        <CopyBtn value={status.tx} label="Copy tx hash" />{txUrl && <ExtLink href={txUrl(status.tx)} label="Open tx in explorer" />}</span>}
      {status.kind === 'ok' && action}
    </div>
  );
};

type Run = (key: string, label: string, fn: () => Promise<string | Result>, after?: (r?: string | Result) => void) => void;
/** Fire-and-track for table rows: a toast per action, a busy set keyed by row. `after` runs on settle (re-read, refresh). */
export function useTracked(): [(key: string) => boolean, Run] {
  const [busy, setBusy] = useState<string[]>([]);
  const run: Run = (key, label, fn, after) => {
    setBusy((b) => [...b, key]);
    const id = toast.loading(label);
    Promise.resolve().then(fn).then((r) => {
      const tx = typeof r === 'string' ? undefined : r.tx;
      toast[kindOf(r) === 'ok' ? 'success' : 'error'](label, { id, description: textOf(r), action: tx ? { label: 'Copy tx', onClick: () => copy(tx) } : undefined });
      after?.(r);
    }).catch((err) => { toast.error(label, { id, description: `failed: ${err?.message ?? err}` }); after?.(); })
      .finally(() => setBusy((b) => b.filter((k) => k !== key)));
  };
  return [(key) => busy.includes(key), run];
}

/** Metadata URI with one-click sample tiles: <metadata base>/N.json. */
export function UriField({ uri, setUri, disabled }: { uri: string; setUri: (v: string) => void; disabled?: boolean }) {
  const sample = (n: number) => `${metaBase()}/${n}.json`;
  return (
    <fieldset disabled={disabled} className="grid min-w-0 gap-4 disabled:opacity-50">
      <legend className="mb-2 text-sm font-medium text-muted-foreground">Metadata</legend>
      <ToggleGroup type="single" variant="outline" spacing={2} className="flex-wrap" value={uri} onValueChange={(v) => v && setUri(v)}>
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <ToggleGroupItem key={n} value={sample(n)} title={sample(n)} aria-label={`Sample ${n}`} className="size-11 overflow-hidden p-0 sm:size-14 data-[state=on]:ring-2 data-[state=on]:ring-primary data-[state=on]:ring-offset-2 data-[state=on]:ring-offset-card">
            <img src={`/samples/${n}.png`} alt="" className="size-full object-cover" />
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
      <Input label="Metadata URI" value={uri} onChange={setUri} mono placeholder={`${metaBase()}/1.json`}
        hint={<>Public https or ipfs://. Pick a sample above, or <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setUri('https://example.invalid/dead.json')}>use a dead URL</button> to test a broken image.</>} />
    </fieldset>
  );
}

/** Metadata image thumbnail; no image or a dead one shows a deliberate placeholder. */
export function Thumb({ uri, className = 'size-10' }: { uri?: string; className?: string }) {
  const [meta, setMeta] = useState<Meta>({});
  const [dead, setDead] = useState(false);
  useEffect(() => { setDead(false); fetchMeta(uri).then(setMeta); }, [uri]);
  return meta.image && !dead ? <img src={meta.image} alt="" onError={() => setDead(true)} className={cn('shrink-0 rounded-md object-cover', className)} />
    : <div className={cn('flex shrink-0 items-center justify-center rounded-md border bg-muted/50', className)}><ImageOff className="size-4 text-muted-foreground" /></div>;
}

/** Esc, the close button or a click on the backdrop closes it. Plain address only: wallets disagree on URI schemes. */
export function QrDialog({ title, address, onClose }: { title: string; address: string; onClose: () => void }) {
  const qr = qrcode(0, 'M');
  qr.addData(address);
  qr.make();
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>Scan to fund this wallet.</DialogDescription></DialogHeader>
        <img src={qr.createDataURL(8, 2)} alt={`QR code for ${address}`} className="mx-auto rounded-md [image-rendering:pixelated]" />
        <div className="flex items-center gap-2 rounded-md border bg-muted/40 py-1 pr-1 pl-3"><code className="min-w-0 flex-1 font-mono text-xs break-all">{address}</code><CopyBtn value={address} /></div>
      </DialogContent>
    </Dialog>
  );
}

/** The recipient (the wallet under test), per chain. Empty clears it; Save is off while the address is invalid. */
export function RecipientDialog({ chain, label, value, onSave, onClose }: { chain: Chain; label: string; value: string; onSave: (v: string) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  const ok = !v.trim() || validAddress(chain, v.trim());
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-6" onSubmit={(ev) => { ev.preventDefault(); if (ok) { onSave(v.trim()); onClose(); } }}>
          <DialogHeader><DialogTitle>{label} recipient</DialogTitle><DialogDescription>The wallet under test.</DialogDescription></DialogHeader>
          <AddressInput chain={chain} label="Address" value={v} onChange={setV} placeholder={`${label} address of the wallet under test`} />
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!ok}>Save</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Send to address...": a validated address, plus an XRPL sale price or an ERC-1155 amount. */
export function SendDialog({ chain, title, initialTo = '', price, amount, onSend, onClose }: { chain: Chain; title: string; initialTo?: string; price?: boolean; amount?: string; onSend: (to: string, o: { priceXrp: string; amount: string }) => void; onClose: () => void }) {
  const [to, setTo] = useState(initialTo);
  const [priceXrp, setPrice] = useState('0');
  const [amt, setAmt] = useState(amount ?? '1');
  const priceBad = !!price && !(Number(priceXrp) >= 0);
  const amtBad = !!amount && !(Number.isInteger(+amt) && +amt >= 1 && +amt <= +amount);
  const ok = validAddress(chain, to.trim()) && !priceBad && !amtBad;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <form className="grid gap-6" onSubmit={(ev) => { ev.preventDefault(); if (ok) { onSend(to.trim(), { priceXrp, amount: amt }); onClose(); } }}>
          <DialogHeader><DialogTitle>{title}</DialogTitle>
            <DialogDescription>{chain === 'xrpl' ? 'Creates a sell offer the receiver must accept.' : 'Signed and sent from the playground wallet.'}</DialogDescription></DialogHeader>
          <div className="grid gap-4">
            <AddressInput chain={chain} label="Address" value={to} onChange={setTo} />
            {price && <Input label="Price (XRP, 0 = gift)" type="number" min={0} step="any" value={priceXrp} onChange={setPrice} error={priceBad ? '0 or more' : undefined} />}
            {amount && <Input label="Amount" type="number" min={1} step={1} value={amt} onChange={setAmt} hint={`Of ${amount} copies`} error={amtBad ? `A whole number from 1 to ${amount}` : undefined} />}
          </div>
          <DialogFooter><Button type="button" variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" disabled={!ok}>{chain === 'xrpl' ? (Number(priceXrp) > 0 ? `Offer for ${priceXrp} XRP` : 'Offer as gift') : 'Send'}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
