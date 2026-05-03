'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, 
  Trophy, 
  PlusCircle, 
  ChevronLeft, 
  ChevronRight, 
  Info, 
  Share2, 
  AlertTriangle, 
  Check, 
  Flame, 
  MessageSquare, 
  Hash, 
  Settings, 
  X, 
  Save, 
  Edit2, 
  Lock, 
  Trash2,
  CalendarDays
} from 'lucide-react';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, doc, setDoc, onSnapshot, arrayUnion, getDoc, updateDoc, deleteField, deleteDoc } from 'firebase/firestore';

// --- Firebase 설정 ---
const firebaseConfig = {
  apiKey: "AIzaSyDd-DX7f2gYFAj70hcwTlHeT11UeIs-itg",
  authDomain: "when-we-meet-27fc2.firebaseapp.com",
  projectId: "when-we-meet-27fc2",
  storageBucket: "when-we-meet-27fc2.firebasestorage.app",
  messagingSenderId: "893868955608",
  appId: "1:893868955608:web:f394eb00e35ce93f9704ad",
  measurementId: "G-7NJFB3HK9J"
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];
const auth = getAuth(app);
const db = getFirestore(app);
const appId = "when-we-meet-prod";

// --- 유저 고유 색상 팔레트 생성기 ---
const PALETTE = [
  '#F87171', // Red 400
  '#FB923C', // Orange 400
  '#FBBF24', // Amber 400
  '#34D399', // Emerald 400
  '#22D3EE', // Cyan 400
  '#60A5FA', // Blue 400
  '#A78BFA', // Violet 400
  '#E879F9', // Fuchsia 400
  '#F472B6', // Pink 400
  '#A3E635'  // Lime 400
];

const getUserColor = (name: string) => {
  if (!name) return '#66c0f4';
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return PALETTE[Math.abs(hash) % PALETTE.length];
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [view, setView] = useState<'home' | 'room' | 'results'>('home'); 
  const [step, setStep] = useState(1); 
  const [roomName, setRoomName] = useState('');
  const [currentRoomId, setCurrentRoomId] = useState('');
  const [entrySource, setEntrySource] = useState<'creator' | 'invitee'>('creator'); 
  const [nickname, setNickname] = useState('');
  
  const [roomData, setRoomData] = useState<any>({});
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [myComments, setMyComments] = useState<Record<string, string>>({});
  const [focusedDate, setFocusedDate] = useState<string | null>(null); 
  const [myMeetings, setMyMeetings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState({ show: false, message: '' });

  const [isEditMode, setIsEditMode] = useState(false);
  const [editingMeeting, setEditingMeeting] = useState<any>(null);
  const [tempEditName, setTempEditName] = useState('');
  const [tempEditNickname, setTempEditNickname] = useState('');
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const [currentDate, setCurrentDate] = useState(new Date()); 
  const urlProcessedRef = useRef(false);
  
  // 전체 결과 달력 토글 상태
  const [showFullCalendar, setShowFullCalendar] = useState(false);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const monthName = `${year}년 ${month + 1}월`;

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();
  const formatDate = (y: number, m: number, d: number) => `${y}-${(m + 1).toString().padStart(2, '0')}-${d.toString().padStart(2, '0')}`;
  const getDayLabel = (y: number, m: number, d: number) => ['일', '월', '화', '수', '목', '금', '토'][new Date(y, m, d).getDay()];

  const todayObj = new Date();
  todayObj.setHours(0, 0, 0, 0);
  const todayStr = formatDate(todayObj.getFullYear(), todayObj.getMonth(), todayObj.getDate());
  const isPastDate = (y: number, m: number, d: number) => new Date(y, m, d).getTime() < todayObj.getTime();

  // 환경에 따른 URL 업데이트 에러 방지 유틸리티
  const updateUrl = (roomId?: string) => {
    try {
      const url = roomId 
        ? `?roomId=${roomId}`
        : window.location.pathname;
      window.history.replaceState(null, '', url);
    } catch (e) {
      console.warn("URL 업데이트가 차단되었습니다 (미리보기 환경 등):", e);
    }
  };

  const goToHome = () => {
    updateUrl(); 
    setView('home');
    setRoomName('');
    setNickname('');
    setSelectedDates([]);
    setMyComments({});
    setCurrentRoomId('');
    setIsEditMode(false);
    setShowFullCalendar(false);
  };

  useEffect(() => { 
    if (view === 'home') { 
      setRoomName(''); 
      setIsEditMode(false); 
      setShowFullCalendar(false);
    } 
  }, [view]);

  useEffect(() => { 
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { 
      if (!currentUser) signInAnonymously(auth); 
      setUser(currentUser); 
    }); 
    return () => unsubscribe(); 
  }, []);

  const loadRoomDataAndEnter = async (rId: string, nick: string, rName: string) => {
    setCurrentRoomId(rId);
    setNickname(nick);
    if (rName) setRoomName(rName);

    updateUrl(rId); 

    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', rId);
    const roomSnap = await getDoc(roomDocRef);
    
    if (roomSnap.exists()) {
      const data = roomSnap.data() as any;
      setRoomData(data);
      if (data.name) setRoomName(data.name);

      if (data.participants?.[nick] && data.participants[nick].length > 0) {
        const existingDates = data.participants[nick];
        setSelectedDates(existingDates);
        setFocusedDate(existingDates[existingDates.length - 1]); 
      } else {
        setSelectedDates([]);
        setFocusedDate(null);
      }

      const oldComments: Record<string, string> = {};
      Object.entries(data.comments || {}).forEach(([date, list]: any) => {
        const myC = list.find((c: any) => c.name === nick);
        if (myC) oldComments[date] = myC.text;
      });
      setMyComments(oldComments);
    } else {
      setSelectedDates([]);
      setMyComments({});
      setFocusedDate(null);
    }

    setView('room');
    setStep(2);
  };

  useEffect(() => {
    if (!user) return;
    const historyDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'history_collection', 'data');
    const unsubscribe = onSnapshot(historyDocRef, (docSnap) => { 
      const meetings = docSnap.exists() ? docSnap.data().meetings || [] : [];
      setMyMeetings(meetings); 
      setIsLoading(false); 

      if (!urlProcessedRef.current) {
        urlProcessedRef.current = true;
        const params = new URLSearchParams(window.location.search);
        const roomIdFromUrl = params.get('roomId');
        
        if (roomIdFromUrl) {
          const joinedMeeting = meetings.find((m: any) => m.id === roomIdFromUrl);
          if (joinedMeeting) {
            updateUrl(); 
            setView('home');
            showMessage("이미 참여 중인 모임입니다. 내 약속에서 확인하세요.");
          } else {
            setCurrentRoomId(roomIdFromUrl); 
            setEntrySource('invitee'); 
            setNickname(''); 
            setView('room'); 
            setStep(1);
          }
        }
      }
    }, () => setIsLoading(false));
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    if (!user || !currentRoomId) return;
    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId);
    const unsubscribe = onSnapshot(roomDocRef, (docSnap) => { 
      if (docSnap.exists()) { 
        const data = docSnap.data() as any; 
        setRoomData(data); 
        if (data.name && !editingMeeting) setRoomName(data.name); 
      } 
    });
    return () => unsubscribe();
  }, [user, currentRoomId, editingMeeting]);

  const showMessage = (msg: string) => { 
    setToast({ show: true, message: msg }); 
    setTimeout(() => setToast({ show: false, message: '' }), 3000); 
  };
  
  const createMeeting = async () => {
    if (!roomName || !user) return;
    const newId = Math.random().toString(36).substring(2, 8).toUpperCase();
    try {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', newId);
      await setDoc(roomDocRef, { 
        name: roomName, 
        createdAt: new Date().toISOString(), 
        participants: {}, 
        comments: {} 
      });
      const historyDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'history_collection', 'data');
      await setDoc(historyDocRef, { 
        meetings: arrayUnion({ 
          id: newId, 
          name: roomName, 
          role: '방장', 
          members: 1, 
          savedNickname: '방장' 
        }) 
      }, { merge: true });

      updateUrl(newId); 

      setCurrentRoomId(newId); 
      setEntrySource('creator'); 
      setNickname(''); 
      setView('room'); 
      setStep(1);
    } catch (e) { 
      showMessage("모임 생성 실패"); 
    }
  };

  const enterRoom = () => {
    if (roomData?.participants?.[nickname] && roomData.participants[nickname].length > 0) {
      const existingDates = roomData.participants[nickname];
      setSelectedDates(existingDates);
      setFocusedDate(existingDates[existingDates.length - 1]); 
    } else {
      setSelectedDates([]);
      setFocusedDate(null);
    }
    
    const oldComments: Record<string, string> = {};
    Object.entries(roomData?.comments || {}).forEach(([date, list]: any) => {
      const myC = list.find((c: any) => c.name === nickname);
      if (myC) oldComments[date] = myC.text;
    });
    setMyComments(oldComments); 
    setStep(2);
  };

  const saveSchedule = async () => {
    if (!user || !currentRoomId || !nickname) return;
    try {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', currentRoomId);
      const mergedComments = { ...(roomData.comments || {}) };
      
      Object.keys(mergedComments).forEach(date => { 
        mergedComments[date] = mergedComments[date].filter((c: any) => c.name !== nickname); 
      });

      selectedDates.forEach(date => {
        const text = myComments[date];
        if (text && text.trim()) {
          if (!mergedComments[date]) mergedComments[date] = [];
          mergedComments[date].push({ name: nickname, text: text.trim() });
        }
      });

      await updateDoc(roomDocRef, { 
        [`participants.${nickname}`]: selectedDates, 
        comments: mergedComments 
      });

      const historyDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'history_collection', 'data');
      const historySnap = await getDoc(historyDocRef);
      const meetings = historySnap.exists() ? historySnap.data().meetings || [] : [];
      
      const currentParticipantsCount = Object.keys(roomData?.participants || {}).length;
      const membersCount = roomData?.participants?.[nickname] ? currentParticipantsCount : currentParticipantsCount + 1;
      
      const isAlready = meetings.some((m: any) => m.id === currentRoomId);
      
      if (isAlready) {
        const updated = meetings.map((m: any) => 
          m.id === currentRoomId ? { ...m, savedNickname: nickname, members: membersCount } : m
        );
        await setDoc(historyDocRef, { meetings: updated }, { merge: true });
      } else {
        await setDoc(historyDocRef, { 
          meetings: arrayUnion({ 
            id: currentRoomId, 
            name: roomName, 
            role: '멤버', 
            members: membersCount, 
            savedNickname: nickname 
          }) 
        }, { merge: true });
      }

      setView('results'); 
      showMessage("일정이 저장되었습니다.");
    } catch (e) { 
      showMessage("저장 실패"); 
    }
  };

  const closeEditModal = () => { 
    setEditingMeeting(null); 
    setDeleteConfirmId(null); 
  };

  const handleUpdateMeeting = async () => {
    if (!user || !editingMeeting) return;
    const oldNick = editingMeeting.savedNickname;
    const isNickChanged = oldNick !== tempEditNickname;

    try {
      const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', editingMeeting.id);
      
      if (editingMeeting.role === '방장') {
        await updateDoc(roomDocRef, { name: tempEditName });
      }

      if (isNickChanged) {
        const roomSnap = await getDoc(roomDocRef);
        if (roomSnap.exists()) {
          const rData = roomSnap.data() as any;
          const oldDates = rData.participants?.[oldNick] || [];
          const updatedComms = { ...(rData.comments || {}) };
          
          Object.keys(updatedComms).forEach(date => { 
            updatedComms[date] = updatedComms[date].map((c: any) => 
              c.name === oldNick ? { ...c, name: tempEditNickname } : c
            ); 
          });

          await updateDoc(roomDocRef, { 
            [`participants.${oldNick}`]: deleteField(), 
            [`participants.${tempEditNickname}`]: oldDates, 
            comments: updatedComms 
          });
        }
      }

      const historyDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'history_collection', 'data');
      const historySnap = await getDoc(historyDocRef);
      
      if (historySnap.exists()) {
        const updated = historySnap.data().meetings.map((m: any) => 
          m.id === editingMeeting.id 
            ? { ...m, name: (editingMeeting.role === '방장' ? tempEditName : m.name), savedNickname: tempEditNickname } 
            : m
        );
        await setDoc(historyDocRef, { meetings: updated }, { merge: true });
      }

      if (currentRoomId === editingMeeting.id) {
        setNickname(tempEditNickname);
      }

      showMessage("수정되었습니다."); 
      closeEditModal(); 
      setIsEditMode(false);
    } catch (e) { 
      showMessage("수정 실패"); 
    }
  };

  const confirmDeleteMeeting = async () => {
    if (!user || !editingMeeting || editingMeeting.role !== '방장') return;
    try {
      await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'rooms', editingMeeting.id));
      
      const historyDocRef = doc(db, 'artifacts', appId, 'users', user.uid, 'history_collection', 'data');
      const historySnap = await getDoc(historyDocRef);
      
      if (historySnap.exists()) {
        const updated = historySnap.data().meetings.filter((m: any) => m.id !== editingMeeting.id);
        await setDoc(historyDocRef, { meetings: updated }, { merge: true });
      }

      showMessage("모임이 삭제되었습니다."); 
      closeEditModal(); 
      setIsEditMode(false);
    } catch (e) { 
      showMessage("삭제 중 오류가 발생했습니다."); 
    }
  };

  const toggleDateSelection = (dateStr: string) => {
    if (isPastDate(year, month, parseInt(dateStr.split('-')[2]))) return;

    const isDeselecting = selectedDates.includes(dateStr);
    
    if (isDeselecting) {
      const newDates = selectedDates.filter(d => d !== dateStr);
      setSelectedDates(newDates);
      
      if (focusedDate === dateStr) {
        setFocusedDate(newDates.length > 0 ? newDates[newDates.length - 1] : null);
      }
    } else {
      setSelectedDates([...selectedDates, dateStr]);
      setFocusedDate(dateStr); 
    }
  };

  const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 1));
  const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 1));

  const getOthersAvailable = (dateStr: string) => {
    const names: string[] = [];
    Object.entries(roomData?.participants || {}).forEach(([n, dates]: any) => { 
      if (n !== nickname && dates.includes(dateStr)) {
        names.push(n); 
      }
    });
    return names;
  };

  const allParticipants = useMemo(() => {
    const names = new Set(Object.keys(roomData?.participants || {}));
    if (nickname) names.add(nickname);
    return Array.from(names);
  }, [roomData, nickname]);

  const topThreeDates = useMemo(() => {
    const allUniqueDates = new Set([...selectedDates]);
    Object.values(roomData?.participants || {}).forEach((dates: any) => {
      dates.forEach((d: string) => allUniqueDates.add(d));
    });

    const days: any[] = [];
    Array.from(allUniqueDates).forEach((dateStr: any) => {
      const count = getOthersAvailable(dateStr).length + (selectedDates.includes(dateStr) ? 1 : 0);
      if (count > 0) {
        const [y, m, d] = dateStr.split('-');
        const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
        const dayLabel = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];
        
        days.push({ 
          dateStr, 
          date: `${m}월 ${d}일 (${dayLabel})`, 
          count 
        });
      }
    });
    return days.sort((a, b) => b.count - a.count).slice(0, 3);
  }, [selectedDates, nickname, roomData]);

  const nearPerfectDate = useMemo(() => {
    const totalCount = allParticipants.length;
    if (totalCount <= 1) return null;
    
    const allUniqueDates = new Set([...selectedDates]);
    Object.values(roomData?.participants || {}).forEach((dates: any) => {
      dates.forEach((d: string) => allUniqueDates.add(d));
    });

    for (const dateStr of Array.from(allUniqueDates)) {
      const count = getOthersAvailable(dateStr as string).length + (selectedDates.includes(dateStr as string) ? 1 : 0);
      
      if (count === totalCount - 1) {
        const available = [...getOthersAvailable(dateStr as string)];
        if (selectedDates.includes(dateStr as string)) available.push(nickname);
        
        const missing = allParticipants.find(p => !available.includes(p));
        if (missing) {
          const [y, m, d] = (dateStr as string).split('-');
          const dateObj = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
          const dayLabel = ['일', '월', '화', '수', '목', '금', '토'][dateObj.getDay()];

          return { 
            dateStr: dateStr as string, 
            date: `${m}월 ${d}일 (${dayLabel})`, 
            name: missing 
          };
        }
      }
    }
    return null;
  }, [allParticipants, selectedDates, nickname, roomData]);

  const handleAcceptSchedule = (dateStr: string) => {
    setSelectedDates(prev => Array.from(new Set([...prev, dateStr])));
    showMessage("굴복하셨군요. 다시 [저장하기]를 눌러 확정하세요.");
  };

  const handleMeetingClick = (m: any) => {
    if (isEditMode) {
      setEditingMeeting(m); 
      setTempEditName(m.name); 
      setTempEditNickname(m.savedNickname);
    } else {
      loadRoomDataAndEnter(m.id, m.savedNickname, m.name);
    }
  };

  const handleShare = () => {
    const inviteUrl = `${window.location.origin}${window.location.pathname}?roomId=${currentRoomId}`;
    const dummy = document.createElement('textarea'); 
    document.body.appendChild(dummy);
    dummy.value = inviteUrl; 
    dummy.select(); 
    document.execCommand('copy'); 
    document.body.removeChild(dummy);
    showMessage("링크가 복사되었습니다!");
  };

  const renderCalendarGrid = (isReadonly = false) => {
    return (
      <div className="bg-[#171a21]/80 p-5 rounded-sm border border-black/50 shadow-inner select-none overflow-hidden font-bold">
        <div className="grid grid-cols-7 gap-1 text-center mb-6 opacity-30 font-bold">
          {['일','월','화','수','목','금','토'].map((d, i) => (
            <span key={i} className="text-[10px] font-black font-bold">{d}</span>
          ))}
        </div>
        
        <div className="grid grid-cols-7 gap-1.5 font-bold">
          {Array.from({length: getFirstDayOfMonth(year, month)}, (_, i) => (
            <div key={`pad-${i}`} className="aspect-square" />
          ))}
          {Array.from({length: getDaysInMonth(year, month)}, (_, i) => {
            const dayNum = i + 1; 
            const dateStr = formatDate(year, month, dayNum);
            const isPast = isPastDate(year, month, dayNum);
            const isToday = dateStr === todayStr;
            
            const isSelected = selectedDates.includes(dateStr);
            const participantsForDate = getOthersAvailable(dateStr);
            if (isSelected) participantsForDate.push(nickname);

            const totalCount = allParticipants.length > 0 ? allParticipants.length : 1;
            const count = participantsForDate.length;
            const ratio = count / totalCount;

            let opacityStyle = {};
            let bgClass = 'bg-[#2a3f5a]';
            if (count > 0) {
              if (ratio === 1) {
                bgClass = 'bg-[#47bfff] shadow-md';
              } else {
                opacityStyle = { backgroundColor: `rgba(71, 191, 255, ${0.15 + (ratio * 0.5)})` };
                bgClass = ''; 
              }
            }
            
            const borderClass = isSelected ? 'ring-2 ring-white z-10' : 'border border-transparent';

            return (
              <div 
                key={i} 
                data-date={dateStr} 
                onClick={() => !isReadonly && toggleDateSelection(dateStr)} 
                className={`aspect-square relative flex flex-col items-center justify-start pt-1 rounded-sm transition-all overflow-hidden ${bgClass} ${borderClass} ${isPast ? 'opacity-20 bg-transparent cursor-not-allowed border-none' : isReadonly ? 'cursor-default' : 'cursor-pointer active:scale-95'}`}
                style={opacityStyle}
              >
                <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
                  {isToday && !isSelected && (
                    <span className="absolute top-1 left-1 w-1 h-1 rounded-full bg-red-400"></span>
                  )}
                  <span className={`text-[11px] font-black pointer-events-none mb-0.5 z-10 ${count === totalCount ? 'text-[#171a21]' : 'text-white'} ${isToday && !isSelected ? 'text-red-400' : ''}`}>
                    {dayNum}
                  </span>
                  
                  {count > 0 && (
                    <div className="flex flex-wrap justify-center content-start gap-[2px] w-full px-1 z-10 pointer-events-none">
                      {participantsForDate.map((pName, idx) => (
                        <div 
                          key={idx} 
                          className="w-1.5 h-1.5 rounded-full shadow-sm" 
                          style={{ backgroundColor: getUserColor(pName) }} 
                        />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#171a21] text-[#c7d5e0] flex flex-col font-sans overflow-x-hidden selection:bg-[#66c0f4] selection:text-[#171a21]">
      <main className="flex-1 flex flex-col items-center pt-12 mx-auto w-full pb-12 text-center relative">
        
        {/* ===================== HOME VIEW ===================== */}
        {view === 'home' && (
          <div className="w-full max-w-md px-6 animate-in slide-in-from-right-4 duration-500 text-left">
            <div className="mb-10 px-1 text-center font-bold">
              <h1 className="text-6xl font-black text-white tracking-tighter leading-none mb-4 drop-shadow-2xl">
                우리 <span className="text-[#66c0f4]">언제</span> 봄?
              </h1>
              <p className="text-[15px] text-[#66c0f4] font-black uppercase tracking-[0.3em] drop-shadow-sm">
                언제 볼래 날짜만 정해
              </p>
            </div>
            
            <div className="bg-[#1b2838] border-t-2 border-[#66c0f4] p-8 rounded-sm shadow-2xl space-y-6 mt-6">
              <div className="space-y-4 text-left">
                <div className="space-y-2">
                  <label className="text-[11px] font-black text-[#c7d5e0]/30 uppercase tracking-widest block font-bold">
                    새 모임 이름
                  </label>
                  <input 
                    type="text" 
                    placeholder="예: 맛있는거 사주는 모임" 
                    className="w-full bg-[#2a3f5a] border-none text-white rounded-sm p-4 focus:ring-2 focus:ring-[#66c0f4] outline-none font-bold placeholder:text-[#4d5254]" 
                    value={roomName} 
                    onChange={(e) => setRoomName(e.target.value)} 
                  />
                </div>
              </div>
              <button 
                onClick={createMeeting} 
                disabled={!roomName || !user} 
                className="w-full bg-gradient-to-r from-[#47bfff] to-[#1a44c2] text-white font-black py-5 rounded-sm uppercase shadow-xl active:scale-95 disabled:opacity-30 transition-all flex items-center justify-center gap-3 font-bold"
              >
                <PlusCircle size={20} /> 모임 만들기
              </button>
            </div>

            {!isLoading && myMeetings.length > 0 && (
              <div className="mt-14 space-y-6 text-left font-bold animate-in fade-in slide-in-from-bottom-4 duration-700">
                <div className="flex items-center gap-3 mb-6 px-1 border-l-4 border-[#66c0f4]/50 pl-4 relative">
                  <Hash size={18} className="text-[#66c0f4]" />
                  <h3 className="text-[15px] font-black text-white uppercase tracking-[0.15em] font-bold">내 약속</h3>
                  <div className="bg-[#2a475e] text-[#66c0f4] text-[10px] px-2.5 py-0.5 rounded-sm font-black border border-[#66c0f4]/20 font-bold">
                    {myMeetings.length}
                  </div>
                  <button 
                    onClick={() => setIsEditMode(!isEditMode)} 
                    className={`p-1.5 rounded-sm ml-auto ${isEditMode ? 'bg-[#66c0f4] text-[#171a21]' : 'bg-[#2a475e] text-[#c7d5e0]'}`}
                  >
                    <Settings size={16} className={isEditMode ? 'animate-spin-slow' : ''} />
                  </button>
                </div>
                <div className="space-y-4 font-bold">
                  {myMeetings.map((m) => (
                    <div 
                      key={m.id} 
                      onClick={() => handleMeetingClick(m)} 
                      className={`p-6 rounded-sm border flex items-center justify-between group transition-all shadow-md active:scale-[0.98] cursor-pointer font-bold ${isEditMode ? 'border-[#66c0f4] bg-[#2a3f5a]/30 ring-2 ring-[#66c0f4]/10' : 'bg-[#1b2838] border-white/5 hover:bg-[#213247]'}`}
                    >
                      <div className="flex items-center gap-4 font-bold">
                        <h4 className="text-xl text-white font-black tracking-tight font-bold">{m.name}</h4>
                        {m.role === '방장' ? (
                          <span className="text-[9px] bg-[#66c0f4] text-[#171a21] px-1.5 py-0.5 font-black rounded-sm uppercase">방장</span>
                        ) : (
                          <span className="text-[9px] bg-[#4d5254] text-[#c7d5e0] px-1.5 py-0.5 font-black rounded-sm uppercase">멤버</span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 font-bold">
                        {!isEditMode && (
                          <div className="flex items-center gap-1.5 text-[#4d5254] group-hover:text-[#66c0f4] transition-colors font-bold">
                            <Users size={16} />
                            <span className="text-sm font-bold">{m.members || 1}</span>
                          </div>
                        )}
                        {isEditMode ? (
                          <Edit2 size={18} className="text-[#66c0f4] animate-bounce-subtle" />
                        ) : (
                          <ChevronRight size={18} className="text-[#4d5254] group-hover:text-[#66c0f4]" />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ===================== EDIT MODAL ===================== */}
        {editingMeeting && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-[#171a21]/95 backdrop-blur-md animate-in fade-in duration-300 font-bold">
            <div className="w-full max-w-md bg-[#1b2838] border-t-2 border-[#66c0f4] rounded-sm shadow-2xl p-8 space-y-8 font-bold flex flex-col">
              <div className="flex items-center justify-between font-bold">
                <div className="flex items-center gap-3 font-bold">
                  <Settings size={20} className="text-[#66c0f4]" />
                  <h2 className="text-xl text-white font-black uppercase font-bold">모임 설정 수정</h2>
                </div>
                <button onClick={closeEditModal} className="text-[#4d5254] hover:text-white transition-colors">
                  <X size={24} />
                </button>
              </div>
              
              <div className="space-y-6 font-bold">
                <div className="space-y-2 text-left font-bold">
                  <div className="flex items-center justify-between font-bold">
                    <label className="text-[10px] font-black text-[#c7d5e0]/30 uppercase tracking-widest block font-bold">
                      모임 이름 수정
                    </label>
                    {editingMeeting.role !== '방장' && (
                      <div className="flex items-center gap-1 text-[#4d5254] text-[9px] font-black uppercase">
                        <Lock size={10} /> 방장 전용
                      </div>
                    )}
                  </div>
                  <input 
                    type="text" 
                    disabled={editingMeeting.role !== '방장'} 
                    className={`w-full bg-[#2a3f5a] border-none text-white rounded-sm p-4 outline-none font-bold ${editingMeeting.role !== '방장' ? 'opacity-40 cursor-not-allowed grayscale-[0.5]' : ''}`} 
                    value={tempEditName} 
                    onChange={(e) => setTempEditName(e.target.value)} 
                  />
                </div>
                
                <div className="space-y-2 text-left font-bold">
                  <label className="text-[10px] font-black text-[#c7d5e0]/30 uppercase tracking-widest block font-bold">
                    내 닉네임 수정
                  </label>
                  <div className="relative font-bold">
                    <input 
                      type="text" 
                      maxLength={8} 
                      className="w-full bg-[#2a3f5a] border-none text-white rounded-sm p-4 outline-none font-bold" 
                      value={tempEditNickname} 
                      onChange={(e) => setTempEditNickname(e.target.value)} 
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-[#4d5254] font-black font-bold">
                      {tempEditNickname.length}/8
                    </div>
                  </div>
                </div>
              </div>
              
              <div className="flex gap-3 pt-4 font-bold">
                <button 
                  onClick={closeEditModal} 
                  className="flex-1 py-4 bg-[#2a475e] text-[#c7d5e0] rounded-sm font-black text-xs uppercase hover:bg-[#3d5a7d] transition-all font-bold"
                >
                  취소
                </button>
                <button 
                  onClick={handleUpdateMeeting} 
                  disabled={!tempEditName || !tempEditNickname} 
                  className="flex-1 py-4 bg-gradient-to-r from-[#47bfff] to-[#1a44c2] text-white rounded-sm font-black text-xs uppercase active:scale-95 disabled:opacity-50 transition-all shadow-lg font-bold flex items-center justify-center gap-2"
                >
                  <Save size={16} /> 변경사항 저장
                </button>
              </div>
              
              {editingMeeting.role === '방장' && (
                <div className="pt-6 border-t border-white/10 mt-2">
                  {!deleteConfirmId ? (
                    <button 
                      onClick={() => setDeleteConfirmId(editingMeeting.id)} 
                      className="w-full py-3 text-[#ff4d4f] bg-[#ff4d4f]/10 rounded-sm font-black text-xs uppercase hover:bg-[#ff4d4f]/20 transition-all flex items-center justify-center gap-2"
                    >
                      <Trash2 size={16} /> 모임 삭제하기
                    </button>
                  ) : (
                    <div className="flex gap-2 animate-in fade-in zoom-in-95 duration-200">
                      <button 
                        onClick={() => setDeleteConfirmId(null)} 
                        className="flex-1 py-3 text-[#c7d5e0] bg-[#2a475e] rounded-sm font-black text-xs uppercase hover:bg-[#3d5a7d] transition-all"
                      >
                        취소
                      </button>
                      <button 
                        onClick={confirmDeleteMeeting} 
                        className="flex-[2] py-3 text-white bg-[#ff4d4f] rounded-sm font-black text-xs uppercase hover:bg-[#ff4d4f]/90 transition-all flex items-center justify-center gap-2 shadow-lg"
                      >
                        <AlertTriangle size={16} /> 정말 삭제할게요
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ===================== ROOM VIEW ===================== */}
        {view === 'room' && (
          <div className="w-full max-w-md px-6 animate-in slide-in-from-right-4 duration-500 text-left font-bold">
            {step === 1 ? (
              <div className="mt-16 flex flex-col items-center font-bold w-full">
                <div className="mb-12 text-center space-y-4">
                  <h1 className="text-5xl font-black text-[#66c0f4] drop-shadow-md tracking-tighter whitespace-normal break-keep">
                    '<span className="text-white">{roomName || '무명'}</span>'
                  </h1>
                  <p className="text-2xl text-[#c7d5e0] font-black tracking-tight">
                    {entrySource === 'creator' ? '모임이 개설되었습니다' : '모임에 초대되었습니다'}
                  </p>
                </div>
                
                <div className="w-full bg-[#1b2838] border-t-2 border-[#66c0f4] p-10 rounded-sm shadow-2xl space-y-8 text-center font-bold">
                  <div className="space-y-1 font-bold">
                    <h2 className="text-xl text-white font-black uppercase font-bold">닉네임 설정</h2>
                    <p className="text-xs text-[#c7d5e0]/40 font-bold uppercase tracking-widest font-bold">
                      최대 8자까지 입력 가능합니다
                    </p>
                  </div>
                  <div className="space-y-4 font-bold">
                    <div className="relative font-bold">
                      <input 
                        type="text" 
                        placeholder="닉네임 입력" 
                        maxLength={8} 
                        className="w-full bg-[#2a3f5a] border-none text-white rounded-sm p-5 pr-14 outline-none font-black text-center text-lg focus:ring-2 focus:ring-[#66c0f4] font-bold" 
                        value={nickname} 
                        onChange={(e) => setNickname(e.target.value)} 
                      />
                      <div className="absolute right-4 top-1/2 -translate-y-1/2 text-[12px] text-[#4d5254] font-black font-bold">
                        {nickname.length}/8
                      </div>
                    </div>
                    <button 
                      onClick={enterRoom} 
                      disabled={!nickname} 
                      className="w-full bg-gradient-to-r from-[#47bfff] to-[#1a44c2] text-white font-black py-5 rounded-sm uppercase shadow-xl active:scale-95 transition-all font-bold"
                    >
                      날짜 선택하기
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="space-y-8 font-bold">
                <div className="flex justify-between items-start border-b border-white/5 pb-4 px-1 text-nowrap font-bold">
                  <div className="space-y-1 flex-1 text-left font-bold">
                    <p className="text-[10px] text-[#66c0f4] font-black uppercase tracking-[0.3em] font-bold">날짜 선택</p>
                    <h2 className="text-xl text-white font-black uppercase font-bold">{roomName || '모임명'}</h2>
                  </div>
                  <div className="text-right flex flex-col items-end font-bold">
                    <div className="flex items-baseline gap-1 font-bold">
                      <span className="text-white text-4xl font-black leading-none font-bold">{selectedDates.length}</span>
                      <span className="text-[#4d5254] text-xs font-black uppercase font-bold">일 선택됨</span>
                    </div>
                  </div>
                </div>
                
                <div className="flex items-center justify-between px-2 mb-2 font-bold">
                  <h3 className="text-white font-black tracking-tight font-bold">{monthName}</h3>
                  <div className="flex gap-4 font-bold">
                    <button onClick={handlePrevMonth} className="text-[#4d5254] hover:text-[#66c0f4] font-bold">
                      <ChevronLeft size={20}/>
                    </button>
                    <button onClick={handleNextMonth} className="text-[#4d5254] hover:text-[#66c0f4] font-bold">
                      <ChevronRight size={20}/>
                    </button>
                  </div>
                </div>
                
                {renderCalendarGrid(false)}

                {focusedDate && (
                  <div className="bg-[#1b2838] p-6 rounded-sm border border-white/5 min-h-[120px] flex flex-col gap-4 shadow-xl font-bold animate-in fade-in slide-in-from-bottom-2 duration-300">
                    <div className="space-y-4 font-bold text-left">
                      <span className="text-[10px] text-[#66c0f4] font-black uppercase tracking-widest text-nowrap font-bold">
                        {focusedDate.split('-')[1]}월 {focusedDate.split('-')[2]}일 ({getDayLabel(year, month, parseInt(focusedDate.split('-')[2]))}) 쌉가능한 사람
                      </span>
                      <div className="flex flex-wrap gap-2 text-left font-bold">
                        {selectedDates.includes(focusedDate) && (
                          <div 
                            className="px-3 py-1.5 rounded-sm text-[11px] font-black shadow-md border"
                            style={{ 
                              backgroundColor: getUserColor(nickname) + '26', 
                              color: getUserColor(nickname),
                              borderColor: getUserColor(nickname) + '4D' 
                            }}
                          >
                            {nickname} <span className="opacity-80 text-[9px]">(나)</span>
                          </div>
                        )}
                        {getOthersAvailable(focusedDate).map((name, idx) => (
                          <div 
                            key={idx} 
                            className="px-3 py-1.5 rounded-sm text-[11px] font-black shadow-sm border"
                            style={{ 
                              backgroundColor: getUserColor(name) + '26', 
                              color: getUserColor(name),
                              borderColor: getUserColor(name) + '4D' 
                            }}
                          >
                            {name}
                          </div>
                        ))}
                      </div>
                      
                      {selectedDates.includes(focusedDate) && (
                        <div className="mt-4 pt-4 border-t border-white/5 font-bold">
                          <div className="flex items-center gap-2 mb-2 font-bold">
                            <MessageSquare size={12} className="text-[#66c0f4]" />
                            <span className="text-[10px] text-[#c7d5e0]/50 font-black uppercase font-bold">한 줄 코멘트 남기기</span>
                          </div>
                          <input 
                            type="text" 
                            placeholder="예: 이 날 병원 예약 있어서 오후에 가능" 
                            className="w-full bg-[#171a21] border border-white/5 text-white rounded-sm p-3 text-xs outline-none focus:border-[#66c0f4]/50 transition-all font-bold placeholder:text-[#4d5254]" 
                            value={myComments[focusedDate] || ''} 
                            onChange={(e) => setMyComments({...myComments, [focusedDate]: e.target.value})} 
                            maxLength={30} 
                          />
                        </div>
                      )}
                    </div>
                  </div>
                )}
                
                <button 
                  onClick={saveSchedule} 
                  className="w-full bg-gradient-to-r from-[#47bfff] to-[#1a44c2] text-white font-black py-5 rounded-sm uppercase tracking-widest shadow-xl active:scale-95 transition-all font-bold text-center"
                >
                  저장하기
                </button>
              </div>
            )}
          </div>
        )}

        {/* ===================== RESULTS VIEW ===================== */}
        {view === 'results' && (
          <div className="w-full max-w-md px-6 animate-in slide-in-from-right-4 duration-500 text-left font-bold text-nowrap font-bold pb-24">
            <div className="mb-10 text-center space-y-2 relative font-bold pt-8">
              <h1 className="text-4xl font-black text-white leading-tight tracking-tighter drop-shadow-2xl whitespace-normal px-6 break-keep text-center font-bold">
                <span className="text-[#66c0f4]">'</span>{roomName || '결과 확인'}<span className="text-[#66c0f4]">'</span>
              </h1>
            </div>
            
            {showFullCalendar && (
              <div className="mb-12 bg-[#1b2838] p-5 rounded-sm shadow-2xl border border-[#66c0f4]/30 animate-in zoom-in-95 duration-200">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-white font-black tracking-tight">{monthName}</h3>
                  <div className="flex gap-4">
                    <button onClick={handlePrevMonth} className="text-[#4d5254] hover:text-[#66c0f4]"><ChevronLeft size={20}/></button>
                    <button onClick={handleNextMonth} className="text-[#4d5254] hover:text-[#66c0f4]"><ChevronRight size={20}/></button>
                  </div>
                </div>
                
                {renderCalendarGrid(true)}

                <div className="flex gap-3 mt-5">
                  <button 
                    onClick={() => setShowFullCalendar(false)} 
                    className="flex-[1] py-3 bg-[#2a475e] text-[#c7d5e0] rounded-sm font-black text-xs uppercase hover:bg-[#3d5a7d] transition-all"
                  >
                    닫기
                  </button>
                  <button 
                    onClick={() => { setView('room'); setShowFullCalendar(false); setStep(2); }} 
                    className="flex-[2] py-3 bg-[#66c0f4] text-[#171a21] rounded-sm font-black text-xs uppercase active:scale-95 transition-all shadow-lg flex items-center justify-center gap-2"
                  >
                    <Edit2 size={14} /> 일정 수정하기
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-8 font-bold text-left font-bold">
              {(() => {
                const totalCount = allParticipants.length; 
                const hasFull = topThreeDates.some(item => item.count === totalCount);
                if (!hasFull && nearPerfectDate) {
                  return (
                    <div className="bg-red-500/10 border-2 border-red-500/30 p-6 rounded-sm shadow-xl flex flex-col gap-4 animate-in zoom-in duration-300 font-bold">
                      <div className="flex items-center gap-3 text-red-500 font-bold">
                        <AlertTriangle size={24} className="animate-bounce" />
                        <span className="text-[11px] font-black uppercase font-bold">조율 긴급 알림</span>
                      </div>
                      <div className="space-y-2 font-bold">
                        <p className="text-white text-lg font-black tracking-tight leading-tight whitespace-normal font-bold">
                          <span className="text-red-400 font-bold">{nearPerfectDate.name}</span>님만 오면 <span className="text-[#66c0f4] font-bold">{nearPerfectDate.date}</span>에 다 모입니다.
                        </p>
                        <p className="text-red-400 text-sm font-bold">친구야 조율해라</p>
                      </div>
                      {nearPerfectDate.name === nickname && (
                        <button 
                          onClick={() => handleAcceptSchedule(nearPerfectDate.dateStr)} 
                          className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-sm uppercase mt-2 border border-white/20 font-bold"
                        >
                          <Check size={18} /> 일정에 동참하기
                        </button>
                      )}
                    </div>
                  );
                } 
                return null;
              })()}

              <div className="space-y-6 font-bold text-left font-bold">
                <div className="flex items-center justify-between pb-3 border-b border-white/10">
                  <h3 className="text-[15px] text-white font-black uppercase tracking-widest flex items-center gap-2 font-bold text-left">
                    <Trophy size={20} className="text-[#66c0f4]" /> 베스트 일정
                  </h3>
                  {!showFullCalendar && (
                    <button 
                      onClick={() => setShowFullCalendar(true)} 
                      className="text-[11px] bg-[#2a475e] text-[#66c0f4] px-3 py-1.5 rounded-sm hover:bg-[#3d5a7d] transition-all font-black flex items-center gap-1 shadow-md"
                    >
                      전체 달력 보기 <CalendarDays size={12} className="ml-0.5" />
                    </button>
                  )}
                </div>
                
                {topThreeDates.map((item, idx) => {
                  const isFull = item.count === allParticipants.length; 
                  const dayComments = roomData.comments?.[item.dateStr] || [];
                  
                  const participantsForDate = getOthersAvailable(item.dateStr);
                  if (selectedDates.includes(item.dateStr)) participantsForDate.push(nickname);

                  return (
                    <div 
                      key={idx} 
                      className={`p-6 rounded-sm border-l-4 shadow-2xl flex flex-col gap-4 font-bold text-left transition-all animate-in slide-in-from-bottom-2 ${isFull ? 'bg-[#1b2838] border-[#47bfff] ring-2 ring-[#47bfff]/20 scale-[1.02] z-10' : 'bg-[#1b2838] border-[#66c0f4] font-bold'}`} 
                      style={{ animationDelay: `${idx * 100}ms` }}
                    >
                      <div className="flex items-start gap-5 text-left font-bold">
                        <div className={`w-12 h-12 rounded-sm flex items-center justify-center font-black text-2xl font-bold shrink-0 ${isFull ? 'bg-[#47bfff] text-[#171a21]' : (idx === 0 ? 'bg-[#66c0f4] text-[#171a21]' : 'bg-[#2a475e] text-[#c7d5e0]')}`}>
                          {idx + 1}
                        </div>
                        <div className="text-left font-bold relative flex-1 font-bold">
                          <p className="text-xl text-white font-black text-left leading-tight font-bold">{item.date}</p>
                          
                          {isFull ? (
                            <div className="inline-flex items-center gap-1.5 bg-[#47bfff]/20 text-[#47bfff] px-2.5 py-1 rounded-sm text-[11px] font-black border border-[#47bfff]/30 mt-2">
                              전원 참여 가능 <Flame size={12} className="text-[#47bfff] animate-pulse" />
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {participantsForDate.map((pName, i) => (
                                <span 
                                  key={i} 
                                  className="px-2 py-1 rounded-sm text-[10px] font-black border shadow-sm" 
                                  style={{ 
                                    backgroundColor: getUserColor(pName) + '26', 
                                    color: getUserColor(pName), 
                                    borderColor: getUserColor(pName) + '4D' 
                                  }}
                                >
                                  {pName} {pName === nickname && <span className="opacity-80 text-[8px]">(나)</span>}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>

                      {dayComments.length > 0 && (
                        <div className="mt-1 space-y-2 border-t border-white/5 pt-4 font-bold">
                          <div className="flex flex-col gap-2">
                            {dayComments.map((c: any, i: number) => (
                              <div key={i} className="flex gap-2 items-center whitespace-normal font-bold">
                                <span 
                                  className="w-2 h-2 rounded-full shrink-0 shadow-sm" 
                                  style={{ backgroundColor: getUserColor(c.name) }}
                                ></span>
                                <span 
                                  className="text-[10px] font-black shrink-0 font-bold"
                                  style={{ color: getUserColor(c.name) }}
                                >
                                  {c.name} :
                                </span>
                                <span className="text-[11px] text-[#c7d5e0]/80 font-bold leading-relaxed font-bold">{c.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 mb-10 items-stretch font-bold pt-8">
                <button 
                  onClick={goToHome} 
                  className="flex-[2] py-6 bg-gradient-to-r from-[#47bfff] to-[#1a44c2] text-white rounded-sm font-black text-sm uppercase shadow-xl active:scale-95 transition-all font-bold"
                >
                  처음으로
                </button>
                <button 
                  onClick={handleShare} 
                  className="flex-[3] py-6 bg-[#1b2838] border border-[#66c0f4]/30 text-[#c7d5e0] rounded-sm font-black text-sm uppercase hover:bg-[#213247] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl font-bold"
                >
                  <Share2 size={20} className="text-[#66c0f4]" /> 
                  <span>초대 링크 복사</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* ===================== TOAST ===================== */}
      {toast.show && (
        <div className="fixed bottom-12 left-1/2 -translate-x-1/2 z-[100] animate-in fade-in slide-in-from-bottom-6 duration-300 font-bold">
          <div className="bg-[#47bfff] text-[#171a21] px-8 py-4 rounded-sm font-black shadow-2xl flex items-center gap-4 border-l-8 border-white font-bold">
            <Info size={20} /> 
            <span className="text-sm font-bold text-nowrap font-bold">
              {toast.message}
            </span>
          </div>
        </div>
      )}

      {/* ===================== STYLES ===================== */}
      <style>{`
        @import url('https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/static/pretendard.css');
        body { 
          font-family: 'Pretendard', sans-serif; 
          letter-spacing: -0.03em; 
          background-color: #171a21; 
          -webkit-tap-highlight-color: transparent; 
        }
        .animate-in { animation: fadeIn 0.4s ease-out; }
        @keyframes fadeIn { 
          from { opacity: 0; transform: translateX(10px); } 
          to { opacity: 1; transform: translateX(0); } 
        }
        .animate-spin-slow { animation: spin 8s linear infinite; }
        @keyframes spin { 
          from { transform: rotate(0deg); } 
          to { transform: rotate(360deg); } 
        }
        @keyframes bounce-subtle { 
          0%, 100% { transform: translateY(0); } 
          50% { transform: translateY(-3px); } 
        }
        .animate-bounce-subtle { animation: bounce-subtle 2s ease-in-out infinite; }
      `}</style>
    </div>
  );
}