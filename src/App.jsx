import React, { useState } from 'react';
import CustomerPortal from './components/CustomerPortal';
import AgentDashboard from './components/AgentDashboard';

export default function App() {
  const [currentView, setCurrentView] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('view') === 'agent' ? 'agent' : 'customer';
  });

  return (
    <div className="min-h-screen bg-[#070D1E] font-sans antialiased text-slate-100">
      {currentView === 'customer' ? (
        <CustomerPortal onSwitchToAgent={() => setCurrentView('agent')} />
      ) : (
        <AgentDashboard onSwitchToPassenger={() => setCurrentView('customer')} />
      )}
    </div>
  );
}
