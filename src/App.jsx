import React, { useState } from 'react';
import CustomerPortal from './components/CustomerPortal';
import AgentDashboard from './components/AgentDashboard';
import LoginPage from './components/LoginPage';

export default function App() {
  // State for current user / session (persisted across refresh and browser restarts)
  const [authSession, setAuthSession] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const viewParam = params.get('view');

    // 1. Check saved session role in localStorage
    const savedRole = localStorage.getItem('gomini_user_role');

    if (savedRole === 'agent' || viewParam === 'agent') {
      const agentName = localStorage.getItem('gomini_agent_name') || 'Agent Support';
      return { role: 'agent', name: agentName };
    }

    if (savedRole === 'customer' || viewParam === 'customer') {
      const eid = localStorage.getItem('gomini_active_eid');
      let savedPassenger = null;
      try {
        const raw = localStorage.getItem('gomini_passenger_data');
        if (raw) savedPassenger = JSON.parse(raw);
      } catch (e) {}

      if (eid || savedPassenger) {
        return {
          role: 'customer',
          eid: eid || savedPassenger?.employee_id,
          passenger: savedPassenger
        };
      }
    }

    // Default to Login Page if not signed in
    return null;
  });

  // Handle Customer Login from LoginPage
  const handleCustomerLogin = (passenger) => {
    const eid = passenger?.employee_id || localStorage.getItem('gomini_active_eid');
    if (passenger) {
      try {
        localStorage.setItem('gomini_passenger_data', JSON.stringify(passenger));
      } catch (e) {}
    }
    if (eid) {
      localStorage.setItem('gomini_active_eid', String(eid).trim());
    }
    localStorage.setItem('gomini_user_role', 'customer');
    setAuthSession({ role: 'customer', eid, passenger });
  };

  // Handle Agent Login from LoginPage
  const handleAgentLogin = (name) => {
    const trimmed = (name || 'Agent Support').trim();
    localStorage.setItem('gomini_agent_name', trimmed);
    localStorage.setItem('gomini_user_role', 'agent');
    setAuthSession({ role: 'agent', name: trimmed });
  };

  // Handle Sign Out from any portal (Customer or Agent)
  const handleSignOut = () => {
    localStorage.removeItem('gomini_active_eid');
    localStorage.removeItem('gomini_passenger_data');
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
