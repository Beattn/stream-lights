import { Link, useLocation } from "wouter";
import {
  LayoutDashboard,
  Lightbulb,
  Zap,
  Terminal,
  Globe,
  Settings as SettingsIcon,
  Activity,
  LogOut,
} from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();
  const { signOut } = useAuth();
  const { toast } = useToast();

  const navItems = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard },
    { href: "/devices", label: "Devices", icon: Lightbulb },
    { href: "/triggers", label: "Triggers", icon: Zap },
    { href: "/commands", label: "Commands", icon: Terminal },
    { href: "/platforms", label: "Platforms", icon: Globe },
    { href: "/settings", label: "Settings", icon: SettingsIcon },
  ];

  const handleSignOut = async () => {
    await signOut();
    toast({ title: "Signed out." });
  };

  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-sidebar flex flex-col shrink-0 sticky top-0 h-screen">
        <div className="h-16 flex items-center px-6 border-b border-border">
          <div className="flex items-center gap-3 text-primary">
            <Zap className="w-6 h-6 fill-current" />
            <span className="font-bold text-lg tracking-tight uppercase">Stream Lights</span>
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location === item.href;
            const Icon = item.icon;

            return (
              <Link key={item.href} href={item.href}>
                <div className={`
                  flex items-center gap-3 px-3 py-2 rounded-md transition-all cursor-pointer select-none
                  ${isActive
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }
                `}>
                  <Icon className={`w-5 h-5 ${isActive ? "text-primary" : ""}`} />
                  {item.label}
                </div>
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <div className="flex items-center gap-2 px-3 py-2 text-sm text-muted-foreground bg-muted/50 rounded-md">
            <Activity className="w-4 h-4" />
            <span>System:</span>
            <span className={`ml-auto flex items-center gap-1.5 ${health?.status === 'ok' ? 'text-green-500' : 'text-destructive'}`}>
              <span className={`w-2 h-2 rounded-full ${health?.status === 'ok' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-destructive shadow-[0_0_8px_rgba(239,68,68,0.6)]'}`} />
              {health?.status === 'ok' ? 'Online' : 'Offline'}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSignOut}
            className="w-full justify-start gap-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 px-3"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <div className="flex-1 p-8 overflow-auto">
          <div className="max-w-7xl mx-auto space-y-8">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
