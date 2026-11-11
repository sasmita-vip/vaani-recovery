import { useEffect, useState } from 'react';
import { ThemeProvider } from '@/lib/theme';
import { AuthProvider, useAuth } from '@/lib/auth';
import { LiveProvider, useLiveData } from '@/lib/live';
import { hashFor, historyHash, useHashRoute, type NavKey } from '@/lib/router';
import { Sidebar, BottomNav } from '@/components/Sidebar';
import { TopBar } from '@/components/TopBar';
import { SignInScreen } from '@/screens/SignIn';
import { OverviewScreen } from '@/screens/Overview';
import { LiveCallsScreen } from '@/screens/LiveCalls';
import { EscalationQueueScreen } from '@/screens/EscalationQueue';
import { PromisesScreen } from '@/screens/Promises';
import { CallHistoryScreen } from '@/screens/CallHistory';
import { CallDetailScreen } from '@/screens/CallDetail';
import { ComplianceScreen } from '@/screens/Compliance';
import { SettingsScreen } from '@/screens/Settings';
import { fetchEscalationCounts, fetchLiveCalls } from '@/lib/api';
import { Skeleton } from '@/components/ui';
import { WaveBackdrop } from '@/components/Waves';

function Dashboard() {
  const { session } = useAuth();
  const { route, navigate } = useHashRoute();
  const [collapsed, setCollapsed] = useState(false);

  const counts = useLiveData(async () => {
    const [calls, escalations] = await Promise.all([fetchLiveCalls(), fetchEscalationCounts()]);
    return { live: calls.length, open: escalations.Open + escalations.Assigned };
  });

  const liveCount = counts.data?.live ?? 0;
  const escalationCount = counts.data?.open ?? 0;

  // After a successful sign-in, leave the sign-in page.
  useEffect(() => {
    if (session && route.signIn) navigate('#/overview');
  }, [session, route.signIn, navigate]);

  const go = (key: NavKey) => navigate(hashFor(key));
  const openCall = (callId: string) => navigate(hashFor('call-detail', callId));

  if (route.signIn) {
    return <SignInScreen onBack={() => navigate('#/overview')} />;
  }

  return (
    <div className="flex h-screen overflow-hidden bg-surface-2">
      <Sidebar
        active={route.nav}
        onNavigate={go}
        collapsed={collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        liveCount={liveCount}
        escalationCount={escalationCount}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar
          escalationCount={escalationCount}
          onSearch={(query) => navigate(historyHash(query))}
        />

        <main className="relative flex-1 overflow-y-auto p-4 pb-24 sm:p-6 md:pb-6">
          <WaveBackdrop className="text-line-strong opacity-40" />
          <div className="relative z-10 mx-auto max-w-7xl animate-fade-in">
            {route.nav === 'overview' && <OverviewScreen onNavigate={go} />}
            {route.nav === 'live' && <LiveCallsScreen />}
            {route.nav === 'escalation' && <EscalationQueueScreen onCallSelect={openCall} />}
            {route.nav === 'ptp' && <PromisesScreen onCallSelect={openCall} />}
            {route.nav === 'history' && (
              <CallHistoryScreen initialQuery={route.query} onCallSelect={openCall} onNavigate={go} />
            )}
            {route.nav === 'call-detail' && (
              <CallDetailScreen callId={route.callId} onNavigate={go} onCallSelect={openCall} />
            )}
            {route.nav === 'compliance' && <ComplianceScreen onCallSelect={openCall} />}
            {route.nav === 'settings' && <SettingsScreen />}
          </div>
        </main>

        <BottomNav active={route.nav} onNavigate={go} liveCount={liveCount} escalationCount={escalationCount} />
      </div>
    </div>
  );
}

function AppShell() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface-2">
        <div className="w-full max-w-sm space-y-3 px-6" aria-busy="true" aria-label="Loading dashboard">
          <Skeleton className="mx-auto h-12 w-12 rounded-2xl" />
          <Skeleton className="h-6 w-40 mx-auto" />
          <Skeleton className="h-40 w-full" />
        </div>
      </div>
    );
  }

  // Public by design: the dashboard renders without a session. Anonymous
  // visitors are read-only (no actions, masked phone numbers) and can open
  // #/signin whenever they need manager/officer access.
  return (
    <LiveProvider>
      <Dashboard />
    </LiveProvider>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
