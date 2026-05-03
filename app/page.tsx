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
  Trash2
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

  // [기능 추가] 데이터를 완벽하게 리셋하고 홈으로 돌아가는 함수
  const goToHome = () => {
    const newUrl = `${window.location.origin}${window.location.pathname}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);
    
    setView('home');
    setRoomName('');
    setNickname('');
    setSelectedDates([]);
    setMyComments({});
    setCurrentRoomId('');
    setIsEditMode(false);
  };

  useEffect(() => { 
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => { 
      if (!currentUser) signInAnonymously(auth); 
      setUser(currentUser); 
    }); 
    return () => unsubscribe(); 
  }, []);

  // [수정] DB에서 날짜 데이터를 확실히 가져와서 화면에 복구하는 핵심 함수
  const loadRoomDataAndEnter = async (rId: string, nick: string, rName: string) => {
    setCurrentRoomId(rId);
    setNickname(nick);
    if (rName) setRoomName(rName);

    // 주소창 업데이트 (새로고침 대비)
    const newUrl = `${window.location.origin}${window.location.pathname}?roomId=${rId}`;
    window.history.replaceState({ path: newUrl }, '', newUrl);

    // DB 데이터 강제 호출
    const roomDocRef = doc(db, 'artifacts', appId, 'public', 'data', 'rooms', rId);
    const roomSnap = await getDoc(roomDocRef);
    
    if (roomSnap.exists()) {
      const data = roomSnap.data() as any;
      setRoomData(data);
      if (data.name) setRoomName(data.name);

      // 내 날짜 배열 셋팅
      if (data.participants?.[nick]) {
        setSelectedDates(data.participants[nick]);
      } else {
        setSelectedDates([]);
      }

      // 내 코멘트 셋팅
      const oldComments: Record<string, string> = {};
      Object.entries(data.comments || {}).forEach(([date, list]: any) => {
        const myC = list.find((c: any) => c.name === nick);
        if (myC) oldComments[date] = myC.text;
      });
      setMyComments(oldComments);
    } else {
      setSelectedDates([]);
      setMyComments({});
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

      // 앱 최초 로드 시 URL 파라미터 처리
      if (!urlProcessedRef.current) {
        urlProcessedRef.current = true;
        const params = new URLSearchParams(window.location.search);
        const roomIdFromUrl = params.get('roomId');
        
        if (roomIdFromUrl) {
          const joinedMeeting = meetings.find((m: any) => m.id === roomIdFromUrl);
          if (joinedMeeting) {
            // [수정] 이미 참여중이면 데이터 모두 불러와서 바로 달력 화면으로 이동!
            loadRoomDataAndEnter(roomIdFromUrl, joinedMeeting.savedNickname, joinedMeeting.name);
            showMessage("참여 중인 모임으로 자동 이동했습니다.");
          } else {
            // 처음 온 방이면 닉네임 설정창으로!
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

  // 실시간 동기화 (내가 아닌 다른 사람이 수정했을 때 룸 데이터 업데이트)
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

      // 생성 시 주소창에 방 번호 박아주기 (새로고침 방지용)
      const newUrl = `${window.location.origin}${window.location.pathname}?roomId=${newId}`;
      window.history.replaceState({ path: newUrl }, '', newUrl);

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
    if (roomData?.participants?.[nickname]) {
      setSelectedDates(roomData.participants[nickname]);
    } else {
      setSelectedDates([]);
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
      
      // 기존 코멘트 제거 (취소된 날짜 정리)
      Object.keys(mergedComments).forEach(date => { 
        mergedComments[date] = mergedComments[date].filter((c: any) => c.name !== nickname); 
      });

      // 선택된 날짜에 대해서만 코멘트 저장
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
    setSelectedDates(prev => 
      prev.includes(dateStr) 
        ? prev.filter(d => d !== dateStr) 
        : [...prev, dateStr]
    );
    setFocusedDate(dateStr);
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
    const days = [];
    for (let i = 1; i <= getDaysInMonth(year, month); i++) {
      const dateStr = formatDate(year, month, i);
      const count = getOthersAvailable(dateStr).length + (selectedDates.includes(dateStr) ? 1 : 0);
      if (count > 0) {
        days.push({ 
          dateStr, 
          date: `${(month + 1).toString().padStart(2, '0')}월 ${i.toString().padStart(2, '0')}일 (${getDayLabel(year, month, i)})`, 
          count 
        });
      }
    }
    return days.sort((a, b) => b.count - a.count).slice(0, 3);
  }, [currentDate, selectedDates, nickname, roomData]);

  const nearPerfectDate = useMemo(() => {
    const totalCount = allParticipants.length;
    if (totalCount <= 1) return null;
    
    const daysInMonthCount = getDaysInMonth(year, month);
    for (let i = 1; i <= daysInMonthCount; i++) {
      const dateStr = formatDate(year, month, i);
      const count = getOthersAvailable(dateStr).length + (selectedDates.includes(dateStr) ? 1 : 0);
      
      if (count === totalCount - 1) {
        const available = [...getOthersAvailable(dateStr)];
        if (selectedDates.includes(dateStr)) available.push(nickname);
        
        const missing = allParticipants.find(p => !available.includes(p));
        if (missing) {
          return { 
            dateStr, 
            date: `${(month + 1).toString().padStart(2, '0')}월 ${i.toString().padStart(2, '0')}일 (${getDayLabel(year, month, i)})`, 
            name: missing 
          };
        }
      }
    }
    return null;
  }, [allParticipants, selectedDates, nickname, currentDate, roomData]);

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
      // [수정] 방을 클릭했을 때 DB 데이터 동기화 함수 실행!
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
                    placeholder="예: 인수 맛있는거 사주는 모임" 
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
              <div className="mt-12 flex flex-col items-center font-bold">
                <h1 className="text-3xl font-black text-white leading-tight tracking-tighter text-center mb-6 px-4 whitespace-normal font-bold">
                  '{roomName || '무명'}'<br />
                  {entrySource === 'creator' ? '모임이 개설되었습니다' : '모임에 초대되었습니다'}
                </h1>
                
                <div className="w-full bg-[#1b2838] border-t-2 border-[#66c0f4] p-10 rounded-sm shadow-2xl space-y-8 text-center font-bold">
                  <div className="space-y-1 font-bold">
                    <h2 className="text-xl text-white font-black uppercase font-bold">닉네임 설정</h2>
                    <p className="text-xs text-[#c7d5e0]/40 font-bold uppercase tracking-widest font-bold">
                      최대 8자까지 입력 가능합니다 (길게 짓지마라.)
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
                      const othersCount = getOthersAvailable(dateStr).length;
                      const displayCount = othersCount + (isSelected ? 1 : 0);

                      return (
                        <div 
                          key={i} 
                          data-date={dateStr} 
                          onClick={() => toggleDateSelection(dateStr)} 
                          className={`aspect-square relative flex flex-col items-center justify-center rounded-sm transition-all border border-transparent font-bold cursor-pointer overflow-hidden
                          ${isPast ? 'opacity-20 bg-transparent cursor-not-allowed' : 
                            isSelected ? 'bg-[#66c0f4] text-[#171a21] shadow-lg' : 
                            displayCount >= 3 ? 'bg-[#47bfff]/20 text-[#66c0f4]' : 'bg-[#2a3f5a]'}`}
                        >
                          <div className="absolute inset-0 flex flex-col items-center justify-center p-1">
                            {isToday && !isSelected && (
                              <span className="absolute top-1 left-1 w-1 h-1 rounded-full bg-red-400"></span>
                            )}
                            <span className={`text-xs font-black pointer-events-none ${isToday && !isSelected ? 'text-red-400' : ''}`}>
                              {dayNum}
                            </span>
                            {displayCount > 0 && (
                              <span className={`text-[8px] font-black pointer-events-none leading-none mt-0.5 ${isSelected ? 'text-[#171a21]' : 'text-[#66c0f4]'}`}>
                                {displayCount}명
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="bg-[#1b2838] p-6 rounded-sm border border-white/5 min-h-[120px] flex flex-col gap-4 shadow-xl font-bold">
                  {focusedDate ? (
                    <div className="space-y-4 animate-in fade-in duration-300 font-bold text-left font-bold">
                      <span className="text-[10px] text-[#66c0f4] font-black uppercase tracking-widest text-nowrap font-bold">
                        {focusedDate.split('-')[1]}월 {focusedDate.split('-')[2]}일 ({getDayLabel(year, month, parseInt(focusedDate.split('-')[2]))}) 쌉가능한 사람
                      </span>
                      <div className="flex flex-wrap gap-2 text-left font-bold">
                        {selectedDates.includes(focusedDate) && (
                          <div className="bg-[#66c0f4] text-[#171a21] px-3 py-1.5 rounded-sm text-[10px] font-black font-bold">
                            {nickname} (나)
                          </div>
                        )}
                        {getOthersAvailable(focusedDate).map((name, idx) => (
                          <div key={idx} className="bg-[#2a475e] text-white px-3 py-1.5 rounded-sm text-[10px] font-black border border-[#66c0f4]/10 font-bold">
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
                  ) : (
                    <div className="text-center py-6 opacity-30 flex flex-col items-center gap-3 font-bold">
                      <Info size={20} />
                      <p className="text-[10px] font-black uppercase font-bold">날짜를 눌러 의견을 남겨보세요</p>
                    </div>
                  )}
                </div>
                
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
          <div className="w-full max-w-md px-6 animate-in slide-in-from-right-4 duration-500 text-left font-bold text-nowrap font-bold">
            <div className="mb-16 text-center space-y-2 relative font-bold">
              <div className="absolute inset-0 bg-[#66c0f4]/5 blur-3xl rounded-full -z-10 font-bold"></div>
              <p className="text-[10px] text-[#66c0f4] font-black uppercase tracking-[0.4em] mb-2 opacity-50 font-bold">모임 일정 결과</p>
              <h1 className="text-6xl font-black text-white leading-none tracking-tighter drop-shadow-2xl whitespace-normal px-6 break-keep text-center font-bold">
                {roomName || '결과 확인'}
              </h1>
              <div className="flex justify-center items-center gap-4 mt-6 font-bold">
                <div className="h-[1px] w-12 bg-gradient-to-r from-transparent to-[#66c0f4]/30 font-bold"></div>
                <div className="h-1.5 w-1.5 rounded-full bg-[#66c0f4] font-bold"></div>
                <div className="h-[1px] w-12 bg-gradient-to-l from-transparent to-[#66c0f4]/30 font-bold"></div>
              </div>
            </div>
            
            <div className="space-y-12 font-bold text-left font-bold">
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
                        <p className="text-red-400 text-sm font-bold">친구야 죽고싶지 않으면 조율해라</p>
                      </div>
                      {nearPerfectDate.name === nickname && (
                        <button 
                          onClick={() => handleAcceptSchedule(nearPerfectDate.dateStr)} 
                          className="w-full bg-red-600 hover:bg-red-500 text-white font-black py-4 rounded-sm flex items-center justify-center gap-2 shadow-lg active:scale-95 transition-all text-sm uppercase mt-2 border border-white/20 font-bold"
                        >
                          <Check size={18} /> 굴복하기
                        </button>
                      )}
                    </div>
                  );
                } 
                return null;
              })()}

              <div className="space-y-6 font-bold text-left font-bold">
                <h3 className="text-[11px] text-white font-black uppercase tracking-[0.3em] ml-1 flex items-center gap-3 font-bold text-left">
                  <Trophy size={18} className="text-[#66c0f4]" /> 이 날이 베스트다 얘들아
                </h3>
                
                {topThreeDates.map((item, idx) => {
                  const isFull = item.count === allParticipants.length; 
                  const dayComments = roomData.comments?.[item.dateStr] || [];
                  return (
                    <div 
                      key={idx} 
                      className={`p-7 rounded-sm border-l-4 shadow-2xl flex flex-col gap-4 font-bold text-left transition-all animate-in slide-in-from-bottom-2 ${isFull ? 'bg-[#1b2838] border-[#47bfff] ring-2 ring-[#47bfff]/20 scale-[1.02] z-10' : 'bg-[#1b2838] border-[#66c0f4] font-bold'}`} 
                      style={{ animationDelay: `${idx * 100}ms` }}
                    >
                      <div className="flex items-center gap-6 text-left font-bold">
                        <div className={`w-14 h-14 rounded-sm flex items-center justify-center font-black text-3xl font-bold ${isFull ? 'bg-[#47bfff] text-[#171a21]' : (idx === 0 ? 'bg-[#66c0f4] text-[#171a21]' : 'bg-[#2a475e] text-[#c7d5e0]')}`}>
                          {idx + 1}
                        </div>
                        <div className="text-left font-bold relative flex-1 font-bold">
                          <div className="flex items-center gap-2 font-bold">
                            <p className="text-xl text-white font-black text-left leading-tight font-bold">{item.date}</p>
                            {isFull && <Flame size={18} className="text-[#47bfff] animate-pulse" />}
                          </div>
                          <p className={`text-[11px] font-black uppercase text-left tracking-wide mt-1 font-bold ${isFull ? 'text-[#47bfff]' : 'text-[#66c0f4]'}`}>
                            {isFull ? '전원 참여 가능 🔥' : `${item.count}명 참여 가능`}
                          </p>
                        </div>
                      </div>

                      {dayComments.length > 0 && (
                        <div className="mt-2 space-y-2 border-t border-white/5 pt-4 font-bold">
                          <div className="flex flex-col gap-2">
                            {dayComments.map((c: any, i: number) => (
                              <div key={i} className="flex gap-2 items-start whitespace-normal font-bold">
                                <span className="text-[10px] text-[#66c0f4] font-black shrink-0 mt-0.5 font-bold">[{c.name}]</span>
                                <span className="text-[11px] text-[#c7d5e0]/60 font-bold leading-relaxed font-bold">{c.text}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-4 mb-10 items-stretch font-bold pt-12">
                <button 
                  onClick={goToHome} 
                  className="flex-[2] py-7 bg-gradient-to-r from-[#47bfff] to-[#1a44c2] text-white rounded-sm font-black text-sm uppercase shadow-xl active:scale-95 transition-all font-bold"
                >
                  처음으로
                </button>
                <button 
                  onClick={handleShare} 
                  className="flex-[3] py-7 bg-[#1b2838] border border-[#66c0f4]/30 text-[#c7d5e0] rounded-sm font-black text-sm uppercase hover:bg-[#213247] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl font-bold"
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