import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import {
  Bus,
  Clock,
  Phone,
  Printer,
  MapPin,
  Navigation,
  MessageSquare,
  Send,
  X,
  Search,
  LogOut,
  RefreshCw,
  Sparkles,
  ShieldCheck,
  CheckCircle2
} from 'lucide-react';

// Route offset in minutes for calculating pickup times from shift times
function getRouteOffset(route) {
  const r = (route || '').toUpperCase();
  if (r.includes('R3')) return 80;  // 1 hr 20m
  if (r.includes('R5')) return 95;  // 1 hr 35m (17:00 -> 15:25)
  if (r.includes('R1') || r.includes('R4')) return 125; // 2 hr 5m
  if (r.includes('R2')) return 130; // 2 hr 10m
  if (r.includes('R6')) return 135; // 2 hr 15m
  return 120; // 2 hr default
}

function calculatePickupTime(shiftTimeStr, route) {
  if (!shiftTimeStr || !shiftTimeStr.includes(':')) return shiftTimeStr;
  const parts = shiftTimeStr.split(':').map(Number);
  const h = parts[0];
  const m = parts[1] || 0;
  const offset = getRouteOffset(route);
  let totalMins = h * 60 + m - offset;
  if (totalMins < 0) totalMins += 24 * 60;
  const ph = Math.floor(totalMins / 60) % 24;
  const pm = totalMins % 60;
  return `${ph < 10 ? '0' + ph : ph}:${pm < 10 ? '0' + pm : pm}`;
}

// Check if a given time hour falls within Door-to-Door window
function checkIsD2D(timeStr, direction) {
  if (!timeStr || !timeStr.includes(':')) return false;
  const h = parseInt(timeStr.split(':')[0], 10);
  if (direction === 'To Office') {
    // Arrival between 12:00 AM (0) and 6:00 AM
    return h >= 0 && h <= 6;
  } else {
    // Departure between 11:00 PM (23) and 5:00 AM
    return h === 23 || (h >= 0 && h <= 5);
  }
}

export default function CustomerPortal({ onSwitchToAgent }) {
  const [passenger, setPassenger] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allRoster, setAllRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef(null);

  // Load roster from Supabase
  const loadRoster = async () => {
    try {
      const { data, error } = await supabase.from('roster').select('*');
      if (!error && data && data.length > 0) {
        setAllRoster(data);

        // Saved EID or default to Abdulrahman Nawar (3367295)
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
      console.error('Error fetching roster:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRoster();

    // Realtime WebSocket subscription on roster table
    const channel = supabase
      .channel('roster_live_channel')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'roster' }, () => {
        loadRoster();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // Search by EID or Name
  const handleSearch = (e) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    const q = searchQuery.trim().toLowerCase();
    const found = allRoster.find(
      (p) =>
        String(p.employee_id).toLowerCase().includes(q) ||
        String(p.name).toLowerCase().includes(q) ||
        String(p.phone).replace(/[^0-9]/g, '').includes(q.replace(/[^0-9]/g, ''))
    );

    if (found) {
      setPassenger(found);
      localStorage.setItem('gomini_active_eid', found.employee_id);
      setSearchQuery('');
    } else {
      alert('No passenger found matching: ' + searchQuery);
    }
  };

  // Chat conversation loader
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

  // Realtime subscription for active chat
  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel('chat_msg_' + conversation.id)
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

      await supabase.from('messages').insert({
        conversation_id: conv.id,
        sender_type: 'passenger',
        sender_name: passenger.name,
        body: body
      });

      await supabase
        .from('conversations')
        .update({ last_message: body, updated_at: new Date().toISOString() })
        .eq('id', conv.id);

      // Bot auto-reply
      setTimeout(async () => {
        let reply = "Hello! A GoMini dispatch support agent has received your request and will assist you shortly.";
        const bLower = body.toLowerCase();
        if (bLower.includes('bus') || bLower.includes('where')) {
          reply = `Your vehicle for ${passenger.route} is HI-ACE (2H) scheduled at ${passenger.collection_point || 'your station'}. Captain will arrive on schedule.`;
        } else if (bLower.includes('delay') || bLower.includes('late')) {
          reply = `We've flagged your report for ${passenger.name} (${passenger.employee_id}). Operations is tracking the vehicle status right now.`;
        }

        await supabase.from('messages').insert({
          conversation_id: conv.id,
          sender_type: 'bot',
          sender_name: 'GoMini Bot',
          body: reply
        });
      }, 500);

    } catch (err) {
      console.error(err);
    } finally {
      setSendingMsg(false);
    }
  };

  // Convert raw schedules into strictly sorted 7-Day Commute Plan (Saturday -> Friday)
  const renderWeeklyPlan = () => {
    const rawSched = passenger?.schedules || passenger?.schedule;
    if (!passenger || !rawSched) return [];

    // Filter out internal metadata keys (like _gender, _dtd)
    const validDays = Object.keys(rawSched).filter(k => !k.startsWith('_'));

    // Strict chronological week sorting: Saturday -> Friday
    const dayOrder = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday'];
    validDays.sort((a, b) => {
      const idxA = dayOrder.findIndex(d => a.toLowerCase().includes(d));
      const idxB = dayOrder.findIndex(d => b.toLowerCase().includes(d));
      return (idxA === -1 ? 99 : idxA) - (idxB === -1 ? 99 : idxB);
    });

    return validDays.map((day) => {
      const shiftVal = String(rawSched[day] || '').trim();
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
      const isD2DTo = checkIsD2D(startShift, 'To Office');
      const isD2DFrom = checkIsD2D(endShift, 'From Office');

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
            isD2D: isD2DTo
          },
          {
            direction: 'From Office',
            shiftTime: endShift,
            tripTime: endShift,
            vehicle: 'HI-ACE (2H)',
            collectionPoint: passenger.collection_point || 'Designated Station',
            isD2D: isD2DFrom
          }
        ]
      };
    });
  };

  const weeklyPlan = renderWeeklyPlan();

  const handlePrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#070D1E] flex flex-col items-center justify-center p-6 text-slate-300">
        <div className="h-10 w-10 border-4 border-cyan-500 border-t-transparent rounded-full animate-spin mb-4"></div>
        <p className="text-sm font-semibold tracking-wide">Loading Commute Schedule...</p>
      </div>
    );
  }

  const cleanPhone = String(passenger?.phone || '').replace(/^=/, '').trim();

  return (
    <div className="min-h-screen bg-[#070D1E] text-slate-100 flex flex-col font-sans selection:bg-pink-500/30">
      {/* Top Header - Exact Match to Screenshot */}
      <header className="h-16 bg-[#0B132B]/95 backdrop-blur-md border-b border-slate-800 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
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
          {/* Search EID or Name */}
          <form onSubmit={handleSearch} className="relative hidden md:block">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search EID (e.g. 3367295)..."
              className="bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-1.5 pl-8 text-xs text-white focus:outline-none focus:border-cyan-500 w-52 transition-all"
            />
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
          </form>

          {passenger && (
            <div className="flex items-center gap-2 bg-slate-900/90 px-3.5 py-1.5 rounded-full border border-slate-800 text-xs text-slate-300 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="font-bold text-white truncate max-w-[170px] sm:max-w-[220px]">
                {passenger.name}
              </span>
            </div>
          )}

          {/* Quick Access to Admin, Executive & Agent Views */}
          <div className="hidden sm:flex items-center gap-1.5">
            <a
              href="/dispatch.html?view=admin"
              className="text-xs font-bold text-blue-300 hover:text-white bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/30 px-2.5 py-1.5 rounded-xl transition-all"
            >
              Admin Dispatch →
            </a>
            <a
              href="/dispatch.html?view=executive"
              className="text-xs font-bold text-purple-300 hover:text-white bg-purple-600/20 hover:bg-purple-600/30 border border-purple-500/30 px-2.5 py-1.5 rounded-xl transition-all"
            >
              Executive View →
            </a>
          </div>

          <button
            onClick={onSwitchToAgent}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 px-3 py-1.5 rounded-xl transition-all"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Passenger Profile Card (Exact Match to User Image) */}
        <div className="bg-[#0B1531] p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl mb-8 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-cyan-500/20 shrink-0">
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
                <p className="text-xs sm:text-sm text-slate-400 mt-1 flex items-center gap-2 flex-wrap">
                  <span>Phone: {cleanPhone || '+20 (10) 33774966'}</span>
                  <span>•</span>
                  <span className="text-cyan-400 font-semibold">
                    {passenger?.route || 'R5 - imbaba Ring road'}
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={handlePrint}
              className="flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 text-xs font-bold text-slate-200 transition-all self-start md:self-auto shrink-0 shadow-sm"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              <span>Print Schedule</span>
            </button>
          </div>

          {/* Sub Cards: Designated Collection Point & Route */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6 pt-6 border-t border-slate-800/80">
            <div className="p-4 rounded-2xl bg-[#080E24] border border-slate-800 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400 shrink-0">
                <MapPin className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Designated Collection Point
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {passenger?.collection_point || 'Mit Nama'}
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-[#080E24] border border-slate-800 flex items-center gap-3">
              <div className="h-10 w-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shrink-0">
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Designated Route
                </div>
                <div className="text-sm font-bold text-white mt-0.5">
                  {passenger?.route || 'R5 - imbaba Ring road'}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Weekly Commute Schedule Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-6">
          <div className="flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            <h3 className="text-lg sm:text-xl font-bold text-white">
              Weekly Commute Schedule (Saturday – Friday)
            </h3>
          </div>
          <span className="text-xs text-slate-400 font-medium">
            Please be at your pickup point 5 mins prior
          </span>
        </div>

        {/* 7-Day Commute Grid */}
        <div className="space-y-4 mb-20">
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

              {/* Day Body */}
              {item.isOff ? (
                <div className="p-6 text-center text-slate-400 text-xs">
                  <span>No commute scheduled for this day (Roster: <strong className="text-slate-300">OFF</strong>). Enjoy your day off!</span>
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
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <path d="m18 15-6-6-6 6" />
                              </svg>
                            ) : (
                              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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

                        {/* Shift, Vehicle, Station Details */}
                        <div className="flex items-center gap-4 sm:gap-6 pt-3 md:pt-0 border-t md:border-t-0 border-slate-800/80 flex-wrap">
                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Shift Time
                            </div>
                            <div className="text-xs font-bold text-slate-200 mt-0.5">
                              {t.shiftTime}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Vehicle
                            </div>
                            <div className="text-xs font-bold text-slate-200 mt-0.5">
                              {t.vehicle}
                            </div>
                          </div>

                          <div>
                            <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                              Collection Point
                            </div>
                            <div className="text-xs font-bold text-cyan-400 mt-0.5">
                              {t.collectionPoint}
                            </div>
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
        <button
          onClick={() => setShowChat(!showChat)}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white flex items-center justify-center shadow-xl shadow-pink-500/30 transition-all transform hover:scale-105 active:scale-95"
        >
          {showChat ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        </button>
      </div>

      {/* Slide-over Live Support Drawer */}
      {showChat && (
        <div className="fixed inset-y-0 right-0 w-full sm:w-96 bg-[#0B132B] border-l border-slate-800 shadow-2xl z-50 flex flex-col animate-in slide-in-from-right duration-200">
          {/* Chat Header */}
          <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-[#080E24]">
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400">
                <Sparkles className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-white">GoMini Support</h4>
                <p className="text-[11px] text-emerald-400 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  AI Agent & Dispatch Team Online
                </p>
              </div>
            </div>

            <button
              onClick={() => setShowChat(false)}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Messages Body */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {messages.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                <div className="h-12 w-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mb-3">
                  <MessageSquare className="w-6 h-6" />
                </div>
                <p className="text-xs font-semibold text-slate-300">How can we help your commute today?</p>
                <p className="text-[11px] text-slate-500 mt-1">Ask about bus location, report a delay, or request assistance.</p>
              </div>
            ) : (
              messages.map((m) => {
                const isPax = m.sender_type === 'passenger';
                return (
                  <div key={m.id} className={`flex flex-col ${isPax ? 'items-end' : 'items-start'}`}>
                    <span className="text-[10px] text-slate-500 mb-0.5 px-1 font-medium">
                      {isPax ? 'You' : m.sender_name || 'Support'}
                    </span>
                    <div
                      className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs ${
                        isPax
                          ? 'bg-gradient-to-r from-pink-500 to-rose-600 text-white rounded-tr-none shadow-md shadow-pink-500/10'
                          : 'bg-[#0F1B3E] text-slate-200 border border-slate-700/60 rounded-tl-none'
                      }`}
                    >
                      {m.body}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input */}
          <form onSubmit={handleSendMessage} className="p-3 border-t border-slate-800 bg-[#080E24]">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={inputMsg}
                onChange={(e) => setInputMsg(e.target.value)}
                placeholder="Ask about your bus, route, or timing..."
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-pink-500"
              />
              <button
                type="submit"
                disabled={sendingMsg || !inputMsg.trim()}
                className="p-2 rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-40 text-white transition-all shadow-md shadow-pink-500/20"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
