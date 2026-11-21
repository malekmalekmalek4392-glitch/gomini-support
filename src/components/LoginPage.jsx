import React, { useState } from 'react';
import { 
  Users, 
  User, 
  Lock, 
  Mail, 
  UserCheck, 
  AlertCircle, 
  ArrowRight,
  Sparkles
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LoginPage({ onCustomerLogin, onAgentLogin }) {
  // Tab toggle: 'staff' (Staff Admin/Exec) vs 'customer' (Customer/Passenger)
  const [activeTab, setActiveTab] = useState('staff');

  // Staff Form State
  const [staffEmail, setStaffEmail] = useState('');
  const [staffPassword, setStaffPassword] = useState('');
  const [agentName, setAgentName] = useState('');
  const [staffLoading, setStaffLoading] = useState(false);
  const [staffError, setStaffError] = useState('');

  // Customer Form State
  const [customerId, setCustomerId] = useState('');
  const [customerLoading, setCustomerLoading] = useState(false);
  const [customerError, setCustomerError] = useState('');

  // Check if current staff email is agent
  const isAgent = staffEmail.trim().toLowerCase() === 'agent@gomini.com' || staffEmail.trim().toLowerCase().startsWith('agent');

  // Handle Staff Login (Admin, Executive, Agent)
  const handleStaffSubmit = async (e) => {
    e.preventDefault();
    setStaffError('');

    const email = staffEmail.trim().toLowerCase();
    const pass = staffPassword.trim();

    if (!email) {
      setStaffError('Please enter your email address.');
      return;
    }

    if (!pass) {
      setStaffError('Please enter your password.');
      return;
    }

    setStaffLoading(true);

    // 1. Admin Login (admin@gomini.com / 123456)
    if (email === 'admin@gomini.com') {
      if (pass === '123456') {
        const authUser = { role: 'admin', email: 'admin@gomini.com', name: 'System Administrator' };
        sessionStorage.setItem('gomini_auth', JSON.stringify(authUser));
        localStorage.setItem('gomini_user_role', 'admin');
        window.location.href = '/dispatch.html?view=admin';
      } else {
        setStaffError('Invalid password. Please check your credentials.');
        setStaffLoading(false);
      }
      return;
    }

    // 2. Executive Login (executive@gomini.com / 123456)
    if (email === 'executive@gomini.com') {
      if (pass === '123456') {
        const authUser = { role: 'executive', email: 'executive@gomini.com', name: 'Executive Operations' };
        sessionStorage.setItem('gomini_auth', JSON.stringify(authUser));
        localStorage.setItem('gomini_user_role', 'executive');
        window.location.href = '/dispatch.html?view=executive';
      } else {
        setStaffError('Invalid password. Please check your credentials.');
        setStaffLoading(false);
      }
      return;
    }

    // 3. Agent Login (agent@gomini.com / 123456 + Agent Name)
    if (email === 'agent@gomini.com') {
      if (pass !== '123456') {
        setStaffError('Invalid password. Please check your credentials.');
        setStaffLoading(false);
        return;
      }

      const trimmedName = agentName.trim();
      if (!trimmedName) {
        setStaffError('Please enter your name as the agent helping passengers.');
        setStaffLoading(false);
        return;
      }

      const authUser = { role: 'agent', email: 'agent@gomini.com', name: trimmedName };
      sessionStorage.setItem('gomini_auth', JSON.stringify(authUser));
      localStorage.setItem('gomini_agent_name', trimmedName);
      localStorage.setItem('gomini_user_role', 'agent');

      // Sync with agents table to satisfy foreign key constraint on ticket claiming
      try {
        const { data: existing } = await supabase
          .from('agents')
          .select('id')
          .eq('email', 'agent@gomini.com')
          .limit(1);

        if (existing && existing.length > 0) {
          localStorage.setItem('gomini_agent_id', existing[0].id);
        } else {
          const { data: created } = await supabase
            .from('agents')
            .insert({
              full_name: trimmedName,
              email: 'agent@gomini.com',
              role: 'agent',
              is_online: true
            })
            .select()
            .single();

          if (created) {
            localStorage.setItem('gomini_agent_id', created.id);
          }
        }
      } catch (agErr) {
        console.warn('Agent DB sync:', agErr);
      }

      setStaffLoading(false);
      onAgentLogin(trimmedName);
      return;
    }

    // Unknown email
    setStaffError('Invalid email address. Please check your credentials.');
    setStaffLoading(false);
  };

  // Handle Customer Login (No Password Required)
  const handleCustomerSubmit = async (e) => {
    e.preventDefault();
    setCustomerError('');
    const input = customerId.trim();

    if (!input) {
      setCustomerError('Please enter your Employee ID.');
      return;
    }

    setCustomerLoading(true);
    try {
      const { data, error } = await supabase.from('roster').select('*');
      if (error) throw error;

      if (data && data.length > 0) {
        const match = data.find(p => 
          String(p.employee_id || '').trim() === input
        );

        if (match) {
          localStorage.setItem('gomini_active_eid', match.employee_id);
          localStorage.setItem('gomini_user_role', 'customer');
          onCustomerLogin(match);
        } else {
          const partialMatch = data.find(p => String(p.employee_id || '').includes(input));
          if (partialMatch) {
            localStorage.setItem('gomini_active_eid', partialMatch.employee_id);
            localStorage.setItem('gomini_user_role', 'customer');
            onCustomerLogin(partialMatch);
          } else {
            setCustomerError(`No employee record found for ID "${input}". Please check your Employee ID.`);
          }
        }
      } else {
        localStorage.setItem('gomini_active_eid', input);
        localStorage.setItem('gomini_user_role', 'customer');
        onCustomerLogin({ employee_id: input });
      }
    } catch (err) {
      console.error('Customer login error:', err);
      localStorage.setItem('gomini_active_eid', input);
      localStorage.setItem('gomini_user_role', 'customer');
      onCustomerLogin({ employee_id: input });
    } finally {
      setCustomerLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070D1E] text-slate-100 flex flex-col justify-between selection:bg-blue-500/30">
      
      {/* Top Brand Header */}
      <header className="border-b border-slate-800/80 bg-[#091124]/70 backdrop-blur-md sticky top-0 z-30 px-4 sm:px-8 py-3.5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <img 
            src="/app-icon.png" 
            alt="GoMini Logo" 
            className="h-10 w-10 rounded-xl object-cover shadow-lg shadow-cyan-500/20" 
          />
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

      {/* Main Center Section */}
      <main className="flex-1 flex flex-col justify-center items-center px-4 py-8 sm:py-12">
        
        {/* Glow behind the card */}
        <div className="absolute w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-3xl pointer-events-none -z-0"></div>

        {/* Card Wrapper */}
        <div className="relative z-10 w-full max-w-lg">
          
          {/* Card Headline */}
          <div className="text-center mb-6">
            <img 
              src="/app-icon.png" 
              alt="GoMini Logo" 
              className="h-16 w-16 rounded-2xl object-cover shadow-2xl shadow-blue-500/30 mx-auto mb-3 border border-slate-700/60" 
            />
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-800/80 border border-slate-700/60 text-xs font-bold text-cyan-400 mb-2 shadow-sm">
              <Sparkles className="w-3.5 h-3.5" />
              <span>Unified Access Portal</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              Sign In to GoMini
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 font-medium mt-1">
              TaskUs & GoMini Intelligent Mobility Operations
            </p>
          </div>

          {/* Login Card */}
          <div className="bg-[#0B132B]/90 backdrop-blur-xl border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/50">
            
            {/* The Two Buttons (Exact Match to Picture) */}
            <div className="flex p-1 bg-slate-900/90 rounded-2xl mb-7 border border-slate-700/60 shadow-inner">
              <button
                type="button"
                onClick={() => { setActiveTab('staff'); setStaffError(''); setCustomerError(''); }}
                className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'staff'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-4 h-4" />
                <span>Staff (Admin / Exec)</span>
              </button>

              <button
                type="button"
                onClick={() => { setActiveTab('customer'); setStaffError(''); setCustomerError(''); }}
                className={`flex-1 py-3 text-xs sm:text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                  activeTab === 'customer'
                    ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/30'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <User className="w-4 h-4" />
                <span>Customer / Passenger</span>
              </button>
            </div>

            {/* ========================================= */}
            {/* 1. STAFF TAB FORM                         */}
            {/* ========================================= */}
            {activeTab === 'staff' && (
              <form onSubmit={handleStaffSubmit} className="space-y-4">
                
                {/* Email Address */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Email Address
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Mail className="w-4 h-4" />
                    </div>
                    <input
                      type="email"
                      value={staffEmail}
                      onChange={(e) => setStaffEmail(e.target.value)}
                      placeholder=""
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                      required
                    />
                  </div>
                </div>

                {/* Agent Name Field (Displayed when agent email is typed) */}
                {isAgent && (
                  <div>
                    <label className="block text-xs font-bold text-cyan-300 uppercase tracking-wider mb-2">
                      Agent Name (Displayed to Commuters)
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-cyan-400">
                        <UserCheck className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        value={agentName}
                        onChange={(e) => setAgentName(e.target.value)}
                        placeholder="Enter the name that will help passengers (e.g. Sara, Omar)"
                        className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/90 border border-cyan-500/50 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-cyan-400 focus:ring-2 focus:ring-cyan-500/20 transition-all font-medium"
                        required={isAgent}
                      />
                    </div>
                  </div>
                )}

                {/* Password */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <Lock className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      value={staffPassword}
                      onChange={(e) => setStaffPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                      required
                    />
                  </div>
                </div>

                {/* Error Banner */}
                {staffError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{staffError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={staffLoading}
                  className="w-full mt-3 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all transform active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {staffLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <span>Sign In to Dispatch</span>
                  )}
                </button>
              </form>
            )}

            {/* ========================================= */}
            {/* 2. CUSTOMER / PASSENGER TAB FORM           */}
            {/* ========================================= */}
            {activeTab === 'customer' && (
              <form onSubmit={handleCustomerSubmit} className="space-y-4">
                
                {/* Employee ID */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Employee ID
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <User className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={customerId}
                      onChange={(e) => setCustomerId(e.target.value)}
                      placeholder="Enter Employee ID"
                      className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-900/90 border border-slate-700 text-base sm:text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all font-medium"
                      required
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-2">
                    No password required. Enter your Employee ID to access your commute schedule.
                  </p>
                </div>

                {/* Error Banner */}
                {customerError && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{customerError}</span>
                  </div>
                )}

                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={customerLoading}
                  className="w-full mt-3 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all transform active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                >
                  {customerLoading ? (
                    <div className="h-4 w-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <span>View Commute Schedule</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </form>
            )}

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
