import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bus,
  Clock,
  Phone,
  Printer,
  MapPin,
  Navigation,
  CheckCircle,
  AlertTriangle,
  HelpCircle,
  MessageSquare,
  Send,
  X,
  Search,
  LogOut,
  RefreshCw,
  Sparkles
} from 'lucide-react';

// Route offset in minutes for calculating pickup times from shift times
function getRouteOffset(route) {
  const r = (route || '').toUpperCase();
  if (r.includes('R3')) return 80;  // 1 hr 20m
  if (r.includes('R5')) return 95;  // 1 hr 35m
  if (r.includes('R1') || r.includes('R4')) return 125; // 2 hr 5m
  if (r.includes('R2')) return 130; // 2 hr 10m
  if (r.includes('R6')) return 135; // 2 hr 15m
  return 120; // 2 hr default
}

function calculatePickupTime(shiftTimeStr, route) {
  if (!shiftTimeStr || !shiftTimeStr.includes(':')) return shiftTimeStr;
  const [h, m] = shiftTimeStr.split(':').map(Number);
  const offset = getRouteOffset(route);
  let totalMins = h * 60 + (m || 0) - offset;
  if (totalMins < 0) totalMins += 24 * 60;
  const ph = Math.floor(totalMins / 60) % 24;
  const pm = totalMins % 60;
  return `${ph < 10 ? '0' + ph : ph}:${pm < 10 ? '0' + pm : pm}`;
}

export default function CustomerPortal({ onSwitchToAgent }) {
  const [passenger, setPassenger] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searching, setSearching] = useState(false);
  const [allRoster, setAllRoster] = useState([]);

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef(null);

  // Load initial roster from Supabase
  const loadRoster = async () => {
    try {
      const { data, error } = await supabase.from('roster').select('*');
      if (!error && data && data.length > 0) {
        setAllRoster(data);

        // Check if there is a saved EID in localStorage
        const savedEid = localStorage.getItem('gomini_active_eid') || '3367295';
        const match = data.find(
          (p) => String(p.employee_id).includes(savedEid) || String(p.name).toLowerCase().includes('nawar')
        );
        if (match) {
          setPassenger(match);
        } else {
          setPassenger(data[0]);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadRoster();

    // Realtime listener on roster table: whenever sheet updates, screen updates live!
    const channel = supabase
      .channel('roster_live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roster' }, (payload) => {
        loadRoster();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Handle Search EID or Name
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = searchQuery.trim().toLowerCase();
    const found = allRoster.find(
      (p) =>
        String(p.employee_id).toLowerCase().includes(q) ||
        String(p.name).toLowerCase().includes(q) ||
        String(p.phone).includes(q)
    );

    if (found) {
      setPassenger(found);
      localStorage.setItem('gomini_active_eid', found.employee_id);
      setSearchQuery('');
    } else {
      alert('No passenger found matching: ' + searchQuery);
    }
  };

  // Load active chat when passenger changes
  useEffect(() => {
    if (!passenger) return;

    const fetchChat = async () => {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('employee_id', passenger.employee_id)
        .in('status', ['open', 'pending'])
        .order('id', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setConversation(data[0]);
        loadMessages(data[0].id);
      } else {
        setConversation(null);
        setMessages([]);
      }
    };

    fetchChat();
  }, [passenger]);

  const loadMessages = async (convId) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    if (data) {
      setMessages(data);
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }
  };

  // Realtime subscription for open chat
  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel('pax_conv_' + conversation.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Send message
  const handleSendMessage = async (e) => {
    e?.preventDefault();
    if (!inputMsg.trim() || sendingMsg || !passenger) return;

    setSendingMsg(true);
    const body = inputMsg.trim();
    setInputMsg('');

    try {
      let conv = conversation;
      if (!conv) {
        const { data } = await supabase
          .from('conversations')
          .insert({
            employee_id: passenger.employee_id,
            passenger_name: passenger.name,
            passenger_phone: passenger.phone,
            route: passenger.route,
            category: 'general',
            status: 'open',
            last_message: body
          })
          .select()
          .single();
        conv = data;
        setConversation(data);
      }

      if (conv) {
        await supabase.from('messages').insert({
          conversation_id: conv.id,
          sender_type: 'passenger',
          sender_name: passenger.name,
          body: body
        });

        await supabase
          .from('conversations')
          .update({ last_message: body, last_message_at: new Date().toISOString(), status: 'open' })
          .eq('id', conv.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingMsg(false);
    }
  };

  const handleQuickAction = async (actionKey) => {
    if (!passenger) return;
    let userText = '';
    let botReply = '';

    if (actionKey === 'where_is_bus') {
      userText = 'Where is my shuttle bus?';
      botReply = `Your assigned route is [${passenger.route}]. Designated pickup station: ${passenger.collection_point || 'Designated Station'}. Driver details are displayed on your live trip card.`;
    } else if (actionKey === 'delay') {
      userText = 'Is the shuttle delayed?';
      botReply = `According to our dispatch matrix, operations are currently on schedule. If traffic occurs, your driver will notify the route channel.`;
    } else if (actionKey === 'missed') {
      userText = 'I missed my shuttle bus!';
      botReply = `If you missed your scheduled departure, please contact your shift supervisor immediately to arrange alternate boarding on the next rotation.`;
    } else if (actionKey === 'issue') {
      userText = 'I want to report an issue (AC, Driver, Delay, Lost item).';
      botReply = `Please type the details of your issue below, and our support team will handle it immediately.`;
    }

    let conv = conversation;
    if (!conv) {
      const { data } = await supabase
        .from('conversations')
        .insert({
          employee_id: passenger.employee_id,
          passenger_name: passenger.name,
          passenger_phone: passenger.phone,
          route: passenger.route,
          category: actionKey,
          status: 'open',
          last_message: userText
        })
        .select()
        .single();
      conv = data;
      setConversation(data);
    }

    if (!conv) return;

    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_type: 'passenger',
      sender_name: passenger.name,
      body: userText
    });

    setTimeout(async () => {
      await supabase.from('messages').insert({
        conversation_id: conv.id,
        sender_type: 'bot',
        sender_name: 'GoMini Bot',
        body: botReply
      });
    }, 400);
  };

  // Convert raw passenger.schedules into 7-Day Commute Plan items
  const renderWeeklyPlan = () => {
    const sched = passenger?.schedules || passenger?.schedule;
    if (!passenger || !sched) return [];

    const defaultDays = [
      'Saturday, Nov 14',
      'Sunday, Nov 15',
      'Monday, Nov 16',
      'Tuesday, Nov 17',
      'Wednesday, Nov 18',
      'Thursday, Nov 19',
      'Friday, Nov 20'
    ];

    const keys = Object.keys(sched);
    const dayKeys = keys.length > 0 ? keys : defaultDays;

    return dayKeys.map((day) => {
      const shiftVal = String(sched[day] || '').trim();
      const sv = shiftVal.toUpperCase();
      const isOff =
        !shiftVal ||
        sv === 'OFF' ||
        sv.includes('NO TRANSPORTATION') ||
        sv.includes('UPL') ||
        sv.includes('PTO') ||
        sv.includes('ANNUAL');

      if (isOff) {
        return {
          day,
          isOff: true,
          statusText: shiftVal || 'OFF',
          trips: []
        };
      }

      // Parse shift times e.g. "17:00-02:00"
      const parts = shiftVal.split('-');
      const startShift = parts[0] ? parts[0].trim() : '17:00';
      const endShift = parts[1] ? parts[1].trim() : '02:00';

      const pickupTime = calculatePickupTime(startShift, passenger.route);

      return {
        day,
        isOff: false,
        shiftVal,
        trips: [
          {
            direction: 'To Office',
            shiftTime: startShift,
            tripTime: pickupTime,
            vehicle: 'HI-ACE (2H)',
            collectionPoint: passenger.collection_point || 'Designated Station',
            isD2D: false
          },
          {
            direction: 'From Office',
            shiftTime: endShift,
            tripTime: endShift,
            vehicle: 'HI-ACE (2H)',
            collectionPoint: passenger.collection_point || 'Designated Station',
            isD2D: true
          }
        ]
      };
    });
  };

  const weeklyPlan = renderWeeklyPlan();

  return (
    <div className="min-h-screen bg-[#070D1E] text-slate-100 flex flex-col font-sans selection:bg-pink-500/30">
      {/* Top Header */}
      <header className="h-16 bg-[#0B132B]/90 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-8 w-8 rounded-xl bg-pink-500 flex items-center justify-center font-black text-xs text-white shadow-md shadow-pink-500/20">
              GM
            </span>
            <span className="font-black text-xl text-white tracking-wide">
              go<span className="text-pink-500">mini.</span>
            </span>
          </div>
          <div className="h-4 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <div className="text-xs font-bold text-white hidden sm:block">GoMini Mobility</div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              Customer Schedule Portal
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Search EID */}
          <form onSubmit={handleSearch} className="relative hidden md:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search EID (e.g. 3367295)..."
              className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-1.5 pl-8 text-xs text-white focus:outline-none focus:border-cyan-500 w-52"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </form>

          <button
            onClick={onSwitchToAgent}
            className="text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 px-3 py-1.5 rounded-xl transition-all"
          >
            Agent Workspace →
          </button>

          {passenger && (
            <div className="hidden lg:flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
              <span className="font-bold text-white truncate max-w-[160px]">{passenger.name}</span>
            </div>
          )}
        </div>
      </header>

      {/* Main Schedule Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Passenger Profile Card (Exact Match to Your Image) */}
        <div className="bg-[#0B1531] p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl mb-8 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-cyan-500/20">
                <span>{passenger?.name ? passenger.name.charAt(0).toUpperCase() : 'A'}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                    Passenger Schedule
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    EID: {passenger?.employee_id || '3367295'}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  {passenger?.name || 'Abdulrahman Nawar'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Phone: {passenger?.phone || '+20 (10) 33774966'}</span>
                  <span>•</span>
                  <span className="text-cyan-400 font-semibold">
                    {passenger?.route || 'R5 - imbaba Ring road'}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex sm:items-center gap-3">
              <button
                onClick={() => window.print()}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-slate-900/90 hover:bg-slate-800 text-slate-300 border border-slate-700/80 transition-all flex items-center gap-2 shadow-sm"
              >
                <Printer className="w-4 h-4 text-slate-400" />
                <span>Print Schedule</span>
              </button>
              <button
                onClick={() => setShowChat(true)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-lg shadow-pink-500/25 transition-all flex items-center gap-2"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Need Help? Chat</span>
              </button>
            </div>
          </div>

          {/* Designated Collection Point & Route Bar */}
          <div className="mt-6 pt-6 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-4 rounded-2xl bg-[#080E24] border border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Designated Collection Point
              </span>
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <MapPin className="w-4 h-4 text-cyan-400" />
                <span>{passenger?.collection_point || 'Mit Nama'}</span>
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#080E24] border border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Designated Route
              </span>
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Navigation className="w-4 h-4 text-blue-400" />
                <span>{passenger?.route || 'R5 - imbaba Ring road'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Weekly Commute Schedule Header */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            <span>Weekly Commute Schedule (Saturday - Friday)</span>
          </h3>
          <span className="text-xs text-slate-400 font-medium">Please be at your pickup point 5 mins prior</span>
        </div>

        {/* 7-Day Commute Schedule Cards */}
        <div className="space-y-4 mb-16">
          {weeklyPlan.map((item) => (
            <div
              key={item.day}
              className={`rounded-2xl border transition-all ${
                item.isOff
                  ? 'bg-[#0A1128]/50 border-slate-800/60 opacity-60'
                  : 'bg-[#0B1531] border-slate-800 hover:border-cyan-500/30 shadow-lg'
              }`}
            >
              {/* Day Header */}
              <div className="px-6 py-4 flex items-center justify-between border-b border-slate-800/80 bg-[#080E24] rounded-t-2xl">
                <div className="flex items-center gap-3">
                  <span className="text-sm sm:text-base font-bold text-white">{item.day}</span>
                  {item.isOff ? (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 uppercase">
                      OFF
                    </span>
                  ) : (
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 uppercase tracking-wide">
                      Scheduled Commute
                    </span>
                  )}
                </div>

                {!item.isOff && (
                  <span className="text-xs font-bold text-slate-400">Shift: {item.shiftVal}</span>
                )}
              </div>

              {/* Day Content */}
              {item.isOff ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  <span>No commute scheduled for this day (Roster: <strong className="text-slate-300">OFF</strong>). Have a great day off!</span>
                </div>
              ) : (
                <div className="p-6 space-y-4">
                  {item.trips.map((t, idx) => {
                    const isTo = t.direction === 'To Office';
                    return (
                      <div
                        key={idx}
                        className="p-4 rounded-2xl bg-[#080E24] border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4"
                      >
                        {/* Direction & Pickup Time */}
                        <div className="flex items-start gap-4">
                          <div
                            className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 ${
                              isTo ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                            }`}
                          >
                            {isTo ? (
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m18 15-6-6-6 6" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                                <path d="m6 9 6 6 6-6" />
                              </svg>
                            )}
                          </div>

                          <div>
                            <div className="flex items-center gap-2">
                              <span
                                className={`text-xs font-bold uppercase tracking-wider ${
                                  isTo ? 'text-emerald-400' : 'text-rose-400'
                                }`}
                              >
                                {t.direction}
                              </span>
                              {t.isD2D && (
                                <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
                                  Door-to-Door
                                </span>
                              )}
                            </div>

                            <div className="flex items-baseline gap-2 mt-1">
                              <span className="text-xl sm:text-2xl font-black text-white">{t.tripTime}</span>
                              <span className="text-[11px] font-medium text-slate-400">
                                {isTo ? '(Pickup / Station Departure)' : '(Trip Departure Time)'}
                              </span>
                            </div>
                          </div>
                        </div>

                        {/* Metadata Badges */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Shift Time</span>
                            <span className="font-bold text-slate-200">{t.shiftTime}</span>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Vehicle</span>
                            <span className="font-bold text-blue-300">{t.vehicle}</span>
                          </div>

                          <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 col-span-2 sm:col-span-1">
                            <span className="text-[10px] font-bold text-slate-400 block uppercase">Collection Point</span>
                            <span className="font-bold text-cyan-300 truncate block">{t.collectionPoint}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}
        </div>
      </main>

      {/* Floating Support Chat Button */}
      <div className="fixed bottom-6 right-6 z-40">
        {!showChat && (
          <button
            onClick={() => setShowChat(true)}
            className="flex items-center gap-2.5 px-5 py-3.5 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-bold text-sm shadow-2xl shadow-pink-500/30 transition-all hover:scale-105"
          >
            <MessageSquare className="w-5 h-5" />
            <span>Shuttle Support Chat</span>
          </button>
        )}
      </div>

      {/* Slide-over Support Chat Drawer */}
      {showChat && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex justify-end">
          <div className="w-full max-w-md bg-slate-950 h-full flex flex-col shadow-2xl border-l border-slate-800 animate-in slide-in-from-right duration-200">
            {/* Drawer Header */}
            <div className="p-4 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-pink-500 flex items-center justify-center font-bold text-xs text-white">
                  GM
                </div>
                <div>
                  <h4 className="text-sm font-bold text-white">GoMini Shuttle Support</h4>
                  <p className="text-[11px] text-pink-400 font-medium">{passenger?.route}</p>
                </div>
              </div>

              <button
                onClick={() => setShowChat(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/60"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Quick Action Helpers */}
            <div className="p-3 bg-slate-900/60 border-b border-slate-800/80 grid grid-cols-2 gap-1.5">
              <button
                onClick={() => handleQuickAction('where_is_bus')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition-all"
              >
                <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Bus className="w-3 h-3 text-cyan-400" />
                  <span>Where is my bus?</span>
                </div>
              </button>

              <button
                onClick={() => handleQuickAction('delay')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition-all"
              >
                <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <Clock className="w-3 h-3 text-amber-400" />
                  <span>Is it delayed?</span>
                </div>
              </button>

              <button
                onClick={() => handleQuickAction('missed')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition-all"
              >
                <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <AlertTriangle className="w-3 h-3 text-rose-400" />
                  <span>Missed my bus</span>
                </div>
              </button>

              <button
                onClick={() => handleQuickAction('issue')}
                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left transition-all"
              >
                <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                  <HelpCircle className="w-3 h-3 text-purple-400" />
                  <span>Report an issue</span>
                </div>
              </button>
            </div>

            {/* Message Thread */}
            <div className="flex-1 p-4 overflow-y-auto space-y-3">
              {messages.length === 0 ? (
                <div className="h-64 flex flex-col items-center justify-center text-center text-slate-500">
                  <MessageSquare className="w-10 h-10 text-slate-700 mb-2 stroke-[1.2]" />
                  <p className="text-xs font-bold text-slate-400">How can we help you today?</p>
                  <p className="text-[11px] text-slate-600 mt-1">Tap a quick action above or send a message</p>
                </div>
              ) : (
                messages.map((m) => {
                  const isMe = m.sender_type === 'passenger';
                  const isBot = m.sender_type === 'bot';

                  return (
                    <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                      <span className="text-[10px] text-slate-400 font-semibold mb-1 px-1">
                        {isMe ? 'You' : isBot ? '🤖 GoMini Bot' : `🧑‍💼 ${m.sender_name || 'Agent'}`}
                      </span>
                      <div
                        className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-sm ${
                          isMe
                            ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-tr-none'
                            : isBot
                            ? 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none'
                            : 'bg-blue-600 text-white rounded-tl-none'
                        }`}
                      >
                        {m.body}
                      </div>
                      <span className="text-[9px] text-slate-500 mt-1 px-1">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Bar */}
            <form onSubmit={handleSendMessage} className="p-3 bg-slate-900 border-t border-slate-800 flex items-center gap-2">
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Type a message to support..."
                className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-none focus:border-pink-500"
              />
              <button
                type="submit"
                disabled={!inputMsg.trim() || sendingMsg}
                className="h-10 px-4 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-40 text-white font-bold text-xs flex items-center justify-center transition-all"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
