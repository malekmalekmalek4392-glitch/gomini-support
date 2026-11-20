import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../lib/supabase';
import { Send, Bus, Clock, Phone, AlertTriangle, HelpCircle, CheckCircle, MessageSquare, ArrowLeft, RefreshCw } from 'lucide-react';

export default function PassengerChat({ onSwitchToAgent }) {
  const [profile, setProfile] = useState(() => {
    const saved = localStorage.getItem('gomini_pax_profile');
    return saved ? JSON.parse(saved) : null;
  });

  const [formName, setFormName] = useState('');
  const [formEid, setFormEid] = useState('');
  const [formRoute, setFormRoute] = useState('R1 - Heliopolis');
  const [formPhone, setFormPhone] = useState('');

  const [activeTrip, setActiveTrip] = useState(null);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputMessage, setInputMessage] = useState('');
  const [loadingTrip, setLoadingTrip] = useState(false);
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef(null);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Load today's active trip for passenger's route
  const fetchTrip = async (route) => {
    setLoadingTrip(true);
    try {
      const { data, error } = await supabase
        .from('trips')
        .select('*')
        .eq('route', route)
        .order('id', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
        setActiveTrip(data[0]);
      } else {
        setActiveTrip(null);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingTrip(false);
    }
  };

  // Find or create conversation for passenger
  const loadConversation = async (prof) => {
    try {
      const { data, error } = await supabase
        .from('conversations')
        .select('*')
        .eq('employee_id', prof.eid)
        .in('status', ['open', 'pending'])
        .order('id', { ascending: false })
        .limit(1);

      if (!error && data && data.length > 0) {
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

    if (data) setMessages(data);
  };

  useEffect(() => {
    if (profile) {
      fetchTrip(profile.route);
      loadConversation(profile);
    }
  }, [profile]);

  // Realtime subscription for conversation and messages
  useEffect(() => {
    if (!conversation?.id) return;

    const channel = supabase
      .channel('chat_' + conversation.id)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          setMessages((prev) => {
            if (prev.some((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        }
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations', filter: `id=eq.${conversation.id}` },
        (payload) => {
          setConversation(payload.new);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  const handleRegister = (e) => {
    e.preventDefault();
    if (!formName || !formEid) return;
    const p = {
      name: formName.trim(),
      eid: formEid.trim(),
      route: formRoute,
      phone: formPhone.trim()
    };
    localStorage.setItem('gomini_pax_profile', JSON.stringify(p));
    setProfile(p);
  };

  // Create conversation if none exists
  const getOrCreateConversation = async (category = 'general', initialMsg = '') => {
    if (conversation) return conversation;

    const { data, error } = await supabase
      .from('conversations')
      .insert({
        employee_id: profile.eid,
        passenger_name: profile.name,
        passenger_phone: profile.phone,
        route: profile.route,
        category: category,
        status: 'open',
        last_message: initialMsg || 'Conversation started'
      })
      .select()
      .single();

    if (!error && data) {
      setConversation(data);
      return data;
    }
    return null;
  };

  // Bot Quick Answers
  const handleQuickAction = async (actionKey) => {
    let userText = '';
    let botReply = '';

    if (actionKey === 'where_is_bus') {
      userText = 'Where is my shuttle bus?';
      if (activeTrip) {
        botReply = `Your assigned shuttle for ${activeTrip.route} is vehicle [${activeTrip.vehicle_code || 'Assigned'}] (${activeTrip.vehicle_type || 'Van'}). Shift time is ${activeTrip.shift_time}, trip pickup starts around ${activeTrip.trip_time || activeTrip.shift_time}. Captain: ${activeTrip.captain_name || 'Assigned Driver'} (${activeTrip.captain_phone || 'Available in dispatch'}).`;
      } else {
        botReply = `We are checking the schedule for ${profile.route}. Our support agent will connect with you shortly with your live vehicle assignment.`;
      }
    } else if (actionKey === 'delay') {
      userText = 'Is the shuttle delayed?';
      if (activeTrip && activeTrip.delay_minutes > 0) {
        botReply = `Status update: Your shuttle (${activeTrip.vehicle_code}) is currently delayed by approximately ${activeTrip.delay_minutes} minutes due to route traffic. We apologize for the inconvenience.`;
      } else {
        botReply = `According to our dispatch schedule, your route (${profile.route}) is currently operating on time. Connecting you to an agent if you need special assistance.`;
      }
    } else if (actionKey === 'missed_bus') {
      userText = 'I missed my shuttle bus!';
      botReply = `If you missed your scheduled bus for ${profile.route}, please contact your site supervisor immediately. We have alerted our dispatch coordinator to check if a seat is available on the next rotation.`;
    } else if (actionKey === 'issue') {
      userText = 'I want to report an issue with the ride.';
      botReply = `We take safety and comfort seriously. Please type details of the issue (e.g. AC, driving, delay, lost item) below, and an agent will assist you immediately.`;
    }

    const conv = await getOrCreateConversation(actionKey, userText);
    if (!conv) return;

    // Insert user question
    await supabase.from('messages').insert({
      conversation_id: conv.id,
      sender_type: 'passenger',
      sender_name: profile.name,
      body: userText
    });

    // Insert bot answer
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
    if (!inputMessage.trim() || sending) return;

    setSending(true);
    const text = inputMessage.trim();
    setInputMessage('');

    try {
      const conv = await getOrCreateConversation('general', text);
      if (conv) {
        await supabase.from('messages').insert({
          conversation_id: conv.id,
          sender_type: 'passenger',
          sender_name: profile.name,
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
      setSending(false);
    }
  };

  // If not onboarded, show quick login/profile setup
  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col justify-center items-center p-4">
        <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center font-black text-xl text-white shadow-lg shadow-pink-500/20">
              GM
            </div>
            <div>
              <h1 className="text-xl font-black text-white">GoMini Shuttle Support</h1>
              <p className="text-xs text-slate-400">TaskUs Corporate Commute</p>
            </div>
          </div>

          <form onSubmit={handleRegister} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Full Name</label>
              <input
                type="text"
                required
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
                placeholder="e.g. Ahmed Mahmoud"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Employee ID (EID)</label>
              <input
                type="text"
                required
                value={formEid}
                onChange={(e) => setFormEid(e.target.value)}
                placeholder="e.g. TU-10294"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Your Route</label>
              <select
                value={formRoute}
                onChange={(e) => setFormRoute(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
              >
                <option value="R1 - Heliopolis">R1 - Heliopolis / El Hegaz / Alf Maskan</option>
                <option value="R2 - Nasr City">R2 - Nasr City / Abbas El Akkad</option>
                <option value="R3 - Maadi">R3 - Maadi / Zahraa</option>
                <option value="R4 - Giza / Haram">R4 - Giza / Haram / Faisal</option>
                <option value="R5 - Mohandessin">R5 - Mohandessin / Dokki</option>
                <option value="R6 - New Cairo">R6 - New Cairo / Tagamoa</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Phone Number (Optional)</label>
              <input
                type="tel"
                value={formPhone}
                onChange={(e) => setFormPhone(e.target.value)}
                placeholder="01xxxxxxxxx"
                className="w-full bg-slate-950 border border-slate-800 rounded-xl px-4 py-3 text-sm text-white focus:outline-none focus:border-pink-500 transition-colors"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white shadow-lg shadow-pink-500/20 transition-all mt-2"
            >
              Start Shuttle Support
            </button>
          </form>

          <div className="mt-6 pt-4 border-t border-slate-800/80 text-center">
            <button
              onClick={onSwitchToAgent}
              className="text-xs text-slate-500 hover:text-slate-300 font-medium transition-colors"
            >
              Switch to Support Agent Console →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col max-w-lg mx-auto border-x border-slate-900 shadow-2xl">
      {/* Header */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-800 px-4 py-3 sticky top-0 z-20 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center font-black text-sm text-white">
            GM
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              <span>{profile.name}</span>
              <span className="text-[10px] bg-slate-800 px-2 py-0.5 rounded-full text-slate-400 border border-slate-700">{profile.eid}</span>
            </h2>
            <p className="text-[11px] text-pink-400 font-medium">{profile.route}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchTrip(profile.route)}
            title="Refresh trip"
            className="p-2 rounded-xl text-slate-400 hover:text-white bg-slate-800/60 border border-slate-700/50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingTrip ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={onSwitchToAgent}
            className="px-2.5 py-1.5 rounded-xl text-[11px] font-bold text-purple-300 bg-purple-500/10 border border-purple-500/30 hover:bg-purple-500/20"
          >
            Agent View
          </button>
        </div>
      </header>

      {/* Live Trip Card */}
      <div className="p-4 bg-slate-900/50 border-b border-slate-800/80">
        <div className="bg-gradient-to-br from-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-4 shadow-lg relative overflow-hidden">
          <div className="absolute top-0 right-0 w-28 h-28 bg-purple-500/5 rounded-full blur-2xl"></div>

          <div className="flex items-center justify-between mb-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-400 uppercase tracking-wider">
              <Bus className="w-3.5 h-3.5 text-pink-400" />
              <span>Today's Shuttle</span>
            </span>
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
              {activeTrip?.status === 'delayed' ? 'Delayed' : 'Active'}
            </span>
          </div>

          {activeTrip ? (
            <div className="space-y-3">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-2xl font-black text-white flex items-center gap-2">
                    <span>{activeTrip.vehicle_code || '1H'}</span>
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wide">
                      {activeTrip.vehicle_type || 'HI-ACE'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <Clock className="w-3 h-3 text-cyan-400" />
                    <span>Shift: {activeTrip.shift_time} (Pickup: {activeTrip.trip_time || activeTrip.shift_time})</span>
                  </p>
                </div>

                {activeTrip.captain_phone && (
                  <a
                    href={`tel:${activeTrip.captain_phone}`}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold hover:bg-emerald-500/30 transition-all shadow-sm"
                  >
                    <Phone className="w-3 h-3" />
                    <span>Call Driver</span>
                  </a>
                )}
              </div>

              <div className="text-xs text-slate-300 pt-2 border-t border-slate-800 flex items-center justify-between">
                <span>Driver: <b>{activeTrip.captain_name || 'Captain Assigned'}</b></span>
                <span className="text-slate-400 font-mono text-[11px]">{activeTrip.captain_phone || ''}</span>
              </div>
            </div>
          ) : (
            <div className="py-2 text-center text-xs text-slate-400">
              No vehicle assigned yet for today. Use quick buttons below to ask support.
            </div>
          )}
        </div>
      </div>

      {/* Quick Action Buttons */}
      <div className="p-4 grid grid-cols-2 gap-2 border-b border-slate-900 bg-slate-950">
        <button
          onClick={() => handleQuickAction('where_is_bus')}
          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left flex items-start gap-2.5 transition-all group"
        >
          <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 group-hover:bg-cyan-500/20">
            <Bus className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Where is my bus?</div>
            <div className="text-[10px] text-slate-400">Live vehicle info</div>
          </div>
        </button>

        <button
          onClick={() => handleQuickAction('delay')}
          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left flex items-start gap-2.5 transition-all group"
        >
          <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:bg-amber-500/20">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Is it delayed?</div>
            <div className="text-[10px] text-slate-400">Traffic & status</div>
          </div>
        </button>

        <button
          onClick={() => handleQuickAction('missed_bus')}
          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left flex items-start gap-2.5 transition-all group"
        >
          <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 group-hover:bg-rose-500/20">
            <AlertTriangle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">I missed the bus</div>
            <div className="text-[10px] text-slate-400">Emergency support</div>
          </div>
        </button>

        <button
          onClick={() => handleQuickAction('issue')}
          className="p-3 rounded-2xl bg-slate-900 border border-slate-800 hover:border-slate-700 text-left flex items-start gap-2.5 transition-all group"
        >
          <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20 group-hover:bg-purple-500/20">
            <HelpCircle className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-white">Report an issue</div>
            <div className="text-[10px] text-slate-400">AC, driver, lost item</div>
          </div>
        </button>
      </div>

      {/* Messages Thread */}
      <div className="flex-1 p-4 overflow-y-auto space-y-3">
        {messages.length === 0 ? (
          <div className="h-48 flex flex-col items-center justify-center text-center text-slate-500">
            <MessageSquare className="w-8 h-8 text-slate-600 mb-2 stroke-[1.5]" />
            <p className="text-xs font-medium">Tap a quick action above or type below</p>
            <p className="text-[11px] text-slate-600 mt-0.5">Support agents are active online</p>
          </div>
        ) : (
          messages.map((m) => {
            const isMe = m.sender_type === 'passenger';
            const isBot = m.sender_type === 'bot';

            return (
              <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                <div className="text-[10px] text-slate-400 font-semibold mb-1 px-1">
                  {isMe ? 'You' : isBot ? '🤖 GoMini Bot' : `🧑‍💼 ${m.sender_name || 'Support Agent'}`}
                </div>
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed shadow-md ${
                    isMe
                      ? 'bg-gradient-to-r from-pink-500 to-purple-600 text-white rounded-tr-none'
                      : isBot
                      ? 'bg-slate-900 text-slate-200 border border-slate-800 rounded-tl-none'
                      : 'bg-blue-600 text-white rounded-tl-none shadow-blue-500/10'
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

      {/* Chat Input Bar */}
      <form onSubmit={handleSendMessage} className="p-3 bg-slate-900/90 border-t border-slate-800 sticky bottom-0 z-20 flex gap-2 items-center">
        <input
          type="text"
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          placeholder="Type a message to support..."
          className="flex-1 bg-slate-950 border border-slate-800 rounded-2xl px-4 py-3 text-xs text-white focus:outline-none focus:border-pink-500 transition-colors"
        />
        <button
          type="submit"
          disabled={!inputMessage.trim() || sending}
          className="h-11 w-11 rounded-2xl bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 disabled:opacity-40 flex items-center justify-center text-white shadow-lg shadow-pink-500/20 transition-all flex-shrink-0"
        >
          <Send className="w-4 h-4" />
        </button>
      </form>
    </div>
  );
}
