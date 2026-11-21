import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  MessageSquare,
  CheckCircle,
  Clock,
  AlertCircle,
  Send,
  User,
  ChevronRight,
  Phone,
  Bus,
  Filter,
  ShieldCheck,
  LogOut,
  ArrowLeft,
  Info,
  X,
  Languages,
  Bell,
  AlertTriangle
} from 'lucide-react';

export default function AgentDashboard({ onSwitchToPassenger, onSignOut, agentNameProp }) {
  const [agentName, setAgentName] = useState(() => agentNameProp || localStorage.getItem('gomini_agent_name') || 'Agent Support');
  const [agentId, setAgentId] = useState(() => {
    const saved = localStorage.getItem('gomini_agent_id');
    return saved && saved !== '00000000-0000-0000-0000-000000000001' ? saved : 'd3737431-70c9-43ec-b330-4160d21402ca';
  });
  const [agentLang, setAgentLang] = useState(() => localStorage.getItem('gomini_agent_lang') || localStorage.getItem('gomini_chat_lang') || 'en');

  const [activeTab, setActiveTab] = useState('unassigned'); // 'unassigned', 'mine', 'resolved'
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [cannedResponses, setCannedResponses] = useState([]);
  const [showCanned, setShowCanned] = useState(false);
  const [claiming, setClaiming] = useState(false);
  const [relatedTrip, setRelatedTrip] = useState(null);
  const [showRiderInfo, setShowRiderInfo] = useState(false);
  const [newTicketNotification, setNewTicketNotification] = useState(null);

  const msgScrollRef = useRef(null);

  // Load Canned responses
  useEffect(() => {
    supabase
      .from('canned_responses')
      .select('*')
      .then(({ data }) => {
        if (data) setCannedResponses(data);
      });
  }, []);

  // Ensure active agent is registered in `agents` table so foreign key constraint is always satisfied
  useEffect(() => {
    const resolveAgentIdentity = async () => {
      try {
        const storedId = localStorage.getItem('gomini_agent_id');
        if (storedId) {
          const { data: match } = await supabase.from('agents').select('id, full_name').eq('id', storedId).maybeSingle();
          if (match) {
            setAgentId(match.id);
            return;
          }
        }

        const { data: byEmail } = await supabase.from('agents').select('id, full_name').eq('email', 'agent@gomini.com').limit(1);
        if (byEmail && byEmail.length > 0) {
          setAgentId(byEmail[0].id);
          localStorage.setItem('gomini_agent_id', byEmail[0].id);
          return;
        }

        const { data: newRow } = await supabase
          .from('agents')
          .insert({
            full_name: agentName || 'Agent Support',
            email: 'agent@gomini.com',
            role: 'agent',
            is_online: true
          })
          .select()
          .single();

        if (newRow) {
          setAgentId(newRow.id);
          localStorage.setItem('gomini_agent_id', newRow.id);
        }
      } catch (e) {
        console.warn('Agent identity resolution warning:', e);
      }
    };

    resolveAgentIdentity();
  }, [agentName]);

  // Synthesize clean audio bell chime with Web Audio API (Zero external assets required)
  const playNotificationChime = () => {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, now); // E5
      gain1.gain.setValueAtTime(0.35, now);
      gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      osc1.start(now);
      osc1.stop(now + 0.35);

      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(880, now + 0.15); // A5
      gain2.gain.setValueAtTime(0.4, now + 0.15);
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.55);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      osc2.start(now + 0.15);
      osc2.stop(now + 0.55);
    } catch (err) {
      console.warn('Audio chime error:', err);
    }
  };

  // Load Conversations according to strict assignment & status
  const fetchConversations = async () => {
    let query = supabase.from('conversations').select('*').order('last_message_at', { ascending: false });

    if (activeTab === 'unassigned') {
      // Any ticket not assigned to any agent and not resolved
      query = query.is('assigned_agent_id', null).neq('status', 'resolved');
    } else if (activeTab === 'mine') {
      // Strictly assigned to THIS agent only, active
      query = query.eq('assigned_agent_id', agentId).neq('status', 'resolved');
    } else if (activeTab === 'resolved') {
      // Resolved history
      query = query.eq('status', 'resolved');
    }

    const { data } = await query;
    if (data) setConversations(data);
  };

  useEffect(() => {
    fetchConversations();

    // Ask for browser notification permission once
    if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default') {
      try {
        Notification.requestPermission();
      } catch (e) {}
    }

    // Realtime listener for new incoming tickets and status updates
    const channel = supabase
      .channel('agent_convs_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversations' }, (payload) => {
        fetchConversations();

        if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
          const conv = payload.new;
          const isUnassigned = !conv.assigned_agent_id && conv.status !== 'resolved';
          const needsAgent = conv.category === 'needs_agent' || conv.category === 'issue' || conv.category === 'missed_bus';

          // ONLY trigger chime & popup notification when chatbot CANNOT answer automatically!
          if (isUnassigned && needsAgent) {
            playNotificationChime();
            setNewTicketNotification({
              id: conv.id,
              name: conv.passenger_name || 'Passenger',
              route: conv.route || 'GoMini Route',
              eid: conv.employee_id,
              message: conv.last_message || 'Awaiting agent support',
              rawConv: conv
            });

            if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
              try {
                new Notification('GoMini Dispatch: Unassigned Request', {
                  body: `${conv.passenger_name} (${conv.route}): ${conv.last_message}`,
                  icon: '/app-icon.png'
                });
              } catch (e) {}
            }
          }

          // If this ticket is currently open in active view, sync its assignment or close if resolved
          setSelectedConv((prev) => {
            if (prev && prev.id === conv.id) {
              if (conv.status === 'resolved') {
                return null; // Close chat view when ticket is resolved
              }
              return { ...prev, ...conv };
            }
            return prev;
          });
        }
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeTab, agentId]);

  // Load Messages for selected ticket
  const loadMessages = async (convId) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
      setTimeout(() => msgScrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  // Load trip context for selected ticket's route
  const loadTripContext = async (route) => {
    if (!route) return;
    const { data } = await supabase
      .from('trips')
      .select('*')
      .eq('route', route)
      .order('id', { ascending: false })
      .limit(1);

    if (data && data.length > 0) {
      setRelatedTrip(data[0]);
    } else {
      setRelatedTrip(null);
    }
  };

  const handleSelectConversation = (conv) => {
    setSelectedConv(conv);
    loadMessages(conv.id);
    loadTripContext(conv.route);
  };

  // Realtime subscription for open chat
  useEffect(() => {
    if (!selectedConv?.id) return;

    const channel = supabase
      .channel('agent_chat_' + selectedConv.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${selectedConv.id}` },
        (payload) => {
          setMessages((prev) => [...prev, payload.new]);
          setTimeout(() => msgScrollRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedConv?.id]);

  // Resolve guaranteed valid agent ID from DB or existing record
  const getValidAgentId = async () => {
    let currentId = agentId;
    if (!currentId || currentId === '00000000-0000-0000-0000-000000000001') {
      const stored = localStorage.getItem('gomini_agent_id');
      if (stored && stored !== '00000000-0000-0000-0000-000000000001') {
        currentId = stored;
      }
    }

    if (currentId && currentId !== '00000000-0000-0000-0000-000000000001') {
      const { data: match } = await supabase.from('agents').select('id').eq('id', currentId).maybeSingle();
      if (match?.id) {
        setAgentId(match.id);
        return match.id;
      }
    }

    const { data: byEmail } = await supabase.from('agents').select('id').eq('email', 'agent@gomini.com').limit(1);
    if (byEmail && byEmail.length > 0) {
      setAgentId(byEmail[0].id);
      localStorage.setItem('gomini_agent_id', byEmail[0].id);
      return byEmail[0].id;
    }

    const fallbackId = 'd3737431-70c9-43ec-b330-4160d21402ca';
    setAgentId(fallbackId);
    localStorage.setItem('gomini_agent_id', fallbackId);
    return fallbackId;
  };

  // Claim Ticket (Atomic with direct fallback)
  const handleClaimTicket = async () => {
    if (!selectedConv || claiming) return;
    setClaiming(true);

    try {
      const resolvedId = await getValidAgentId();
      let success = false;

      // 1. Try atomic claim_ticket RPC
      try {
        const { data, error } = await supabase.rpc('claim_ticket', {
          ticket_id: selectedConv.id,
          agent_id: resolvedId,
          agent_name: agentName || 'Agent Support'
        });
        if (!error && (data?.success || data === true)) {
          success = true;
        }
      } catch (rpcErr) {
        console.warn('RPC claim_ticket failed, falling back to direct update:', rpcErr);
      }

      // 2. Direct update fallback (NO updated_at column in conversations schema)
      if (!success) {
        const { error: updErr } = await supabase
          .from('conversations')
          .update({
            assigned_agent_id: resolvedId,
            assigned_agent_name: agentName || 'Agent Support',
            status: 'open'
          })
          .eq('id', selectedConv.id);

        if (!updErr) {
          success = true;
        } else {
          console.error('Direct claim update error:', updErr);
        }
      }

      if (success) {
        setSelectedConv((prev) => ({
          ...prev,
          assigned_agent_id: resolvedId,
          assigned_agent_name: agentName || 'Agent Support',
          status: 'open'
        }));
        await fetchConversations();
      } else {
        alert(agentLang === 'ar' ? 'تعذر استلام التذكرة أو تم استلامها بالفعل بواسطة موظف آخر.' : 'Could not claim ticket. It may already be assigned.');
      }
    } catch (e) {
      console.error('Ticket claim failure:', e);
      alert(agentLang === 'ar' ? 'حدث خطأ أثناء استلام التذكرة.' : 'An error occurred while claiming ticket.');
    } finally {
      setClaiming(false);
    }
  };

  // Resolve Ticket
  const handleResolveTicket = async () => {
    if (!selectedConv) return;
    const targetConvId = selectedConv.id;

    try {
      // 1. Mark as resolved and clear agent assignment in DB
      await supabase
        .from('conversations')
        .update({
          status: 'resolved',
          assigned_agent_id: null,
          assigned_agent_name: null,
          resolved_at: new Date().toISOString()
        })
        .eq('id', targetConvId);

      // 2. Add system confirmation message in conversation history
      await supabase.from('messages').insert({
        conversation_id: targetConvId,
        sender_type: 'system',
        sender_name: 'System',
        body: `Ticket marked as Resolved by ${agentName || 'Agent'}`
      });

      // 3. Immediately close chat from agent view so it returns to ticket queue
      setSelectedConv(null);
      setMessages([]);
      setShowRiderInfo(false);

      // 4. Refresh conversation queues
      await fetchConversations();
    } catch (err) {
      console.error('Error resolving ticket:', err);
    }
  };

  // Send Message
  const handleSendAgentMessage = async (e) => {
    e?.preventDefault();
    if (!inputMsg.trim() || !selectedConv) return;

    // Enforce claiming check before sending
    if (selectedConv.assigned_agent_id && selectedConv.assigned_agent_id !== agentId) {
      alert(agentLang === 'ar' ? 'هذه التذكرة مستلمة بواسطة موظف آخر.' : 'This ticket is claimed by another agent.');
      return;
    }

    const body = inputMsg.trim();
    setInputMsg('');
    setShowCanned(false);

    await supabase.from('messages').insert({
      conversation_id: selectedConv.id,
      sender_type: 'agent',
      sender_name: agentName,
      body: body
    });

    await supabase
      .from('conversations')
      .update({
        last_message: body,
        last_message_at: new Date().toISOString(),
        status: 'pending'
      })
      .eq('id', selectedConv.id);
  };

  const handleApplyCanned = (text) => {
    setInputMsg(text);
    setShowCanned(false);
  };

  const renderPassengerProfile = () => (
    <div>
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Passenger Profile</h4>
      <div className="bg-slate-900/60 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
        <div>
          <div className="text-slate-500 text-[11px]">Employee Name</div>
          <div className="font-bold text-white text-sm">{selectedConv?.passenger_name}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[11px]">TaskUs EID</div>
          <div className="font-mono text-cyan-400 font-bold">{selectedConv?.employee_id}</div>
        </div>
        <div>
          <div className="text-slate-500 text-[11px]">Assigned Route</div>
          <div className="text-purple-300 font-bold">{selectedConv?.route}</div>
        </div>
        {selectedConv?.passenger_phone && (
          <div>
            <div className="text-slate-500 text-[11px]">Phone</div>
            <a href={`tel:${selectedConv.passenger_phone}`} className="text-emerald-400 font-mono hover:underline">
              {selectedConv.passenger_phone}
            </a>
          </div>
        )}
      </div>
    </div>
  );

  const renderDispatchAssignment = () => (
    <div>
      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Live Dispatch Assignment</h4>
      {relatedTrip ? (
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs shadow-md">
          <div className="flex items-center justify-between">
            <span className="px-2.5 py-0.5 rounded-lg text-xs font-black font-mono bg-purple-500/20 text-purple-300 border border-purple-500/40">
              {relatedTrip.vehicle_code}
            </span>
            <span className="text-[10px] font-bold text-slate-400">{relatedTrip.vehicle_type}</span>
          </div>

          <div className="space-y-1 text-slate-300">
            <div className="flex justify-between">
              <span className="text-slate-500">Shift Time:</span>
              <span className="font-bold text-white">{relatedTrip.shift_time}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Pickup Start:</span>
              <span className="font-bold text-cyan-400">{relatedTrip.trip_time || relatedTrip.shift_time}</span>
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800 flex justify-between items-center">
            <div>
              <div className="text-[10px] text-slate-500">Driver</div>
              <div className="font-bold text-white text-xs">{relatedTrip.captain_name || 'Assigned'}</div>
            </div>
            {relatedTrip.captain_phone && (
              <a
                href={`tel:${relatedTrip.captain_phone}`}
                className="p-2 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30"
              >
                <Phone className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
        </div>
      ) : (
        <div className="p-4 rounded-2xl border border-slate-800/80 bg-slate-900/30 text-center text-xs text-slate-500">
          No active trip data pushed yet from Google Sheets.
        </div>
      )}
    </div>
  );

  const isClaimedByMe = selectedConv?.assigned_agent_id === agentId;
  const isClaimedByOther = selectedConv?.assigned_agent_id && selectedConv.assigned_agent_id !== agentId;
  const isUnassigned = selectedConv && !selectedConv.assigned_agent_id;
  const isResolved = selectedConv?.status === 'resolved';

  return (
    <div
      dir={agentLang === 'ar' ? 'rtl' : 'ltr'}
      className="h-[100dvh] bg-slate-950 flex flex-col overflow-hidden text-slate-100"
    >
      {/* Realtime Alert Banner for Unassigned Customer Needing Human Agent */}
      {newTicketNotification && (
        <div className="fixed top-16 right-4 left-4 sm:left-auto sm:w-96 z-50 bg-gradient-to-r from-purple-900 to-indigo-900 border-2 border-purple-500 rounded-2xl p-3.5 shadow-2xl flex items-center justify-between gap-3 animate-in slide-in-from-top duration-300">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-xl bg-purple-500/30 flex items-center justify-center text-purple-300 shrink-0">
              <Bell className="w-5 h-5 animate-bounce" />
            </div>
            <div className="min-w-0 text-xs">
              <p className="font-bold text-white truncate">
                {agentLang === 'ar' ? 'طلب جديد ينتظر الاستلام!' : 'New Customer Waiting!'}
              </p>
              <p className="text-purple-200 truncate">
                {newTicketNotification.name} ({newTicketNotification.route})
              </p>
              <p className="text-[11px] text-slate-300 truncate mt-0.5 opacity-90">
                "{newTicketNotification.message}"
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={() => {
                setActiveTab('unassigned');
                if (newTicketNotification.rawConv) {
                  handleSelectConversation(newTicketNotification.rawConv);
                }
                setNewTicketNotification(null);
              }}
              className="px-2.5 py-1.5 rounded-lg bg-purple-500 hover:bg-purple-600 text-white font-bold text-xs transition-all cursor-pointer shadow-md"
            >
              {agentLang === 'ar' ? 'عرض' : 'View'}
            </button>
            <button
              onClick={() => setNewTicketNotification(null)}
              className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-white/10"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Top Navbar with Safe Area Support for iPhone / Mobile */}
      <header
        className="bg-slate-900 border-b border-slate-800 px-3 sm:px-6 flex items-center justify-between flex-shrink-0 z-10"
        style={{
          paddingTop: 'max(env(safe-area-inset-top, 0px) + 6px, 12px)',
          paddingBottom: '10px'
        }}
      >
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <img
            src="/app-icon.png"
            alt="GoMini"
            className="h-8 w-8 rounded-xl object-contain shadow-sm shrink-0"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
            }}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-bold text-xs sm:text-sm text-white truncate">
                {agentLang === 'ar' ? 'مساحة عمل خدمة العملاء' : 'Agent Workspace'}
              </span>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded-full font-bold flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="hidden xs:inline">{agentLang === 'ar' ? 'متصل' : 'Online'}</span>
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {/* Language Switcher AR / EN */}
          <button
            type="button"
            onClick={() => {
              const next = agentLang === 'en' ? 'ar' : 'en';
              setAgentLang(next);
              localStorage.setItem('gomini_agent_lang', next);
            }}
            className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-950 hover:bg-slate-800 text-cyan-400 hover:text-cyan-300 border border-slate-800 transition-all flex items-center gap-1 cursor-pointer shrink-0 active:scale-95"
            title={agentLang === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
          >
            <Languages className="w-3.5 h-3.5" />
            <span>{agentLang === 'en' ? 'عربي' : 'EN'}</span>
          </button>

          {/* Agent Name Badge */}
          <div className="flex items-center gap-1.5 bg-slate-950 px-2 sm:px-3 py-1.5 rounded-xl border border-slate-800 text-xs">
            <User className="w-3.5 h-3.5 text-purple-400 shrink-0" />
            <input
              type="text"
              value={agentName}
              onChange={(e) => {
                setAgentName(e.target.value);
                localStorage.setItem('gomini_agent_name', e.target.value);
              }}
              title="Agent Name"
              className="bg-transparent font-bold text-white focus:outline-none w-16 sm:w-24 text-xs"
            />
          </div>

          {/* Prominent Sign Out Button */}
          <button
            onClick={onSignOut || onSwitchToPassenger}
            className="text-xs font-bold text-rose-300 hover:text-rose-100 bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer flex items-center gap-1.5 shrink-0 active:scale-95"
            title="Sign Out"
            aria-label="Sign Out"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden xs:inline">{agentLang === 'ar' ? 'خروج' : 'Sign Out'}</span>
          </button>
        </div>
      </header>

      {/* 3-Pane Body: Master-Detail on mobile */}
      <div className="flex-1 flex overflow-hidden relative min-h-0">
        {/* Pane 1: Queue List */}
        <aside
          className={`${
            selectedConv ? 'hidden md:flex' : 'flex'
          } w-full md:w-80 border-r border-slate-800/80 bg-slate-950 flex-col flex-shrink-0 min-h-0`}
        >
          {/* Tabs */}
          <div className="p-3 border-b border-slate-800/80 grid grid-cols-3 gap-1 bg-slate-900/40 shrink-0">
            <button
              onClick={() => setActiveTab('unassigned')}
              className={`py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'unassigned' ? 'bg-pink-500 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {agentLang === 'ar' ? 'غير مسند' : 'Unassigned'}
            </button>
            <button
              onClick={() => setActiveTab('mine')}
              className={`py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'mine' ? 'bg-purple-600 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {agentLang === 'ar' ? 'تذاكري' : 'My Tickets'}
            </button>
            <button
              onClick={() => setActiveTab('resolved')}
              className={`py-2 sm:py-1.5 text-xs font-bold rounded-lg transition-all ${
                activeTab === 'resolved' ? 'bg-slate-800 text-white shadow-sm' : 'text-slate-400 hover:text-white'
              }`}
            >
              {agentLang === 'ar' ? 'تم الحل' : 'Resolved'}
            </button>
          </div>

          {/* Ticket Items */}
          <div className="flex-1 overflow-y-auto divide-y divide-slate-900">
            {conversations.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-500">
                {agentLang === 'ar' ? 'لا توجد تذاكر في هذا القسم حالياً.' : 'No tickets in this queue.'}
              </div>
            ) : (
              conversations.map((c) => {
                const isSelected = selectedConv?.id === c.id;
                return (
                  <div
                    key={c.id}
                    onClick={() => handleSelectConversation(c)}
                    className={`p-3.5 cursor-pointer transition-all ${
                      isSelected
                        ? 'bg-slate-900 border-l-4 border-purple-500'
                        : 'hover:bg-slate-900/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-bold text-xs text-white truncate max-w-[150px]">{c.passenger_name}</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(c.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <div className="text-[11px] text-purple-400 font-medium truncate mb-1">
                      {c.route}
                    </div>

                    <p className="text-xs text-slate-400 truncate line-clamp-1">
                      {c.last_message || 'New request'}
                    </p>

                    <div className="mt-2 flex items-center justify-between text-[10px]">
                      <span className="text-slate-500 font-mono">{c.employee_id}</span>
                      {c.assigned_agent_name && (
                        <span className="text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded-md">
                          {c.assigned_agent_name}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </aside>

        {/* Pane 2: Conversation Thread */}
        <main
          className={`${
            !selectedConv ? 'hidden md:flex' : 'flex'
          } flex-1 flex-col bg-slate-900/30 overflow-hidden min-h-0 w-full`}
        >
          {selectedConv ? (
            <>
              {/* Ticket Top bar */}
              <div className="h-14 px-3 sm:px-6 border-b border-slate-800 flex items-center justify-between bg-slate-900/80 gap-2 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <button
                    type="button"
                    onClick={() => setSelectedConv(null)}
                    className="md:hidden p-1.5 -ml-1 rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 flex items-center gap-1 text-xs font-bold transition-all shrink-0 active:scale-95 cursor-pointer"
                    title="Back to Tickets Queue"
                    aria-label="Back to Tickets Queue"
                  >
                    <ArrowLeft className={`w-4 h-4 text-slate-200 ${agentLang === 'ar' ? 'rotate-180' : ''}`} />
                    <span className="hidden xs:inline">{agentLang === 'ar' ? 'القائمة' : 'Queue'}</span>
                  </button>
                  <div className="min-w-0">
                    <h3 className="text-xs sm:text-sm font-bold text-white flex items-center gap-1.5 truncate">
                      <span className="truncate">{selectedConv.passenger_name}</span>
                      <span className="text-[11px] text-slate-400 font-mono shrink-0">({selectedConv.employee_id})</span>
                    </h3>
                    <p className="text-[11px] text-purple-400 truncate">{selectedConv.route}</p>
                  </div>
                </div>

                <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
                  {/* Passenger Details Button for Mobile */}
                  <button
                    type="button"
                    onClick={() => setShowRiderInfo(true)}
                    className="lg:hidden p-2 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700/60 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                    title="View Passenger & Route Details"
                    aria-label="View Passenger & Route Details"
                  >
                    <Info className="w-4 h-4" />
                  </button>

                  {/* Claim Button if unassigned */}
                  {isUnassigned && (
                    <button
                      onClick={handleClaimTicket}
                      disabled={claiming}
                      className="px-2.5 sm:px-3.5 py-1.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white shadow-md shadow-purple-600/20 transition-all shrink-0 cursor-pointer"
                    >
                      {claiming
                        ? (agentLang === 'ar' ? 'جاري الاستلام...' : 'Claiming...')
                        : (agentLang === 'ar' ? 'استلام التذكرة' : 'Claim')}
                    </button>
                  )}

                  {/* Status Badge if Claimed by Other */}
                  {isClaimedByOther && (
                    <span className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                      {agentLang === 'ar' ? `مستلمة: ${selectedConv.assigned_agent_name}` : `Claimed: ${selectedConv.assigned_agent_name}`}
                    </span>
                  )}

                  {/* Status Badge if Claimed by Me */}
                  {isClaimedByMe && !isResolved && (
                    <span className="hidden sm:inline px-2 py-0.5 rounded-md text-[10px] font-bold bg-purple-500/20 text-purple-300 border border-purple-500/30">
                      {agentLang === 'ar' ? 'مسندة إليك' : 'Claimed by you'}
                    </span>
                  )}

                  {/* Resolve Button (Only available to the claiming agent) */}
                  {isClaimedByMe && !isResolved && (
                    <button
                      onClick={handleResolveTicket}
                      className="px-2.5 sm:px-3 py-1.5 rounded-xl font-bold text-xs bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-600/30 transition-all flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <CheckCircle className="w-3.5 h-3.5" />
                      <span className="hidden xs:inline">{agentLang === 'ar' ? 'تم الحل' : 'Resolve'}</span>
                    </button>
                  )}

                  {/* Close Chat button (Available on all screens) */}
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedConv(null);
                      setMessages([]);
                      setShowRiderInfo(false);
                    }}
                    className="p-1.5 rounded-xl text-slate-400 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-all flex items-center justify-center shrink-0 cursor-pointer"
                    title={agentLang === 'ar' ? 'إغلاق المحادثة' : 'Close chat'}
                    aria-label="Close chat"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 p-3 sm:p-6 overflow-y-auto space-y-3 min-h-0">
                {messages.map((m) => {
                  const isAgent = m.sender_type === 'agent';
                  const isBot = m.sender_type === 'bot';
                  const isSys = m.sender_type === 'system';

                  if (isSys) {
                    return (
                      <div key={m.id} className="text-center my-2">
                        <span className="text-[11px] bg-slate-800 text-slate-400 px-3 py-1 rounded-full border border-slate-700/60 font-medium">
                          {m.body}
                        </span>
                      </div>
                    );
                  }

                  return (
                    <div key={m.id} className={`flex flex-col ${isAgent ? 'items-end' : 'items-start'}`}>
                      <div className="text-[10px] text-slate-400 font-semibold mb-1 px-1">
                        {isAgent ? `🧑‍💼 You (${m.sender_name})` : isBot ? '🤖 Bot Auto-Answer' : `👤 ${m.sender_name}`}
                      </div>
                      <div
                        className={`max-w-[85%] sm:max-w-[70%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm whitespace-pre-line ${
                          isAgent
                            ? 'bg-purple-600 text-white rounded-tr-none'
                            : isBot
                            ? 'bg-slate-800 text-slate-200 border border-slate-700 rounded-tl-none'
                            : 'bg-slate-950 text-slate-100 border border-slate-800 rounded-tl-none'
                        }`}
                      >
                        {m.body}
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 px-1">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })}
                <div ref={msgScrollRef} />
              </div>

              {/* Canned Quick Replies Drawer */}
              {showCanned && (
                <div className="p-3 bg-slate-900 border-t border-slate-800 flex flex-wrap gap-2 max-h-36 overflow-y-auto shrink-0">
                  {cannedResponses.map((cr) => (
                    <button
                      key={cr.id}
                      onClick={() => handleApplyCanned(cr.message_ar)}
                      className="px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800 hover:border-purple-500/50 text-left text-xs text-slate-300 transition-all flex items-center gap-2 cursor-pointer"
                    >
                      <span className="font-mono text-purple-400 font-bold">{cr.shortcut}</span>
                      <span className="truncate max-w-[200px]">{cr.title}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Action Bottom Section depending on Ticket Assignment State */}
              {isResolved ? (
                <div
                  className="p-4 bg-slate-900 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-emerald-400 shrink-0 text-center"
                  style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 14px)'
                  }}
                >
                  <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>
                    {agentLang === 'ar'
                      ? 'تم حل هذه التذكرة. إذا أرسل الراكب رسالة جديدة ستظهر تلقائياً في قائمة غير المسند.'
                      : 'Ticket resolved. If the customer messages again, it will reopen in the Unassigned queue.'}
                  </span>
                </div>
              ) : isUnassigned ? (
                <div
                  className="p-3 sm:p-4 bg-slate-900/95 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0"
                  style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 14px)'
                  }}
                >
                  <div className="flex items-center gap-2 text-xs text-amber-300 font-medium">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>
                      {agentLang === 'ar'
                        ? 'هذه التذكرة غير مسندة. يجب استلام التذكرة أولاً للرد ومنع تكرار المراسلة.'
                        : 'This ticket is unassigned. Claim it to respond and prevent double texting.'}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={handleClaimTicket}
                    disabled={claiming}
                    className="w-full sm:w-auto px-5 py-2.5 rounded-xl font-bold text-xs bg-purple-600 hover:bg-purple-500 text-white shadow-lg shadow-purple-600/30 transition-all cursor-pointer shrink-0 active:scale-95"
                  >
                    {claiming
                      ? (agentLang === 'ar' ? 'جاري الاستلام...' : 'Claiming...')
                      : (agentLang === 'ar' ? '⚡ استلام التذكرة للرد' : '⚡ Claim Ticket to Reply')}
                  </button>
                </div>
              ) : isClaimedByOther ? (
                <div
                  className="p-4 bg-slate-900/95 border-t border-slate-800 flex items-center justify-center gap-2 text-xs text-slate-400 shrink-0 text-center"
                  style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 14px)'
                  }}
                >
                  <ShieldCheck className="w-4 h-4 text-purple-400 shrink-0" />
                  <span>
                    {agentLang === 'ar'
                      ? `تم استلام هذه التذكرة بواسطة (${selectedConv.assigned_agent_name || 'موظف آخر'}). مغلقة لمنع تكرار الرد.`
                      : `This ticket is claimed by ${selectedConv.assigned_agent_name || 'another agent'}. Locked to prevent duplicate responses.`}
                  </span>
                </div>
              ) : (
                /* Claimed by Me: Active Texting Input */
                <form
                  onSubmit={handleSendAgentMessage}
                  className="p-3 sm:p-4 bg-slate-900/90 border-t border-slate-800 flex items-center gap-2 shrink-0"
                  style={{
                    paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 14px)'
                  }}
                >
                  <button
                    type="button"
                    onClick={() => setShowCanned(!showCanned)}
                    className="px-2.5 sm:px-3 py-2.5 rounded-xl text-xs font-bold bg-slate-950 border border-slate-800 text-purple-300 hover:border-purple-500/40 shrink-0 cursor-pointer"
                    title="Canned responses shortcut"
                  >
                    ⚡ <span className="hidden sm:inline">{agentLang === 'ar' ? 'ردود جاهزة' : '/Canned'}</span>
                  </button>
                  <input
                    type="text"
                    value={inputMsg}
                    onChange={(e) => setInputMsg(e.target.value)}
                    placeholder={agentLang === 'ar' ? 'اكتب ردك للراكب...' : 'Type a response to the rider...'}
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-3.5 sm:px-4 py-2.5 text-base sm:text-xs text-white focus:outline-none focus:border-purple-500 min-w-0"
                  />
                  <button
                    type="submit"
                    disabled={!inputMsg.trim()}
                    className="h-10 px-3 sm:px-4 rounded-xl bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold text-xs flex items-center gap-1.5 shadow-md shadow-purple-600/20 shrink-0 cursor-pointer active:scale-95"
                  >
                    <Send className={`w-3.5 h-3.5 ${agentLang === 'ar' ? 'rotate-180' : ''}`} />
                    <span className="hidden xs:inline">{agentLang === 'ar' ? 'إرسال' : 'Send'}</span>
                  </button>
                </form>
              )}
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs p-6 text-center">
              <MessageSquare className="w-12 h-12 text-slate-700 mb-3 stroke-[1.2]" />
              <p className="font-bold text-slate-400">
                {agentLang === 'ar' ? 'اختر تذكرة من القائمة' : 'Select a ticket from the left queue'}
              </p>
              <p className="text-slate-600 mt-1">
                {agentLang === 'ar' ? 'سيتم تحديث الطلبات الواردة مباشرة فور وصولها' : 'Live incoming requests will update in real-time'}
              </p>
            </div>
          )}
        </main>

        {/* Pane 3: Passenger & Trip Context on Desktop */}
        {selectedConv && (
          <aside className="hidden lg:flex w-80 border-l border-slate-800/80 bg-slate-950 p-5 flex-col gap-5 flex-shrink-0 overflow-y-auto">
            {renderPassengerProfile()}
            {renderDispatchAssignment()}
          </aside>
        )}

        {/* Mobile Passenger & Trip Context Bottom Sheet Modal */}
        {selectedConv && showRiderInfo && (
          <div
            className="fixed inset-0 z-50 lg:hidden flex flex-col justify-end bg-black/60 backdrop-blur-xs"
            onClick={() => setShowRiderInfo(false)}
          >
            <div
              className="bg-slate-950 border-t border-slate-800 rounded-t-3xl max-h-[85vh] overflow-y-auto p-5 space-y-5 animate-in slide-in-from-bottom duration-200"
              style={{
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 16px, 20px)'
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-800 pb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <span>{agentLang === 'ar' ? 'تفاصيل الراكب والرحلة' : 'Passenger & Route Info'}</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setShowRiderInfo(false)}
                  className="h-8 w-8 rounded-full bg-slate-800 text-slate-300 hover:text-white flex items-center justify-center border border-slate-700 cursor-pointer"
                  title="Close"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {renderPassengerProfile()}
              {renderDispatchAssignment()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
