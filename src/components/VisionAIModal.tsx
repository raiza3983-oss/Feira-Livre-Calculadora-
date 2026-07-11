import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Camera, Barcode, QrCode, Cpu, Scale, FileText, CheckSquare, 
  Package, Image, Plus, Trash2, AlertTriangle, Play, Square, RefreshCw, 
  Settings, Wifi, Terminal, Check, Upload, Clock, Compass, Layers, Monitor
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import CameraView from '../modules/vision_v2/camera/CameraView';
import CameraOverlay, { DetectionBox } from '../modules/vision_v2/camera/CameraOverlay';

interface ProductMetadata {
  id?: string;
  productName?: string;
  marca?: string;
  categoria?: string;
  fotoPrincipal?: string;
  fotosExtras?: string[];
  codigoGS1?: string;
  codigoInterno?: string;
  peso?: number;
  validade?: string;
  lote?: string;
  fornecedor?: string;
  origem?: string;
  situacao?: 'Aprovado' | 'Em Análise' | 'Quarentena' | 'Descartado';
  observacoes?: string;
}

interface VisionAIModalProps {
  isOpen: boolean;
  onClose: () => void;
  products: Array<{
    id: string;
    name: string;
    quantity: number;
    unit: 'kg' | 'gram' | 'box' | 'bag' | 'unit';
    weightPerUnit: number;
    segmento?: string;
  }>;
  productsSmartMetadata: Record<string, ProductMetadata>;
  selectedProductId: string | null;
  onSelectProduct: (pId: string) => void;
  onSaveMetadata: (prodId: string, data: ProductMetadata) => void;
  onUpdateProductWeight: (prodId: string, weight: number) => void;
}

type TabType = 
  | 'overview' 
  | 'barcode' 
  | 'qrcode' 
  | 'detector' 
  | 'counter' 
  | 'ocr' 
  | 'scale' 
  | 'evidence' 
  | 'conference' 
  | 'inventory';

export default function VisionAIModal({
  isOpen,
  onClose,
  products,
  productsSmartMetadata,
  selectedProductId,
  onSelectProduct,
  onSaveMetadata,
  onUpdateProductWeight
}: VisionAIModalProps) {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [cameraActive, setCameraActive] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [logs, setLogs] = useState<Array<{ id: string; msg: string; type: 'info' | 'success' | 'warn'; timestamp: string }>>([]);
  const [isCameraSupported, setIsCameraSupported] = useState<boolean>(true);
  
  // Real camera references
  const cameraRef = useRef<any>(null);

  // Active product metadata
  const currentProduct = products.find(p => p.id === selectedProductId);
  const activeMeta = selectedProductId ? (productsSmartMetadata[selectedProductId] || {}) : null;

  // OCR state mock-ups
  const [ocrText, setOcrText] = useState<string>('');
  const [ocrResult, setOcrResult] = useState<{ lote?: string; validade?: string; peso?: number }>({});
  
  // Barcode / GS1 mock state
  const [scannedCode, setScannedCode] = useState<string>('');
  const [barcodeResult, setBarcodeResult] = useState<{ format?: string; category?: string; manufacturer?: string }>({});

  // Object Counter state
  const [counterCount, setCounterCount] = useState<number>(0);
  const [counterType, setCounterType] = useState<string>('Unidades');

  // Scale state
  const [scaleConnection, setScaleConnection] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [scaleWeight, setScaleWeight] = useState<number>(0);
  const [scaleMethod, setScaleMethod] = useState<'bluetooth' | 'usb' | 'serial' | 'ocr'>('bluetooth');

  // Evidence state
  const [evidenceNotes, setEvidenceNotes] = useState<string>('');
  const [evidencePhotos, setEvidencePhotos] = useState<string[]>([]);
  const [evidenceMainPhoto, setEvidenceMainPhoto] = useState<string>('');

  // Conference state
  const [confQuantity, setConfQuantity] = useState<number>(0);
  const [confStatus, setConfStatus] = useState<'pending' | 'verified' | 'failed'>('pending');

  // Bounding box overlays
  const [detections, setDetections] = useState<DetectionBox[]>([]);

  // Push to console logs
  const addLog = (msg: string, type: 'info' | 'success' | 'warn' = 'info') => {
    const time = new Date().toLocaleTimeString('pt-BR');
    setLogs(prev => [{ id: Math.random().toString(), msg, type, timestamp: time }, ...prev.slice(0, 15)]);
  };

  // Initialize tabs and load product evidence notes
  useEffect(() => {
    if (selectedProductId && activeMeta) {
      setEvidenceNotes(activeMeta.observacoes || '');
      setEvidencePhotos(activeMeta.fotosExtras || []);
      setEvidenceMainPhoto(activeMeta.fotoPrincipal || '');
      setConfQuantity(currentProduct?.quantity || 1);
    } else {
      setEvidenceNotes('');
      setEvidencePhotos([]);
      setEvidenceMainPhoto('');
      setConfQuantity(1);
    }
  }, [selectedProductId, activeMeta]);

  // Handle detection simulation based on tabs
  useEffect(() => {
    if (!cameraActive) {
      setDetections([]);
      return;
    }

    let interval: NodeJS.Timeout;
    if (activeTab === 'detector') {
      interval = setInterval(() => {
        if (currentProduct) {
          setDetections([
            {
              id: 'det-1',
              x: 25 + Math.random() * 6,
              y: 20 + Math.random() * 6,
              width: 45 + Math.random() * 4,
              height: 50 + Math.random() * 4,
              label: `${currentProduct.name.toUpperCase()}`,
              confidence: 90 + Math.floor(Math.random() * 9)
            }
          ]);
        } else {
          setDetections([
            {
              id: 'det-unknown',
              x: 30,
              y: 30,
              width: 40,
              height: 40,
              label: 'AGUARDANDO PRODUTO',
              confidence: 60
            }
          ]);
        }
      }, 1500);
    } else if (activeTab === 'counter') {
      interval = setInterval(() => {
        const count = 3 + Math.floor(Math.random() * 5);
        setCounterCount(count);
        const list: DetectionBox[] = [];
        for (let i = 0; i < count; i++) {
          list.push({
            id: `count-${i}`,
            x: 10 + (i * 12) + Math.random() * 4,
            y: 30 + Math.random() * 30,
            width: 10,
            height: 12,
            label: `${currentProduct?.name || 'Item'} #${i + 1}`,
            confidence: 98
          });
        }
        setDetections(list);
      }, 2000);
    } else {
      setDetections([]);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [activeTab, cameraActive, selectedProductId]);

  if (!isOpen) return null;

  // Simulate general actions
  const triggerScan = () => {
    if (!cameraActive) {
      addLog('Ative a câmera para iniciar o processamento de imagem.', 'warn');
      return;
    }
    setIsScanning(true);
    addLog(`Processamento iniciado no módulo: ${activeTab.toUpperCase()}`, 'info');

    setTimeout(() => {
      setIsScanning(false);
      
      if (activeTab === 'barcode') {
        const generatedCode = '789102' + Math.floor(1000000 + Math.random() * 9000000);
        setScannedCode(generatedCode);
        setBarcodeResult({
          format: 'EAN-13 (GS1 Brasil)',
          category: currentProduct?.segmento || 'Alimentos / Hortifrúti',
          manufacturer: 'Distribuidora Sabor Local Ltda'
        });
        addLog(`Código EAN-13 detectado com sucesso: ${generatedCode}`, 'success');

        // Look up corresponding product if we have code matches or just assign
        if (selectedProductId) {
          const updated: ProductMetadata = {
            ...(productsSmartMetadata[selectedProductId] || {}),
            id: selectedProductId,
            codigoGS1: generatedCode,
            productName: currentProduct?.name
          };
          onSaveMetadata(selectedProductId, updated);
          addLog(`Código de barras vinculado ao produto: ${currentProduct?.name}`, 'success');
        }
      } 
      
      else if (activeTab === 'qrcode') {
        const qrContent = `https://feiralivre.app/trace/sku-${selectedProductId || '000'}?lot=L${Math.floor(Math.random()*9000)}`;
        setScannedCode(qrContent);
        addLog(`QR Code / DataMatrix verificado: ${qrContent}`, 'success');
      } 
      
      else if (activeTab === 'detector') {
        if (!selectedProductId) {
          addLog('Nenhum produto selecionado para comparação.', 'warn');
          return;
        }
        addLog(`Detector comparou os frames. Confiança de 97.4% de ser ${currentProduct?.name}`, 'success');
      } 
      
      else if (activeTab === 'counter') {
        addLog(`Contagem finalizada. Foram detectados ${counterCount} volumes.`, 'success');
      } 
      
      else if (activeTab === 'ocr') {
        const l = 'LOT-' + Math.floor(Math.random() * 9000 + 1000);
        const val = '2026-10-15';
        const p = Number((0.500 + Math.random() * 2).toFixed(3));
        setOcrResult({ lote: l, validade: val, peso: p });
        setOcrText(`PROD: ${currentProduct?.name || 'ALIMENTO'}\nLOT: ${l}\nVAL: ${val}\nPESO LIQ: ${p} kg\nORIGEM: BRASIL`);
        addLog(`OCR processado com sucesso. Lote: ${l}, Validade: ${val}`, 'success');

        if (selectedProductId) {
          const updated: ProductMetadata = {
            ...(productsSmartMetadata[selectedProductId] || {}),
            id: selectedProductId,
            lote: l,
            validade: val,
            peso: p,
            productName: currentProduct?.name
          };
          onSaveMetadata(selectedProductId, updated);
          onUpdateProductWeight(selectedProductId, p);
          addLog(`Dados extraídos via OCR salvos na Ficha de Rastreabilidade.`, 'success');
        }
      } 
      
      else if (activeTab === 'scale') {
        const weightMock = Number((0.800 + Math.random() * 1.5).toFixed(3));
        setScaleWeight(weightMock);
        addLog(`Leitura de peso estabilizada: ${weightMock.toFixed(3)} kg`, 'success');
        
        if (selectedProductId) {
          const updated: ProductMetadata = {
            ...(productsSmartMetadata[selectedProductId] || {}),
            id: selectedProductId,
            peso: weightMock,
            productName: currentProduct?.name
          };
          onSaveMetadata(selectedProductId, updated);
          onUpdateProductWeight(selectedProductId, weightMock);
          addLog(`Peso de ${weightMock.toFixed(3)} kg gravado no produto ${currentProduct?.name}`, 'success');
        }
      }
    }, 1800);
  };

  // Connect Scale simulator
  const connectScale = () => {
    setScaleConnection('connecting');
    addLog(`Iniciando handshake com balança via ${scaleMethod}...`, 'info');
    setTimeout(() => {
      setScaleConnection('connected');
      const base = currentProduct?.weightPerUnit || 1.150;
      setScaleWeight(base);
      addLog(`Balança Industrial classe III conectada com sucesso!`, 'success');
    }, 1500);
  };

  // Save evidence
  const saveEvidenceData = () => {
    if (!selectedProductId) {
      addLog('Selecione um produto para salvar as evidências.', 'warn');
      return;
    }

    const updated: ProductMetadata = {
      ...(productsSmartMetadata[selectedProductId] || {}),
      id: selectedProductId,
      productName: currentProduct?.name,
      fotoPrincipal: evidenceMainPhoto,
      fotosExtras: evidencePhotos,
      observacoes: evidenceNotes
    };

    onSaveMetadata(selectedProductId, updated);
    addLog(`Evidências salvas para o produto: ${currentProduct?.name}`, 'success');
  };

  // Toggle real camera
  const toggleCamera = async () => {
    if (cameraActive) {
      cameraRef.current?.stop();
      setCameraActive(false);
      addLog('Câmera desativada pelo operador', 'warn');
    } else {
      setCameraActive(true);
      addLog('Ativando feed de câmera em tempo real...', 'info');
      setTimeout(() => {
        cameraRef.current?.start();
      }, 300);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-[32px] w-full max-w-6xl overflow-hidden shadow-2xl flex flex-col md:h-[85vh] h-auto font-sans text-slate-100">
        
        {/* MODAL HEADER */}
        <div className="bg-slate-950 px-6 py-4 border-b border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20">
              <Cpu size={20} className="animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[9px] bg-emerald-500/20 text-emerald-400 font-extrabold px-1.5 py-0.5 rounded tracking-widest uppercase font-mono">
                  PRO v2.5
                </span>
                <span className="text-[10px] text-slate-500 font-mono">
                  OFFLINE-FIRST CORE
                </span>
              </div>
              <h2 className="text-sm md:text-base font-black text-white uppercase tracking-tight">
                Antigravity Vision AI Suite
              </h2>
            </div>
          </div>

          {/* ACTIVE PRODUCT CONTROL SELECTOR */}
          <div className="flex items-center gap-3 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-slate-800">
            <div className="text-left">
              <span className="text-[8px] text-slate-500 font-extrabold uppercase block tracking-wider">
                PRODUTO EM CONFERÊNCIA
              </span>
              <select
                value={selectedProductId || ''}
                onChange={(e) => onSelectProduct(e.target.value)}
                className="bg-transparent text-xs font-black text-emerald-400 focus:outline-none border-0 p-0 pr-6 cursor-pointer"
              >
                <option value="" className="bg-slate-900 text-slate-300">-- SELECIONE UM PRODUTO --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                    {p.name.toUpperCase()} ({p.unit.toUpperCase()})
                  </option>
                ))}
              </select>
            </div>
            {selectedProductId && (
              <span className="bg-slate-800 text-slate-400 text-[8px] font-mono px-2 py-1 rounded">
                SKU-{selectedProductId.substring(0, 5).toUpperCase()}
              </span>
            )}
          </div>

          {/* CLOSE ACTION */}
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-850 text-slate-400 hover:text-white flex items-center justify-center transition-colors border-0 hover:bg-slate-800 cursor-pointer self-end md:self-auto"
          >
            <X size={16} />
          </button>
        </div>

        {/* MODAL MAIN LAYOUT */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* LEFT SIDEBAR: MODULE LIST */}
          <div className="w-full md:w-60 bg-slate-950/40 border-r border-slate-850 flex flex-col md:h-full max-h-[300px] md:max-h-none overflow-y-auto shrink-0 p-3.5 space-y-1">
            <span className="text-[9px] text-slate-500 font-extrabold tracking-widest uppercase px-3.5 py-1 mb-1 block">
              Módulos Integrados
            </span>

            {[
              { id: 'overview', label: 'Visão Geral', icon: Monitor },
              { id: 'barcode', label: 'Código de Barras', icon: Barcode },
              { id: 'qrcode', label: 'QR Code', icon: QrCode },
              { id: 'detector', label: 'Detector de Produtos', icon: Compass },
              { id: 'counter', label: 'Contador Automático', icon: Layers },
              { id: 'ocr', label: 'OCR Leitor de Texto', icon: FileText },
              { id: 'scale', label: 'Leitor de Balança', icon: Scale },
              { id: 'evidence', label: 'Evidências & Fotos', icon: Image },
              { id: 'conference', label: 'Conferência Carga', icon: CheckSquare },
              { id: 'inventory', label: 'Inventário Rápido', icon: Package }
            ].map((tab) => {
              const Icon = tab.icon;
              const isActive = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id as TabType);
                    addLog(`Módulo alterado para: ${tab.label}`, 'info');
                  }}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl border-0 text-left font-bold text-xs uppercase tracking-wide transition-all cursor-pointer ${
                    isActive 
                      ? 'bg-emerald-600 text-white font-black shadow-lg shadow-emerald-950/30' 
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/40'
                  }`}
                >
                  <Icon size={14} className={isActive ? 'text-white' : 'text-slate-500'} />
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>

          {/* MAIN CONTENT SPLIT WORKSPACE */}
          <div className="flex-1 flex flex-col lg:flex-row overflow-hidden min-h-0">
            
            {/* WORKSPACE LEFT: STREAM FEED OVERLAY */}
            <div className="flex-1 p-5 flex flex-col justify-between overflow-y-auto space-y-4">
              
              {/* CAMERA FEED WRAPPER */}
              <div className="relative aspect-video rounded-3xl bg-slate-950 border border-slate-800 overflow-hidden shadow-inner flex flex-col items-center justify-center min-h-[220px]">
                
                {/* Simulated Grid Background */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#1e293b_1px,transparent_1px),linear-gradient(to_bottom,#1e293b_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

                {cameraActive ? (
                  <>
                    <CameraView 
                      ref={cameraRef}
                      className="absolute inset-0 w-full h-full"
                      onReady={() => addLog('Feed de câmera estabelecido.', 'success')}
                      onError={(err) => {
                        setIsCameraSupported(false);
                        addLog(`Erro ou restrição de iFrame na câmera: ${err.message}`, 'warn');
                      }}
                    />
                    
                    {/* Interactive overlay boxes */}
                    <CameraOverlay 
                      detections={detections}
                      showCrosshair={activeTab === 'overview' || activeTab === 'detector'}
                      showBarcodeArea={activeTab === 'barcode' || activeTab === 'qrcode'}
                      showMeasureArea={activeTab === 'counter' || activeTab === 'scale'}
                    />

                    {/* Scanning animation laser */}
                    {(isScanning || isScanning === false) && (
                      <motion.div
                        animate={{ y: ['0%', '100%', '0%'] }}
                        transition={{ repeat: Infinity, duration: 3, ease: 'easeInOut' }}
                        className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-emerald-400 to-transparent shadow-[0_0_12px_rgba(52,211,153,0.8)] z-10 pointer-events-none"
                      />
                    )}

                    {/* Simulation watermark */}
                    <div className="absolute bottom-3 left-3 bg-slate-900/80 px-2 py-1 rounded text-[8px] font-mono tracking-widest text-emerald-400 border border-slate-800 z-10">
                      LIVE STREAM • DETECTOR {activeTab.toUpperCase()}
                    </div>
                  </>
                ) : (
                  <div className="text-center space-y-3 p-6 z-10">
                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center text-slate-500 border border-slate-800 mx-auto">
                      <Camera size={24} />
                    </div>
                    <div>
                      <h4 className="text-sm font-black uppercase text-slate-300">Câmera em Standby</h4>
                      <p className="text-xs text-slate-500 max-w-xs mx-auto mt-1">Clique em "Ativar Câmera" para iniciar o processamento local.</p>
                    </div>
                  </div>
                )}
              </div>

              {/* CAMERA CONTROL OVERLAY OPTIONS */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-950/50 p-3 rounded-2xl border border-slate-850">
                <div className="flex items-center gap-2">
                  <button
                    onClick={toggleCamera}
                    className={`px-4 py-2 text-[10px] font-extrabold uppercase tracking-wider rounded-xl transition-all border-0 cursor-pointer flex items-center gap-1.5 ${
                      cameraActive 
                        ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20' 
                        : 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                    }`}
                  >
                    {cameraActive ? <Square size={12} /> : <Play size={12} />}
                    {cameraActive ? 'Desativar Câmera' : 'Ativar Câmera'}
                  </button>

                  <button
                    onClick={triggerScan}
                    disabled={isScanning || !cameraActive}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl border-0 flex items-center gap-1.5 transition-all cursor-pointer"
                  >
                    <RefreshCw size={12} className={isScanning ? 'animate-spin' : ''} />
                    {isScanning ? 'Analisando...' : 'Análise por IA'}
                  </button>
                </div>

                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono">
                  <Wifi size={12} className="text-emerald-400" />
                  <span>MODO OFFLINE ATIVO</span>
                </div>
              </div>

              {/* LIVE TERMINAL LOGGER */}
              <div className="bg-slate-950 rounded-2xl border border-slate-850 overflow-hidden flex flex-col h-40">
                <div className="bg-slate-950 px-4 py-2 border-b border-slate-900 flex items-center justify-between">
                  <span className="text-[8px] font-mono font-bold tracking-widest text-slate-500 uppercase flex items-center gap-1.5">
                    <Terminal size={10} className="text-emerald-500" /> CONSOLE LOG • ANTIGRAVITY v2.5
                  </span>
                  <button
                    onClick={() => setLogs([])}
                    className="text-[8px] font-bold text-slate-500 hover:text-slate-300 border-0 bg-transparent cursor-pointer"
                  >
                    LIMPAR
                  </button>
                </div>
                <div className="flex-1 p-3.5 font-mono text-[9px] overflow-y-auto space-y-1.5 scrollbar-thin">
                  {logs.length === 0 ? (
                    <div className="text-slate-600 italic">Inicie uma leitura ou altere o módulo para gerar logs de rastreabilidade...</div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="flex gap-2 items-start leading-relaxed">
                        <span className="text-slate-600 shrink-0">[{log.timestamp}]</span>
                        <span className={
                          log.type === 'success' ? 'text-emerald-400 font-bold' : 
                          log.type === 'warn' ? 'text-amber-400 font-bold' : 'text-slate-300'
                        }>
                          {log.msg}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>

            </div>

            {/* WORKSPACE RIGHT: INTEGRATED MODULE PANEL */}
            <div className="w-full lg:w-[400px] bg-slate-950/30 border-l border-slate-850 p-5 overflow-y-auto flex flex-col justify-between">
              
              <div className="space-y-6">
                
                {/* 1. VISÃO GERAL TAB */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Painel Geral</span>
                      <h3 className="text-sm font-black text-white uppercase">Visão Multimodal</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        O Antigravity Vision AI consolida todos os sensores por câmera no mesmo núcleo de processamento.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3">
                      <h4 className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest">Sensores Prontos</h4>
                      <div className="grid grid-cols-2 gap-2 text-[10px] font-bold uppercase text-slate-300">
                        <div className="bg-slate-900 p-2 rounded-xl flex items-center gap-2 border border-slate-850">
                          <Barcode size={12} className="text-emerald-400" /> EAN-13 GS1
                        </div>
                        <div className="bg-slate-900 p-2 rounded-xl flex items-center gap-2 border border-slate-850">
                          <QrCode size={12} className="text-emerald-400" /> 2D Matrix
                        </div>
                        <div className="bg-slate-900 p-2 rounded-xl flex items-center gap-2 border border-slate-850">
                          <Compass size={12} className="text-emerald-400" /> Detector
                        </div>
                        <div className="bg-slate-900 p-2 rounded-xl flex items-center gap-2 border border-slate-850">
                          <FileText size={12} className="text-emerald-400" /> OCR Text
                        </div>
                      </div>
                    </div>

                    <div className="bg-emerald-950/20 p-4 rounded-2xl border border-emerald-900/30 space-y-2">
                      <div className="flex gap-2 text-emerald-400 items-start">
                        <Check size={16} className="shrink-0 mt-0.5" />
                        <div className="text-xs font-bold leading-tight">Como integrar as leituras?</div>
                      </div>
                      <p className="text-[10px] text-emerald-300/80 leading-relaxed">
                        Selecione o produto acima, aponte a câmera e clique em <strong>Análise por IA</strong>. Os dados extraídos (peso, lote, validade, código de barras) serão automaticamente atualizados no produto.
                      </p>
                    </div>
                  </div>
                )}

                {/* 2. BARCODE / GS1 TAB */}
                {activeTab === 'barcode' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Rastreador GS1</span>
                      <h3 className="text-sm font-black text-white uppercase">Código de Barras</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Suporte completo para códigos EAN-13, EAN-8, UPC e GTIN.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block mb-1">Último Código Lido</label>
                        <div className="relative">
                          <Barcode size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-emerald-400" />
                          <input
                            type="text"
                            readOnly
                            value={scannedCode || 'Aguardando varredura...'}
                            className="w-full pl-9 pr-4 py-2.5 bg-slate-950 border border-slate-850 rounded-xl text-xs font-mono font-bold text-emerald-400 focus:outline-none"
                          />
                        </div>
                      </div>

                      {scannedCode && (
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-2 font-mono text-[10px]">
                          <div className="flex justify-between"><span className="text-slate-500">FORMATO:</span> <span className="text-slate-300 font-bold">{barcodeResult.format}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">CATEGORIA:</span> <span className="text-slate-300 font-bold">{barcodeResult.category}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">PRODUTOR:</span> <span className="text-slate-300 font-bold">{barcodeResult.manufacturer}</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 3. QR CODE TAB */}
                {activeTab === 'qrcode' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Leitor de QR</span>
                      <h3 className="text-sm font-black text-white uppercase">QR Code / DataMatrix</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Ideal para rastreabilidade de fardo e lotes agrícolas de produtores certificados.
                      </p>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block mb-1">Conteúdo Lido</label>
                        <textarea
                          readOnly
                          rows={3}
                          value={scannedCode || 'Nenhum QR Code no frame...'}
                          className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl text-xs font-mono font-bold text-emerald-400 focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>
                )}

                {/* 4. PRODUCT DETECTOR TAB */}
                {activeTab === 'detector' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Visão Computacional</span>
                      <h3 className="text-sm font-black text-white uppercase">Detector de Produtos</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Utiliza a foto cadastrada na ficha técnica como modelo de aprendizado local para conferência de identidade.
                      </p>
                    </div>

                    {currentProduct ? (
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3">
                        <div className="flex items-center gap-3">
                          {activeMeta?.fotoPrincipal ? (
                            <img
                              src={activeMeta.fotoPrincipal}
                              alt="Referência"
                              className="w-12 h-12 rounded-lg object-cover border border-slate-800"
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-12 h-12 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-center text-slate-600">
                              <Image size={16} />
                            </div>
                          )}
                          <div>
                            <span className="text-[8px] text-slate-500 font-extrabold uppercase block leading-none">MODELO DE REFERÊNCIA</span>
                            <span className="text-xs font-black text-slate-200">{currentProduct.name.toUpperCase()}</span>
                          </div>
                        </div>

                        {cameraActive && (
                          <div className="bg-emerald-950/20 p-3 rounded-xl border border-emerald-900/30 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-emerald-400">Match de IA:</span>
                            <span className="text-xs font-black text-emerald-400">97.4% CONFIDÊNCIA</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="p-4 text-center bg-slate-950 border border-slate-850 rounded-2xl text-[10px] text-slate-500 font-bold uppercase">
                        Selecione um produto para ativar o comparador de imagem.
                      </div>
                    )}
                  </div>
                )}

                {/* 5. OBJECT COUNTER TAB */}
                {activeTab === 'counter' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Conferência Automatizada</span>
                      <h3 className="text-sm font-black text-white uppercase">Contador de Objetos</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Contagem de volumes ou unidades no mesmo frame por contraste e segmentação geométrica.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850 text-center space-y-2">
                      <span className="text-[8px] text-slate-500 font-extrabold uppercase block tracking-widest">QUANTIDADE CONSTATADA</span>
                      <div className="text-3xl font-mono font-black text-emerald-400 tracking-wider">
                        {counterCount} <span className="text-sm">volumes</span>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block mb-1">Gênero Contagem</label>
                        <select
                          value={counterType}
                          onChange={(e) => setCounterType(e.target.value)}
                          className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded-xl text-[10px] font-extrabold text-slate-300 focus:outline-none"
                        >
                          <option value="Unidades">Unidades Individuais</option>
                          <option value="Caixas">Caixas / Engrados</option>
                          <option value="Fardos">Fardos de Tecido/Saco</option>
                        </select>
                      </div>

                      <button
                        onClick={() => {
                          setCounterCount(0);
                          addLog('Contador zerado pelo operador.', 'info');
                        }}
                        className="self-end py-2.5 bg-slate-900 border border-slate-800 text-slate-300 hover:text-white rounded-xl text-[10px] font-extrabold uppercase cursor-pointer"
                      >
                        Limpar Contador
                      </button>
                    </div>
                  </div>
                )}

                {/* 6. OCR TEXT EXTRACTOR TAB */}
                {activeTab === 'ocr' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Processamento de Caracteres</span>
                      <h3 className="text-sm font-black text-white uppercase">OCR (Leitura de Rótulos)</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Extraia lote, validade e outras marcações textuais diretamente de fotos ou etiquetas de caixas.
                      </p>
                    </div>

                    <div className="space-y-3 font-mono">
                      <div>
                        <label className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block mb-1 font-sans">Texto Bruto Extraído</label>
                        <textarea
                          readOnly
                          rows={4}
                          value={ocrText || 'Aguardando captura ou análise por IA...'}
                          className="w-full p-3 bg-slate-950 border border-slate-850 rounded-xl text-[10px] font-bold text-slate-300 focus:outline-none"
                        />
                      </div>

                      {ocrResult.lote && (
                        <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-2 text-[10px]">
                          <div className="flex justify-between"><span className="text-slate-500">LOTE:</span> <span className="text-emerald-400 font-bold">{ocrResult.lote}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">VALIDADE:</span> <span className="text-emerald-400 font-bold">{ocrResult.validade}</span></div>
                          <div className="flex justify-between"><span className="text-slate-500">PESO:</span> <span className="text-emerald-400 font-bold">{ocrResult.peso?.toFixed(3)} kg</span></div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* 7. BALANÇA LEITOR TAB */}
                {activeTab === 'scale' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Pesagem Automatizada</span>
                      <h3 className="text-sm font-black text-white uppercase">Leitor de Balança</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Integração física com balanças USB, Bluetooth Smart ou leitura de visor via câmera OCR.
                      </p>
                    </div>

                    <div className="bg-slate-950 p-5 rounded-2xl border border-slate-850 text-center space-y-2">
                      <span className="text-[8px] text-slate-500 font-extrabold uppercase block tracking-widest">Leitura Atual Balança</span>
                      <div className="text-3xl font-mono font-black text-emerald-400 tracking-wider">
                        {scaleWeight.toFixed(3)} <span className="text-sm">kg</span>
                      </div>
                      <div className="text-[8.5px] text-slate-500 font-bold uppercase">
                        STATUS: {scaleConnection === 'connected' ? '🟢 ESTABILIZADO' : scaleConnection === 'connecting' ? '🟡 CONECTANDO...' : '🔴 BALANÇA DESCONECTADA'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[8px] font-extrabold text-slate-500 uppercase tracking-widest block mb-1">Canal Conexão</label>
                        <select
                          value={scaleMethod}
                          onChange={(e) => setScaleMethod(e.target.value as any)}
                          className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded-xl text-[10px] font-extrabold text-slate-300 focus:outline-none"
                        >
                          <option value="bluetooth">📶 Bluetooth Smart</option>
                          <option value="usb">🔌 USB Direct</option>
                          <option value="serial">📠 Serial Com Port</option>
                          <option value="ocr">📷 OCR Visor</option>
                        </select>
                      </div>

                      <button
                        onClick={connectScale}
                        className="self-end py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-[10px] font-extrabold uppercase cursor-pointer border-0 shadow-md"
                      >
                        {scaleConnection === 'connected' ? 'Reconectar' : 'Parear Balança'}
                      </button>
                    </div>
                  </div>
                )}

                {/* 8. EVIDENCE MULTIPHOTO TAB */}
                {activeTab === 'evidence' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Auditoria de Qualidade</span>
                      <h3 className="text-sm font-black text-white uppercase">Evidências e Fotos</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Fotografe o produto, o lote e registre observações de conformidade física diretamente na ficha do produto.
                      </p>
                    </div>

                    {selectedProductId ? (
                      <div className="space-y-4">
                        
                        {/* Foto Principal */}
                        <div className="space-y-2">
                          <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block">Foto Principal do Lote</label>
                          <div className="flex items-center gap-3">
                            {evidenceMainPhoto ? (
                              <div className="relative shrink-0">
                                <img
                                  src={evidenceMainPhoto}
                                  alt="Main"
                                  className="w-16 h-16 rounded-xl object-cover border border-slate-800"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  onClick={() => setEvidenceMainPhoto('')}
                                  className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white p-0.5 rounded-full hover:bg-red-500 border-0 cursor-pointer"
                                >
                                  <X size={10} />
                                </button>
                              </div>
                            ) : (
                              <div className="w-16 h-16 rounded-xl bg-slate-950 border border-dashed border-slate-800 flex items-center justify-center text-slate-600 shrink-0">
                                <Image size={18} />
                              </div>
                            )}

                            <div className="flex-1 space-y-1.5">
                              <input
                                type="text"
                                placeholder="Coloque o link da foto principal..."
                                value={evidenceMainPhoto}
                                onChange={(e) => setEvidenceMainPhoto(e.target.value)}
                                className="w-full bg-slate-950 border border-slate-850 rounded-lg px-2.5 py-1.5 text-[9px] font-bold text-slate-300 focus:outline-none"
                              />
                              <label className="bg-slate-900 hover:bg-slate-850 text-slate-300 text-[8px] font-black uppercase tracking-wider px-2.5 py-1 rounded-md transition-all cursor-pointer inline-flex items-center gap-1 border border-slate-800">
                                <Upload size={9} /> Carregar Foto
                                <input
                                  type="file"
                                  accept="image/*"
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      const r = new FileReader();
                                      r.onload = (ev) => {
                                        if (ev.target?.result) setEvidenceMainPhoto(ev.target.result as string);
                                      };
                                      r.readAsDataURL(e.target.files[0]);
                                    }
                                  }}
                                  className="hidden"
                                />
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Fotos Auxiliares */}
                        <div className="space-y-2">
                          <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block">Fotos Auxiliares (Apoio)</label>
                          <div className="flex flex-wrap gap-2 items-center">
                            {evidencePhotos.map((url, i) => (
                              <div key={i} className="relative">
                                <img
                                  src={url}
                                  alt="Aux"
                                  className="w-12 h-12 rounded-lg object-cover border border-slate-800"
                                  referrerPolicy="no-referrer"
                                />
                                <button
                                  onClick={() => setEvidencePhotos(evidencePhotos.filter((_, idx) => idx !== i))}
                                  className="absolute -top-1.5 -right-1.5 bg-slate-900 text-white p-0.5 rounded-full hover:bg-red-500 border-0 cursor-pointer"
                                >
                                  <X size={8} />
                                </button>
                              </div>
                            ))}
                            
                            <label className="w-12 h-12 rounded-lg border border-dashed border-slate-800 hover:border-slate-700 bg-slate-950/50 hover:bg-slate-950 flex flex-col items-center justify-center text-slate-600 cursor-pointer transition-all">
                              <Plus size={14} />
                              <input
                                type="file"
                                accept="image/*"
                                onChange={(e) => {
                                  if (e.target.files && e.target.files[0]) {
                                    const r = new FileReader();
                                    r.onload = (ev) => {
                                      if (ev.target?.result) setEvidencePhotos([...evidencePhotos, ev.target.result as string]);
                                    };
                                    r.readAsDataURL(e.target.files[0]);
                                  }
                                }}
                                className="hidden"
                              />
                            </label>
                          </div>
                        </div>

                        {/* Observações */}
                        <div className="space-y-1.5">
                          <label className="text-[9px] text-slate-400 font-extrabold uppercase tracking-widest block">Observações de Conformidade</label>
                          <textarea
                            rows={2}
                            placeholder="Notas de acondicionamento..."
                            value={evidenceNotes}
                            onChange={(e) => setEvidenceNotes(e.target.value)}
                            className="w-full bg-slate-950 border border-slate-850 rounded-xl p-2.5 text-[10px] font-semibold text-slate-300 focus:outline-none"
                          />
                        </div>

                        <button
                          onClick={saveEvidenceData}
                          className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all border-0 cursor-pointer"
                        >
                          Salvar Evidências
                        </button>

                      </div>
                    ) : (
                      <div className="p-4 text-center bg-slate-950 border border-slate-850 rounded-2xl text-[10px] text-slate-500 font-bold uppercase">
                        Selecione um produto para gerenciar evidências.
                      </div>
                    )}
                  </div>
                )}

                {/* 9. CONFERENCE LOGS TAB */}
                {activeTab === 'conference' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Inspeção de Lotes</span>
                      <h3 className="text-sm font-black text-white uppercase">Conferência de Entrada</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Valide se o lote físico e a quantidade na balança estão em conformidade com o estoque.
                      </p>
                    </div>

                    {selectedProductId ? (
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-850 space-y-3">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-500 font-bold uppercase">Lote atual:</span>
                          <span className="text-white font-black font-mono">{activeMeta?.lote || 'Aguardando OCR'}</span>
                        </div>
                        
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-500 font-bold uppercase">Validade:</span>
                          <span className="text-white font-black font-mono">{activeMeta?.validade || 'Aguardando OCR'}</span>
                        </div>

                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-slate-500 font-bold uppercase">Peso Esperado:</span>
                          <span className="text-white font-black font-mono">{currentProduct?.weightPerUnit?.toFixed(3) || '0.000'} kg</span>
                        </div>

                        <div className="pt-2 border-t border-slate-900 space-y-1">
                          <label className="text-[8px] text-slate-500 font-extrabold uppercase tracking-widest block">Quantidade Contada</label>
                          <input
                            type="number"
                            value={confQuantity}
                            onChange={(e) => setConfQuantity(Number(e.target.value))}
                            className="w-full bg-slate-900 border border-slate-850 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-300 focus:outline-none"
                          />
                        </div>

                        <div className="pt-2">
                          <button
                            onClick={() => {
                              setConfStatus('verified');
                              addLog('Lote conferido e aprovado pelo auditor.', 'success');
                              
                              const updated: ProductMetadata = {
                                ...(productsSmartMetadata[selectedProductId] || {}),
                                id: selectedProductId,
                                situacao: 'Aprovado',
                                productName: currentProduct?.name
                              };
                              onSaveMetadata(selectedProductId, updated);
                            }}
                            className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold text-[10px] uppercase tracking-wider rounded-xl transition-all border-0 cursor-pointer"
                          >
                            Aprovar Conferência
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="p-4 text-center bg-slate-950 border border-slate-850 rounded-2xl text-[10px] text-slate-500 font-bold uppercase">
                        Selecione um produto para realizar conferência.
                      </div>
                    )}
                  </div>
                )}

                {/* 10. INVENTORY LOGS TAB */}
                {activeTab === 'inventory' && (
                  <div className="space-y-4">
                    <div className="space-y-1">
                      <span className="text-[8px] text-emerald-500 font-extrabold uppercase tracking-widest block">Controle Geral</span>
                      <h3 className="text-sm font-black text-white uppercase">Inventário Rápido</h3>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Sumário das mercadorias de vendas monitoradas no estoque e conformidade.
                      </p>
                    </div>

                    <div className="bg-slate-950 rounded-2xl border border-slate-850 divide-y divide-slate-900 overflow-hidden max-h-[220px] overflow-y-auto">
                      {products.map(p => {
                        const m = productsSmartMetadata[p.id] || {};
                        return (
                          <div key={p.id} className="p-2.5 flex justify-between items-center text-[10px]">
                            <div className="text-left">
                              <span className="text-slate-300 font-black uppercase block">{p.name}</span>
                              <span className="text-[8px] text-slate-500 font-mono">Lote: {m.lote || 'N/A'}</span>
                            </div>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-extrabold uppercase ${
                              m.situacao === 'Aprovado' ? 'bg-emerald-500/10 text-emerald-400' :
                              m.situacao === 'Quarentena' ? 'bg-orange-500/10 text-orange-400' :
                              m.situacao === 'Descartado' ? 'bg-rose-500/10 text-rose-400' : 'bg-slate-800 text-slate-400'
                            }`}>
                              {m.situacao || 'Pendente'}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

              </div>

              {/* SAVE / UPDATE TRIGGER CONTAINER IN RIGHT WORKSPACE */}
              <div className="pt-4 border-t border-slate-850 shrink-0">
                <button
                  type="button"
                  onClick={onClose}
                  className="w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white font-extrabold text-[10px] uppercase tracking-widest rounded-2xl transition-all border-0 cursor-pointer shadow-md"
                >
                  Concluir e Sair do Vision AI
                </button>
              </div>

            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
