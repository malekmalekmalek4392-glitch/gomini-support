import React, { useState, useEffect } from 'react';
import CustomerPortal from './components/CustomerPortal';
import AgentDashboard from './components/AgentDashboard';
import { LayoutDashboard, BarChart3, Users, Headphones, ExternalLink, RefreshCw } from 'lucide-react';

export default function App() {
  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const v = params.get('view');
    if (v === 'admin' || v === 'executive' || v === 'agent') return v;
    return 'customer';
  });

  // Sync view changes to URL query param without full reload
  const setView = (v) => {
    setCurrentView(v);
    const url = new URL(window.location);
    if (v === 'customer') {
      url.searchParams.delete('view');
    } else {
      url.searchParams.set('view', v);
    }
    window.history.pushState({}, '', url);
  };

  return (
    <div className="min-h-screen bg-[#070D1E] text-slate-100 flex flex-col font-sans antialiased selection:bg-pink-500/30">
      {/* Top Global Navigation Bar */}
      <header className="h-16 bg-[#0B132B]/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setView('customer')}>
            <span className="h-8 w-8 rounded-xl bg-pink-500 flex items-center justify-center font-black text-xs text-white shadow-md shadow-pink-500/20">
              GM
            </span>
            <span className="font-black text-xl text-white tracking-wide">
              go<span className="text-pink-500">mini.</span>
            </span>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block"></div>

          {/* View Selector Pills */}
          <nav className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-2xl border border-slate-800">
            <button
              onClick={() => setView('customer')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentView === 'customer'
                  ? 'bg-cyan-500 text-white shadow-md shadow-cyan-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Customer</span>
            </button>

            <button
              onClick={() => setView('admin')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentView === 'admin'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutDashboard className="w-3.5 h-3.5" />
              <span>Admin Dispatch</span>
            </button>

            <button
              onClick={() => setView('executive')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentView === 'executive'
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-600/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Executive</span>
            </button>

            <button
              onClick={() => setView('agent')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                currentView === 'agent'
                  ? 'bg-pink-600 text-white shadow-md shadow-pink-600/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Headphones className="w-3.5 h-3.5" />
              <span>Support Desk</span>
            </button>
          </nav>
        </div>

        {/* Status Indicator */}
        <div className="flex items-center gap-3">
          <div className="hidden md:flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/30 px-2.5 py-1 rounded-full text-[11px] font-bold text-emerald-300">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
            <span>Live Edit Sync Active</span>
          </div>

          {(currentView === 'admin' || currentView === 'executive') && (
            <a
              href={`/dispatch.html?view=${currentView}`}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-slate-400 hover:text-white flex items-center gap-1 bg-slate-800/60 px-2.5 py-1 rounded-lg border border-slate-700/60 transition-all"
              title="Open full screen in new tab"
            >
              <ExternalLink className="w-3 h-3" />
              <span className="hidden sm:inline">Pop Out</span>
            </a>
          )}
        </div>
      </header>

      {/* Main Content Body */}
      <div className="flex-1 flex flex-col">
        {currentView === 'customer' && (
          <CustomerPortal
            onSwitchToAgent={() => setView('agent')}
            onSwitchToAdmin={() => setView('admin')}
            onSwitchToExecutive={() => setView('executive')}
          />
        )}

        {currentView === 'admin' && (
          <iframe
            src="/dispatch.html?view=admin"
            title="GoMini Admin Dispatch Matrix"
            className="w-full flex-1 border-0 min-h-[calc(100vh-4rem)] bg-[#070D1E]"
          />
        )}

        {currentView === 'executive' && (
          <iframe
            src="/dispatch.html?view=executive"
            title="GoMini Executive Operations View"
            className="w-full flex-1 border-0 min-h-[calc(100vh-4rem)] bg-[#070D1E]"
          />
        )}

        {currentView === 'agent' && (
          <AgentDashboard onSwitchToPassenger={() => setView('customer')} />
        )}
      </div>
    </div>
  );
}
