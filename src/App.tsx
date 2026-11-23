import React from 'react';
import { AnimatePresence, MotionConfig, motion } from 'motion/react';
import { AppProvider, useApp } from './context/AppContext';
import { AppShell } from './components/AppShell';
import { AuthModal } from './components/AuthModal';
import { CommandPalette } from './components/CommandPalette';
import { DashboardView } from './views/DashboardView';
import { ProjectsMarketplaceView } from './views/ProjectsMarketplaceView';
import { FreelancersView } from './views/FreelancersView';
import { MyProjectsView } from './views/MyProjectsView';
import { TasksView } from './views/TasksView';
import { MessagesView } from './views/MessagesView';
import { LensAiView } from './views/LensAiView';
import { WorkspaceHubView } from './views/WorkspaceHubView';
import { NotificationsView, SavedItemsView } from './views/SavedAndNotificationsView';
import { SettingsView } from './views/SettingsView';
import { AdminView } from './views/AdminView';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false, message: '' };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, message: error?.message || 'Unexpected interface error.' };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center bg-[#F5F6F8] dark:bg-[#101116] p-6">
          <div className="max-w-md rounded-2xl border border-black/[0.08] dark:border-white/[0.1] bg-white dark:bg-[#1A1C24] p-6 text-center">
            <h1 className="text-base font-semibold text-[#171820] dark:text-[#F2F3F7]">
              Something went wrong
            </h1>
            <p className="mt-2 text-xs text-[#777987] dark:text-[#9B9EAC]">
              {this.state.message}
            </p>
            <button
              type="button"
              onClick={() => this.setState({ hasError: false, message: '' })}
              className="mt-4 rounded-lg bg-[#7657E8] px-4 py-2 text-sm font-medium text-white hover:bg-[#6446d6]"
            >
              Reload View
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function ActivePageRouter() {
  const { activePage } = useApp();

  const renderPage = () => {
    switch (activePage) {
      case 'home':
        return <DashboardView modeView="home" />;
      case 'workspace':
        return <DashboardView modeView="workspace" />;
      case 'discover-projects':
        return <ProjectsMarketplaceView />;
      case 'find-freelancers':
        return <FreelancersView />;
      case 'my-projects':
        return <MyProjectsView />;
      case 'messages':
        return <MessagesView />;
      case 'tasks':
        return <TasksView initialMode="list" />;
      case 'calendar':
        return <TasksView initialMode="calendar" />;
      case 'saved':
        return <SavedItemsView />;
      case 'lens':
        return <LensAiView />;
      case 'integrations':
        return <WorkspaceHubView />;
      case 'notifications':
        return <NotificationsView />;
      case 'settings':
        return <SettingsView />;
      case 'admin':
        return <AdminView />;
      default:
        return <DashboardView modeView="home" />;
    }
  };

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={activePage}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -2 }}
        transition={{ duration: 0.14, ease: 'easeOut' }}
      >
        {renderPage()}
      </motion.div>
    </AnimatePresence>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <MotionConfig reducedMotion="user">
        <AppProvider>
          <AppShell>
            <ActivePageRouter />
          </AppShell>
          <AuthModal />
          <CommandPalette />
        </AppProvider>
      </MotionConfig>
    </ErrorBoundary>
  );
}
