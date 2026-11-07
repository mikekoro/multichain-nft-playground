import { useSyncExternalStore, type ReactNode } from 'react';
import { FlaskConical, KeyRound, LayoutGrid, Settings as SettingsIcon, TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarTrigger, useSidebar } from '@/components/ui/sidebar';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { MAINNET } from './settings';
import { CHAINS, type Chain } from './pure';
import { low, META, useBalance, useRows } from './chainMeta';
import Overview from './pages/Overview';
import ChainPage from './pages/ChainPage';
import { EXTRAS } from './pages/extras';
import Settings from './pages/Settings';
import { ChainLogo } from './ui';

const ROUTES = ['overview', ...CHAINS, 'settings'] as const;
type Route = (typeof ROUTES)[number];
const hash = () => location.hash.replace(/^#\/?/, '');
/** Hash routing, no router: #/overview, #/xrpl ... #/settings. Back and forward fire hashchange. */
const useRoute = (): Route => {
  const h = useSyncExternalStore((f) => { addEventListener('hashchange', f); return () => removeEventListener('hashchange', f); }, hash);
  return (ROUTES as readonly string[]).includes(h) ? (h as Route) : 'overview';
};
const title = (r: Route) => r === 'overview' ? 'Overview' : r === 'settings' ? 'Settings' : META[r].label;

function NavItem({ route, current, icon, label, children }: { route: Route; current: Route; icon: ReactNode; label: string; children?: ReactNode }) {
  const { setOpenMobile } = useSidebar();
  return (
    <SidebarMenuItem>
      <SidebarMenuButton asChild isActive={route === current} className="data-[active=true]:inset-ring data-[active=true]:inset-ring-sidebar-border">
        <a href={`#/${route}`} onClick={() => setOpenMobile(false)}>{icon}<span>{label}</span></a>
      </SidebarMenuButton>
      {children}
    </SidebarMenuItem>
  );
}

function ChainNav({ chain, current }: { chain: Chain; current: Route }) {
  const m = META[chain];
  const isLow = low(useBalance(chain), m.need);
  // The same rows as the chain page's NFTs table: the lab wallet's listing merged with the mint log.
  const count = useRows(chain).length;
  return (
    <NavItem route={chain} current={current} icon={<ChainLogo src={m.logo} />} label={m.label}>
      <SidebarMenuBadge className="gap-2 text-xs font-normal text-muted-foreground">
        {isLow && <span className="size-1.5 rounded-full bg-destructive" role="img" aria-label="Balance below recommended" title="Balance below recommended" />}
        <span className="tabular-nums" title="NFTs">{count}</span>
      </SidebarMenuBadge>
    </NavItem>
  );
}

function AppSidebar({ route }: { route: Route }) {
  return (
    <Sidebar variant="inset">
      <SidebarHeader className="px-3 pt-4">
        <div className="flex items-center gap-2.5 px-1">
          <div className="flex size-7 items-center justify-center rounded-[6px] bg-brand text-primary-foreground"><FlaskConical className="size-4" /></div>
          <div className="min-w-0 flex-1 leading-tight">
            <div className="truncate text-sm font-semibold">Multichain NFT Lab</div>
            <div className={MAINNET ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>{MAINNET ? 'Mainnet' : 'Testnet'}</div>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent className="gap-0">
        <SidebarGroup><SidebarGroupContent><SidebarMenu>
          <NavItem route="overview" current={route} icon={<LayoutGrid />} label="Overview" />
          <NavItem route="settings" current={route} icon={<SettingsIcon />} label="Settings" />
        </SidebarMenu></SidebarGroupContent></SidebarGroup>
        <SidebarGroup className="pt-0">
          <SidebarGroupLabel>Chains</SidebarGroupLabel>
          <SidebarGroupContent><SidebarMenu>{CHAINS.map((c) => <ChainNav key={c} chain={c} current={route} />)}</SidebarMenu></SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="pb-3">
        <p className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5 text-xs leading-relaxed text-warning"><KeyRound className="mt-0.5 size-3.5 shrink-0" />Keys live in .env.local and in the bundle. Never deploy this app.</p>
      </SidebarFooter>
    </Sidebar>
  );
}

export default function App() {
  const route = useRoute();
  return (
    <TooltipProvider delayDuration={300}>
      <SidebarProvider>
        <AppSidebar route={route} />
        <SidebarInset className="min-w-0">
          <header className="sticky top-0 z-10 flex h-12 items-center gap-2 border-b bg-background/80 px-4 backdrop-blur md:hidden">
            <SidebarTrigger aria-label="Toggle navigation" />
            <Separator orientation="vertical" className="data-[orientation=vertical]:h-4" />
            <span className="text-sm font-medium">{title(route)}</span>
          </header>
          <div className="mx-auto w-full max-w-5xl space-y-6 p-4 md:p-10">
            {MAINNET && <Alert variant="destructive"><TriangleAlert /><AlertTitle>Mainnet: real funds</AlertTitle><AlertDescription>Every action here spends real money. Keys are in .env.local and in the bundle.</AlertDescription></Alert>}
            {route === 'overview' ? <Overview /> : route === 'settings' ? <Settings /> : <ChainPage key={route} chain={route} extra={EXTRAS[route]} />}
          </div>
        </SidebarInset>
      </SidebarProvider>
      <Toaster theme="dark" position="bottom-right" />
    </TooltipProvider>
  );
}
