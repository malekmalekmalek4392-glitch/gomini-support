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
  ChevronUp,
  ChevronDown,
  Sparkles,
  LogOut,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';

export default function CustomerPortal({ onSwitchToAgent }) {
  const [session, setSession] = useState(() => {
    const saved = localStorage.getItem('gomini_pax_session');
    return saved
      ? JSON.parse(saved)
      : {
          name: 'Abdulrahman Nawar',
          eid: '3367295',
          phone: '+20 (10) 33774966',
          route: 'R5 - imbaba Ring road',
          collectionPoint: 'Mit Nama',
          isVIP: false
        };
  });

  const [searchEid, setSearchEid] = useState('');
  const [showLoginModal, setShowLoginModal] = useState(!session);
  const [trips, setTrips] = useState([]);
  const [loadingTrips, setLoadingTrips] = useState(false);

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMsg, setInputMsg] = useState('');
  const [sendingMsg, setSendingMsg] = useState(false);
  const messagesEndRef = useRef(null);

  // Load trips from Supabase for this passenger's route
  const fetchRouteTrips = async (routeName) => {
    if (!routeName) return;
    setLoadingTrips(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .ilike('route', `%${routeName.split('-')[0].trim()}%`)
        .order('id', { ascending: false });

      if (!error && data) {
        setTrips(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTrips(false);
    }
  };

  useEffect(() => {
    if (session?.route) {
      fetchRouteTrips(session.route);
      loadConversation();
    }
  }, [session]);

  // Load or create active chat conversation
  const loadConversation = async () => {
    if (!session) return;
    try {
      const { data } = await supabase
        .from('conversations')
        .select('*')
        .eq('employee_id', session.eid)
        .in('status', ['open', 'pending'])
        .order('id', { ascending: false })
        .limit(1);

      if (data && data.length > 0) {
        setConversation(data[0]);
        loadMessages(data[0].id);
      }
    } catch (e) {
      console.error(e);
    }
  };

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

  // Realtime subscription for conversation & messages
  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel('cust_chat_' + conversation.id)
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

  // Quick Action Handler
  const handleQuickAction = async (actionKey) => {
    let userText = '';
    let botReply = '';

    const activeTrip = trips[0];

    if (actionKey === 'where_is_bus') {
      userText = 'Where is my shuttle bus?';
      if (activeTrip) {
        botReply = `Your assigned shuttle for ${session.route} is [${activeTrip.vehicle_code || 'Assigned'}] (${activeTrip.vehicle_type || 'HI-ACE'}). Shift time: ${activeTrip.shift_time}, pickup time: ${activeTrip.trip_time || activeTrip.shift_time} at ${session.collectionPoint}. Driver: ${activeTrip.captain_name || 'Captain Assigned'} (${activeTrip.captain_phone || 'Call button available'}).`;
      } else {
        botReply = `Your shuttle for ${session.route} is scheduled according to your weekly plan. Pickup at ${session.collectionPoint}. A support agent will assist if you need real-time GPS.`;
      }
    } else if (actionKey === 'delay') {
      userText = 'Is the shuttle delayed?';
      if (activeTrip && activeTrip.delay_minutes > 0) {
        botReply = `Status update: Your shuttle (${activeTrip.vehicle_code}) has an estimated delay of ${activeTrip.delay_minutes} minutes due to traffic. We apologize for the inconvenience.`;
      } else {
        botReply = `Our dispatch system reports normal traffic for ${session.route}. If your bus has not arrived after pickup time, an agent can check with the captain.`;
      }
    } else if (actionKey === 'missed') {
      userText = 'I missed my shuttle bus!';
      botReply = `If you missed your scheduled shuttle, please alert your shift coordinator immediately. We are checking vehicle rotations to see if alternative boarding is available.`;
    } else if (actionKey === 'issue') {
      userText = 'I want to report an issue (AC, Driver, Delay, Lost Item).';
      botReply = `We apologize for any trouble. Please describe the issue below, and our support team will handle it immediately.`;
    }

    let conv = conversation;
    if (!conv) {
      const { data } = await supabase
        .from('conversations')
        .insert({
          employee_id: session.eid,
          passenger_name: session.name,
          passenger_phone: session.phone,
          route: session.route,
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
      sender_name: session.name,
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

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!inputMsg.trim() || sendingMsg) return;

    setSendingMsg(true);
    const text = inputMsg.trim();
    setInputMsg('');

    try {
      let conv = conversation;
      if (!conv) {
        const { data } = await supabase
          .from('conversations')
          .insert({
            employee_id: session.eid,
            passenger_name: session.name,
            passenger_phone: session.phone,
            route: session.route,
            category: 'general',
            status: 'open',
            last_message: text
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
          sender_name: session.name,
          body: text
        });

        await supabase
          .from('conversations')
          .update({ last_message: text, last_message_at: new Date().toISOString(), status: 'open' })
          .eq('id', conv.id);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSendingMsg(false);
    }
  };

  // Mock 7-Day Commute Plan data (Matches TaskUs week structure)
  const daysPlan = [
    {
      day: 'Saturday, Nov 14',
      isOff: true,
      statusText: 'OFF'
    },
    {
      day: 'Sunday, Nov 15',
      isOff: true,
      statusText: 'OFF'
    },
    {
      day: 'Monday, Nov 16',
      isOff: false,
      shiftVal: '17:00–02:00',
      trips: [
        {
          direction: 'To Office',
          shiftTime: '17:00',
          tripTime: '15:25',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: false
        },
        {
          direction: 'From Office',
          shiftTime: '02:00',
          tripTime: '02:00',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: true
        }
      ]
    },
    {
      day: 'Tuesday, Nov 17',
      isOff: false,
      shiftVal: '17:00–02:00',
      trips: [
        {
          direction: 'To Office',
          shiftTime: '17:00',
          tripTime: '15:25',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: false
        },
        {
          direction: 'From Office',
          shiftTime: '02:00',
          tripTime: '02:00',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: true
        }
      ]
    },
    {
      day: 'Wednesday, Nov 18',
      isOff: false,
      shiftVal: '17:00–02:00',
      trips: [
        {
          direction: 'To Office',
          shiftTime: '17:00',
          tripTime: '15:25',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: false
        },
        {
          direction: 'From Office',
          shiftTime: '02:00',
          tripTime: '02:00',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: true
        }
      ]
    },
    {
      day: 'Thursday, Nov 19',
      isOff: false,
      shiftVal: '17:00–02:00',
      trips: [
        {
          direction: 'To Office',
          shiftTime: '17:00',
          tripTime: '15:25',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: false
        },
        {
          direction: 'From Office',
          shiftTime: '02:00',
          tripTime: '02:00',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: true
        }
      ]
    },
    {
      day: 'Friday, Nov 20',
      isOff: false,
      shiftVal: '17:00–02:00',
      trips: [
        {
          direction: 'To Office',
          shiftTime: '17:00',
          tripTime: '15:25',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: false
        },
        {
          direction: 'From Office',
          shiftTime: '02:00',
          tripTime: '02:00',
          vehicle: 'HI-ACE (2H)',
          vehicleType: 'HI-ACE',
          collectionPoint: session?.collectionPoint || 'Mit Nama',
          isD2D: true
        }
      ]
    }
  ];

  return (
    <div className="min-h-screen bg-[#070D1E] text-slate-100 flex flex-col font-sans selection:bg-pink-500/30">
      {/* Top Header */}
      <header className="h-16 bg-[#0B132B]/80 backdrop-blur-md border-b border-slate-800/80 px-4 sm:px-8 flex items-center justify-between sticky top-0 z-30">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg bg-pink-500 flex items-center justify-center font-black text-xs text-white">
              GM
            </span>
            <span className="font-black text-lg text-white tracking-wide">go<span className="text-pink-500">mini.</span></span>
          </div>
          <div className="h-4 w-px bg-slate-700 hidden sm:block"></div>
          <div>
            <div className="text-xs font-bold text-white hidden sm:block">GoMini Mobility</div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">Customer Schedule Portal</div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={onSwitchToAgent}
            className="text-xs font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20 px-3 py-1.5 rounded-xl transition-all"
          >
            Agent Workspace →
          </button>

          {session && (
            <div className="flex items-center gap-2">
              <div className="hidden md:flex items-center gap-2 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800 text-xs text-slate-300">
                <span className="w-2 h-2 rounded-full bg-cyan-400"></span>
                <span className="font-bold text-white truncate max-w-[160px]">{session.name}</span>
              </div>
              <button
                onClick={() => {
                  localStorage.removeItem('gomini_pax_session');
                  setSession(null);
                  setShowLoginModal(true);
                }}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 px-3 py-1.5 rounded-xl transition-all flex items-center gap-1.5"
                title="Sign out"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Sign Out</span>
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 py-8 sm:px-6 lg:px-8">
        {/* Passenger Profile Header Card */}
        <div className="bg-[#0B1531] p-6 sm:p-8 rounded-3xl border border-slate-800 shadow-2xl mb-8 relative overflow-hidden">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="flex items-center gap-4">
              <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-cyan-500 to-blue-600 flex items-center justify-center text-white text-2xl font-black shadow-lg shadow-cyan-500/20">
                <span>{session?.name ? session.name.charAt(0).toUpperCase() : 'A'}</span>
              </div>
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 uppercase tracking-wider">
                    Passenger Schedule
                  </span>
                  <span className="text-xs text-slate-400 font-mono">
                    EID: {session?.eid || '3367295'}
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-black text-white">
                  {session?.name || 'Abdulrahman Nawar'}
                </h2>
                <p className="text-xs sm:text-sm text-slate-400 mt-0.5 flex items-center gap-2 flex-wrap">
                  <span>Phone: {session?.phone || '+20 (10) 33774966'}</span>
                  <span>•</span>
                  <span className="text-cyan-400 font-semibold">{session?.route || 'R5 - imbaba Ring road'}</span>
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
                <span>{session?.collectionPoint || 'Mit Nama'}</span>
              </span>
            </div>

            <div className="p-4 rounded-2xl bg-[#080E24] border border-slate-800/80">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                Designated Route
              </span>
              <span className="text-sm font-bold text-white flex items-center gap-2">
                <Navigation className="w-4 h-4 text-blue-400" />
                <span>{session?.route || 'R5 - imbaba Ring road'}</span>
              </span>
            </div>
          </div>
        </div>

        {/* Weekly Commute Schedule Title */}
        <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <Clock className="w-5 h-5 text-cyan-400" />
            <span>Weekly Commute Schedule (Saturday - Friday)</span>
          </h3>
          <span className="text-xs text-slate-400 font-medium">Please be at your pickup point 5 mins prior</span>
        </div>

        {/* Days Schedule Cards */}
        <div className="space-y-4 mb-16">
          {daysPlan.map((item) => (
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

      {/* Floating Support Chat Widget */}
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
                  <p className="text-[11px] text-pink-400 font-medium">{session?.route}</p>
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
