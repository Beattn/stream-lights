import { useEffect, lazy, Suspense } from "react";
import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";

import { AuthProvider, useAuth } from "@/context/auth";
import Layout from "@/components/layout";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";

// Lazy load secondary routes for faster initial page load
const Devices = lazy(() => import("@/pages/devices"));
const Triggers = lazy(() => import("@/pages/triggers"));
const Commands = lazy(() => import("@/pages/commands"));
const Platforms = lazy(() => import("@/pages/platforms"));
const Settings = lazy(() => import("@/pages/settings"));

// Loading component for suspense boundaries
function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-muted-foreground text-sm">Loading page...</p>
      </div>
    </div>
  );
}

const queryClient = new QueryClient();

function AppRouter() {
  const { session, loading, authEnabled } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          <p className="text-muted-foreground text-sm">Loading...</p>
        </div>
      </div>
    );
  }

  if (authEnabled && !session) {
    return <Login />;
  }

  return (
    <Layout>
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/devices">
          <Suspense fallback={<PageLoader />}>
            <Devices />
          </Suspense>
        </Route>
        <Route path="/triggers">
          <Suspense fallback={<PageLoader />}>
            <Triggers />
          </Suspense>
        </Route>
        <Route path="/commands">
          <Suspense fallback={<PageLoader />}>
            <Commands />
          </Suspense>
        </Route>
        <Route path="/platforms">
          <Suspense fallback={<PageLoader />}>
            <Platforms />
          </Suspense>
        </Route>
        <Route path="/settings">
          <Suspense fallback={<PageLoader />}>
            <Settings />
          </Suspense>
        </Route>
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  useEffect(() => {
    document.documentElement.classList.add("dark");
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <AuthProvider>
          <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
            <AppRouter />
          </WouterRouter>
          <Toaster />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
