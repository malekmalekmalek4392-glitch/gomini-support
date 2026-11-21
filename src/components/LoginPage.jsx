import React, { useState } from 'react';
import { 
  Users, 
  User, 
  Lock, 
  Mail, 
  UserCheck, 
  AlertCircle, 
  ArrowRight
} from 'lucide-react';
import { supabase } from '../lib/supabase';

export default function LoginPage({ onCustomerLogin, onAgentLogin }) {
  // Active Tab: 'staff' or 'customer'
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
  const isAgentEmail = staffEmail.trim().toLowerCase() === 'agent@gomini.com';

  // Handle Staff Login
  const handleStaffSubmit = (e) => {
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

    // 1. Admin Login
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

    // 2. Executive Login
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

    // 3. Agent Login
    if (email === 'agent@gomini.com') {
      if (pass !== '123456') {
        setStaffError('Invalid password. Please check your credentials.');
        setStaffLoading(false);
        return;
      }

      const trimmedName = agentName.trim();
      if (!trimmedName) {
        setStaffError('Please enter your agent name to help commuters.');
        setStaffLoading(false);
        return;
      }

      const authUser = { role: 'agent', email: 'agent@gomini.com', name: trimmedName };
      sessionStorage.setItem('gomini_auth', JSON.stringify(authUser));
      localStorage.setItem('gomini_agent_name', trimmedName);
      localStorage.setItem('gomini_user_role', 'agent');
      setStaffLoading(false);
      onAgentLogin(trimmedName);
      return;
    }

    setStaffError('Unrecognized email address. Please use your authorized company account.');
    setStaffLoading(false);
  };

  // Handle Customer Login (No Password)
  const handleCustomerSubmit = async (e) => {
    e.preventDefault();
    setCustomerError('');
    const input = customerId.trim();

    if (!input) {
      setCustomerError('Please enter your Employee ID or registered mobile phone number.');
      return;
    }

    setCustomerLoading(true);
    try {
      const { data, error } = await supabase.from('roster').select('*');
      if (error) throw error;

      if (data && data.length > 0) {
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
          const partialMatch = data.find(p => String(p.employee_id || '').includes(input));
          if (partialMatch) {
            localStorage.setItem('gomini_active_eid', partialMatch.employee_id);
            localStorage.setItem('gomini_user_role', 'customer');
            onCustomerLogin(partialMatch);
          } else {
            setCustomerError(`No employee record found for "${input}". Please check your ID or contact dispatch.`);
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
    <div className="min-h-screen bg-[#070D1E] text-slate-100 flex flex-col justify-center items-center px-4 py-12 selection:bg-blue-500/30">
      
      {/* Background Ambient Glow */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-600/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main Card Container */}
      <div className="relative w-full max-w-md">
        
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-blue-600 via-indigo-600 to-cyan-500 flex items-center justify-center mx-auto shadow-lg shadow-blue-500/20 text-white font-black text-2xl mb-3">
            G
          </div>
          <h1 className="text-2xl font-black text-white tracking-tight">GoMini Mobility</h1>
          <p className="text-xs text-slate-400 font-medium mt-1">
            TaskUs & GoMini Intelligent Mobility Operations
          </p>
        </div>

        {/* Card Box */}
        <div className="bg-[#0B132B]/90 backdrop-blur-xl border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl shadow-black/40">
          
          {/* Dual Pill Tab Switcher */}
          <div className="flex p-1 bg-slate-900/90 rounded-2xl mb-6 border border-slate-800/80">
            <button
              type="button"
              onClick={() => { setActiveTab('staff'); setStaffError(''); setCustomerError(''); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'staff'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              <span>Staff (Admin / Exec)</span>
            </button>

            <button
              type="button"
              onClick={() => { setActiveTab('customer'); setStaffError(''); setCustomerError(''); }}
              className={`flex-1 py-2.5 text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
                activeTab === 'customer'
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <User className="w-3.5 h-3.5" />
              <span>Customer / Passenger</span>
            </button>
          </div>

          {/* ========================================= */}
          {/* 1. STAFF FORM (Admin / Exec / Agent)       */}
          {/* ========================================= */}
          {activeTab === 'staff' && (
            <form onSubmit={handleStaffSubmit} className="space-y-4">
              
              {/* Agent Name Field (Only shown when email is agent@gomini.com) */}
              {isAgentEmail && (
                <div>
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                    Agent Name
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                      <UserCheck className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      placeholder="Enter the name that will help passengers"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                      required={isAgentEmail}
                    />
                  </div>
                </div>
              )}

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
                    placeholder="Enter email (e.g. admin@gomini.com)"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                    required
                  />
                </div>
              </div>

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
                    placeholder="Enter password"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                    required
                  />
                </div>
              </div>

              {/* Error Message */}
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
                className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all transform active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
          {/* 2. CUSTOMER / PASSENGER FORM               */}
          {/* ========================================= */}
          {activeTab === 'customer' && (
            <form onSubmit={handleCustomerSubmit} className="space-y-4">
              
              {/* Customer ID / EID / Phone */}
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Employee ID (EID) or Mobile
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    placeholder="Enter Employee ID or Phone Number"
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700/80 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium"
                    required
                  />
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  No password required. Enter your registered ID or mobile number.
                </p>
              </div>

              {/* Error Message */}
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
                className="w-full mt-2 py-3 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-sm shadow-lg shadow-blue-600/30 transition-all transform active:scale-[0.99] disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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

    </div>
  );
}
