import { useState } from "react";
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
  Download,
  Monitor,
  Copy,
  CheckCheck,
  X,
} from "lucide-react";
import { useHealthCheck } from "@workspace/api-client-react";
import { useAuth } from "@/context/auth";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

function DownloadModal({ onClose }: { onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const steps = [
    {
      num: "1",
      title: "Install Node.js",
      desc: "Download and install the LTS version from nodejs.org",
      link: { label: "nodejs.org →", href: "https://nodejs.org" },
    },
    {
      num: "2",
      title: "Clone the repo",
      desc: "Open PowerShell and run:",
      code: "git clone https://github.com/Beattn/stream-lights.git\ncd stream-lights/artifacts/desktop-agent",
      codeKey: "clone",
    },
    {
      num: "3",
      title: "Run the installer script",
      desc: "From the desktop-agent folder in PowerShell:",
      code: "Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned\n.\\install-windows.ps1",
      codeKey: "install",
    },
    {
      num: "4",
      title: "First-time setup",
      desc: "A setup window opens — paste your Supabase URL and Anon Key (Settings → API in Supabase), then click Save.",
    },
  ];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.7)", backdropFilter: "blur(4px)" }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="bg-sidebar border border-border rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-border">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
              <Monitor className="w-5 h-5 text-primary" />
            </div>
            <div>
              <h2 className="font-semibold text-foreground">Desktop Agent</h2>
              <p className="text-xs text-muted-foreground">Install on your streaming PC</p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* What it does */}
        <div className="px-6 py-4 bg-primary/5 border-b border-border">
          <p className="text-sm text-muted-foreground leading-relaxed">
            The agent runs silently in your <span className="text-foreground font-medium">system tray</span>.
            It connects to Kick/Twitch and controls your Hue & Nanoleaf lights
            directly over your <span className="text-foreground font-medium">local network</span> — no cloud relay needed.
          </p>
        </div>

        {/* Steps */}
        <div className="px-6 py-5 space-y-4 max-h-80 overflow-y-auto">
          {steps.map((step) => (
            <div key={step.num} className="flex gap-4">
              <div className="w-7 h-7 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
                {step.num}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{step.title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                {step.link && (
                  <a href={step.link.href} target="_blank" rel="noreferrer"
                    className="text-xs text-primary hover:underline mt-1 inline-block">
                    {step.link.label}
                  </a>
                )}
                {step.code && (
                  <div className="mt-2 relative group">
                    <pre className="bg-background border border-border rounded-lg px-3 py-2.5 text-xs text-green-400 font-mono whitespace-pre-wrap leading-relaxed pr-10">
                      {step.code}
                    </pre>
                    <button
                      onClick={() => copy(step.code!, step.codeKey!)}
                      className="absolute top-2 right-2 text-muted-foreground hover:text-foreground transition-colors"
                      title="Copy"
                    >
                      {copied === step.codeKey
                        ? <CheckCheck className="w-3.5 h-3.5 text-green-500" />
                        : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex items-center justify-between gap-3">
          <span className="text-xs text-muted-foreground">Windows 10/11 · Runs at startup · System tray</span>
          <a
            href="https://github.com/Beattn/stream-lights"
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
          >
            <Download className="w-4 h-4" />
            View on GitHub
          </a>
        </div>
      </div>
    </div>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { data: health } = useHealthCheck();
  const { signOut } = useAuth();
  const { toast } = useToast();
  const [showDownload, setShowDownload] = useState(false);

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
          {/* Download Agent Button */}
          <button
            onClick={() => setShowDownload(true)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md bg-primary/10 hover:bg-primary/20 text-primary transition-colors text-sm font-medium border border-primary/20 hover:border-primary/40"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Download Desktop Agent</span>
          </button>

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

      {/* Download Modal */}
      {showDownload && <DownloadModal onClose={() => setShowDownload(false)} />}

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
