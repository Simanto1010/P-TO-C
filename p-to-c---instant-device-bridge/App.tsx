
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { TransferItem, ItemType } from './types';
import { getSmartAnalysis } from './geminiService';
import QRCode from 'qrcode';
import { Html5QrcodeScanner } from 'html5-qrcode';
import { 
  Copy, 
  Trash2, 
  Download, 
  Plus, 
  CheckCircle2,
  ChevronRight,
  SendHorizontal,
  QrCode,
  Link2,
  X,
  History,
  Smartphone,
  Monitor,
  CloudLightning,
  RefreshCw,
  FileText,
  Image as ImageIcon,
  ExternalLink,
  Camera,
  Keyboard
} from 'lucide-react';

const BROADCAST_CHANNEL_NAME = 'P2C_STABLE_V10';
const CLOUD_RELAY_URL = 'https://kvdb.io/v1/p2c_v10_standard';

const getDeviceType = () => {
  const ua = navigator.userAgent;
  if (/Mobile|Android|iP(hone|od)/i.test(ua)) return 'Mobile';
  return 'PC';
};

const generateCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

// Premium Logo Component
const P2CLogo = () => (
  <div className="flex items-center gap-3 select-none">
    <div className="relative group">
      <div className="absolute inset-0 bg-indigo-500 blur-xl opacity-20 group-hover:opacity-50 transition-opacity duration-500"></div>
      <div className="relative w-12 h-12 bg-gradient-to-br from-indigo-500 via-violet-600 to-indigo-700 rounded-2xl flex items-center justify-center shadow-[0_10px_30px_rgba(79,70,229,0.4)] transform group-hover:scale-110 transition-all duration-500 ease-out border border-white/10">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" className="drop-shadow-sm">
          <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 17L12 22L22 17" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M2 12L12 17L22 12" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </div>
    <div className="flex flex-col -space-y-1.5">
      <span className="text-2xl font-black italic tracking-tighter text-white drop-shadow-md">P<span className="text-indigo-400">2</span>C</span>
      <span className="text-[9px] font-black uppercase tracking-[0.4em] text-slate-500 leading-none">Bridge Core</span>
    </div>
  </div>
);

const App: React.FC = () => {
  const [items, setItems] = useState<TransferItem[]>([]);
  const [globalHistory, setGlobalHistory] = useState<TransferItem[]>(() => {
    const saved = localStorage.getItem('p2c_history_v10');
    return saved ? JSON.parse(saved) : [];
  });
  
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showPairing, setShowPairing] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [pairInput, setPairInput] = useState('');
  
  const [myNodeId] = useState(() => localStorage.getItem('p2c_node_id_v10') || generateCode());
  const [activeBridge, setActiveBridge] = useState(() => localStorage.getItem('p2c_bridge_v10') || myNodeId);
  const [pairingTab, setPairingTab] = useState<'qr' | 'scan' | 'id'>('qr');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const scannerRef = useRef<Html5QrcodeScanner | null>(null);
  const channel = useMemo(() => new BroadcastChannel(BROADCAST_CHANNEL_NAME), []);
  const deviceType = useMemo(() => getDeviceType(), []);

  // Sync state to local storage
  useEffect(() => {
    localStorage.setItem('p2c_node_id_v10', myNodeId);
    localStorage.setItem('p2c_bridge_v10', activeBridge);
    localStorage.setItem('p2c_history_v10', JSON.stringify(globalHistory));
  }, [activeBridge, myNodeId, globalHistory]);

  // QR Code Generation
  useEffect(() => {
    QRCode.toDataURL(activeBridge, {
      color: { dark: '#000000', light: '#ffffff' },
      width: 400,
      margin: 1
    }).then(setQrDataUrl);
  }, [activeBridge]);

  // Scanner Logic
  useEffect(() => {
    if (showPairing && pairingTab === 'scan') {
      const scanner = new Html5QrcodeScanner("scanner-container", { fps: 15, qrbox: { width: 250, height: 250 } }, false);
      scanner.render((text) => {
        const code = text.toUpperCase().trim();
        setActiveBridge(code);
        setShowPairing(false);
        scanner.clear();
      }, (err) => {});
      scannerRef.current = scanner;
    } else {
      scannerRef.current?.clear().catch(() => {});
    }
    return () => { scannerRef.current?.clear().catch(() => {}); };
  }, [showPairing, pairingTab]);

  // Cloud Sync Logic
  useEffect(() => {
    const syncData = async () => {
      try {
        const response = await fetch(`${CLOUD_RELAY_URL}/${activeBridge}`);
        if (response.ok) {
          const cloudData = await response.json();
          if (Array.isArray(cloudData) && JSON.stringify(cloudData) !== JSON.stringify(items)) {
            setItems(cloudData);
          }
        }
      } catch (e) { /* silent fail */ }
    };

    const interval = setInterval(syncData, 3000);
    syncData();
    return () => clearInterval(interval);
  }, [activeBridge, items]);

  useEffect(() => {
    channel.onmessage = (event) => {
      if (event.data.bridge === activeBridge && event.data.type === 'SYNC') {
        setItems(event.data.items);
      }
    };
  }, [activeBridge, channel]);

  const pushUpdate = async (newItems: TransferItem[]) => {
    try {
      await fetch(`${CLOUD_RELAY_URL}/${activeBridge}`, {
        method: 'POST',
        body: JSON.stringify(newItems)
      });
      channel.postMessage({ type: 'SYNC', bridge: activeBridge, items: newItems });
    } catch (e) { console.error("Relay error"); }
  };

  const handleSend = async (type: ItemType, content: string, fileName?: string) => {
    if (!content.trim() && !fileName) return;
    setIsProcessing(true);

    const { insight, actions, refinedType } = await getSmartAnalysis(type, content, fileName);
    
    const newItem: TransferItem = {
      id: crypto.randomUUID(),
      type: refinedType,
      content,
      fileName,
      timestamp: Date.now(),
      aiInsight: insight,
      smartActions: actions,
      metadata: { dimensions: deviceType }
    };

    const updatedItems = [newItem, ...items].slice(0, 50);
    setItems(updatedItems);
    await pushUpdate(updatedItems);
    setGlobalHistory(prev => [newItem, ...prev].slice(0, 100));
    
    setIsProcessing(false);
    setInputValue('');
  };

  const downloadFile = (item: TransferItem) => {
    const link = document.createElement('a');
    link.href = item.content;
    link.download = item.fileName || `P2C_Packet_${Date.now()}.bin`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200">
      <div className="relative max-w-2xl mx-auto px-4 py-8">
        
        {/* Premium Header */}
        <header className="flex items-center justify-between mb-12 px-2">
          <P2CLogo />

          <div className="flex gap-3">
            <button 
              onClick={() => { setShowPairing(true); setPairingTab('qr'); }}
              className="group flex items-center gap-3 px-5 py-2.5 bg-slate-800/60 hover:bg-slate-700/80 rounded-2xl border border-slate-700/50 transition-all text-sm font-bold active:scale-95 shadow-lg backdrop-blur-sm"
            >
              <span className="text-indigo-400 font-mono tracking-widest">{activeBridge}</span>
              <QrCode size={20} className="group-hover:scale-110 transition-transform text-indigo-400/80" />
            </button>
            <button 
              onClick={() => setShowHistory(true)}
              className="p-3 bg-slate-800/60 hover:bg-slate-700/80 rounded-2xl border border-slate-700/50 transition-all active:scale-95 shadow-lg backdrop-blur-sm group"
              title="Ledger"
            >
              <History size={20} className="group-hover:rotate-[-20deg] transition-transform" />
            </button>
          </div>
        </header>

        {/* Transfer Terminal */}
        <div className="bg-slate-900/30 border border-slate-800/40 rounded-[2.5rem] p-6 mb-12 backdrop-blur-xl shadow-[0_30px_60px_-15px_rgba(0,0,0,0.7)] relative overflow-hidden group">
          <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
          <textarea
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Relay data to your mesh..."
            className="w-full bg-transparent border-none text-slate-200 placeholder:text-slate-800 focus:ring-0 min-h-[160px] resize-none text-lg leading-relaxed font-medium"
          />
          <div className="flex items-center justify-between pt-6 border-t border-slate-800/30">
            <button 
              onClick={() => {
                const code = generateCode();
                setActiveBridge(code);
                setItems([]);
              }}
              className="text-[10px] font-black text-slate-700 hover:text-indigo-400 uppercase tracking-[0.5em] flex items-center gap-3 transition-all"
            >
              <RefreshCw size={14} /> New Link
            </button>
            <div className="flex gap-4">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="p-4 text-slate-600 hover:text-white hover:bg-slate-800 rounded-2xl transition-all"
                title="Add Data"
              >
                <Plus size={26} />
              </button>
              <button
                disabled={!inputValue.trim() || isProcessing}
                onClick={() => handleSend(inputValue.startsWith('http') ? 'link' : 'text', inputValue)}
                className="px-12 py-4 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-20 text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center gap-4 transition-all shadow-[0_15px_30px_-5px_rgba(79,70,229,0.4)] active:scale-95"
              >
                {isProcessing ? <RefreshCw className="animate-spin" size={20} /> : <>Transfer Now <SendHorizontal size={20} /></>}
              </button>
            </div>
          </div>
          <input type="file" ref={fileInputRef} className="hidden" onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = (ev) => handleSend(file.type.startsWith('image/') ? 'image' : 'file', ev.target?.result as string, file.name);
            reader.readAsDataURL(file);
          }} />
        </div>

        {/* Mesh Stream */}
        <div className="space-y-8 pb-24">
          <div className="flex items-center gap-5 px-3">
            <span className="text-[11px] font-black uppercase tracking-[0.8em] text-slate-800">Bridge Stream</span>
            <div className="flex-1 h-[1px] bg-slate-800/30" />
          </div>

          {items.length === 0 ? (
            <div className="text-center py-28 opacity-20">
              <CloudLightning size={70} strokeWidth={1} className="mx-auto mb-8 text-slate-600" />
              <p className="text-[11px] font-black uppercase tracking-[0.8em]">Awaiting Uplink</p>
            </div>
          ) : (
            <div className="space-y-5">
              {items.map(item => (
                <div key={item.id} className="bg-slate-900/20 border border-slate-800/40 rounded-3xl p-5 flex gap-6 hover:border-slate-700/60 transition-all group animate-in shadow-sm hover:shadow-xl backdrop-blur-sm">
                  <div className="shrink-0">
                    {item.type === 'image' ? (
                      <img src={item.content} className="w-16 h-16 rounded-2xl object-cover border border-slate-800/80 shadow-lg" alt="" />
                    ) : (
                      <div className="w-16 h-16 rounded-2xl bg-black/40 border border-slate-800/50 flex items-center justify-center text-indigo-400/80">
                        {item.type === 'link' ? <Link2 size={24} /> : item.type === 'file' ? <FileText size={24} /> : <ImageIcon size={24} />}
                      </div>
                    )}
                  </div>
                  <div className="flex-1 min-w-0 flex flex-col justify-center">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="text-sm font-bold text-white/90 truncate max-w-[300px] pr-4">
                        {item.fileName || (item.type === 'text' || item.type === 'link' ? item.content : 'Secure Packet')}
                      </h3>
                      <button 
                        onClick={() => {
                          const next = items.filter(i => i.id !== item.id);
                          setItems(next);
                          pushUpdate(next);
                        }}
                        className="p-1.5 text-slate-700 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-all active:scale-75"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    
                    <div className="flex flex-wrap gap-2.5 mt-2">
                      {(item.type === 'file' || item.type === 'image' || item.type === 'video') && (
                        <button 
                          onClick={() => downloadFile(item)}
                          className="px-5 py-2 bg-indigo-500/10 hover:bg-indigo-600 text-indigo-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all shadow-sm"
                        >
                          <Download size={14} /> Download
                        </button>
                      )}
                      
                      <button 
                        onClick={() => {
                          navigator.clipboard.writeText(item.content);
                          setCopiedId(item.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        className="px-5 py-2 bg-slate-800/40 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all shadow-sm"
                      >
                        {copiedId === item.id ? <CheckCircle2 size={14} className="text-green-500" /> : <Copy size={14} />} 
                        {copiedId === item.id ? 'Copied' : 'Copy'}
                      </button>

                      {item.type === 'link' && (
                        <button 
                          onClick={() => window.open(item.content, '_blank')}
                          className="px-5 py-2 bg-slate-800/40 hover:bg-slate-700 text-slate-400 hover:text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2.5 transition-all shadow-sm"
                        >
                          <ExternalLink size={14} /> View
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* PREMIUM PAIRING MODAL - FIXED TOKEN ID LAYOUT */}
      {showPairing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/95 backdrop-blur-3xl" onClick={() => setShowPairing(false)} />
          <div className="relative w-full max-w-sm bg-[#0e0e16] border border-slate-800/60 rounded-[3rem] p-8 shadow-[0_40px_100px_rgba(0,0,0,1)] overflow-hidden animate-in zoom-in-95 duration-300">
            
            {/* Functional Tabs */}
            <div className="flex bg-black/40 p-2 rounded-[1.5rem] mb-12 border border-slate-800/40 relative shadow-inner">
              <button 
                onClick={() => setPairingTab('qr')}
                className={`flex-1 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all relative z-10 ${pairingTab === 'qr' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600'}`}
              >
                QR Code
              </button>
              <button 
                onClick={() => setPairingTab('scan')}
                className={`flex-1 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all relative z-10 ${pairingTab === 'scan' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600'}`}
              >
                Scanner
              </button>
              <button 
                onClick={() => setPairingTab('id')}
                className={`flex-1 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] rounded-xl transition-all relative z-10 ${pairingTab === 'id' ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600'}`}
              >
                Token ID
              </button>
            </div>

            <div className="min-h-[380px] flex flex-col items-center justify-center">
              {pairingTab === 'qr' && (
                <div className="text-center w-full animate-in fade-in slide-in-from-bottom-4">
                  <div className="relative inline-block mb-10 group">
                    <div className="absolute inset-[-10px] bg-white blur-2xl opacity-10 group-hover:opacity-30 transition-opacity"></div>
                    <div className="relative bg-white p-7 rounded-[2.5rem] shadow-2xl overflow-hidden border-4 border-white">
                      <img src={qrDataUrl} alt="Bridge QR" className="w-44 h-44" />
                    </div>
                  </div>
                  
                  <div className="bg-black/50 rounded-[2rem] border border-slate-800/60 p-7 shadow-inner w-full group transition-all hover:border-indigo-500/30">
                    <p className="text-[10px] font-black text-slate-700 uppercase tracking-[0.6em] mb-3">Bridge ID</p>
                    <div className="text-5xl font-mono font-black text-indigo-400 tracking-tighter italic drop-shadow-[0_0_15px_rgba(99,102,241,0.4)] group-hover:scale-105 transition-transform">
                      {activeBridge}
                    </div>
                  </div>
                </div>
              )}

              {pairingTab === 'scan' && (
                <div className="w-full animate-in fade-in slide-in-from-bottom-4">
                  <div id="scanner-container" className="w-full aspect-square rounded-[2.5rem] overflow-hidden border-2 border-slate-800/50 shadow-inner bg-black/30 mb-8 relative">
                    <div className="absolute inset-x-10 top-1/2 h-1.5 bg-indigo-500/60 shadow-[0_0_25px_#6366f1] scan-line z-10 pointer-events-none rounded-full"></div>
                  </div>
                  <div className="flex items-center justify-center gap-4 text-slate-600 bg-black/30 py-3 rounded-full border border-slate-800/30">
                    <Camera size={18} className="animate-pulse" />
                    <p className="text-[10px] font-black uppercase tracking-[0.3em]">Mesh Scanner Active</p>
                  </div>
                </div>
              )}

              {pairingTab === 'id' && (
                <div className="w-full animate-in fade-in slide-in-from-bottom-4 flex flex-col items-center">
                  <div className="w-24 h-24 bg-gradient-to-br from-indigo-600/20 to-violet-600/10 rounded-[2rem] flex items-center justify-center text-indigo-400 mb-10 border border-indigo-500/20 shadow-2xl">
                    <Keyboard size={40} />
                  </div>
                  <p className="text-sm text-slate-600 mb-10 text-center px-6 leading-relaxed font-bold italic opacity-80">"Merge with a remote node by inputting its unique mesh token."</p>
                  
                  {/* Fixed Token ID Entry - Displaced Fix */}
                  <div className="flex gap-4 w-full relative">
                    <input 
                      type="text" 
                      value={pairInput}
                      onChange={(e) => setPairInput(e.target.value.toUpperCase())}
                      placeholder="TOKEN ID"
                      className="flex-1 min-w-0 bg-black/60 border border-slate-800 rounded-3xl px-8 py-5 text-white font-mono font-black text-3xl focus:border-indigo-600 transition-all text-center tracking-tighter focus:ring-0 placeholder:text-slate-900 shadow-inner block"
                    />
                    <button 
                      onClick={() => {
                        if (pairInput.trim()) {
                          setActiveBridge(pairInput.trim());
                          setShowPairing(false);
                          setPairInput('');
                          setItems([]);
                        }
                      }}
                      className="shrink-0 w-20 h-[76px] bg-indigo-600 hover:bg-indigo-500 text-white rounded-3xl shadow-[0_15px_30px_-10px_rgba(79,70,229,0.5)] flex items-center justify-center transition-all active:scale-90 active:bg-indigo-700"
                    >
                      <ChevronRight size={38} strokeWidth={3} />
                    </button>
                  </div>
                </div>
              )}
            </div>
            
            <button onClick={() => setShowPairing(false)} className="absolute top-8 right-8 text-slate-700 hover:text-white transition-all active:scale-75 z-20">
              <X size={32} />
            </button>
          </div>
        </div>
      )}

      {/* Activity Ledger */}
      {showHistory && (
        <div className="fixed inset-0 z-[60] flex justify-end">
          <div className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={() => setShowHistory(false)} />
          <div className="relative w-full max-w-md bg-[#0a0a12] h-full shadow-2xl p-10 border-l border-slate-800/50 animate-in slide-in-from-right duration-400">
            <div className="flex items-center justify-between mb-16">
              <div className="flex items-center gap-5">
                <div className="p-4 bg-indigo-500/10 rounded-[1.5rem] text-indigo-400 border border-indigo-500/20 shadow-lg">
                  <History size={26} />
                </div>
                <div>
                  <h2 className="text-2xl font-black text-white italic tracking-tighter leading-none">THE LEDGER</h2>
                  <p className="text-[10px] font-black uppercase text-slate-700 tracking-[0.5em] mt-2">Node History Logs</p>
                </div>
              </div>
              <button onClick={() => setShowHistory(false)} className="p-3 text-slate-700 hover:text-white transition-all active:scale-75"><X size={36} /></button>
            </div>
            
            <div className="space-y-5 overflow-y-auto h-[calc(100vh-280px)] pr-5 custom-scroll pb-12">
              {globalHistory.length === 0 ? (
                <div className="text-center py-48 opacity-10">
                  <History size={80} strokeWidth={1} className="mx-auto mb-8" />
                  <p className="text-xs font-black uppercase tracking-[1em]">Empty Log</p>
                </div>
              ) : (
                globalHistory.map(item => (
                  <div key={item.id} className="p-6 bg-slate-900/30 rounded-[2rem] border border-slate-800/60 flex gap-5 hover:border-slate-700 transition-all shadow-sm">
                    <div className="w-14 h-14 rounded-2xl bg-black/50 flex items-center justify-center text-slate-700 shrink-0 border border-slate-800/40">
                      {item.type === 'image' ? <ImageIcon size={26} /> : <FileText size={26} />}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col justify-center">
                      <p className="text-sm font-bold text-slate-200 truncate mb-1.5 italic pr-4">{item.fileName || (item.type === 'text' ? item.content : 'Mesh Fragment')}</p>
                      <div className="flex items-center justify-between">
                         <span className="text-[11px] text-slate-700 font-black uppercase tracking-widest">{new Date(item.timestamp).toLocaleString([], { hour: '2-digit', minute: '2-digit' })}</span>
                         <button 
                          onClick={() => {
                            navigator.clipboard.writeText(item.content);
                            setCopiedId(item.id);
                            setTimeout(() => setCopiedId(null), 2000);
                          }}
                          className="text-[10px] font-black text-indigo-500 hover:text-white transition-all uppercase tracking-[0.2em]"
                         >
                           {copiedId === item.id ? 'Copied' : 'Resend'}
                         </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            
            <div className="absolute bottom-12 left-10 right-10">
              <button 
                onClick={() => setGlobalHistory([])}
                className="w-full py-5 text-[11px] font-black uppercase tracking-[0.6em] text-slate-800 hover:text-red-500 transition-all border border-slate-800/40 hover:border-red-500/20 rounded-3xl bg-black/40 shadow-xl"
              >
                Clear All Nodes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Mesh HUB */}
      <div className="fixed bottom-12 left-1/2 -translate-x-1/2 flex items-center gap-12 px-12 py-6 bg-[#0c0c14]/90 border border-slate-800/80 rounded-[3rem] shadow-[0_40px_100px_rgba(0,0,0,1)] backdrop-blur-3xl z-40 transition-all hover:scale-[1.03] hover:border-indigo-500/40 group">
        <div className="flex items-center gap-5 pr-12 border-r border-slate-800/80">
          <div className={`w-3.5 h-3.5 rounded-full transition-all duration-1000 ${activeBridge !== myNodeId ? 'bg-indigo-500 shadow-[0_0_25px_#6366f1]' : 'bg-slate-800'}`} />
          <span className="text-[12px] font-black uppercase tracking-[0.5em] text-white/80 italic">{activeBridge !== myNodeId ? 'MESH ACTIVE' : 'PRIVATE NODE'}</span>
        </div>
        <div className="flex gap-12 items-center">
          <Monitor size={24} className={deviceType === 'PC' ? 'text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.6)]' : 'text-slate-900'} />
          <div className="w-16 h-[1.5px] bg-slate-800/80 relative overflow-hidden rounded-full">
            <div className="absolute inset-0 bg-indigo-500/30 animate-pulse"></div>
          </div>
          <Smartphone size={24} className={deviceType === 'Mobile' ? 'text-indigo-400 drop-shadow-[0_0_12px_rgba(99,102,241,0.6)]' : 'text-slate-900'} />
        </div>
      </div>
    </div>
  );
};

export default App;
