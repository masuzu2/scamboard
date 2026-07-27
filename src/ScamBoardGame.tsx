import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ShieldAlert, ShieldCheck, Gift, Trophy, TerminalSquare, Play, Dices, 
  Zap, Users, Globe, Cpu, Skull, Flame, Coins, Clock, 
  Fingerprint, Activity, Hexagon, ChevronRight,
  Share2, Shield, Lock, ArrowLeftRight, UserX, Volume2, VolumeX, HelpCircle, MapPin
} from 'lucide-react';
import WebGLDiceOverlay from './WebGLDice';
import { io, Socket } from 'socket.io-client';
import { cyberCards, bonusCards, SHOP_ITEMS, SCAMMER_TAUNTS, type Tile, type TileType, type Player as BasePlayer } from './gameData';

// ponytail: yagni - replaced clsx/twMerge with native array join. No generic UI library means no conflicts to merge.
function cn(...inputs: (string | undefined | null | false)[]) { return inputs.filter(Boolean).join(' '); }

type Player = BasePlayer & { items: string[], isSkipped: boolean, isProtected: boolean, plusRoll: number, consecutive: number, badges: string[], finishOrder?: number };

const AvatarMap: Record<string, string> = {
  'Cyber Security Expert': '/characters/Cyber Security Expert.png',
  'Detective': '/characters/Detective.png',
  'Ethical Hacker': '/characters/Ethical Hacker.png',
  'Programmer': '/characters/Programmer.png',
  'Robot Assistant': '/characters/Robot Assistant.png',
  'Student': '/characters/Student.png',
};

const avatarKeys = Object.keys(AvatarMap);

// --- AUDIO ENGINE (PRO MAX) ---
const AudioEngine = {
  ctx: null as AudioContext | null,
  masterGain: null as GainNode | null,
  bgmOsc: null as OscillatorNode | null,
  bgmInterval: null as any,
  isMuted: false,

  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = 0.3; // Default volume
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },

  playTone(freq: number, type: OscillatorType, duration: number, vol: number = 0.1, slideTo?: number) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
      if (slideTo) {
         osc.frequency.exponentialRampToValueAtTime(slideTo, this.ctx.currentTime + duration);
      }
      
      gain.gain.setValueAtTime(vol, this.ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
      
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch(e) {}
  },

  startBGM() {
    if (!this.ctx || this.bgmInterval || this.isMuted) return;
    this.init();
    
    // Cyberpunk procedural bassline (C minor pentatonic)
    const notes = [65.41, 65.41, 77.78, 65.41, 98.00, 65.41, 116.54, 77.78];
    let step = 0;
    
    this.bgmInterval = setInterval(() => {
       if (this.isMuted) return;
       const freq = notes[step % notes.length];
       this.playTone(freq, 'sawtooth', 0.15, 0.05);
       
       // Add hi-hats on offbeats
       if (step % 2 !== 0) {
          this.playTone(8000, 'square', 0.05, 0.01);
       }
       
       step++;
    }, 250); // 120 BPM 8th notes
  },

  stopBGM() {
    if (this.bgmInterval) {
      clearInterval(this.bgmInterval);
      this.bgmInterval = null;
    }
  },

  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) this.stopBGM();
    else this.startBGM();
    return this.isMuted;
  },

  playClick() { this.playTone(1200, 'sine', 0.05, 0.05); },
  playGlitch() { 
    this.playTone(150, 'sawtooth', 0.1, 0.2, 50); 
    setTimeout(() => this.playTone(80, 'square', 0.1, 0.2), 50); 
  },
  playCoin() { 
    this.playTone(1200, 'sine', 0.1, 0.1); 
    setTimeout(() => this.playTone(1600, 'sine', 0.2, 0.1), 100); 
  },
  playDice() { 
    for(let i=0; i<4; i++) setTimeout(() => this.playTone(300 + Math.random()*200, 'square', 0.05, 0.05), i*80);
  },
  playMove() { this.playTone(400, 'triangle', 0.1, 0.05, 600); },
  playCorrect() { 
    this.playTone(523.25, 'sine', 0.1, 0.1); 
    setTimeout(() => this.playTone(659.25, 'sine', 0.1, 0.1), 100); 
    setTimeout(() => this.playTone(783.99, 'sine', 0.3, 0.1), 200); 
  },
  playWrong() { 
    this.playTone(200, 'sawtooth', 0.3, 0.1, 150); 
    setTimeout(() => this.playTone(150, 'sawtooth', 0.4, 0.1, 100), 200); 
  },
  playWin() { 
    [523.25, 659.25, 783.99, 1046.50, 1318.51].forEach((f, i) => setTimeout(() => this.playTone(f, 'square', 0.2, 0.1), i * 120)); 
  },
  playItem() { 
    this.playTone(800, 'square', 0.1, 0.1, 1200); 
    setTimeout(() => this.playTone(1200, 'square', 0.2, 0.1, 1600), 100); 
  },
  playBoss() { 
    this.playTone(100, 'sawtooth', 0.5, 0.3, 50); 
    setTimeout(() => this.playTone(80, 'sawtooth', 0.8, 0.4, 30), 200); 
  }
};



const MemoizedTile = React.memo(({ tile }: { tile: Tile }) => {
  const d = TILE_DATA[tile.type] ?? TILE_DATA.start;

  // Create a stunning glassmorphism effect using transparent hex colors
  const glassBg = `${d.mid}80`; // 50% opacity color
  const extrude = `${d.lo}cc`; // 80% opacity extrusion

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className={cn("absolute flex items-center justify-center flex-col transition-transform hover:scale-105 group backdrop-blur-md", d.iconCls)}
      style={{ 
        width: TILE_SIZE, 
        height: TILE_SIZE, 
        left: tile.x, 
        top: tile.y, 
        zIndex: 10,
        borderRadius: '24px', 
        // Acrylic Glass Look
        background: `linear-gradient(145deg, rgba(255,255,255,0.15) 0%, ${glassBg} 40%, rgba(0,0,0,0.2) 100%)`,
        borderTop: `2px solid rgba(255,255,255,0.7)`,
        borderLeft: `1.5px solid rgba(255,255,255,0.4)`,
        borderRight: `1px solid rgba(255,255,255,0.1)`,
        borderBottom: `1px solid rgba(0,0,0,0.3)`,
        transform: `translateY(-10px)`, 
        // Glass extrusion and glowing neon shadows
        boxShadow: `
          inset 0 0 20px ${d.glow},
          0px 2px 0 ${extrude},
          0px 4px 0 ${extrude},
          0px 6px 0 ${extrude},
          0px 8px 0 ${extrude},
          0px 10px 0 ${extrude},
          0px 12px 0 ${extrude},
          0px 14px 20px rgba(0,0,0,0.8),
          0px 15px 30px ${d.glow}
        `,
      }}
      id={`tile-${tile.index}`}
    >
      <div className="absolute top-3 left-3 text-[14px] opacity-90 font-mono font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
        {String(tile.index).padStart(2, '0')}
      </div>
      
      {/* Straight 2D floating icon - glowing inside the glass */}
      <div style={{ filter: `drop-shadow(0 5px 10px rgba(0,0,0,0.5)) drop-shadow(0 0 15px ${d.glow})` }}>
        {tile.type === 'start'    && <Play        className="w-10 h-10 opacity-90" />}
        {tile.type === 'finish'   && <Trophy      className="w-10 h-10 opacity-90" />}
        {tile.type === 'cyber'    && <ShieldAlert className="w-10 h-10 opacity-90" />}
        {tile.type === 'safe'     && <ShieldCheck className="w-10 h-10 opacity-90" />}
        {tile.type === 'bonus'    && <Gift        className="w-10 h-10 opacity-90" />}
        {tile.type === 'help'     && <Cpu         className="w-10 h-10 opacity-90" />}
        {tile.type === 'firewall' && <Lock        className="w-10 h-10 opacity-90 animate-pulse" />}
        {tile.type === 'shop'     && <Hexagon     className="w-10 h-10 opacity-90" />}
      </div>
      
      {/* Holographic Tooltip (Visible on Hover) */}
      <div className="absolute -top-16 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none flex flex-col items-center" style={{ transform: 'translateZ(30px)' }}>
        <div className="bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs p-2 rounded-lg shadow-[0_0_15px_rgba(0,0,0,0.8)] min-w-[120px] text-center">
          <div className="font-bold text-[13px] mb-1" style={{ color: d.hi }}>{d.name || tile.type}</div>
          <div className="text-[10px] opacity-80 leading-tight">{d.desc || 'A tile on the board.'}</div>
        </div>
        <div className="w-0 h-0 border-l-[6px] border-l-transparent border-r-[6px] border-r-transparent border-t-[6px] border-t-black/80" />
      </div>
      
      {/* Subtle glossy overlay */}
      <div className="absolute inset-0 rounded-[16px] pointer-events-none" style={{ background: 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, transparent 50%)' }} />
    </motion.div>
  );
}, () => true);

// --- DATA CONSTANTS ---
const BOARD_SIZE = 28;
const playerColors = ['bg-pink-500', 'bg-blue-500', 'bg-violet-500', 'bg-emerald-500', 'bg-amber-500', 'bg-red-500'];
const playerGlows = ['shadow-[0_0_15px_rgba(236,72,153,0.8)]', 'shadow-[0_0_15px_rgba(6,182,212,0.8)]', 'shadow-[0_0_15px_rgba(139,92,246,0.8)]', 'shadow-[0_0_15px_rgba(16,185,129,0.8)]', 'shadow-[0_0_15px_rgba(245,158,11,0.8)]', 'shadow-[0_0_15px_rgba(244,63,94,0.8)]'];
const TILE_SIZE = 120;
const TILE_GAP = 30; // increased for 3D
const COLS = 7;



const generateBoard = (): Tile[] => {
  const board: Tile[] = [];
  const types: TileType[] = [];
  const middleSize = BOARD_SIZE - 2;
  
  // Distribute tile types
  for (let i = 0; i < Math.floor(middleSize * 0.37); i++) types.push('cyber');
  for (let i = 0; i < Math.floor(middleSize * 0.25); i++) types.push('safe');
  for (let i = 0; i < Math.floor(middleSize * 0.18); i++) types.push('bonus');
  for (let i = 0; i < Math.floor(middleSize * 0.08); i++) types.push('help');
  for (let i = 0; i < 3; i++) types.push('shop'); // ✅ Shop tiles exist now
  while (types.length < middleSize) types.push('safe'); 
  
  // Shuffle
  for (let i = types.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [types[i], types[j]] = [types[j], types[i]];
  }

  // Force firewalls at strategic checkpoints
  const fw1 = Math.floor(middleSize * 0.3);
  const fw2 = Math.floor(middleSize * 0.7);
  types[fw1] = 'firewall';
  types[fw2] = 'firewall';

  const allTypes: TileType[] = ['start', ...types, 'finish'];

  for (let i = 0; i < BOARD_SIZE; i++) {
    const row = Math.floor(i / COLS);
    const col = row % 2 === 0 ? i % COLS : (COLS - 1) - (i % COLS);
    board.push({ index: i, type: allTypes[i], x: col * (TILE_SIZE + TILE_GAP), y: row * (TILE_SIZE + TILE_GAP) });
  }
  return board;
};

// Timer Component to prevent full app re-render every second
const CyberTimer = React.memo(({ expiresAt, isMyTurn, onTimeout }: { expiresAt: number, isMyTurn: boolean, onTimeout: () => void }) => {
   const [timeLeft, setTimeLeft] = useState(() => Math.max(0, Math.ceil((expiresAt - Date.now() + Math.random()) / 1000)));
   const onTimeoutRef = React.useRef(onTimeout);
   React.useEffect(() => { onTimeoutRef.current = onTimeout; }, [onTimeout]);

   useEffect(() => {
      const interval = setInterval(() => {
         const remaining = Math.max(0, Math.ceil((expiresAt - Date.now() + Math.random()) / 1000));
         setTimeLeft(remaining);
         if (remaining <= 0) {
            clearInterval(interval);
            if (isMyTurn) onTimeoutRef.current();
         }
      }, 500);
      return () => clearInterval(interval);
   }, [expiresAt, isMyTurn]);

   return (
      <div className={cn("text-2xl font-mono font-black flex items-center gap-3 px-4 py-1 rounded", timeLeft <= 3 ? "bg-red-500/20 text-red-500 animate-glitch" : "text-white")}>
         <Clock className="w-6 h-6" /> 00:{timeLeft.toString().padStart(2, '0')}
      </div>
   );
});

// ============================================================
// MEMOIZED TILE — Ponytail flat block
// ============================================================

const TILE_DATA: Record<TileType, any> = {
  start:    { hi:'#94a3b8', mid:'#475569', lo:'#1e293b', glow:'rgba(148,163,184,0.15)', iconCls:'text-slate-300' },
  finish:   { hi:'#f472b6', mid:'#db2777', lo:'#831843', glow:'rgba(244,114,182,0.15)', iconCls:'text-pink-200', name:'Finish Line', desc:'Reach here to win!'  },
  cyber:    { hi:'#f87171', mid:'#dc2626', lo:'#7f1d1d', glow:'rgba(248,113,113,0.15)', iconCls:'text-red-200', name:'Cyber Threat', desc:'Danger! Lose money or items.'   },
  safe:     { hi:'#38bdf8', mid:'#0284c7', lo:'#0c4a6e', glow:'rgba(56,189,248,0.15)',  iconCls:'text-sky-200', name:'Safe Zone', desc:'A secure checkpoint.'   },
  bonus:    { hi:'#fbbf24', mid:'#d97706', lo:'#78350f', glow:'rgba(251,191,36,0.15)',  iconCls:'text-amber-200', name:'Bonus', desc:'Draw a bonus card!' },
  help:     { hi:'#34d399', mid:'#059669', lo:'#064e3b', glow:'rgba(52,211,153,0.15)',  iconCls:'text-emerald-200', name:'Help Desk', desc:'Get assistance and tips.'},
  firewall: { hi:'#fb923c', mid:'#ea580c', lo:'#7c2d12', glow:'rgba(251,146,60,0.15)',  iconCls:'text-orange-200', name:'Firewall', desc:'Stops the next cyber attack.'},
  shop:     { hi:'#a78bfa', mid:'#7c3aed', lo:'#4c1d95', glow:'rgba(167,139,250,0.15)', iconCls:'text-violet-200', name:'Dark Web Shop', desc:'Buy upgrades and defenses.'},
};





const Particles = React.memo(({ count = 20, color = "#00E5FF", startType = "center" }: { count?: number, color?: string, startType?: string }) => (
  <div className="absolute inset-0 pointer-events-none z-50 overflow-hidden">
    {Array.from({ length: count }).map((_, i) => (
      <motion.div key={i}
        initial={{ x: startType === "center" ? "50%" : `${Math.random() * 100}%`, y: startType === "center" ? "50%" : "-10%", scale: 0, opacity: 1 }}
        animate={{ 
           x: startType === "center" ? `calc(50% + ${(Math.random() - 0.5) * 400}px)` : `${Math.random() * 100}%`, 
           y: startType === "center" ? `calc(50% + ${(Math.random() - 0.5) * 400}px)` : "110%", 
           scale: Math.random() * 2.5, opacity: 0, rotate: Math.random() * 360 
        }}
        transition={{ duration: startType === "rain" ? 1.5 + Math.random() * 1.5 : 0.8 + Math.random() * 0.5, ease: "easeOut" }}
        className="absolute w-3 h-3 rounded-full" style={{ backgroundColor: color }}
      />
    ))}
  </div>
));

const FloatingText = React.memo(({ text, color, x, y, onComplete }: { text: string, color: string, x: number, y: number, onComplete: () => void }) => (
  <motion.div 
     initial={{ opacity: 0, y: y, x: x, scale: 0.5 }}
     animate={{ opacity: [0, 1, 0], y: y - 100, scale: 1.5 }}
     transition={{ duration: 1.5, ease: "easeOut" }}
     onAnimationComplete={onComplete}
     className="fixed z-[200] font-black text-2xl pointer-events-none" style={{ color, textShadow: `0 0 10px ${color}` }}
  >
     {text}
  </motion.div>
));

export default function ScamBoardGame() {
  const [s, setS] = useState({
    view: 'menu' as 'menu' | 'setup' | 'playing' | 'finished' | 'gameover_boss',
    mode: 'race' as 'race' | 'score',
    players: [] as Player[],
    currentPlayerIndex: 0,
    board: [] as Tile[],
    usedCyber: [] as number[],
    usedBonus: [] as number[],
    turnPhase: 'idle' as 'idle' | 'rolling' | 'moving' | 'resolvingEvent' | 'turnEnd',
    diceValue: 1,
    activeEvent: null as any,
    bossHealth: 0,
    roundCount: 1,
  });

  const [socket, setSocket] = useState<Socket | null>(null);
  const [roomCode, setRoomCode] = useState('');
  const [isHost, setIsHost] = useState(true);
  const [localPlayerId, setLocalPlayerId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{msg: string, type: 'success'|'error'|'info'} | null>(null);
  const [particles, setParticles] = useState<{key: number, color: string, type: string} | null>(null);
  const [floatingTexts, setFloatingTexts] = useState<{id: number, text: string, color: string, x: number, y: number}[]>([]);
  const [joinInput, setJoinInput] = useState('');
  const [showShop, setShowShop] = useState(false);
  const [isShaking, setIsShaking] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [showTutorial, setShowTutorial] = useState(false);
  
  const [setupPlayers, setSetupPlayers] = useState([{ name: 'คุณตา/คุณยาย', avatar: avatarKeys[0], color: playerColors[0], glow: playerGlows[0] }]);

  const stateRef = useRef(s);
  useEffect(() => { stateRef.current = s; }, [s]);

  const updateS = (updater: typeof s | ((prev: typeof s) => typeof s)) => {
    setS(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      if (socket && roomCode) {
        socket.emit('sync_state', { roomCode, state: next });
      }
      return next;
    });
  };

  const updateViewTransition = (updater: typeof s | ((prev: typeof s) => typeof s)) => {
    if ((document as any).startViewTransition) {
      (document as any).startViewTransition(() => updateS(updater));
    } else {
      updateS(updater);
    }
  };

  useEffect(() => {
    // ✅ Fix: use env var for deploy, fall back to localhost for dev
    const serverUrl = (import.meta as any).env?.VITE_SERVER_URL || 'http://localhost:3001';
    const newSocket = io(serverUrl);
    setSocket(newSocket);
    newSocket.on('state_update', (newState) => {
      if ((document as any).startViewTransition && newState.view !== s.view) {
         (document as any).startViewTransition(() => setS(newState));
      } else {
         setS(newState);
      }
    });
    return () => { newSocket.disconnect(); };
  }, []);


  // Camera: pan board so active tile is centered on screen, in a 2.5D space
  const activeTileForCamera = s.board[s.players[s.currentPlayerIndex]?.position || 0];
  const targetX = activeTileForCamera ? -(activeTileForCamera.x + TILE_SIZE / 2) : 0;
  const targetY = activeTileForCamera ? -(activeTileForCamera.y + TILE_SIZE / 2) : 0;

  const createRoom = () => {
    if (socket) {
      socket.emit('create_room', (res: any) => {
        setRoomCode(res.roomCode);
        setIsHost(true);
        setLocalPlayerId('p0');
        updateViewTransition({ ...s, view: 'setup' });
      });
    } else {
      // Solo mode: go straight to setup
      setLocalPlayerId('p0');
      updateViewTransition({ ...s, view: 'setup' });
    }
  };

  const showTutorialPopup = () => {
    setShowTutorial(true);
  };

  const joinRoom = () => {
    if (socket && joinInput) {
      socket.emit('join_room', joinInput, (res: any) => {
        if (res.success) {
          setRoomCode(joinInput.toUpperCase());
          setIsHost(false);
          setS(res.state);
          const nextId = `p${res.state.players.length || setupPlayers.length}`;
          setLocalPlayerId(nextId);
        } else {
          showToast('Room not found', 'error');
        }
      });
    }
  };

  const showToast = (msg: string, type: 'success'|'error'|'info' = 'info') => {
    setToastMessage({msg, type});
    setTimeout(() => setToastMessage(null), 3000);
  };

  const addFloatingText = (text: string, color: string) => {
     setFloatingTexts(prev => [...prev, { id: Date.now() + Math.random(), text, color, x: window.innerWidth / 2, y: window.innerHeight / 2 }]);
  };

  const triggerShake = () => {
     setIsShaking(true);
     setTimeout(() => setIsShaking(false), 500);
  };

  const startGame = () => {
    AudioEngine.init();
    AudioEngine.playWin();
    AudioEngine.startBGM();
    const savedBadgesStr = localStorage.getItem('scamboard_badges');
    const globalBadges = savedBadgesStr ? JSON.parse(savedBadgesStr) : [];
    
    const initializedPlayers = setupPlayers.map((p, i) => {
      const randomItems = [
         SHOP_ITEMS[Math.floor(Math.random() * SHOP_ITEMS.length)]!.id,
         SHOP_ITEMS[Math.floor(Math.random() * SHOP_ITEMS.length)]!.id
      ];
      return {
        id: `p${i}`, name: p.name, avatar: p.avatar, color: p.color, glow: p.glow,
        position: 0, coins: 5, hasLifeline: false, finished: false,
        items: randomItems, isSkipped: false, isProtected: false, plusRoll: 0, consecutive: 0, badges: globalBadges,
        finishOrder: undefined as number | undefined,
      };
    });
    // ✅ Ensure localPlayerId is always set for solo play
    if (!localPlayerId) setLocalPlayerId('p0');
    
    setShowTutorial(false);
    updateViewTransition(prev => ({
      ...prev,
      view: 'playing',
      players: initializedPlayers,
      board: generateBoard(),
      currentPlayerIndex: 0,
      turnPhase: 'idle',
      bossHealth: 0,
      roundCount: 1
    }));
  };

  const rollDice = () => {
    if (s.turnPhase !== 'idle') return;
    if (s.players[s.currentPlayerIndex]!.isSkipped) {
      showToast(`${s.players[s.currentPlayerIndex]!.name} is DDOS'd! Turn skipped.`, 'error');
      AudioEngine.playGlitch();
      updateS(prev => {
        const np = JSON.parse(JSON.stringify(prev.players)) as Player[];
        np[prev.currentPlayerIndex].isSkipped = false;
        return { ...prev, turnPhase: 'turnEnd', players: np };
      });
      setTimeout(() => endTurn(), 2000);
      return;
    }

    AudioEngine.init(); 
    const baseRoll = Math.floor(Math.random() * 6) + 1;
    const bonus = s.players[s.currentPlayerIndex]!.plusRoll;
    const finalRoll = baseRoll + bonus;

    updateS(prev => {
       const np = JSON.parse(JSON.stringify(prev.players)) as Player[];
       np[prev.currentPlayerIndex].plusRoll = 0;
       return { ...prev, diceValue: finalRoll, players: np, turnPhase: 'rolling' };
    });
    
    if (bonus > 0) addFloatingText(`+${bonus} GUARDIAN BONUS`, '#00E5FF');
  };

  const movePlayer = (steps: number) => {
    let currentStep = 0;
    // ✅ Fix: use ref to track firewall stop — closure over loop state was always false
    const stoppedRef = { value: false };
    const moveInterval = setInterval(() => {
      if (stoppedRef.value) { clearInterval(moveInterval); return; }
      currentStep++;
      AudioEngine.playMove();
      updateS(prev => {
        const newPlayers = JSON.parse(JSON.stringify(prev.players)) as Player[];
        const p = newPlayers[prev.currentPlayerIndex]!;
        if (p.position < BOARD_SIZE - 1) p.position += 1;
        // ❌ Removed firewall hard-stop checkpoint logic
        return { ...prev, players: newPlayers };
      });
      
      if (currentStep >= steps || stoppedRef.value) {
        clearInterval(moveInterval);
        setTimeout(() => resolveTileEvent(), 600);
      }
    }, 400); 
  };

  const resolveTileEvent = () => {
    const currentState = stateRef.current;
    const p = currentState.players[currentState.currentPlayerIndex]!;
    const tile = currentState.board[p.position]!;
    let nextState = { ...currentState, turnPhase: 'resolvingEvent' as any };
    
    if (p.position === BOARD_SIZE - 1) {
      const finishedCount = currentState.players.filter((pl: Player) => pl.finished).length;
      const newPlayers = JSON.parse(JSON.stringify(currentState.players)) as Player[];
      newPlayers[currentState.currentPlayerIndex]!.finished = true;
      (newPlayers[currentState.currentPlayerIndex]! as any).finishOrder = finishedCount + 1;
      if (!newPlayers[currentState.currentPlayerIndex]!.badges.includes('MAINFRAME HACKER')) {
         newPlayers[currentState.currentPlayerIndex]!.badges.push('MAINFRAME HACKER');
      }
      AudioEngine.playWin();
      setParticles({ key: Date.now() + Math.random(), color: '#FFD600', type: 'center' });
      showToast(`${p.name} REACHED MAINFRAME! 🏁`, 'success');
      updateS({ ...nextState, players: newPlayers });
      setTimeout(() => endTurn(), 2000);
      return;
    }

    if (tile.type === 'safe') {
      AudioEngine.playCoin();
      const newPlayers = JSON.parse(JSON.stringify(currentState.players)) as Player[];
      newPlayers[currentState.currentPlayerIndex]!.coins += 1;
      setParticles({ key: Date.now() + Math.random(), color: '#FFD600', type: 'rain' });
      addFloatingText("+1 COIN", "#FFD600");
      updateS({ ...nextState, players: newPlayers });
      setTimeout(() => endTurn(), 1500);
      return;
    } else if (tile.type === 'cyber' || tile.type === 'firewall') {
      if (p.isProtected) {
        AudioEngine.playItem();
        showToast("VPN BLOCKED THE ATTACK! 🛡️", 'success');
        const newPlayers = JSON.parse(JSON.stringify(currentState.players)) as Player[];
        newPlayers[currentState.currentPlayerIndex]!.isProtected = false;
        
        // If it was a firewall, they used their VPN to bypass it, so let's turn it into a safe tile!
        let nextBoard = currentState.board;
        if (tile.type === 'firewall') {
           nextBoard = [...currentState.board];
           nextBoard[p.position] = { ...tile, type: 'safe', label: 'HACKED NODE' };
        }
        
        updateS({ ...nextState, players: newPlayers, board: nextBoard });
        setTimeout(() => endTurn(), 2000);
        return;
      }

      AudioEngine.playGlitch();
      let availableIds = cyberCards.map(c => c.id).filter(id => !currentState.usedCyber.includes(id));
      if (availableIds.length === 0) availableIds = cyberCards.map(c => c.id);
      const randomId = availableIds[Math.floor(Math.random() * availableIds.length)]!;
      const card = cyberCards.find(c => c.id === randomId);
      
      const taunt = tile.type === 'firewall' ? "FIREWALL DETECTED: ACCESS DENIED. INITIATING COUNTERMEASURES..." : SCAMMER_TAUNTS[Math.floor(Math.random() * SCAMMER_TAUNTS.length)];

      if (p.hasLifeline) {
         updateS({ ...nextState, usedCyber: [...currentState.usedCyber, randomId], activeEvent: { type: 'help', data: { card, step: 'askLifeline', isFirewall: tile.type === 'firewall' } } });
      } else {
         updateS({ ...nextState, usedCyber: [...currentState.usedCyber, randomId], activeEvent: { type: 'cyber', data: card, taunt, betActive: false, expiresAt: Date.now() + Math.random() + 10999, isFirewall: tile.type === 'firewall' } });
      }
      return;
    } else if (tile.type === 'bonus') {
      let availableIds = bonusCards.map(c => c.id).filter(id => !currentState.usedBonus.includes(id));
      if (availableIds.length === 0) availableIds = bonusCards.map(c => c.id);
      const randomId = availableIds[Math.floor(Math.random() * availableIds.length)]!;
      const card = bonusCards.find(c => c.id === randomId);
      updateS({ ...nextState, usedBonus: [...currentState.usedBonus, randomId], activeEvent: { type: 'bonus', data: card } });
      return;
    } else if (tile.type === 'help') {
      AudioEngine.playCoin();
      const newPlayers = JSON.parse(JSON.stringify(currentState.players)) as Player[];
      newPlayers[currentState.currentPlayerIndex]!.hasLifeline = true;
      setParticles({ key: Date.now() + Math.random(), color: '#00E5FF', type: 'center' }); 
      addFloatingText("TEAM CONSULT", "#00E5FF");
      updateS({ ...nextState, players: newPlayers });
      setTimeout(() => endTurn(), 1500);
      return;
    } else if (tile.type === 'shop') {
      // Landing on shop tile — open shop automatically
      AudioEngine.playItem();
      setShowShop(true);
      addFloatingText("BLACK MARKET", "#A78BFA");
      setParticles({ key: Date.now() + Math.random(), color: '#A78BFA', type: 'center' });
      updateS(nextState);
      return;
    }
    
    updateS(nextState);
    endTurn();
  };


  const endTurn = () => {
    updateViewTransition(prev => {
      if (prev.bossHealth >= 100) {
         AudioEngine.playBoss();
         return { ...prev, activeEvent: null, turnPhase: 'turnEnd', view: 'gameover_boss' };
      }

      const checkGameOver = () => {
        const allFinished = prev.players.every(p => p.finished);
        const anyoneFinished = prev.players.some(p => p.finished);
        if (prev.mode === 'race' && anyoneFinished) return true;
        if (prev.mode === 'score' && allFinished) return true;
        return false;
      };

      if (checkGameOver()) {
        AudioEngine.playWin();
        return { ...prev, activeEvent: null, turnPhase: 'turnEnd', view: 'finished' };
      }

      let nextIdx = (prev.currentPlayerIndex + 1) % prev.players.length;
      let newRoundCount = prev.roundCount;
      if (nextIdx === 0) newRoundCount++;
      
      let loops = 0;
      while (prev.players[nextIdx].finished && loops < prev.players.length) {
        nextIdx = (nextIdx + 1) % prev.players.length;
        if (nextIdx === 0) newRoundCount++;
        loops++;
      }
      return { ...prev, activeEvent: null, turnPhase: 'idle', currentPlayerIndex: nextIdx, roundCount: newRoundCount };
    });
  };

  const handleCyberAnswer = (isOptionA: boolean, usedHelp: boolean = false, isTimeout: boolean = false) => {
    const currentState = stateRef.current;
    if (currentState.activeEvent?.type !== 'cyber') return;
    const { data: card, betActive, isFirewall, taunt } = currentState.activeEvent;
    
    const ans = isOptionA ? 'A' : 'B';
    const isCorrect = !isTimeout && ans === card.correct;
    const newPlayers = JSON.parse(JSON.stringify(currentState.players)) as Player[];
    const p = newPlayers[currentState.currentPlayerIndex]!;
    let newBossHealth = currentState.bossHealth;
    let nextBoard = currentState.board;

    const multiplier = betActive ? 2 : 1;
    
    if (isCorrect) {
      AudioEngine.playCorrect();
      const coinsWon = card.resultCorrect * multiplier;
      newPlayers[currentState.currentPlayerIndex]!.coins += coinsWon;
      newPlayers[currentState.currentPlayerIndex]!.consecutive += 1;
      newBossHealth = Math.max(0, newBossHealth - 5); // Counter-Hack Boss!
      
      if (isFirewall) {
         nextBoard = [...currentState.board];
         nextBoard[p.position] = { ...nextBoard[p.position]!, type: 'safe', label: 'HACKED NODE' };
         addFloatingText("FIREWALL BREACHED!", "#F97316");
      } else if (newPlayers[currentState.currentPlayerIndex]!.consecutive === 3) {
         if (!newPlayers[currentState.currentPlayerIndex]!.badges.includes('CYBER GUARDIAN')) {
            newPlayers[currentState.currentPlayerIndex]!.badges.push('CYBER GUARDIAN');
            localStorage.setItem('scamboard_badges', JSON.stringify(newPlayers[currentState.currentPlayerIndex]!.badges));
         }
         newPlayers[currentState.currentPlayerIndex]!.plusRoll = 1;
         addFloatingText("CYBER GUARDIAN!", "#00E5FF");
      } else {
         addFloatingText(`+${coinsWon} COINS`, "#FFD600");
      }

      setParticles({ key: Date.now() + Math.random(), color: '#00E5FF', type: 'center' });
    } else {
      AudioEngine.playWrong();
      triggerShake();
      
      // Boss AI Difficulty scaling: Threat Level increases with roundCount
      const threatMultiplier = 1 + (currentState.roundCount * 0.2); // +20% threat per round
      const damageToBossHealth = Math.floor(15 * threatMultiplier);
      
      newBossHealth = Math.min(100, newBossHealth + damageToBossHealth);
      
      // ✅ Fix: resultWrong is already negative in gameData, Math.abs was double-negating
      const coinsLost = Math.floor((card.resultWrong < 0 ? Math.abs(card.resultWrong) : card.resultWrong) * multiplier);
      newPlayers[currentState.currentPlayerIndex]!.coins = Math.max(0, newPlayers[currentState.currentPlayerIndex]!.coins - coinsLost);
      newPlayers[currentState.currentPlayerIndex]!.consecutive = 0;
      addFloatingText(`-${coinsLost} COINS`, "#FF007F");
    }
    
    if (usedHelp) newPlayers[currentState.currentPlayerIndex]!.hasLifeline = false;
    updateS({ ...currentState, players: newPlayers, board: nextBoard, bossHealth: newBossHealth, activeEvent: { type: 'cyber_result', data: { isCorrect, isTimeout, explanation: card.explanation, taunt } } });
  };

  const handleBonusAnswer = (idx: number) => {
    const currentState = stateRef.current;
    const card = currentState.activeEvent?.data;
    if (!card) return;
    const isCorrect = idx === card.correct;
    const newPlayers = JSON.parse(JSON.stringify(currentState.players)) as Player[];
    
    let grantedItem = null;
    if (isCorrect) {
      AudioEngine.playCorrect();
      const randomItem = SHOP_ITEMS[Math.floor(Math.random() * SHOP_ITEMS.length)]!;
      newPlayers[currentState.currentPlayerIndex]!.items.push(randomItem.id);
      grantedItem = randomItem;
      setParticles({ key: Date.now() + Math.random(), color: '#7B2CBF', type: 'rain' });
      addFloatingText(`ได้รับไอเทม: ${randomItem.name}`, "#A78BFA");
    } else {
      AudioEngine.playWrong();
    }
    updateS({ ...currentState, players: newPlayers, activeEvent: { type: 'bonus_result', data: { isCorrect, explanation: card.explanation, grantedItem } } });
  };

  const buyItem = (item: any) => {
    updateS(prev => {
      const p = prev.players[prev.currentPlayerIndex]!;
      if (p.coins >= item.cost) {
        AudioEngine.playItem();
        const np = JSON.parse(JSON.stringify(prev.players)) as Player[];
        np[prev.currentPlayerIndex].coins -= item.cost;
        np[prev.currentPlayerIndex].items.push(item.id);
        showToast(`${item.name} SECURED!`, 'success');
        return { ...prev, players: np };
      }
      showToast(`INSUFFICIENT FUNDS!`, 'error');
      return prev;
    });
  };

  const activateItem = (itemId: string) => {
    updateS(prev => {
      const pIdx = prev.currentPlayerIndex;
      const p = prev.players[pIdx]!;
      const np = JSON.parse(JSON.stringify(prev.players)) as Player[];
      const itemIndex = p.items.indexOf(itemId);
      if (itemIndex > -1) {
        np[pIdx].items.splice(itemIndex, 1);
        AudioEngine.playItem();
        
        if (itemId === 'firewall') {
          np[pIdx].isProtected = true;
          addFloatingText("VPN ACTIVE", "#00E5FF");
        } else if (itemId === 'ddos') {
          let nextIdx = (pIdx + 1) % np.length;
          while (np[nextIdx].finished) nextIdx = (nextIdx + 1) % np.length;
          np[nextIdx].isSkipped = true;
          addFloatingText("DDOS LAUNCHED", "#FF007F");
        } else if (itemId === 'datasteal') {
          let target = -1; let maxCoins = -1;
          np.forEach((pl, i) => { if (i !== pIdx && pl.coins > maxCoins && !pl.finished) { maxCoins = pl.coins; target = i; } });
          if (target > -1 && np[target].coins > 0) {
             const stealAmt = Math.min(2, np[target].coins);
             np[target].coins -= stealAmt;
             np[pIdx].coins += stealAmt;
             addFloatingText(`STOLE ${stealAmt}`, "#FFD600");
          } else {
             showToast(`NO VALID TARGETS FOUND.`, 'error');
          }
        } else if (itemId === 'swap') {
           let leaderIdx = -1; let maxPos = -1;
           np.forEach((pl, i) => { if (i !== pIdx && pl.position > maxPos && !pl.finished) { maxPos = pl.position; leaderIdx = i; }});
           if (leaderIdx > -1) {
              const temp = np[pIdx].position;
              np[pIdx].position = np[leaderIdx].position;
              np[leaderIdx].position = temp;
              addFloatingText("TELEPORTED", "#7B2CBF");
           }
        } else if (itemId === 'pass_buck') {
          // ✅ Fix: properly expose target to a cyber card on their next turn
          let nextIdx = (pIdx + 1) % np.length;
          let loops = 0;
          while (np[nextIdx].finished && loops < np.length) { nextIdx = (nextIdx + 1) % np.length; loops++; }
          if (!np[nextIdx].finished) {
            // Flag target: they'll draw a forced cyber card at turn start
            (np[nextIdx] as any).forcedCyber = true;
            addFloatingText(`EXPOSED ${np[nextIdx].name}!`, "#FF007F");
            showToast(`${np[nextIdx].name} will face a CYBER ATTACK next turn!`, 'error');
          }
        }
        return { ...prev, players: np };
      }
      return prev;
    });
  };

  const getShopIcon = (iconName: string) => {
     switch(iconName) {
        case 'Shield': return <Shield className="w-5 h-5 text-emerald-400" />;
        case 'Zap': return <Zap className="w-5 h-5 text-rose-400" />;
        case 'Lock': return <Lock className="w-5 h-5 text-purple-400" />;
        case 'ArrowLeftRight': return <ArrowLeftRight className="w-5 h-5 text-blue-400" />;
        case 'UserX': return <UserX className="w-5 h-5 text-pink-400" />;
        default: return <Activity className="w-5 h-5" />;
     }
  };

  // --- VIEWS ---
  if (s.view === 'menu') {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center p-6 relative overflow-hidden font-sans">
        {/* Cinematic Ambient Glow */}
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} 
          className="sb-scanlines relative z-20 w-full max-w-lg p-10 md:p-14 bg-white/[0.02] border border-white/[0.08] shadow-2xl flex flex-col items-center group backdrop-blur-sm rounded-[32px]"
        >
          {/* Cyber Edge Highlights */}
          <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-50" />
          <div className="absolute bottom-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent opacity-50" />

          {/* Custom Constructed Logo - True AAA Minimalist Style */}
          <div className="relative mb-14 flex flex-col items-center justify-center group">
            {/* Subtle Grid Backdrop */}
            <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI4IiBoZWlnaHQ9IjgiPjxyZWN0IHdpZHRoPSI4IiBoZWlnaHQ9IjgiIGZpbGw9Im5vbmUiLz48Y2lyY2xlIGN4PSI0IiBjeT0iNCIgcj0iMC41IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPjwvc3ZnPg==')] opacity-50" />
            
            {/* Sharp Geometric Mark */}
            <div className="relative flex items-center justify-center mb-6 z-10">
               {/* Tech Brackets */}
               <div className="absolute -left-6 top-0 bottom-0 w-4 border-l-2 border-y-2 border-cyan-500/30 group-hover:border-cyan-400 transition-colors" />
               <div className="absolute -right-6 top-0 bottom-0 w-4 border-r-2 border-y-2 border-cyan-500/30 group-hover:border-cyan-400 transition-colors" />
               
               <div className="w-16 h-16 md:w-20 md:h-20 bg-slate-900 border border-slate-700 shadow-[4px_4px_0_rgba(34,211,238,0.2)] flex items-center justify-center rotate-45 group-hover:rotate-0 transition-transform duration-500 ease-out">
                 <Shield className="w-8 h-8 md:w-10 md:h-10 text-white -rotate-45 group-hover:rotate-0 transition-transform duration-500 delay-100" />
               </div>
            </div>

            {/* Sharp Typography */}
            <div className="relative z-10 text-center">
               <h1 className="font-heading text-4xl md:text-6xl font-black uppercase tracking-widest text-white leading-none">
                 SCAM<span className="text-cyan-400">BOARD</span>
               </h1>
               
               {/* Micro Details (Serial / Version) */}
               <div className="flex items-center justify-between w-full mt-3 px-2">
                 <span className="font-mono text-[9px] md:text-[10px] text-slate-500 tracking-widest uppercase">SYS.V.2.0.4</span>
                 <div className="flex-1 border-t border-dashed border-slate-700 mx-3" />
                 <span className="font-mono text-[9px] md:text-[10px] text-cyan-500/70 tracking-[0.3em] uppercase font-bold">Tactical Sim</span>
               </div>
            </div>
          </div>

          <div className="w-full space-y-4 relative z-10">
            {/* Local Deploy Button */}
            <button 
              onClick={() => updateViewTransition({ ...s, view: 'setup' })} 
              className="sb-pressable w-full h-16 relative group overflow-hidden transition-all shadow-[0_8px_30px_rgba(37,99,235,0.2)] hover:shadow-[0_8px_40px_rgba(37,99,235,0.4)] rounded-[16px] bg-blue-600 hover:bg-blue-500 border border-white/10 cursor-pointer"
            >
               <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
               <div className="absolute w-[200%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:animate-[slide_1s_ease-in-out_infinite]" />
               
               <div className="absolute inset-0 flex items-center justify-between px-6 text-white font-black text-sm md:text-base uppercase tracking-widest">
                  <span className="flex items-center gap-3"><Users className="w-5 h-5 text-blue-200" /> LOCAL DEPLOYMENT</span>
                  <ChevronRight className="w-6 h-6 text-white/50 group-hover:text-white transition-colors group-hover:translate-x-1" />
               </div>
            </button>

            {/* Host Network Button */}
            <button 
              onClick={createRoom} 
              className="sb-pressable w-full h-16 relative group overflow-hidden transition-all bg-white/[0.03] hover:bg-white/[0.08] shadow-[0_4px_20px_rgba(0,0,0,0.2)] rounded-[16px] border border-white/10 hover:border-white/20 cursor-pointer"
            >
               <div className="absolute inset-0 flex items-center justify-between px-6 text-slate-300 font-bold text-sm md:text-base uppercase tracking-widest">
                  <span className="flex items-center gap-3"><Globe className="w-5 h-5 text-slate-400 group-hover:text-blue-400 transition-colors" /> HOST NETWORK</span>
                  <ChevronRight className="w-5 h-5 text-slate-500 group-hover:text-white transition-colors group-hover:translate-x-1" />
               </div>
            </button>
            
            {/* Join Network Input Area */}
            <div className="flex gap-3 h-16">
               <div className="flex-1 relative group bg-white/[0.03] rounded-[16px] border border-white/10 focus-within:border-purple-500/50 transition-colors shadow-inner overflow-hidden">
                  <input 
                    value={joinInput} 
                    onChange={(e) => setJoinInput(e.target.value)} 
                    placeholder="ENTER UPLINK CODE" 
                    className="w-full h-full bg-transparent px-6 text-white font-bold uppercase text-center focus:outline-none font-mono tracking-widest placeholder:text-slate-600" 
                  />
               </div>
               <button 
                 onClick={joinRoom} 
                 className="w-16 h-full bg-white/5 hover:bg-purple-600 transition-all flex items-center justify-center text-slate-400 hover:text-white shrink-0 group rounded-[16px] border border-white/10 hover:border-purple-500 shadow-[0_4px_20px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_30px_rgba(168,85,247,0.4)]"
               >
                 <Share2 className="w-5 h-5 group-hover:scale-110 transition-transform" />
               </button>
            </div>
          </div>
        </motion.div>
      </div>
    );
  }

  if (s.view === 'setup') {
    return (
      <div className="min-h-screen bg-[#050507] flex items-center justify-center p-6 font-sans relative overflow-hidden">
        <div className="absolute top-[-20%] left-[-10%] w-[500px] h-[500px] bg-blue-600/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute bottom-[-20%] right-[-10%] w-[600px] h-[600px] bg-purple-600/10 rounded-full blur-2xl pointer-events-none" />

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          className="sb-scanlines relative z-20 w-full max-w-2xl p-8 md:p-12 bg-white/[0.02] border border-white/[0.08] shadow-2xl flex flex-col group backdrop-blur-sm rounded-[32px]"
        >
          <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-blue-500/50 to-transparent opacity-50" />
          <div className="absolute bottom-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-purple-500/50 to-transparent opacity-50" />

          <div className="flex items-center justify-between mb-8 pb-6 border-b border-white/[0.06] relative z-10">
            <div className="flex items-center gap-4">
              <div className="relative group/mark flex items-center justify-center">
                <div className="w-10 h-10 bg-slate-900 border border-slate-700 shadow-[2px_2px_0_rgba(34,211,238,0.2)] flex items-center justify-center rotate-45 group-hover/mark:rotate-0 transition-transform duration-500 ease-out">
                  <Shield className="w-5 h-5 text-white -rotate-45 group-hover/mark:rotate-0 transition-transform duration-500 delay-100" />
                </div>
              </div>
              <div>
                <h2 className="font-heading text-2xl md:text-3xl font-black text-white uppercase tracking-widest leading-none">
                  MISSION<span className="text-cyan-400">CONFIG</span>
                </h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-[9px] text-slate-500 tracking-widest uppercase">SYS.V.2.0.4</span>
                  <div className="flex-1 w-8 border-t border-dashed border-slate-700 mx-1" />
                  <span className="font-mono text-[9px] text-cyan-500/70 tracking-[0.3em] uppercase font-bold">Set Parameters</span>
                </div>
              </div>
            </div>
            {roomCode && (
              <div className="bg-white/[0.03] border border-cyan-500/30 rounded-[16px] p-3 px-5 text-center relative overflow-hidden">
                <div className="text-[9px] text-cyan-400 font-bold uppercase tracking-widest mb-1">Network Node</div>
                <div className="text-xl font-black text-white font-mono tracking-widest">{roomCode}</div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
            <div className="space-y-3">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                <Activity className="w-3 h-3" /> Protocol Type
              </label>

              <button
                onClick={() => updateS({...s, mode: 'race'})}
                className={cn("w-full p-5 transition-all text-left flex flex-col gap-1.5 relative overflow-hidden group/btn rounded-[16px] border", s.mode === 'race' ? 'bg-cyan-500/10 border-cyan-400/60 shadow-[0_4px_20px_rgba(34,211,238,0.15)]' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20 hover:bg-white/[0.05]')}
              >
                <div className={cn("absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none rounded-[16px] transition-opacity", s.mode === 'race' ? 'opacity-100' : 'opacity-0')} />
                <span className="font-black text-white text-base flex items-center gap-3 relative z-10 uppercase tracking-wide">
                  <Zap className={cn("w-4 h-4 transition-colors", s.mode === 'race' ? "text-cyan-400" : "text-slate-600")} /> Data Race
                </span>
                <span className="text-[11px] text-slate-400 relative z-10 font-mono">First operative to reach the mainframe wins.</span>
              </button>

              <button
                onClick={() => updateS({...s, mode: 'score'})}
                className={cn("w-full p-5 transition-all text-left flex flex-col gap-1.5 relative overflow-hidden group/btn rounded-[16px] border", s.mode === 'score' ? 'bg-pink-500/10 border-pink-400/60 shadow-[0_4px_20px_rgba(236,72,153,0.15)]' : 'bg-white/[0.02] border-white/[0.06] hover:border-white/20 hover:bg-white/[0.05]')}
              >
                <div className={cn("absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none rounded-[16px] transition-opacity", s.mode === 'score' ? 'opacity-100' : 'opacity-0')} />
                <span className="font-black text-white text-base flex items-center gap-3 relative z-10 uppercase tracking-wide">
                  <Coins className={cn("w-4 h-4 transition-colors", s.mode === 'score' ? "text-pink-400" : "text-slate-600")} /> Economy War
                </span>
                <span className="text-[11px] text-slate-400 relative z-10 font-mono">Agent with highest crypto wealth wins.</span>
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div className="flex justify-between items-center">
                <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest flex items-center gap-2">
                  <Users className="w-3 h-3" /> Operatives ({setupPlayers.length})
                </label>
                {isHost && (
                  <button
                    onClick={() => setSetupPlayers([...setupPlayers, { name: `Agent 0${setupPlayers.length + 1}`, avatar: avatarKeys[setupPlayers.length % avatarKeys.length], color: playerColors[setupPlayers.length % playerColors.length], glow: playerGlows[setupPlayers.length % playerGlows.length] }])}
                    className="text-[10px] font-black text-cyan-400 hover:text-slate-950 bg-white/[0.03] hover:bg-cyan-400 border border-cyan-500/30 hover:border-cyan-400 px-3 py-1.5 rounded-[8px] transition-all font-mono uppercase tracking-widest"
                  >+ Add</button>
                )}
              </div>

              <div className="flex-1 max-h-[230px] bg-white/[0.02] border border-white/[0.06] rounded-[16px] p-3 overflow-y-auto space-y-2 custom-scrollbar">
                {setupPlayers.map((p, idx) => (
                  <div key={idx} className="flex gap-3 items-center bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.05] hover:border-white/[0.12] rounded-[12px] p-2.5 transition-all group/player">
                    <div className={cn("w-10 h-10 flex items-center justify-center rounded-[10px] border border-white/10 shrink-0 overflow-hidden", p.color)}>
                      <img src={AvatarMap[p.avatar] || AvatarMap['Cyber Security Expert']} className="w-full h-full object-cover grayscale opacity-60 group-hover/player:grayscale-0 group-hover/player:opacity-100 transition-all duration-300" alt="Avatar" />
                    </div>
                    <input
                      value={p.name}
                      onChange={(e) => { const n = [...setupPlayers]; n[idx].name = e.target.value; setSetupPlayers(n); }}
                      className="flex-1 bg-transparent border-none focus:outline-none text-white font-bold text-sm font-mono border-b border-transparent focus:border-cyan-500/50 px-1 py-1 transition-all"
                      disabled={!isHost}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative z-10">
            {(!roomCode || isHost) ? (
              <button
                onClick={showTutorialPopup}
                disabled={setupPlayers.length === 0}
                className="sb-pressable w-full h-16 relative group overflow-hidden transition-all disabled:opacity-40 rounded-[16px] bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 border border-white/10 shadow-[0_8px_30px_rgba(37,99,235,0.25)] hover:shadow-[0_8px_40px_rgba(37,99,235,0.4)] cursor-pointer"
              >
                <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
                <div className="absolute w-[200%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:animate-[slide_1s_ease-in-out_infinite]" />
                <div className="absolute inset-0 flex items-center justify-between px-6 text-white font-black text-sm md:text-base uppercase tracking-widest">
                  <span className="flex items-center gap-3"><Play className="w-5 h-5 fill-current text-blue-200" /> เริ่มเกม (START)</span>
                  <ChevronRight className="w-6 h-6 text-white/50 group-hover:text-white transition-colors group-hover:translate-x-1" />
                </div>
              </button>
            ) : (
              <div className="w-full h-16 bg-white/[0.03] border border-white/10 rounded-[16px] flex items-center justify-center relative overflow-hidden shadow-inner">
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent animate-[slide_2s_linear_infinite]" />
                <div className="text-cyan-400 font-bold font-mono text-xs tracking-widest uppercase flex items-center gap-3 relative z-10">
                  <Activity className="w-4 h-4 animate-spin" /> รอหัวหน้าห้องกดเริ่มเกม...
                </div>
              </div>
            )}
          </div>
        </motion.div>

        {/* TUTORIAL MODAL POPUP */}
        {showTutorial && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="relative bg-slate-900 border border-purple-500/50 rounded-2xl max-w-lg w-full p-6 md:p-8 shadow-[0_0_50px_rgba(124,58,237,0.3)] text-white"
            >
              <h2 className="text-2xl md:text-3xl font-black text-purple-400 mb-4 tracking-wider text-center">วิธีเล่นเกม (How to Play)</h2>
              <div className="space-y-4 text-base md:text-lg text-slate-300 leading-relaxed font-sans mb-8">
                <p>🎲 <strong className="text-white">ทอยลูกเต๋า:</strong> สลับกันทอยลูกเต๋าเพื่อเดินไปข้างหน้า</p>
                <p>🛡️ <strong className="text-white">คำถามไซเบอร์:</strong> หากตกช่องไซเบอร์ คุณต้องตอบคำถามกลลวงมิจฉาชีพให้ถูกเพื่อลดพลังบอส</p>
                <p>🃏 <strong className="text-white">การ์ดไอเทม:</strong> คุณจะได้รับการ์ดตั้งต้นคนละ 2 ใบตอนเริ่มเกม และหาเพิ่มได้จากช่องโบนัส หรือซื้อในตลาดมืด</p>
                <p>💀 <strong className="text-white">ระวังบอส!:</strong> หากทุกคนตอบผิดบ่อยๆ จนพลังบอสถึง 100% เกมจะจบและทุกคนแพ้ทันที (รีบเดินเข้าเส้นชัย!)</p>
              </div>
              <button 
                onClick={startGame}
                className="w-full py-4 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold rounded-xl shadow-lg transition-all active:scale-95"
              >
                เข้าใจแล้ว เริ่มเล่นเลย!
              </button>
            </motion.div>
          </div>
        )}
      </div>
    );
  }


  const currentPlayer = s.players[s.currentPlayerIndex]!;
  const isMyTurn = !roomCode || localPlayerId === currentPlayer?.id;

  return (
    <div className={cn("h-screen w-full bg-slate-900 text-slate-100 flex flex-col md:flex-row overflow-hidden font-sans relative", isShaking && "translate-x-2 -translate-y-2")}>
      
      {s.turnPhase === 'rolling' && (
         <WebGLDiceOverlay 
           targetValue={s.diceValue} 
           onLanded={() => {
              AudioEngine.playTone(600, 'sine', 0.2, 0.2);
              updateS(prev => ({ ...prev, turnPhase: 'moving' }));
              movePlayer(s.diceValue);
           }} 
         />
      )}
      
      {particles && <Particles key={particles.key} count={40} color={particles.color} startType={particles.type} />}
      
      {floatingTexts.map(ft => (
         <FloatingText key={ft.id} text={ft.text} color={ft.color} x={ft.x} y={ft.y} onComplete={() => setFloatingTexts(prev => prev.filter(f => f.id !== ft.id))} />
      ))}

      <AnimatePresence>
        {toastMessage && (
          <motion.div initial={{ opacity: 0, y: -50, scale: 0.9 }} animate={{ opacity: 1, y: 24, scale: 1 }} exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={cn("fixed top-0 left-0 right-0 mx-auto w-max max-w-[90vw] z-[100] px-6 py-4 rounded-xl font-bold flex items-center gap-3  border shadow-[0_10px_40px_rgba(0,0,0,0.8)] uppercase tracking-widest text-sm",
              toastMessage.type === 'success' ? "bg-blue-500/20 border-blue-500/50 text-blue-400" : toastMessage.type === 'error' ? "bg-pink-500/20 border-pink-500/50 text-pink-400" : "bg-white/10 border-white/10 text-white"
            )}>
            {toastMessage.type === 'success' && <ShieldCheck className="w-5 h-5" />}
            {toastMessage.type === 'error' && <ShieldAlert className="w-5 h-5" />}
            {toastMessage.msg}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── CYBERPUNK HUD SIDEBAR ── */}
      <div className="w-full h-[45vh] md:h-full md:w-[380px] lg:w-[420px] bg-slate-950/90 backdrop-blur-3xl md:border-r border-b md:border-b-0 border-white/5 flex flex-col z-40 shrink-0 shadow-[10px_0_40px_rgba(0,0,0,0.8)] relative overflow-hidden">
        {/* Ambient Void Glow */}
        <div className="absolute -top-32 -left-32 w-80 h-80 bg-cyan-600/10 blur-[100px] rounded-full pointer-events-none" />
        <div className="absolute -bottom-32 -right-32 w-80 h-80 bg-pink-600/10 blur-[100px] rounded-full pointer-events-none" />

        {/* ── SPECTACULAR AAA NAVBAR / HEADER ── */}
        <div className="relative z-20 border-b border-white/5 bg-slate-900/60 backdrop-blur-2xl px-4 md:px-6 py-4 shadow-[0_10px_30px_rgba(0,0,0,0.5)] overflow-hidden shrink-0">
           {/* Ambient Glows */}
           <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500" />
           <div className="absolute bottom-0 left-0 w-full h-[1px] bg-gradient-to-r from-cyan-500/50 via-purple-500/50 to-pink-500/50" />
           <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-[0.03]" />
           
           <div className="flex items-center justify-between relative z-10 w-full">
              {/* Logo Segment */}
              <div className="flex items-center gap-3 shrink-0 min-w-0">
                 <div className="relative group cursor-pointer shrink-0">
                    <div className="absolute inset-0 bg-cyan-400/20 rounded-xl blur-xl group-hover:bg-cyan-400/40 transition-all duration-500" />
                    <div className="w-10 h-10 bg-black/40 border border-cyan-500/30 rounded-xl flex items-center justify-center relative overflow-hidden backdrop-blur-md group-hover:border-cyan-400 shadow-[inset_0_0_20px_rgba(34,211,238,0.1)] transition-all">
                       <TerminalSquare className="w-5 h-5 text-cyan-400 group-hover:scale-110 transition-transform duration-500" style={{ filter: 'drop-shadow(0 0 8px #22d3ee)' }} />
                       {/* Scanner Line */}
                       <div className="absolute left-0 right-0 h-[2px] bg-cyan-300/50 blur-[1px] animate-[slide_2s_ease-in-out_infinite]" />
                    </div>
                 </div>
                 
                 <div className="flex flex-col min-w-0">
                    <h1 className="text-xl font-black tracking-[0.15em] uppercase text-white flex items-center gap-1 drop-shadow-[0_2px_10px_rgba(0,0,0,1)] truncate">
                       SCAM<span className="text-cyan-400" style={{ textShadow: '0 0 15px #22d3ee' }}>BOARD</span>
                    </h1>
                    {roomCode && (
                       <div className="flex items-center gap-2 mt-0.5 bg-black/40 border border-white/5 rounded-full px-2.5 py-0.5 w-max shadow-inner">
                          <span className="relative flex h-1.5 w-1.5 shrink-0">
                             <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                             <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500 shadow-[0_0_8px_#10b981]"></span>
                          </span>
                          <span className="text-[9px] font-mono font-bold text-emerald-400 uppercase tracking-widest truncate">Node: {roomCode}</span>
                       </div>
                    )}
                 </div>
              </div>

              {/* Action Icons */}
              <div className="flex items-center gap-2 shrink-0 ml-2">
                 <button onClick={() => setShowManual(true)} className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/10 hover:border-cyan-400/50 hover:bg-cyan-500/10 flex items-center justify-center transition-all group shadow-inner">
                    <HelpCircle className="w-4 h-4 text-slate-400 group-hover:text-cyan-400 transition-colors drop-shadow-md" />
                 </button>
                 <button onClick={() => { const muted = AudioEngine.toggleMute(); setIsMuted(muted); AudioEngine.playClick(); }} className="w-10 h-10 rounded-xl bg-white/[0.02] border border-white/10 hover:border-pink-500/50 hover:bg-pink-500/10 flex items-center justify-center transition-all group shadow-inner">
                    {isMuted ? <VolumeX className="w-4 h-4 text-slate-500" /> : <Volume2 className="w-4 h-4 text-pink-400 transition-colors drop-shadow-[0_0_8px_#f472b6]" />}
                 </button>
                 
                 <button onClick={() => {
                    if (s.turnPhase === 'resolvingEvent' && showShop && isMyTurn) {
                       setShowShop(false);
                       endTurn();
                    } else {
                       setShowShop(!showShop);
                    }
                 }} className={cn("w-10 h-10 rounded-xl flex items-center justify-center transition-all relative group shadow-inner overflow-hidden", showShop ? "bg-purple-500/20 border-purple-500 shadow-[0_0_15px_rgba(168,85,247,0.3)]" : "bg-white/[0.02] border-white/10 hover:border-purple-400/50 hover:bg-purple-500/10")}>
                    <div className={cn("absolute inset-0 transition-opacity", showShop ? "opacity-100" : "opacity-0 group-hover:opacity-100")}>
                       <div className="absolute inset-0 bg-gradient-to-br from-purple-500/20 to-transparent" />
                    </div>
                    <Gift className={cn("w-4 h-4 transition-all z-10", showShop ? "text-purple-300 drop-shadow-[0_0_10px_#c084fc] scale-110" : "text-slate-400 group-hover:text-purple-400")} />
                    {!showShop && <div className="absolute top-2.5 right-2.5 w-1.5 h-1.5 rounded-full bg-red-500 shadow-[0_0_8px_#ef4444] animate-pulse" />}
                 </button>
              </div>
           </div>
        </div>

        {/* BOSS AI THREAT LEVEL HUD */}
        <div className="absolute top-24 left-1/2 transform -translate-x-1/2 w-64 md:w-96 flex flex-col gap-2 z-50 pointer-events-none">
          <div className="bg-black/60 backdrop-blur-md p-3 rounded-2xl border border-red-500/20 shadow-[0_0_20px_rgba(244,63,94,0.1)] flex flex-col">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-2">
                <Skull className={cn("w-5 h-5 md:w-6 md:h-6", s.bossHealth > 75 ? "text-red-500 animate-pulse" : "text-rose-400")} />
                <span className="text-xs md:text-sm font-black text-rose-300 tracking-wider">บอสมิจฉาชีพ (AI)</span>
              </div>
              <div className="flex gap-4 items-center">
                <span className="text-xs md:text-sm font-black text-rose-400 tracking-wider">ความอันตราย LVL {s.roundCount}</span>
                <span className="text-lg md:text-xl font-black text-white drop-shadow-[0_0_10px_#ef4444]">{s.bossHealth}%</span>
              </div>
            </div>
            <div className="w-full h-2 bg-rose-950/50 rounded-full overflow-hidden shadow-inner">
              <div className="h-full bg-gradient-to-r from-red-600 to-rose-400 transition-all duration-1000 ease-out" style={{ width: `${s.bossHealth}%`, boxShadow: '0 0 15px #f43f5e' }} />
            </div>
          </div>
        </div>
        
        {/* MAIN CONTENT AREA */}
        <div className="flex-1 overflow-y-auto custom-scrollbar px-6 pb-6 relative z-10 pt-4">
          {showShop ? (
             <div className="space-y-4">
                <div className="flex justify-between items-center mb-4 px-1">
                   <span className="font-black text-purple-400 uppercase text-xs tracking-widest flex items-center gap-2 drop-shadow-[0_0_8px_#c084fc]">
                     <Coins className="w-4 h-4"/> Black Market
                   </span>
                   <span className="font-bold text-emerald-400 text-xs bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1 shadow-[0_0_15px_rgba(16,185,129,0.2)]">
                     BAL <span className="text-white">{s.players.find(p => p.id === localPlayerId)?.coins || currentPlayer?.coins}</span>
                   </span>
                </div>
                {SHOP_ITEMS.map(item => (
                   <div key={item.id} className="bg-white/[0.03] border border-white/10 p-5 rounded-[20px] flex flex-col gap-3 hover:bg-white/[0.06] hover:border-purple-500/50 transition-all group shadow-inner">
                      <div className="flex justify-between items-start">
                         <div className="font-bold text-white text-sm flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-black/40 border border-white/10 flex items-center justify-center text-purple-400 group-hover:scale-110 transition-transform shadow-inner">
                               {getShopIcon(item.icon)}
                            </div>
                            <span className="tracking-wide">{item.name}</span>
                         </div>
                         <div className="text-pink-400 font-bold text-xs bg-pink-500/10 border border-pink-500/30 px-3 py-1 rounded-full">{item.cost} CR</div>
                      </div>
                      <div className="text-[11px] text-slate-400 leading-relaxed">{item.description}</div>
                      <button 
                        onClick={() => buyItem(item)} 
                        disabled={!isMyTurn || (s.turnPhase !== 'idle' && s.turnPhase !== 'resolvingEvent')}
                        className="mt-3 w-full py-3 bg-purple-600 hover:bg-purple-500 disabled:bg-slate-800 disabled:opacity-50 disabled:border-transparent text-white font-black text-xs uppercase tracking-widest transition-all rounded-xl border border-white/10 shadow-[0_4px_20px_rgba(168,85,247,0.3)] hover:shadow-[0_4px_30px_rgba(168,85,247,0.5)]"
                      >
                        Acquire Protocol
                      </button>
                   </div>
                ))}
                {s.turnPhase === 'resolvingEvent' && isMyTurn && (
                   <button 
                      onClick={() => { AudioEngine.playClick(); setShowShop(false); endTurn(); }}
                      className="w-full mt-4 h-14 relative group overflow-hidden transition-all rounded-2xl bg-white/10 hover:bg-white/20 border border-white/20 shadow-lg"
                   >
                      <div className="absolute inset-0 flex items-center justify-center text-white font-black text-sm md:text-base uppercase tracking-widest">
                         ปิดตลาด (CLOSE & END TURN)
                      </div>
                   </button>
                )}
             </div>
          ) : (
             <div className="space-y-4">
               <div className="flex items-center gap-3 mb-4">
                 <div className="h-[1px] flex-1 bg-gradient-to-r from-transparent to-cyan-500/30" />
                 <div className="text-[10px] font-black text-cyan-400 uppercase tracking-widest drop-shadow-[0_0_8px_#22d3ee]">Active Operatives</div>
                 <div className="h-[1px] flex-1 bg-gradient-to-l from-transparent to-cyan-500/30" />
               </div>
               
               {s.players.map((p, idx) => {
                 const isTurn = s.currentPlayerIndex === idx && !p.finished;
                 return (
                   <motion.div key={p.id} animate={{ scale: isTurn ? 1.02 : 1, opacity: p.finished ? 0.4 : 1 }}
                     className={cn(
                        "p-4 rounded-[20px] transition-all duration-300 relative overflow-hidden group border", 
                        isTurn ? "bg-cyan-500/10 border-cyan-400/50 shadow-[0_0_30px_rgba(34,211,238,0.2)]" : "bg-white/[0.02] border-white/10 hover:bg-white/[0.05]"
                     )}>
                     
                     <div className="flex items-center gap-4 relative z-10">
                       <div className={cn("w-14 h-14 flex items-center justify-center relative shrink-0 rounded-[14px] border border-white/10 overflow-hidden shadow-inner", p.color)}>
                         <img src={AvatarMap[p.avatar] || AvatarMap['Cyber Security Expert']} className="w-full h-full object-cover scale-110" alt="Avatar" />
                         {p.isProtected && <div className="absolute inset-0 border-2 border-emerald-400 rounded-[14px] animate-pulse shadow-[inset_0_0_15px_#10b981]" />}
                         {p.isSkipped && <div className="absolute inset-0 bg-red-500/80 flex items-center justify-center backdrop-blur-sm"><Zap className="w-6 h-6 text-white"/></div>}
                       </div>
                       
                       <div className="flex-1 min-w-0">
                         <div className={cn("font-bold text-base flex items-center gap-2 truncate", isTurn ? "text-cyan-400 drop-shadow-[0_0_8px_#22d3ee]" : "text-white")}>
                            {p.name} 
                            {p.badges.map((_: string, i: number) => <Trophy key={i} className="w-4 h-4 text-amber-400 drop-shadow-[0_0_8px_#fbbf24]" />)}
                         </div>
                         
                         <div className="flex items-center gap-4 mt-2">
                           <span className="text-slate-400 font-bold text-[10px] flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                             <MapPin className="w-3 h-3 text-cyan-500" /> <span className="text-white">{p.position.toString().padStart(2, '0')}</span>
                           </span>
                           <span className="text-slate-400 font-bold text-[10px] flex items-center gap-1.5 bg-black/40 px-2 py-1 rounded-md border border-white/5">
                             <Coins className="w-3 h-3 text-pink-500" /> <span className="text-pink-400">{p.coins}</span>
                           </span>
                         </div>
                         
                         {p.items.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-3">
                              {p.items.map((it: string, i: number) => (
                                 <button key={i} onClick={() => activateItem(it)} disabled={!isMyTurn || s.turnPhase !== 'idle'} 
                                    className="px-3 py-1 bg-purple-500/20 hover:bg-purple-500 hover:text-white rounded-md text-[9px] text-purple-300 font-bold uppercase tracking-widest transition-colors disabled:opacity-50 border border-purple-500/30">
                                    {SHOP_ITEMS.find(s => s.id === it)?.name}
                                 </button>
                              ))}
                            </div>
                         )}
                       </div>
                     </div>
                   </motion.div>
                 );
               })}
             </div>
          )}
        </div>
        
        {/* Premium Execute Roll Button */}
        <div className="p-4 md:p-6 bg-slate-900/80 backdrop-blur-xl shrink-0 relative z-20 border-t border-white/5">
          <button
            onClick={rollDice}
            disabled={!isMyTurn || s.turnPhase !== 'idle' || currentPlayer?.finished}
            className="w-full h-12 md:h-16 relative group overflow-hidden transition-all disabled:opacity-50 rounded-[12px] md:rounded-[16px] shadow-[0_8px_30px_rgba(37,99,235,0.2)] bg-blue-600 hover:bg-blue-500 disabled:bg-white/5 border border-white/10"
          >
             <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent pointer-events-none" />
             <div className="absolute w-[200%] h-full bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-[100%] group-hover:animate-[slide_1s_ease-in-out_infinite] group-disabled:hidden" />
             
             <div className="absolute inset-0 flex items-center justify-center gap-2 md:gap-3 text-white font-black text-[14px] md:text-lg tracking-wider group-disabled:text-slate-500">
                <Dices className={cn("w-5 h-5 md:w-8 md:h-8 fill-white/20", s.turnPhase === 'rolling' && "animate-spin")} />
                <span className={cn(s.turnPhase === 'rolling' && "animate-pulse text-cyan-300")}>
                   {!isMyTurn ? 'รอคิวของคุณ...' : s.turnPhase === 'rolling' ? 'กำลังทอยลูกเต๋า...' : 'ทอยลูกเต๋า (ROLL)'}
                </span>
             </div>
          </button>
        </div>
      </div>

      {/* ── STRAIGHT 2.5D EXTRUDED BOARD AREA ── */}
      <div className="flex-1 relative overflow-hidden bg-[#0a0f1c]">
        {/* Deep space background texture */}
        <div className="absolute inset-0 pointer-events-none opacity-40" style={{
           backgroundImage: `radial-gradient(circle at center, rgba(0,229,255,0.05) 0%, transparent 50%), linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px), linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px)`,
           backgroundSize: '100% 100%, 80px 80px, 80px 80px'
        }} />
        
        {/* Screen Center Anchor */}
        <div className="absolute inset-0 flex items-center justify-center">
          {/* Zoomed in container (Straight Top-Down) */}
          <div style={{ transform: 'scale(1.2)' }}>
            
            {/* Sliding Camera Tracker Layer (moves the board under the camera) */}
            <motion.div
              animate={{ x: targetX, y: targetY }}
              transition={{ type: 'spring', stiffness: 70, damping: 25 }}
              style={{ transformStyle: 'preserve-3d' }}
            >
              {/* Custom CSS for Animations */}
              <style>{`
                @keyframes data-flow {
                  to { stroke-dashoffset: -35; }
                }
                .animate-data-flow {
                  animation: data-flow 1s linear infinite;
                }
              `}</style>

              {/* Dashed Cyan Path connecting centers (Now Animated!) */}
              <svg className="absolute pointer-events-none overflow-visible z-0" style={{ left: 0, top: 0 }}>
                <path 
                  d={s.board.map((t, i) => `${i===0?'M':'L'} ${t.x + TILE_SIZE/2} ${t.y + TILE_SIZE/2}`).join(' ')} 
                  fill="none" 
                  stroke="rgba(0, 229, 255, 0.8)" 
                  strokeWidth="8" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  strokeDasharray="20 15" 
                  className="animate-data-flow"
                  style={{ filter: 'drop-shadow(0px 4px 0px rgba(0,0,0,0.5)) drop-shadow(0px 0px 10px rgba(0,229,255,0.6))' }}
                />
              </svg>

              {/* Render Tiles */}
              {s.board.map((tile) => <MemoizedTile key={tile.index} tile={tile} />)}

              {/* Render Image Avatars (Stand-up technique) */}
              {s.players.map((p) => {
                const currentTile = s.board[p.position] || s.board[0];
                const avatarImg = AvatarMap[p.avatar] || AvatarMap['Cyber Security Expert'];
                
                // Offset logic for multiple players on same tile
                const playersOnThisTile = s.players.filter(player => player.position === p.position);
                const myIndexOnTile = playersOnThisTile.findIndex(player => player.id === p.id);
                const totalOnTile = playersOnThisTile.length;
                
                let offsetX = 0; let offsetY = 0;
                if (totalOnTile > 1) {
                  const angle = (myIndexOnTile / totalOnTile) * Math.PI * 2;
                  const radius = 25; 
                  offsetX = Math.cos(angle) * radius;
                  offsetY = Math.sin(angle) * radius;
                }

                const isCurrentPlayer = s.currentPlayerIndex === s.players.findIndex(x => x.id === p.id);
                
                // Extract actual hex for border if using tailwind bg class
                let colorHex = '#00E5FF';
                if (p.color === 'bg-pink-500') colorHex = '#EC4899';
                else if (p.color === 'bg-cyan-500') colorHex = '#06B6D4';
                else if (p.color === 'bg-amber-500') colorHex = '#F59E0B';
                else if (p.color === 'bg-emerald-500') colorHex = '#10B981';
                else if (p.color === 'bg-purple-500') colorHex = '#8B5CF6';

                return (
                  <motion.div 
                    key={p.id}
                    // Adjusted offset (-50) because the avatar is now 100x100 (50px half)
                    animate={{ x: currentTile.x + TILE_SIZE / 2 - 50 + offsetX, y: currentTile.y + TILE_SIZE / 2 - 50 + offsetY }}
                    transition={{ type: "spring", stiffness: 120, damping: 15 }}
                    className="absolute z-40"
                  >
                    {/* Dark shadow right on the board */}
                    <div 
                      className="absolute bg-black/80 rounded-full blur-[8px]" 
                      style={{ width: '50px', height: '20px', left: '25px', top: '80px' }} 
                    />
                    
                    {/* The Avatar Standee (No Frame) */}
                    <div 
                      className={cn(
                        "relative flex items-center justify-center transition-all duration-300", 
                        isCurrentPlayer ? "scale-125 z-50" : "scale-100 z-40"
                      )}
                      style={{ 
                         width: '100px',
                         height: '100px',
                         transform: isCurrentPlayer ? 'translateY(-40px)' : 'translateY(-25px)', 
                      }}
                    >
                      {/* The Image Itself */}
                      <img 
                        src={avatarImg} 
                        className="w-full h-full object-contain" 
                        alt={p.name} 
                        style={{
                          filter: isCurrentPlayer 
                            ? `drop-shadow(0px 10px 10px rgba(0,0,0,0.8)) drop-shadow(0px 0px 15px ${colorHex})` 
                            : `drop-shadow(0px 8px 6px rgba(0,0,0,0.7))`
                        }}
                      />
                      
                      {/* Current player Holographic Arrow indicator */}
                      {isCurrentPlayer && (
                        <div 
                          className="absolute -top-6 text-white animate-bounce font-bold text-lg" 
                          style={{ 
                            filter: `drop-shadow(0 0 10px ${colorHex}) drop-shadow(0 0 20px ${colorHex})`,
                            color: colorHex 
                          }}
                        >
                           ▼
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </motion.div>
          </div>
        </div>

        {/* ── AAA PROGRESS BAR HUD ── */}
        <div className="absolute top-6 left-1/2 transform -translate-x-1/2 w-full max-w-xl px-4 z-50 pointer-events-none">
          <div className="bg-slate-900/80 backdrop-blur-md p-3 rounded-2xl border border-white/10 shadow-[0_10px_30px_rgba(0,0,0,0.8)] flex items-center gap-4">
            <div className="flex -space-x-3">
              {s.players.map(p => (
                <div key={p.id} className="w-8 h-8 rounded-full border-2 overflow-hidden shadow-lg" style={{ borderColor: p.color ? p.color.replace('bg-','') : '#fff' }}>
                  <img src={AvatarMap[p.avatar]} className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
            
            <div className="flex-1">
              <div className="flex justify-between text-xs font-mono text-cyan-400 mb-1 font-bold">
                <span>START</span>
                <span>FINISH</span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden border border-white/10 relative">
                {s.players.map((p, idx) => {
                  const progress = (p.position / (BOARD_SIZE - 1)) * 100;
                  const cHex = p.color === 'bg-pink-500' ? '#EC4899' : p.color === 'bg-cyan-500' ? '#06B6D4' : p.color === 'bg-amber-500' ? '#F59E0B' : p.color === 'bg-emerald-500' ? '#10B981' : p.color === 'bg-purple-500' ? '#8B5CF6' : '#00E5FF';
                  return (
                    <motion.div 
                      key={p.id}
                      className="absolute top-0 bottom-0 rounded-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${progress}%` }}
                      transition={{ type: 'spring', damping: 20 }}
                      style={{ 
                        backgroundColor: cHex,
                        zIndex: 10 - idx,
                        opacity: 0.8,
                        boxShadow: `0 0 10px ${cHex}`
                      }}
                    />
                  );
                })}
              </div>
            </div>
            <Trophy className="w-6 h-6 text-pink-400 animate-pulse" style={{ filter: 'drop-shadow(0 0 10px #f472b6)' }} />
          </div>
        </div>
        
        {/* ── SCAMMER AI BOSS HUD ── */}
        <div className="absolute right-6 top-1/2 transform -translate-y-1/2 z-50 pointer-events-none flex flex-col items-center gap-2">
           <div className="bg-slate-950/80 backdrop-blur-xl p-4 rounded-[32px] border border-red-500/20 shadow-[0_0_30px_rgba(244,63,94,0.15)] flex flex-col items-center">
              <Skull className={cn("w-10 h-10 mb-3 transition-colors", s.bossHealth > 75 ? "text-red-500 animate-glitch drop-shadow-[0_0_15px_#f43f5e]" : "text-rose-400/50")} />
              <div className="text-[10px] text-red-400 font-bold tracking-widest uppercase mb-4 text-center leading-tight">Scammer<br/>AI</div>
              
              <div className="h-64 w-4 bg-slate-900 rounded-full border border-white/10 relative overflow-hidden flex flex-col justify-end shadow-inner">
                 <motion.div 
                    initial={{ height: 0 }}
                    animate={{ height: `${s.bossHealth}%` }}
                    transition={{ type: 'spring', damping: 20 }}
                    className={cn("w-full rounded-full transition-all", s.bossHealth > 75 ? "bg-red-500 shadow-[0_0_20px_#f43f5e]" : "bg-gradient-to-t from-rose-900 to-rose-500")}
                 />
                 {/* Danger threshold line */}
                 <div className="absolute top-[25%] left-0 right-0 h-[2px] bg-red-500/50" />
              </div>
              <div className={cn("mt-4 text-sm font-mono font-black", s.bossHealth > 75 ? "text-red-500 animate-pulse" : "text-rose-400")}>
                 {s.bossHealth}%
              </div>
           </div>
        </div>

      </div>

      {/* Modals */}
      <AnimatePresence>
        {s.activeEvent && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 bg-slate-950/80 backdrop-blur-sm" />
            <motion.div initial={{ scale: 0.9, y: 40, opacity: 0 }} animate={{ scale: 1, y: 0, opacity: 1 }} exit={{ scale: 0.9, y: 40, opacity: 0 }} 
              className="w-full max-w-2xl relative z-10 bg-white/[0.03] shadow-2xl border border-white/10 backdrop-blur-md rounded-[32px] overflow-hidden"
            >
              <div className="absolute top-0 left-0 w-32 h-[2px] bg-cyan-400" />
              <div className="absolute bottom-0 right-0 w-32 h-[2px] bg-pink-500" />
              
              <div className="bg-slate-900 border-b border-white/10 p-5 flex items-center justify-between relative overflow-hidden">
                 <div className="absolute top-0 right-0 w-64 h-full bg-cyan-500/10 blur-2xl" />
                 <div className="flex gap-4 items-center relative z-10">
                   <Activity className="w-5 h-5 text-cyan-400 animate-pulse" />
                   <span className="text-sm text-cyan-400 uppercase tracking-[0.3em] font-black">System Override</span>
                 </div>
                 {s.activeEvent.type === 'cyber' && s.activeEvent.expiresAt && (
                    <CyberTimer 
                       expiresAt={s.activeEvent.expiresAt} 
                       isMyTurn={isMyTurn}
                       onTimeout={() => handleCyberAnswer(false, s.activeEvent.usedHelp, true)} 
                    />
                 )}
              </div>
              
              <div className="p-8 md:p-12 max-h-[80vh] overflow-y-auto custom-scrollbar relative">
                
                {s.activeEvent.type === 'help' && s.activeEvent.data.step === 'askLifeline' && (
                  <div className="text-center py-10">
                    <div className="w-32 h-32 rounded-3xl bg-cyan-500/10 flex items-center justify-center mx-auto mb-8 shadow-lg border border-cyan-400/30 relative">
                       <div className="absolute inset-0 bg-cyan-400/20 animate-pulse rounded-3xl blur-md" />
                       <Users className="w-16 h-16 text-cyan-400 relative z-10" />
                    </div>
                    <h3 className="text-4xl font-black text-white mb-4 tracking-tight uppercase">Initiate Protocol?</h3>
                    <p className="text-cyan-400 mb-12 text-lg font-mono tracking-widest opacity-80">เรียกใช้ความช่วยเหลือทีม (TEAM CONSULT)</p>
                    <div className="flex gap-4">
                      <button onClick={() => updateS({ ...s, activeEvent: { type: 'cyber', data: s.activeEvent.data.card, usedHelp: false, taunt: SCAMMER_TAUNTS[0], betActive: false, expiresAt: Date.now() + Math.random() + 10999, isFirewall: s.activeEvent.data.isFirewall } })} disabled={!isMyTurn} className="flex-1 h-16 bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 hover:border-white/20 text-slate-300 hover:text-white font-bold uppercase tracking-widest transition-colors rounded-[16px] hover-lift">
                        Bypass
                      </button>
                      <button onClick={() => updateS({ ...s, activeEvent: { type: 'cyber', data: s.activeEvent.data.card, usedHelp: true, taunt: SCAMMER_TAUNTS[0], betActive: false, expiresAt: Date.now() + Math.random() + 10999, isFirewall: s.activeEvent.data.isFirewall } })} disabled={!isMyTurn} className="flex-1 h-16 bg-cyan-600 hover:bg-cyan-500 text-white border border-white/10 font-black uppercase tracking-widest transition-colors shadow-[0_0_15px_#00D4FF44] rounded-[16px] hover-lift">Activate</button>
                    </div>
                  </div>
                )}

                {s.activeEvent.type === 'cyber' && (
                  <div>
                    <div className="inline-flex items-center gap-3 px-4 py-2 bg-pink-500/10 border-l-4 border-pink-500 text-pink-400 text-sm font-black uppercase tracking-widest mb-8">
                       <ShieldAlert className="w-5 h-5" /> Threat Detected
                    </div>
                    <h3 className="text-3xl font-black mb-8 text-white leading-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{s.activeEvent.data.title}</h3>
                    <div className="text-xl text-slate-300 mb-10 p-8 bg-black/20 border border-white/5 rounded-2xl relative overflow-hidden font-mono leading-relaxed shadow-inner">
                       <div className="absolute top-0 left-0 w-2 h-full bg-pink-500" />
                       <div className="absolute top-0 right-0 w-32 h-32 bg-pink-500/10 blur-3xl" />
                       <div className="relative z-10">{s.activeEvent.data.situation}</div>
                    </div>
                    
                    {s.activeEvent.usedHelp && (
                       <div className="mb-8 bg-cyan-500/10 border border-cyan-500/30 p-5 rounded-2xl text-cyan-400 flex gap-4 items-center shadow-lg">
                          <Users className="w-8 h-8 animate-pulse shrink-0" />
                          <div className="text-base font-bold tracking-widest uppercase">TEAM CONSULT: VERBAL COMMUNICATION REQUIRED.</div>
                       </div>
                    )}

                    <div className="mb-10 flex flex-col md:flex-row items-start md:items-center justify-between bg-black/30 p-5 border border-white/5 rounded-2xl relative overflow-hidden group shadow-inner">
                       <div className="absolute inset-0 bg-gradient-to-r from-amber-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                       <div className="flex items-center gap-4 relative z-10 mb-4 md:mb-0">
                          <div className="w-12 h-12 bg-amber-500/10 rounded-xl flex items-center justify-center border border-amber-500/30">
                             <Flame className="w-6 h-6 text-amber-500 animate-pulse" />
                          </div>
                          <div>
                             <div className="font-black text-white text-lg uppercase tracking-widest text-glow-amber">High Stakes Protocol</div>
                             <div className="text-sm text-amber-400/80 font-mono mt-1">2x REWARD / 2x PENALTY</div>
                          </div>
                       </div>
                       <button 
                          onClick={() => updateS({...s, activeEvent: {...s.activeEvent, betActive: !s.activeEvent.betActive}})} 
                          disabled={!isMyTurn} 
                          className={cn("px-8 py-4 font-black text-sm uppercase tracking-widest transition-all relative z-10 rounded-[16px] border", s.activeEvent.betActive ? "bg-amber-600 text-white shadow-[0_8px_30px_rgba(245,158,11,0.4)] border-amber-400/50" : "bg-white/[0.05] text-slate-300 hover:bg-white/[0.1] border-white/10 hover:border-white/20")}
                       >
                          {s.activeEvent.betActive ? "ENGAGED" : "ENGAGE"}
                       </button>
                    </div>
                    
                    <div className="space-y-4">
                      <button onClick={() => handleCyberAnswer(true, s.activeEvent.usedHelp)} disabled={!isMyTurn} className="w-full text-left p-6 bg-white/[0.02] border border-white/5 hover:border-pink-500/50 hover:bg-white/[0.05] transition-all flex items-center gap-6 group disabled:opacity-50 relative overflow-hidden rounded-2xl shadow-sm hover:shadow-lg hover-lift">
                        <div className="absolute inset-0 bg-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="text-4xl font-black text-slate-700 group-hover:text-pink-500/60 font-mono w-10 relative z-10 transition-colors">01</span>
                        <span className="font-bold text-xl text-slate-300 group-hover:text-white leading-snug relative z-10">{s.activeEvent.data.optionA}</span>
                      </button>
                      <button onClick={() => handleCyberAnswer(false, s.activeEvent.usedHelp)} disabled={!isMyTurn} className="w-full text-left p-6 bg-white/[0.02] border border-white/5 hover:border-cyan-500/50 hover:bg-white/[0.05] transition-all flex items-center gap-6 group disabled:opacity-50 relative overflow-hidden rounded-2xl shadow-sm hover:shadow-lg hover-lift">
                        <div className="absolute inset-0 bg-cyan-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                        <span className="text-4xl font-black text-slate-700 group-hover:text-cyan-500/60 font-mono w-10 relative z-10 transition-colors">02</span>
                        <span className="font-bold text-xl text-slate-300 group-hover:text-white leading-snug relative z-10">{s.activeEvent.data.optionB}</span>
                      </button>
                    </div>
                  </div>
                )}

                {s.activeEvent.type === 'bonus' && (
                  <div>
                    <div className="inline-flex items-center gap-3 px-4 py-2 bg-purple-500/10 border-l-4 border-purple-500 text-purple-400 text-sm font-black uppercase tracking-widest mb-8">
                       <Gift className="w-5 h-5" /> Data Fragment
                    </div>
                    <div className="text-3xl text-white font-black mb-12 leading-tight drop-shadow-[0_0_10px_rgba(255,255,255,0.2)]">{s.activeEvent.data.question}</div>
                    
                    <div className="space-y-4">
                      {s.activeEvent.data.options.map((opt: string, i: number) => (
                        <button key={i} onClick={() => handleBonusAnswer(i)} disabled={!isMyTurn} className="w-full text-left p-6 bg-white/[0.02] border border-white/5 hover:border-purple-500/50 hover:bg-white/[0.05] transition-all flex items-center gap-6 group disabled:opacity-50 relative overflow-hidden rounded-2xl shadow-sm hover:shadow-lg hover-lift">
                          <div className="absolute inset-0 bg-purple-500/10 opacity-0 group-hover:opacity-100 transition-opacity" />
                          <span className="text-4xl font-black text-slate-700 group-hover:text-purple-500/60 font-mono w-10 relative z-10 transition-colors">0{i+1}</span>
                          <span className="font-bold text-xl text-slate-300 group-hover:text-white relative z-10">{opt}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {(s.activeEvent.type === 'cyber_result' || s.activeEvent.type === 'bonus_result') && (
                  <div className="text-center py-6">
                    <div className={cn("w-32 h-32 flex items-center justify-center mx-auto mb-8 relative rounded-3xl", s.activeEvent.data.isCorrect ? "bg-cyan-500/10 border border-cyan-400/50 shadow-lg" : "bg-pink-500/10 border border-pink-500/50 shadow-lg animate-glitch")}>
                       {s.activeEvent.data.isCorrect ? <ShieldCheck className="w-16 h-16 text-cyan-400 relative z-10 drop-shadow-lg" /> : <ShieldAlert className="w-16 h-16 text-pink-500 relative z-10 drop-shadow-lg" />}
                    </div>
                    
                    {s.activeEvent.data.isTimeout && (
                       <div className="text-red-500 font-black text-2xl mb-4 tracking-[0.3em] animate-pulse">CONNECTION TIMEOUT</div>
                    )}
                    
                    <h3 className={cn("text-5xl font-black mb-8 tracking-tighter uppercase", s.activeEvent.data.isCorrect ? "text-cyan-400 drop-shadow-[0_0_20px_rgba(34,211,238,0.5)]" : "text-pink-500 drop-shadow-[0_0_20px_rgba(236,72,153,0.5)]")}>
                      {s.activeEvent.data.isCorrect ? 'SECURED' : 'BREACHED'}
                    </h3>

                    {!s.activeEvent.data.isCorrect && s.activeEvent.data.taunt && (
                       <div className="italic text-rose-400 mb-10 font-bold text-xl md:text-2xl font-serif">"{s.activeEvent.data.taunt}"</div>
                    )}

                    <div className="bg-black/30 p-8 border border-white/5 rounded-2xl mb-12 text-slate-300 text-left font-sans text-lg leading-relaxed relative shadow-inner">
                      <div className="absolute top-0 left-0 w-2 h-full bg-slate-600 rounded-l-2xl" />
                      <span className="block text-slate-400 font-mono text-sm mb-4 uppercase tracking-[0.2em] pb-2 border-b border-white/5 flex items-center gap-2"><Fingerprint className="w-4 h-4"/> Forensic Log</span>
                      <div className="relative z-10">{s.activeEvent.data.explanation}</div>
                    </div>
                    <button 
                        onClick={() => { AudioEngine.playClick(); endTurn(); }} 
                        className="w-full h-16 relative group overflow-hidden transition-all disabled:opacity-50 rounded-2xl bg-purple-600 hover:bg-purple-500 border border-purple-400/50 shadow-[0_0_20px_rgba(168,85,247,0.4)]"
                     >
                        <div className="absolute inset-0 flex items-center justify-center text-white font-black text-lg md:text-xl uppercase tracking-widest group-disabled:text-slate-300">
                           ปิดหน้าต่าง (CLOSE)
                        </div>
                     </button>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Finished Screen */}
      <AnimatePresence>
        {s.view === 'finished' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 overflow-y-auto">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-slate-950/95 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} 
              className="relative z-10 w-full max-w-3xl p-10 md:p-16 bg-white/[0.03] shadow-2xl border border-white/10 backdrop-blur-md rounded-[32px] text-center my-10 group overflow-hidden"
            >
              <div className="absolute bottom-0 right-0 w-48 h-[2px] bg-pink-500" />

              <div className="relative inline-block mb-10">
                 <div className="absolute inset-0 bg-cyan-500/20 blur-3xl rounded-full" />
                 <Trophy className="w-32 h-32 text-cyan-400 relative z-10 animate-float drop-shadow-[0_0_20px_rgba(34,211,238,0.8)]" />
              </div>
              <h2 className="text-5xl md:text-7xl font-black mb-16 text-white tracking-tighter uppercase drop-shadow-[0_0_15px_rgba(255,255,255,0.4)]">Simulation Complete</h2>
              
              <div className="space-y-6 mb-16 relative z-10">
                {[...s.players].sort((a, b) => {
                  if (s.mode === 'score') return b.coins - a.coins;
                  if (a.finishOrder && b.finishOrder) return a.finishOrder - b.finishOrder;
                  if (a.finishOrder) return -1;
                  if (b.finishOrder) return 1;
                  return b.position - a.position;
                }).map((p, idx) => {
                   const avatarImg = AvatarMap[p.avatar] || AvatarMap['Cyber Security Expert'];
                   return (
                  <div key={p.id} 
                    className={cn("flex flex-col md:flex-row items-start md:items-center gap-6 p-6 transition-transform relative overflow-hidden group/card rounded-3xl", idx === 0 ? "bg-cyan-500/10 border border-cyan-400/50 shadow-lg scale-[1.02]" : "bg-white/[0.03] border border-white/5")}
                  >
                    <div className={cn("font-black text-5xl md:text-6xl w-16 text-center font-mono relative z-10", idx === 0 ? "text-cyan-400 drop-shadow-[0_0_10px_rgba(34,211,238,0.8)]" : "text-slate-600")}>0{idx + 1}</div>
                    <div className={cn("w-20 h-20 flex items-center justify-center rounded-2xl shadow-xl border border-white/20 shrink-0 relative z-10 overflow-hidden", p.color)}>
                       <img src={avatarImg} className="w-full h-full object-cover scale-110" alt="Avatar" />
                    </div>
                    <div className="flex-1 text-left min-w-0 relative z-10">
                      <div className="font-bold text-white text-3xl truncate tracking-wide mb-3">{p.name}</div>
                      <div className="flex gap-2 flex-wrap">
                         {p.badges.map((b, i) => <span key={i} className="text-xs bg-cyan-500/10 text-cyan-400 border border-cyan-500/30 px-3 py-1 rounded-md font-bold uppercase tracking-widest">{b}</span>)}
                      </div>
                    </div>
                    <div className="w-full md:w-auto text-right bg-black/20 px-8 py-4 border border-white/5 rounded-2xl shrink-0 relative z-10">
                      <div className="font-black text-4xl text-amber-400 flex items-center justify-end gap-3 drop-shadow-md"><Coins className="w-8 h-8"/>{p.coins}</div>
                      <div className="text-xs uppercase text-slate-500 font-bold tracking-[0.3em] mt-2">Score</div>
                    </div>
                  </div>
                )})}
              </div>
              <button 
                onClick={() => updateViewTransition({ ...s, view: 'menu' })} 
                className="w-full h-20 relative group overflow-hidden transition-all shadow-lg hover:shadow-xl rounded-[24px] bg-cyan-600 hover:bg-cyan-500 border border-white/10"
              >
                 <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-30" />
                 <div className="absolute w-[200%] h-full bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-[100%] group-hover:animate-[slide_1s_ease-in-out_infinite]" />
                 
                 <div className="absolute inset-0 flex items-center justify-center text-white font-black text-xl uppercase tracking-widest">
                    Return to Lobby
                 </div>
              </button>
            </motion.div>
          </div>
        )}

        {/* Manual Modal */}
        {showManual && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setShowManual(false)} />
            <div className="relative w-full max-w-2xl bg-[#0B1120] border border-cyan-500/30 shadow-[0_0_50px_rgba(34,211,238,0.15)] rounded-[24px] flex flex-col max-h-[90vh] overflow-hidden">
              <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/[0.02]">
                <h2 className="text-2xl font-black tracking-widest uppercase text-cyan-400 flex items-center gap-3">
                  <HelpCircle className="w-6 h-6" />
                  System Manual
                </h2>
                <button onClick={() => setShowManual(false)} className="w-10 h-10 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors">
                  ✕
                </button>
              </div>
              
              <div className="p-8 overflow-y-auto custom-scrollbar flex flex-col gap-8">
                <section>
                  <h3 className="text-xl font-bold text-white mb-4 border-b border-white/10 pb-2">วิธีการเล่น (How to Play)</h3>
                  <ul className="space-y-3 text-slate-300 list-disc pl-5 leading-relaxed">
                    <li>ระบบเกมเป็นบอร์ดเกมแนวไซเบอร์สุ่มทอยลูกเต๋าเดินตามช่องต่างๆ เพื่อไปให้ถึง <strong>MAINFRAME (เส้นชัย)</strong></li>
                    <li>ช่อง <strong className="text-red-400">Cyber Attack (สีแดง)</strong>: สุ่มเจอสถานการณ์ภัยไซเบอร์! ตอบคำถามให้ถูกในเวลา 10 วินาทีเพื่อรับเหรียญ หากตอบผิดจะเสียเหรียญ และบอส Scammer จะโจมตีคุณ!</li>
                    <li>ช่อง <strong className="text-blue-400">Safe Zone (สีน้ำเงิน)</strong>: พักผ่อนและรับ +1 เหรียญฟรี</li>
                    <li>ช่อง <strong className="text-amber-400">Bonus (สีเหลือง)</strong>: ช่องความรู้โบนัส ตอบถูกรับทันที +3 เหรียญ!</li>
                    <li>ช่อง <strong className="text-green-400">Help (สีเขียว)</strong>: ได้รับสิทธิ์ "TEAM CONSULT" ใช้ผ่านคำถามยากๆ หรือขอความช่วยเหลือในช่อง Cyber ครั้งต่อไป</li>
                    <li>ช่อง <strong className="text-violet-400">Shop (สีม่วง)</strong>: เลือกซื้อไอเทมแฮ็กเกอร์ด้วยเหรียญของคุณเพื่อโจมตีผู้เล่นอื่น หรือป้องกันตัวเอง (เช่น VPN, DDOS, Data Steal)</li>
                    <li>สามารถกดเข้า <strong>Shop</strong> จากเมนูด้านขวาบนได้ตลอดเวลาหากเป็นเทิร์นของคุณและมีเหรียญพอ!</li>
                  </ul>
                </section>

                <section>
                  <h3 className="text-xl font-bold text-cyan-400 mb-4 border-b border-white/10 pb-2">คณะผู้จัดทำ (Development Team)</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-slate-300 font-mono text-sm">
                    <div className="bg-white/[0.03] p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-colors">
                      <span className="text-cyan-500 mr-2">68048697</span> ธนภัทร แสงหิรัญ
                    </div>
                    <div className="bg-white/[0.03] p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-colors">
                      <span className="text-cyan-500 mr-2">68043407</span> วรพัธน์ ด้วงแก้ว
                    </div>
                    <div className="bg-white/[0.03] p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-colors">
                      <span className="text-cyan-500 mr-2">68103144</span> ชินภัทร บุญยศ
                    </div>
                    <div className="bg-white/[0.03] p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-colors">
                      <span className="text-cyan-500 mr-2">68071738</span> กันตภณ ฟ้าดิษฐี
                    </div>
                    <div className="bg-white/[0.03] p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-colors">
                      <span className="text-cyan-500 mr-2">68066986</span> บุลากร หอมพันธุ์
                    </div>
                    <div className="bg-white/[0.03] p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-colors">
                      <span className="text-cyan-500 mr-2">68102081</span> สิรภพ ผลเพียร
                    </div>
                    <div className="bg-white/[0.03] p-3 rounded-lg border border-white/5 hover:border-cyan-500/30 transition-colors md:col-span-2">
                      <span className="text-cyan-500 mr-2">68100827</span> ปราบดา ดาราฮีม
                    </div>
                  </div>
                </section>
              </div>
            </div>
          </div>
        )}

        {/* BOSS WIN Screen */}
        {s.view === 'gameover_boss' && (
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-6">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="absolute inset-0 bg-rose-950/95 backdrop-blur-md" />
            <motion.div initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} 
              className="bg-black/90 border border-red-500/50 p-12 md:p-20 max-w-3xl w-full text-center relative z-10 shadow-2xl backdrop-blur-md animate-glitch rounded-[32px] overflow-hidden"
            >
              <div className="absolute top-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
              <div className="absolute bottom-0 left-10 right-10 h-[1px] bg-gradient-to-r from-transparent via-red-500/50 to-transparent" />
              <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iNCIgaGVpZ2h0PSI0IiBmaWxsPSIjZmZmIiBmaWxsLW9wYWNpdHk9IjAuMSIvPgo8L3N2Zz4=')] opacity-20 pointer-events-none" />
              <Skull className="w-40 h-40 text-red-500 mx-auto mb-10 drop-shadow-[0_0_20px_rgba(244,63,94,1)] relative z-10" />
              <h2 className="text-6xl md:text-8xl font-black mb-6 text-red-500 tracking-tighter uppercase drop-shadow-[0_0_20px_rgba(244,63,94,0.8)] relative z-10">FATAL ERROR</h2>
              <p className="text-2xl text-rose-400 mb-16 font-bold tracking-widest uppercase relative z-10 bg-rose-950/40 inline-block px-6 py-2 border border-rose-500/30 rounded-2xl">The Scammer AI reached 100% capacity.<br/><span className="text-white">Mainframe destroyed.</span></p>
              
              <button 
                onClick={() => setS(prev => ({ ...prev, view: 'menu' }))} 
                className="w-full h-20 relative group overflow-hidden transition-all bg-white/[0.03] hover:bg-white/[0.08] border border-red-500/50 hover:border-red-400 shadow-[0_8px_30px_rgba(244,63,94,0.2)] rounded-[24px]"
              >
                 <div className="absolute inset-0 bg-red-500/10 group-hover:bg-red-500/20 transition-colors" />
                 <div className="absolute inset-0 flex items-center justify-center text-red-400 font-black text-xl uppercase tracking-widest group-hover:text-red-300">
                    Reboot System
                 </div>
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
