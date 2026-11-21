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
  CheckCircle2,
  ArrowLeft,
  Languages,
  Bell,
  AlertTriangle
} from 'lucide-react';

// Route offset in minutes for calculating pickup times from shift times
function getRouteOffset(route) {
  const r = (route || '').toUpperCase();
  if (r.includes('R3')) return 80;  // 1 hr 20m
  if (r.includes('R5')) return 95;  // 1 hr 35m (17:00 -> 15:25)
  if (r.includes('R1') || r.includes('R4') || r.includes('R2')) return 125; // 2 hr 5m
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

export default function CustomerPortal({ onSwitchToAgent, onSignOut, initialPassenger }) {
  const [passenger, setPassenger] = useState(initialPassenger || null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allRoster, setAllRoster] = useState([]);
  const [loading, setLoading] = useState(true);

  // Chat State
  const [showChat, setShowChat] = useState(false);
  const [chatLang, setChatLang] = useState(() => localStorage.getItem('gomini_chat_lang') || 'en');
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

        if (initialPassenger) {
          const match = data.find(p => String(p.employee_id) === String(initialPassenger.employee_id));
          setPassenger(match || initialPassenger);
        } else {
          const savedEid = localStorage.getItem('gomini_active_eid') || '3367295';
          const match = data.find(
            (p) => String(p.employee_id).includes(savedEid) || String(p.phone || '').includes(savedEid) || String(p.name).toLowerCase().includes('nawar')
          );
          if (match) {
            setPassenger(match);
          } else {
            setPassenger(data[0]);
          }
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

  // Chat conversation loader (Keeps full history across all past tickets & agents)
  useEffect(() => {
    if (!passenger) return;

    const fetchChat = async () => {
      try {
        // Fetch passenger's conversations (any status: open, pending, or resolved!)
        const { data: convs } = await supabase
          .from('conversations')
          .select('*')
          .eq('employee_id', passenger.employee_id)
          .order('id', { ascending: false });

        if (convs && convs.length > 0) {
          // Set active conversation to the latest one
          setConversation(convs[0]);

          // Load all messages across all this passenger's conversations
          const convIds = convs.map((c) => c.id);
          const { data: msgs } = await supabase
            .from('messages')
            .select('*')
            .in('conversation_id', convIds)
            .order('created_at', { ascending: true });

          if (msgs) {
            setMessages(msgs);
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
          }
        } else {
          setConversation(null);
          setMessages([]);
        }
      } catch (err) {
        console.warn('Error loading chat history:', err);
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
        { event: 'INSERT', schema: 'public', table: 'messages' },
        (payload) => {
          if (payload.new && payload.new.conversation_id === conversation.id) {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new];
            });
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversation?.id]);

  // Scroll to latest message whenever chat drawer is opened
  useEffect(() => {
    if (showChat) {
      setTimeout(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 150);
    }
  }, [showChat]);

  // Helper to detect passenger intent with database-compliant category constraints
  const analyzeMessageIntent = (text) => {
    const t = (text || '').toLowerCase().trim();

    // 1. Missed bus -> Escalate to human agent
    const isMissed = t.includes('miss') || t.includes('فاتني') || t.includes('ملحقتش') || t.includes('راح عليا');
    if (isMissed) {
      return { canBotAnswer: false, intent: 'missed_bus', category: 'missed_bus' };
    }

    // 2. Complaints / Service issues -> Escalate to human agent
    const isComplaint =
      t.includes('issue') ||
      t.includes('complaint') ||
      t.includes('problem') ||
      t.includes('ac') ||
      t.includes('air') ||
      t.includes('driver') ||
      t.includes('lost') ||
      t.includes('مشكلة') ||
      t.includes('شكوى') ||
      t.includes('تكييف') ||
      t.includes('سائق') ||
      t.includes('نسيت') ||
      t.includes('مفقود') ||
      t.includes('عطل') ||
      t.includes('agent') ||
      t.includes('human') ||
      t.includes('employee') ||
      t.includes('person') ||
      t.includes('موظف') ||
      t.includes('خدمة') ||
      t.includes('حد يكلمني') ||
      t.includes('مساعدة');

    if (isComplaint) {
      return { canBotAnswer: false, intent: 'complaint', category: 'complaint' };
    }

    // 3. Where is my bus -> Automated reply
    const isWhereBus = t.includes('where') || t.includes('bus') || t.includes('shuttle') || t.includes('فين') || t.includes('مكان') || t.includes('الأتوبيس') || t.includes('الاتوبيس') || t.includes('الباص') || t.includes('العربية');
    if (isWhereBus) {
      return { canBotAnswer: true, intent: 'where_is_bus', category: 'where_is_bus' };
    }

    // 4. Delay inquiry -> Automated reply
    const isDelay = t.includes('delay') || t.includes('late') || t.includes('traffic') || t.includes('متأخر') || t.includes('تأخير') || t.includes('زحمة');
    if (isDelay) {
      return { canBotAnswer: true, intent: 'delay', category: 'delay' };
    }

    // 5. Schedule / Timing inquiry -> Automated reply
    const isSchedule = t.includes('schedule') || t.includes('time') || t.includes('timing') || t.includes('shift') || t.includes('when') || t.includes('pickup') || t.includes('موعد') || t.includes('مواعيد') || t.includes('جدول') || t.includes('وردية') || t.includes('ميعاد') || t.includes('امتى') || t.includes('التحرك');
    if (isSchedule) {
      return { canBotAnswer: true, intent: 'schedule', category: 'where_is_bus' };
    }

    // 6. Common greetings -> Automated reply
    if (t === 'hi' || t === 'hello' || t === 'hey' || t === 'مرحبا' || t === 'سلام' || t === 'السلام عليكم') {
      return { canBotAnswer: true, intent: 'greeting', category: 'general' };
    }

    // Default unknown messages escalate to human support
    return { canBotAnswer: false, intent: 'needs_agent', category: 'complaint' };
  };

  // Generic send message function that supports both typed text and quick prompt buttons
  const sendMessageWithText = async (rawText) => {
    if (!rawText || !rawText.trim() || sendingMsg || !passenger) return;

    setSendingMsg(true);
    const body = rawText.trim();
    setInputMsg('');

    try {
      const { canBotAnswer, intent, category } = analyzeMessageIntent(body);

      let conv = conversation;
      if (!conv) {
        // Check if an existing conversation exists in DB for this employee
        const { data: existing } = await supabase
          .from('conversations')
          .select('*')
          .eq('employee_id', passenger.employee_id)
          .order('id', { ascending: false })
          .limit(1);

        if (existing && existing.length > 0) {
          conv = existing[0];
          setConversation(existing[0]);
        }
      }

      if (!conv) {
        // Create new conversation with strictly valid category
        const { data: newRow, error: insErr } = await supabase
          .from('conversations')
          .insert({
            employee_id: passenger.employee_id,
            passenger_name: passenger.name,
            passenger_phone: passenger.phone,
            route: passenger.route,
            category: category,
            status: 'open',
            assigned_agent_id: null,
            assigned_agent_name: null,
            last_message: body,
            last_message_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insErr) {
          console.error('Failed to create conversation:', insErr);
          return;
        }
        conv = newRow;
        setConversation(newRow);
      } else {
        // Conversation already exists (whether open, pending, or resolved!)
        const updatePayload = {
          status: 'open',
          last_message: body,
          last_message_at: new Date().toISOString(),
          category: category
        };

        // When ticket was previously resolved OR when human assistance is needed,
        // clear assigned agent so it appears directly in the UNASSIGNED area for all agents!
        if (!canBotAnswer || conv.status === 'resolved') {
          updatePayload.assigned_agent_id = null;
          updatePayload.assigned_agent_name = null;
        }

        const { error: updErr } = await supabase
          .from('conversations')
          .update(updatePayload)
          .eq('id', conv.id);

        if (updErr) {
          console.error('Failed to update conversation:', updErr);
        } else {
          setConversation((prev) => ({ ...prev, ...updatePayload }));
        }
      }

      if (!conv?.id) return;

      // 1. Insert Passenger message
      const { data: paxMsg } = await supabase
        .from('messages')
        .insert({
          conversation_id: conv.id,
          sender_type: 'passenger',
          sender_name: passenger.name,
          body: body
        })
        .select()
        .single();

      if (paxMsg) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === paxMsg.id)) return prev;
          return [...prev, paxMsg];
        });
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
      }

      // 2. Query live trip context for this route
      let tripData = null;
      try {
        const { data: tData } = await supabase
          .from('trips')
          .select('*')
          .eq('route', passenger.route)
          .order('id', { ascending: false })
          .limit(1);
        if (tData && tData.length > 0) tripData = tData[0];
      } catch (err) {
        console.warn('Trip query error:', err);
      }

      // 3. Extract actual passenger commute times
      const activePlanDay = weeklyPlan.find(d => !d.isOff && d.trips && d.trips.length > 0) || weeklyPlan[0];
      const toTrip = activePlanDay?.trips?.find(t => t.direction === 'To Office');
      const fromTrip = activePlanDay?.trips?.find(t => t.direction === 'From Office');

      const toTripTime = toTrip?.tripTime || '19:25';
      const toShiftTime = toTrip?.shiftTime || '21:00';
      const fromTripTime = fromTrip?.tripTime || '06:00';
      const fromShiftTime = fromTrip?.shiftTime || '06:00';
      const pickupStation = passenger.collection_point || toTrip?.collectionPoint || (chatLang === 'ar' ? 'محطتك المحددة' : 'your designated station');
      const carNumber = tripData?.vehicle_code ? `${tripData.vehicle_code} (${tripData.vehicle_type || 'HI-ACE'})` : (toTrip?.vehicle || 'HI-ACE (2H)');
      const captainName = tripData?.captain_name || (chatLang === 'ar' ? 'كابتن الرحلة (قيد التعيين)' : 'Assigned Captain (Dispatch Operations)');
      const captainPhone = tripData?.captain_phone || (chatLang === 'ar' ? 'متاح بغرفة العمليات' : 'Available in Dispatch');

      // 4. Formulate automated response in selected language
      let botReply = '';
      if (canBotAnswer) {
        if (intent === 'greeting') {
          botReply = chatLang === 'ar'
            ? `مرحباً ${passenger.name}! كيف يمكننا مساعدة تنقلك اليوم؟ اسأل عن مكان الأتوبيس، المواعيد، أو الإبلاغ عن أي استفسار.`
            : `Hello ${passenger.name}! How can we help your commute today? You can ask about your bus schedule, trip times, or report an issue.`;
        } else {
          // Commute Details (Where is bus / Schedule / Delay)
          if (chatLang === 'ar') {
            botReply = `📍 تفاصيل رحلتك لخط (${passenger.route || 'خطك المخصص'}):\n• موعد رحلة الذهاب للمكتب: ${toTripTime} (بداية الوردية: ${toShiftTime})\n• موعد رحلة العودة من المكتب: ${fromTripTime} (نهاية الوردية: ${fromShiftTime})\n• نقطة الركوب: ${pickupStation}\n\n⚠️ يرجى التواجد في نقطة الركوب قبل موعد الرحلة بـ 5 دقائق.\n\n🚌 رقم ونوع السيارة: ${carNumber}\n👤 كابتن الرحلة: ${captainName}\n📞 هاتف الكابتن: ${captainPhone}\n\nفريق التحكم وغرفة العمليات يتابع حركة الخط مباشرة.`;
          } else {
            botReply = `📍 Shuttle Details for ${passenger.route || 'your designated route'}:\n• To Office Trip Time: ${toTripTime} (Shift: ${toShiftTime})\n• From Office Trip Time: ${fromTripTime} (Shift: ${fromShiftTime})\n• Pickup Location: ${pickupStation}\n\n⚠️ Please be at pickup point 5 minutes before trip time.\n\n🚌 Car / Vehicle: ${carNumber}\n👤 Captain: ${captainName}\n📞 Captain Phone: ${captainPhone}\n\nOur dispatch operations team is tracking this route live.`;
          }
        }
      } else {
        // Needs Human Support Agent (Issue / Missed bus / complex inquiry)
        if (chatLang === 'ar') {
          botReply = `نعتذر عن أي مشكلة أو إزعاج. تم تحويل استفسارك لغرفة العمليات وسنقوم بتوصيلك بأحد ممثلي الدعم فوراً لمساعدتك.`;
        } else {
          botReply = `We apologize for any trouble. We have alerted our dispatch team and will connect you to a support agent shortly to assist you.`;
        }
      }

      // 5. Insert bot reply
      setTimeout(async () => {
        const { data: bMsg } = await supabase
          .from('messages')
          .insert({
            conversation_id: conv.id,
            sender_type: 'bot',
            sender_name: 'GoMini Bot',
            body: botReply
          })
          .select()
          .single();

        if (bMsg) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === bMsg.id)) return prev;
            return [...prev, bMsg];
          });
          setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
        }
      }, 450);

    } catch (err) {
      console.error(err);
    } finally {
      setSendingMsg(false);
    }
  };

  const handleSendMessage = (e) => {
    e?.preventDefault();
    sendMessageWithText(inputMsg);
  };

  const handleSendPresetMessage = (presetText) => {
    sendMessageWithText(presetText);
  };

  // Convert raw schedules into strictly sorted 7-Day Commute Plan (Saturday -> Friday)
  const renderWeeklyPlan = () => {
    const rawSched = passenger?.schedules || passenger?.schedule;
    if (!passenger || !rawSched) return [];

    // Filter out internal metadata keys (like _gender, _dtd)
    const validDays = Object.keys(rawSched).filter(k => !k.startsWith('_'));

    // Strict numerical date ordering: 16, 17, 18, 19, 20, 21, 22
    function extractDayNum(d) {
      const match = String(d).match(/\d+/);
      return match ? parseInt(match[0], 10) : 999;
    }
    validDays.sort((a, b) => extractDayNum(a) - extractDayNum(b));

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

      const isPassengerFemale = (passenger.schedules && String(passenger.schedules._gender || '').toLowerCase().startsWith('f')) ||
        String(passenger.gender || '').toLowerCase().startsWith('f');
      const isVIP = (passenger.employee_id === '3328570') || (passenger.name && passenger.name.toLowerCase().includes('mohammad gamal'));
      const isEligibleD2D = isPassengerFemale || isVIP;

      const pickupTime = calculatePickupTime(startShift, passenger.route);
      const isD2DTo = isEligibleD2D && checkIsD2D(startShift, 'To Office');
      const isD2DFrom = isEligibleD2D && checkIsD2D(endShift, 'From Office');

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
          <img 
            src="/app-icon.png" 
            alt="GoMini Logo" 
            className="h-10 w-10 rounded-xl object-contain shadow-md shadow-cyan-500/20" 
          />

          <div className="h-4 w-px bg-slate-700 hidden sm:block"></div>

          <div>
            <div className="text-xs font-bold text-white hidden sm:block">GoMini Mobility</div>
            <div className="text-[10px] text-slate-400 font-medium tracking-wider uppercase">
              Customer Schedule Portal
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {passenger && (
            <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-900/90 px-2.5 sm:px-3.5 py-1.5 rounded-full border border-slate-800 text-xs text-slate-300 shadow-sm">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shrink-0"></span>
              <span className="font-bold text-white truncate max-w-[90px] xs:max-w-[140px] sm:max-w-[260px]">
                {passenger.name}
              </span>
            </div>
          )}

          <button
            onClick={onSignOut || onSwitchToAgent}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 px-2.5 sm:px-3 py-1.5 rounded-xl transition-all cursor-pointer shrink-0"
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
      <div className={`fixed bottom-6 right-6 z-40 ${showChat ? 'hidden sm:block' : 'block'}`}>
        <button
          onClick={() => setShowChat(!showChat)}
          aria-label={showChat ? 'Close Support Chat' : 'Open Support Chat'}
          className="h-14 w-14 rounded-full bg-gradient-to-r from-pink-500 to-rose-600 hover:from-pink-600 hover:to-rose-700 text-white flex items-center justify-center shadow-xl shadow-pink-500/30 transition-all transform hover:scale-105 active:scale-95 cursor-pointer"
        >
          {showChat ? <X className="w-6 h-6" /> : <MessageSquare className="w-6 h-6" />}
        </button>
      </div>

      {/* Slide-over Live Support Drawer */}
      {showChat && (
        <>
          {/* Chat Backdrop for mobile & desktop */}
          <div
            onClick={() => setShowChat(false)}
            className="fixed inset-0 bg-black/60 backdrop-blur-[2px] z-45 transition-opacity"
            aria-hidden="true"
          />

          <div
            dir={chatLang === 'ar' ? 'rtl' : 'ltr'}
            className="fixed inset-0 sm:inset-y-0 sm:right-0 sm:left-auto w-full sm:w-96 bg-[#0B132B] sm:border-l border-slate-800 shadow-2xl z-50 flex flex-col h-[100dvh] sm:h-screen animate-in slide-in-from-right duration-200"
          >
            {/* Chat Header with safe-area padding for mobile notches/dynamic island */}
            <div
              className="px-4 py-3 sm:p-4 border-b border-slate-800 flex items-center justify-between bg-[#080E24] shrink-0"
              style={{
                paddingTop: 'max(env(safe-area-inset-top, 0px) + 8px, 16px)'
              }}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  className="sm:hidden p-1.5 -ml-1 rounded-xl text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 transition-all shrink-0 active:scale-95 cursor-pointer"
                  title="Back"
                  aria-label="Back"
                >
                  <ArrowLeft className={`w-5 h-5 text-slate-200 ${chatLang === 'ar' ? 'rotate-180' : ''}`} />
                </button>
                <div className="h-9 w-9 rounded-xl bg-pink-500/20 border border-pink-500/30 flex items-center justify-center text-pink-400 shrink-0">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="min-w-0">
                  <h4 className="text-sm font-bold text-white truncate leading-tight">
                    {chatLang === 'ar' ? 'دعم جو ميني' : 'GoMini Support'}
                  </h4>
                  <p className="text-[11px] text-emerald-400 flex items-center gap-1.5 mt-0.5 truncate">
                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shrink-0"></span>
                    {chatLang === 'ar' ? 'المساعد الآلي والعمليات متاح الآن' : 'AI Agent & Dispatch Online'}
                  </p>
                </div>
              </div>

              {/* Language Switcher & Close Button */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    const next = chatLang === 'en' ? 'ar' : 'en';
                    setChatLang(next);
                    localStorage.setItem('gomini_chat_lang', next);
                  }}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-slate-800/90 hover:bg-slate-700 text-cyan-400 hover:text-cyan-300 border border-slate-700 flex items-center gap-1 transition-all cursor-pointer active:scale-95"
                  title={chatLang === 'en' ? 'التبديل إلى العربية' : 'Switch to English'}
                >
                  <Languages className="w-3.5 h-3.5" />
                  <span>{chatLang === 'en' ? 'عربي' : 'EN'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setShowChat(false)}
                  className="h-9 w-9 rounded-full bg-slate-800/90 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700 hover:border-rose-500/40 flex items-center justify-center transition-all shadow-md active:scale-90 shrink-0 cursor-pointer"
                  title="Close chat"
                  aria-label="Close chat"
                >
                  <X className="w-5 h-5 stroke-[2.5]" />
                </button>
              </div>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
                  <div className="h-12 w-12 rounded-2xl bg-slate-800/80 flex items-center justify-center text-slate-500 mb-3">
                    <MessageSquare className="w-6 h-6" />
                  </div>
                  <p className="text-xs font-semibold text-slate-300">
                    {chatLang === 'ar' ? 'كيف يمكننا مساعدة تنقلك اليوم؟' : 'How can we help your commute today?'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {chatLang === 'ar'
                      ? 'اضغط على أحد الخيارات السريعة أدناه أو اسأل عن الأتوبيس، التأخير، أو طلب مساعدة.'
                      : 'Tap a quick action below or ask about bus location, report a delay, or request assistance.'}
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isPax = m.sender_type === 'passenger';
                  return (
                    <div key={m.id} className={`flex flex-col ${isPax ? (chatLang === 'ar' ? 'items-start' : 'items-end') : (chatLang === 'ar' ? 'items-end' : 'items-start')}`}>
                      <span className="text-[10px] text-slate-500 mb-0.5 px-1 font-medium">
                        {isPax ? (chatLang === 'ar' ? 'أنت' : 'You') : (chatLang === 'ar' ? 'خدمة العملاء' : (m.sender_name || 'Support'))}
                      </span>
                      <div
                        className={`max-w-[85%] px-4 py-2.5 rounded-2xl text-xs whitespace-pre-line leading-relaxed ${
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

            {/* Quick Action Chips for Fast Mobile Responses */}
            <div className="px-3 py-2 bg-[#080E24]/90 border-t border-slate-800/60 flex items-center gap-2 overflow-x-auto no-scrollbar shrink-0">
              <button
                type="button"
                onClick={() => handleSendPresetMessage(chatLang === 'ar' ? 'أين الأتوبيس الخاص بي؟' : 'Where is my shuttle bus?')}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/90 hover:bg-pink-500/20 text-slate-300 hover:text-pink-300 border border-slate-700/80 hover:border-pink-500/40 whitespace-nowrap transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                {chatLang === 'ar' ? '🚌 أين الأتوبيس؟' : '🚌 Where is my bus?'}
              </button>
              <button
                type="button"
                onClick={() => handleSendPresetMessage(chatLang === 'ar' ? 'فاتني الأتوبيس!' : 'I missed my shuttle bus!')}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/90 hover:bg-rose-500/20 text-slate-300 hover:text-rose-300 border border-slate-700/80 hover:border-rose-500/40 whitespace-nowrap transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                {chatLang === 'ar' ? '⚠️ فاتني الأتوبيس!' : '⚠️ Missed my shuttle'}
              </button>
              <button
                type="button"
                onClick={() => handleSendPresetMessage(chatLang === 'ar' ? 'أريد الإبلاغ عن مشكلة (تكييف، سائق، تأخير، مفقودات)' : 'I want to report an issue (AC, Driver, Delay, Lost Item).')}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/90 hover:bg-amber-500/20 text-slate-300 hover:text-amber-300 border border-slate-700/80 hover:border-amber-500/40 whitespace-nowrap transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                {chatLang === 'ar' ? '💬 الإبلاغ عن مشكلة' : '💬 Report an issue'}
              </button>
              <button
                type="button"
                onClick={() => handleSendPresetMessage(chatLang === 'ar' ? 'هل الرحلة متأخرة؟' : 'Is the shuttle delayed?')}
                className="px-3 py-1.5 rounded-full text-xs font-medium bg-slate-800/90 hover:bg-cyan-500/20 text-slate-300 hover:text-cyan-300 border border-slate-700/80 hover:border-cyan-500/40 whitespace-nowrap transition-all active:scale-95 shrink-0 cursor-pointer"
              >
                {chatLang === 'ar' ? '⏰ تأخير الرحلة؟' : '⏰ Trip delay?'}
              </button>
            </div>

            {/* Chat Input with Safe-area Bottom Inset */}
            <form
              onSubmit={handleSendMessage}
              className="p-3 border-t border-slate-800 bg-[#080E24] shrink-0"
              style={{
                paddingBottom: 'max(env(safe-area-inset-bottom, 0px) + 8px, 14px)'
              }}
            >
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={inputMsg}
                  onChange={(e) => setInputMsg(e.target.value)}
                  placeholder={chatLang === 'ar' ? 'اكتب استفسارك عن الأتوبيس، الخط، أو المواعيد...' : 'Ask about your bus, route, or timing...'}
                  className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-3.5 py-2.5 text-base sm:text-xs text-white placeholder-slate-500 focus:outline-none focus:border-pink-500"
                />
                <button
                  type="submit"
                  disabled={sendingMsg || !inputMsg.trim()}
                  className="h-10 w-10 flex items-center justify-center rounded-xl bg-pink-500 hover:bg-pink-600 disabled:opacity-40 text-white transition-all shadow-md shadow-pink-500/20 active:scale-95 shrink-0 cursor-pointer"
                  title="Send message"
                  aria-label="Send message"
                >
                  <Send className={`w-4 h-4 ${chatLang === 'ar' ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
