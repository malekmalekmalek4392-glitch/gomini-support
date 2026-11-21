import React, { useState } from 'react';
import CustomerPortal from './components/CustomerPortal';
import AgentDashboard from './components/AgentDashboard';
import LoginPage from './components/LoginPage';

export default function App() {
  // State for current user / session
  const [authSession, setAuthSession] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');

    // Explicit URL query overrides
    if (viewParam === 'agent') {
      const agentName = localStorage.getItem('gomini_agent_name') || 'Agent Omar';
      return { role: 'agent', name: agentName };
    }
    if (viewParam === 'customer') {
      const eid = localStorage.getItem('gomini_active_eid') || '3367295';
      return { role: 'customer', eid };
    }

    // Check saved session
    const savedRole = localStorage.getItem('gomini_user_role');
    if (savedRole === 'agent') {
      const agentName = localStorage.getItem('gomini_agent_name') || 'Agent';
      return { role: 'agent', name: agentName };
    }
    if (savedRole === 'customer') {
      const eid = localStorage.getItem('gomini_active_eid');
      if (eid) return { role: 'customer', eid };
    }

    // Default to Login Page
    return null;
  });

  // Handle Customer Login from LoginPage
  const handleCustomerLogin = (passenger) => {
    const eid = passenger?.employee_id || localStorage.getItem('gomini_active_eid');
    setAuthSession({ role: 'customer', eid, passenger });
  };

  // Handle Agent Login from LoginPage
  const handleAgentLogin = (name) => {
    setAuthSession({ role: 'agent', name });
  };

  // Handle Sign Out from any portal
  const handleSignOut = () => {
    localStorage.removeItem('gomini_active_eid');
    localStorage.removeItem('gomini_user_role');
    sessionStorage.removeItem('gomini_auth');

    // Clean URL query params if present without reloading
    if (window.location.search) {
      window.history.replaceState({}, '', window.location.pathname);
    }

    setAuthSession(null);
  };

  return (
    <div className="min-h-screen bg-[#070D1E] font-sans antialiased text-slate-100 selection:bg-cyan-500/30">
      {/* 1. Login Page (Dual Card for Customer & Staff) */}
      {!authSession && (
        <LoginPage 
          onCustomerLogin={handleCustomerLogin}
          onAgentLogin={handleAgentLogin}
        />
      )}

      {/* 2. Customer Commuter Portal */}
      {authSession?.role === 'customer' && (
        <CustomerPortal 
          initialPassenger={authSession.passenger}
          onSignOut={handleSignOut}
          onSwitchToAgent={() => setAuthSession({ role: 'agent', name: localStorage.getItem('gomini_agent_name') || 'Agent' })}
        />
      )}

      {/* 3. Live Support Agent Dashboard */}
      {authSession?.role === 'agent' && (
        <AgentDashboard 
          agentNameProp={authSession.name}
          onSignOut={handleSignOut}
          onSwitchToPassenger={handleSignOut}
        />
      )}
    </div>
  );
}
