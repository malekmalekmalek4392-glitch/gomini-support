import React, { useState } from 'react';
import { 
  Bus, 
  ShieldCheck, 
  User, 
  Lock, 
  Mail, 
  ArrowRight, 
  UserCheck, 
  AlertCircle, 
  Sparkles,
  CheckCircle2,
  Headphones,
  Briefcase
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LoginPage({ onCustomerLogin, onAgentLogin }) {
  // Customer Login State
  const [customerId, setCustomerId] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');

  // Staff Login State
  const [staffRole, setStaffRole] = useState('admin'); // 'admin', 'executive', 'agent'
  const [staffEmail, setStaffEmail] = useState('admin@gomini.com');
  const [staffPassword, setStaffPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');

  // Handle Role Quick Switch
  const handleSelectRole = (role) => {
    setStaffRole(role);
    setStaffError('');
    if (role === 'admin') {
      setStaffEmail('admin@gomini.com');
    } else if (role === 'executive') {
      setStaffEmail('executive@gomini.com');
    } else if (role === 'agent') {
      setStaffEmail('agent@gomini.com');
    }
  };

  // Handle Customer Login (No Password Required)
  const handleCustomerSubmit = async (e) => {
    e.preventDefault();
    setCustomerError('');
    const input = customerId.trim();

    if (!input) {
      setCustomerError('Please enter your Employee ID or registered mobile number.');
      return;
    }

    setCustomerLoading(true);
    try {
      // Query roster to check if passenger exists
      const { data, error } = await supabase
        .from('roster')
        .select('*');

      if (error) throw error;

      if (data && data.length > 0) {
        // Search by Employee ID, Phone, or Name
        const match = data.find(p => 
          String(p.employee_id || '').trim() === input ||
          String(p.phone || '').replace(/\D/g, '').includes(input.replace(/\D/g, '')) ||
          String(p.name || '').toLowerCase().includes(input.toLowerCase())
        );

        if (match) {
          localStorage.setItem('gomini_active_eid', match.employee_id);
          localStorage.setItem('gomini_user_role', 'customer');
          onCustomerLogin(match);
        } else {
          // If not exact match, check partial ID or offer to proceed
          const partialMatch = data.find(p => String(p.employee_id || '').includes(input));
          if (partialMatch) {
            localStorage.setItem('gomini_active_eid', partialMatch.employee_id);
            localStorage.setItem('gomini_user_role', 'customer');
            onCustomerLogin(partialMatch);
          } else {
            setCustomerError(`No passenger found matching "${input}". Please double-check your Employee ID or contact dispatch.`);
          }
        }
      } else {
        // Fallback if network offline
        localStorage.setItem('gomini_active_eid', input);
        localStorage.setItem('gomini_user_role', 'customer');
        onCustomerLogin({ employee_id: input });
      }
    } catch (err) {
      console.error('Customer login error:', err);
      // Allow fallback login even if network blips
      localStorage.setItem('gomini_active_eid', input);
      localStorage.setItem('gomini_user_role', 'customer');
      onCustomerLogin({ employee_id: input });
    } finally {
      setCustomerLoading(false);
    }
  };

  // Handle Staff Login (Admin, Executive, Agent)
  const handleStaffSubmit = (e) => {
    e.preventDefault();
    setStaffError('');

    const email = staffEmail.trim().toLowerCase();
    const pass = staffPassword.trim();

    if (!email) {
      setStaffError('Please enter your staff email address.');
      return;
    }

    if (!pass) {
      setStaffError('Please enter your password.');
      return;
    }

    setStaffLoading(true);

    // 1. Admin Login
    if (email === 'admin@gomini.com') {
      if (pass === '123456') {
        const authUser = { role: 'admin', email: 'admin@gomini.com', name: 'System Administrator' };
        sessionStorage.setItem('gomini_auth', JSON.stringify(authUser));
        localStorage.setItem('gomini_user_role', 'admin');
        window.location.href = '/dispatch.html?view=admin';
      } else {
        setStaffError('Incorrect password. For admin, use password: 123456');
        setStaffLoading(false);
      }
      return;
    }

    // 2. Executive Login
    if (email === 'executive@gomini.com') {
      if (pass === '123456') {
        const authUser = { role: 'executive', email: 'executive@gomini.com', name: 'Executive Operations' };
        sessionStorage.setItem('gomini_auth', JSON.stringify(authUser));
        localStorage.setItem('gomini_user_role', 'executive');
        window.location.href = '/dispatch.html?view=executive';
      } else {
        setStaffError('Incorrect password. For executive, use password: 123456');
        setStaffLoading(false);
      }
      return;
    }

    // 3. Agent Login
    if (email === 'agent@gomini.com') {
      if (pass !== '123456') {
        setStaffError('Incorrect password. For agent, use password: 123456');
        setStaffLoading(false);
        return;
      }

      const trimmedAgentName = agentName.trim();
      if (!trimmedAgentName) {
        setStaffError('Please enter the name of the agent that will help commuters (e.g. Sara, Omar).');
        setStaffLoading(false);
        return;
      }

      // Save agent session
      const authUser = { role: 'agent', email: 'agent@gomini.com', name: trimmedAgentName };
      sessionStorage.setItem('gomini_auth', JSON.stringify(authUser));
      localStorage.setItem('gomini_agent_name', trimmedAgentName);
      localStorage.setItem('gomini_user_role', 'agent');
      setStaffLoading(false);
      onAgentLogin(trimmedAgentName);
      return;
    }

    // Unknown email
    setStaffError('Unrecognized staff account. Valid logins: admin@gomini.com, executive@gomini.com, agent@gomini.com');
    setStaffLoading(false);
  };

  return (
    <div className="min-h-screen bg-[#070D1E] text-slate-100 flex flex-col justify-between selection:bg-cyan-500/30 selection:text-cyan-200">
      
      {/* Top Brand Header */}
      <header className="border-b border-slate-800/80 bg-[#091124]/70 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-600 via-cyan-500 to-blue-600 flex items-center justify-center shadow-lg shadow-cyan-500/20 text-white font-black text-xl tracking-wider">
            G
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-black text-base sm:text-lg tracking-tight text-white">GoMini</span>
              <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                Mobility Cloud
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-medium">TaskUs Commute & Dispatch Network</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-xs font-semibold text-slate-400">System Online</span>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-8 sm:py-12 flex flex-col justify-center">
        
        {/* Title & Badge */}
        <div className="text-center max-w-2xl mx-auto mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-bold text-cyan-400 mb-3 shadow-sm">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Unified Access Portal</span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
            Sign In to <span className="bg-gradient-to-r from-cyan-400 to-blue-400 bg-clip-text text-transparent">GoMini Mobility</span>
          </h1>
          <p className="text-slate-400 text-sm sm:text-base mt-2">
            Select your portal below to view your personalized commute schedule or manage operational dispatch.
          </p>
        </div>

        {/* Dual Cards Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
          
          {/* ========================================= */}
          {/* PART 1: CUSTOMER / COMMUTER LOGIN         */}
          {/* ========================================= */}
          <div className="relative rounded-3xl bg-gradient-to-b from-slate-900/90 to-[#0B132B]/90 border border-cyan-500/30 p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-cyan-950/20 backdrop-blur-xl group hover:border-cyan-500/50 transition-all duration-300">
            
            {/* Top Glow Accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10"></div>

            <div>
              {/* Badge & Icon */}
              <div className="flex items-center justify-between mb-6">
                <span className="px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5">
                  <Bus className="w-3.5 h-3.5" />
                  Customer Portal
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                  Password-Free
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Commuter Schedule
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">
                Enter your Employee ID or mobile number to see your exact weekly pickup times, door-to-door status, and route details.
              </p>

              {/* Customer Form */}
              <form onSubmit={handleCustomerSubmit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Customer ID / Employee ID
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      placeholder="e.g. 3367295 or 01033774966"
                      className="w-full pl-10 pr-4 py-3 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-cyan-400" />
                    No password required — login using your assigned company ID.
                  </p>
                </div>

                {customerError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{customerError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={customerLoading}
                  className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 via-cyan-500 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-sm shadow-lg shadow-cyan-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {customerLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>View My Schedule</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Quick Helper / Demo ID */}
            <div className="mt-6 pt-4 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
              <span>Quick test ID:</span>
              <button
                type="button"
                onClick={() => setCustomerId('3367295')}
                className="text-cyan-400 hover:text-cyan-300 font-bold transition-colors cursor-pointer"
              >
                3367295 (Abdulrahman Nawar)
              </button>
            </div>
          </div>

          {/* ========================================= */}
          {/* PART 2: ADMIN / EXECUTIVE / AGENT LOGIN   */}
          {/* ========================================= */}
          <div className="relative rounded-3xl bg-gradient-to-b from-slate-900/90 to-[#0D1226]/90 border border-indigo-500/30 p-6 sm:p-8 flex flex-col justify-between shadow-xl shadow-indigo-950/20 backdrop-blur-xl group hover:border-indigo-500/50 transition-all duration-300">
            
            {/* Top Glow Accent */}
            <div className="absolute top-0 right-0 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -mr-10 -mt-10"></div>

            <div>
              {/* Badge & Icon */}
              <div className="flex items-center justify-between mb-6">
                <span className="px-3 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-indigo-500/15 text-indigo-300 border border-indigo-500/30 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  Staff & Operations
                </span>
                <span className="text-[11px] font-bold text-slate-400 bg-slate-800/80 px-2.5 py-1 rounded-md border border-slate-700/60">
                  Password Required
                </span>
              </div>

              <h2 className="text-xl sm:text-2xl font-bold text-white tracking-tight">
                Staff & Dispatch Portal
              </h2>
              <p className="text-slate-400 text-xs sm:text-sm mt-1.5 leading-relaxed">
                Authorized access for System Admin, Executive Leadership, and Live Commute Support Agents.
              </p>

              {/* Role Selector Tabs */}
              <div className="mt-5 grid grid-cols-3 gap-2 p-1 bg-slate-950/60 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => handleSelectRole('admin')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    staffRole === 'admin'
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>Admin</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('executive')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    staffRole === 'executive'
                      ? 'bg-purple-600 text-white shadow-md shadow-purple-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Briefcase className="w-3.5 h-3.5" />
                  <span>Executive</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSelectRole('agent')}
                  className={`py-2 px-2 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                    staffRole === 'agent'
                      ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                  }`}
                >
                  <Headphones className="w-3.5 h-3.5" />
                  <span>Agent</span>
                </button>
              </div>

              {/* Staff Form */}
              <form onSubmit={handleStaffSubmit} className="mt-5 space-y-3.5">
                
                {/* Agent Name Field (Specific to Agent Login) */}
                {staffRole === 'agent' && (
                  <div>
                    <label className="block text-xs font-bold text-cyan-300 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                      <span>Agent Name (Displayed to Commuters)</span>
                      <span className="text-[10px] text-cyan-400 font-semibold">*Required</span>
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-cyan-400">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="Enter your name (e.g. Sara, Omar)"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-cyan-500/50 rounded-xl text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all"
                        required={staffRole === 'agent'}
                      />
                    </div>
                  </div>
                )}

                {/* Email Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Staff Email
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder="admin@gomini.com, executive@gomini.com, agent@gomini.com"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      required
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      placeholder="Password (123456)"
                      className="w-full pl-10 pr-4 py-2.5 bg-slate-950/80 border border-slate-700/80 rounded-xl text-white placeholder-slate-500 text-sm font-medium focus:outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 transition-all"
                      required
                    />
                  </div>
                </div>

                {staffError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{staffError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={staffLoading}
                  className="w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-indigo-600 via-indigo-500 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-bold text-sm shadow-lg shadow-indigo-500/25 flex items-center justify-center gap-2 transition-all transform active:scale-[0.99] disabled:opacity-50 cursor-pointer"
                >
                  {staffLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>
                        {staffRole === 'admin' && 'Access Admin Dispatch Console'}
                        {staffRole === 'executive' && 'Access Executive Analytics'}
                        {staffRole === 'agent' && 'Launch Support Agent Dashboard'}
                      </span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            </div>

            {/* Credentials Note */}
            <div className="mt-5 pt-3.5 border-t border-slate-800/60 flex items-center justify-between text-xs text-slate-500">
              <span>Standard Password:</span>
              <span className="font-mono text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                123456
              </span>
            </div>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 bg-[#091124]/50 py-4 px-4 text-center text-xs text-slate-500">
        <p>GoMini Intelligent Fleet Management & Commute Logistics &copy; 2026. All rights reserved.</p>
      </footer>

    </div>
  );
}
