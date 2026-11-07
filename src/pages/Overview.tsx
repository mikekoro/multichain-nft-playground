import { useEffect, useState } from 'react';
import { CircleCheck, QrCode, RefreshCw, TriangleAlert } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { META, fmtBal, low, readbackAll, refreshBalance, refreshHeld, useBalance, useRows } from '../chainMeta';
import { CHAINS, type Chain, type Holder } from '../pure';
import { recipientAddress, set } from '../settings';
import { validAddress } from '../validate';
import { Balance, ChainLogo, CopyBtn, HOLDER_LABEL, IconBtn, QrDialog, RecipientDialog, short } from '../ui';

const HOLDERS: Holder[] = ['playground', 'recipient', 'other', 'unknown'];

function ChainCard({ chain, onQr }: { chain: Chain; onQr: () => void }) {
  const m = META[chain];
  const bal = useBalance(chain);
  const rows = useRows(chain);
  const [rcp, setRcp] = useState(() => recipientAddress(chain));
  const [editing, setEditing] = useState(false);
  const rOk = validAddress(chain, rcp);
  const isLow = low(bal, m.need);
  return (
    <Card className="relative gap-0 p-6 transition-colors hover:border-ring/50">
      <div className="flex items-center gap-3">
        <ChainLogo src={m.logo} className="size-8" />
        <div className="min-w-0 flex-1">
          {/* The stretched link makes the whole card clickable; the icon buttons sit above it. */}
          <a href={`#/${chain}`} className="text-base font-semibold after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring">{m.label}</a>
          <div className="text-xs text-muted-foreground">{m.network()}</div>
        </div>
        <div className="relative z-10 -mr-2 flex items-center">
          <IconBtn label="Show QR code" icon={QrCode} onClick={onQr} />
          <CopyBtn value={m.address()} label="Copy wallet address" />
          <IconBtn label="Refresh balance" icon={RefreshCw} onClick={() => refreshBalance(chain)} />
        </div>
      </div>
      <div className="mt-6 space-y-1">
        <div className="text-xs text-muted-foreground">Balance</div>
        <div className="flex min-w-0 text-2xl">{bal === undefined ? <Skeleton className="my-1 h-6 w-36" /> : <Balance value={fmtBal(bal)} low={isLow} />}</div>
        {isLow && <div className="text-xs text-destructive">Below the recommended {m.need} {m.unit}</div>}
      </div>
      <div className="mt-6 divide-y border-t text-sm">
        <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
          <span className="text-muted-foreground">Recipient</span>
          {rOk ? <span className="flex items-center gap-1.5"><CircleCheck className="size-4 text-success" /><span className="font-mono" title={rcp}>{short(rcp)}</span></span>
            : <span className="relative z-10 flex items-center gap-1.5"><TriangleAlert className={rcp ? "size-4 text-destructive" : "size-4 text-warning"} aria-hidden /><button type="button" className="underline underline-offset-4" onClick={() => setEditing(true)}>{rcp ? "Invalid, fix it" : "Set recipient"}</button></span>}
          {editing && <RecipientDialog chain={chain} label={m.label} value={rcp} onClose={() => setEditing(false)}
            onSave={(v) => { set(`recipient.${chain}`, v); setRcp(v); }} />}
        </div>
        <div className="flex items-center justify-between gap-3 py-3 last:pb-0">
          <span className="text-muted-foreground">NFTs</span>
          {rows.length === 0 ? <span className="text-muted-foreground">none yet</span> : (
            <span className="text-right tabular-nums">
              {HOLDERS.map((h) => [h, rows.filter((r) => r.holder === h).length] as const).filter(([, n]) => n > 0)
                .map(([h, n], i) => <span key={h}>{i > 0 && <span className="text-muted-foreground"> · </span>}{n} <span className="text-muted-foreground">{HOLDER_LABEL[h].toLowerCase()}</span></span>)}
            </span>
          )}
        </div>
      </div>
    </Card>
  );
}

export default function Overview() {
  const [qr, setQr] = useState<Chain | null>(null);
  // Holders change without a playground action (a send accepted in the recipient wallet): re-read on open.
  useEffect(() => { CHAINS.forEach((c) => { refreshHeld(c); readbackAll(c); }); }, []);
  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Overview</h1>
        <p className="text-sm text-muted-foreground">Fund each playground wallet, set the recipient (the wallet under test), then mint from a chain page.</p>
      </div>
      <div className="grid gap-6 md:grid-cols-2">{CHAINS.map((c) => <ChainCard key={c} chain={c} onQr={() => setQr(c)} />)}</div>
      {qr && <QrDialog title={`${META[qr].label} · ${META[qr].network()}`} address={META[qr].address()} onClose={() => setQr(null)} />}
    </div>
  );
}
