import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  Video, Square, Play, Pause, RotateCcw, 
  MapPin, X, Settings2, Trash2, Camera, 
  Grid, Plus, ChevronLeft, Clock, Calendar,
  Tag, User, Edit3, Sparkles, Brain, Filter, Share2, Activity, Loader2, Target
} from 'lucide-react';

// --- INDEXED DB STORAGE UTILS ---
const DB_NAME = 'LoopCastDB';
const STORE_NAME = 'clips';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = (e) => {
      e.target.result.createObjectStore(STORE_NAME, { keyPath: 'id' });
    };
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

const saveClipToDB = async (clip) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(clip);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
};

const loadClipsFromDB = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = (e) => resolve(e.target.result);
    request.onerror = (e) => reject(e.target.error);
  });
};

const deleteClipFromDB = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = (e) => reject(e.target.error);
  });
};

// --- GEMINI API HELPER ---
const callGemini = async (prompt) => {
  const apiKey = "";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
  const payload = {
    contents: [{ parts: [{ text: prompt }] }],
  };

  const retries = [1000, 2000, 4000, 8000, 16000];
  for (let i = 0; i < retries.length; i++) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error('API Error');
      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "No insights generated.";
    } catch (error) {
      if (i === retries.length - 1) throw error;
      await new Promise(r => setTimeout(r, retries[i]));
    }
  }
};

const loadScript = (src) => new Promise((resolve, reject) => {
  if (document.querySelector(`script[src="${src}"]`)) return resolve();
  const script = document.createElement('script');
  script.src = src;
  script.onload = resolve;
  script.onerror = reject;
  document.body.appendChild(script);
});

export default function App() {
  const [appMode, setAppMode] = useState('gallery'); 
  const [clips, setClips] = useState([]);
  const [activeClip, setActiveClip] = useState(null);
  const [isLoadingDB, setIsLoadingDB] = useState(true);

  // Load clips from local IndexedDB on startup
  useEffect(() => {
    const fetchClips = async () => {
      try {
        const storedClips = await loadClipsFromDB();
        // Convert stored Blobs back into usable URLs for the session
        const clipsWithUrls = storedClips.map(clip => ({
          ...clip,
          url: URL.createObjectURL(clip.blob) 
        }));
        // Sort by newest first
        setClips(clipsWithUrls.sort((a, b) => b.id - a.id));
      } catch (err) {
        console.error("Failed to load clips from DB:", err);
      } finally {
        setIsLoadingDB(false);
      }
    };
    fetchClips();
  }, []);

  const handleRecordingComplete = async (blob) => {
    const newClip = {
      id: Date.now(),
      blob: blob, // Store the raw binary blob
      date: new Date(),
      tags: [],
      userName: '',
    };
    
    // Save to database
    await saveClipToDB(newClip);

    // Create session URL and add to UI
    const clipWithUrl = { ...newClip, url: URL.createObjectURL(blob) };
    setClips(prev => [clipWithUrl, ...prev]);
    setActiveClip(clipWithUrl);
    setAppMode('playback');
  };

  const updateClip = async (id, updatedFields) => {
    const updatedClips = clips.map(c => c.id === id ? { ...c, ...updatedFields } : c);
    setClips(updatedClips);
    
    if (activeClip?.id === id) {
      setActiveClip(prev => ({ ...prev, ...updatedFields }));
    }

    // Update in database (needs the blob, so we strip the temporary url)
    const clipToSave = updatedClips.find(c => c.id === id);
    if (clipToSave) {
      const { url, ...dbClip } = clipToSave; 
      await saveClipToDB(dbClip);
    }
  };

  const deleteClip = async (id) => {
    const clipToDelete = clips.find(c => c.id === id);
    if (clipToDelete?.url) {
      URL.revokeObjectURL(clipToDelete.url); // Free up browser memory
    }
    
    await deleteClipFromDB(id);
    setClips(prev => prev.filter(c => c.id !== id));
    
    if (activeClip?.id === id) {
      setActiveClip(null);
      setAppMode('gallery');
    }
  };

  if (isLoadingDB) {
    return <div className="min-h-screen bg-gray-950 flex items-center justify-center text-white"><Loader2 className="w-8 h-8 animate-spin text-blue-500" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col font-sans">
      <header className="bg-gray-900 border-b border-gray-800 p-4 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Video className="text-blue-500 w-6 h-6" />
          <h1 className="text-xl font-semibold tracking-tight">LoopCast Pro</h1>
        </div>
        
        {appMode !== 'gallery' && (
          <button 
            onClick={() => setAppMode('gallery')}
            className="flex items-center gap-2 text-sm font-medium text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded-lg transition-colors"
          >
            <Grid className="w-4 h-4" />
            Gallery
          </button>
        )}
      </header>

      <main className="flex-grow flex items-center justify-center p-4 md:p-8">
        <div className="w-full max-w-5xl bg-gray-900 rounded-2xl shadow-2xl overflow-hidden border border-gray-800 flex flex-col min-h-[600px]">
          
          {appMode === 'gallery' && (
            <GalleryView 
              clips={clips} 
              onRecordNew={() => setAppMode('camera')}
              onPlayClip={(clip) => {
                setActiveClip(clip);
                setAppMode('playback');
              }}
              onDeleteClip={deleteClip}
            />
          )}

          {appMode === 'camera' && (
            <CameraView 
              onRecordingComplete={handleRecordingComplete} 
              onCancel={() => setAppMode('gallery')}
            />
          )}

          {appMode === 'playback' && activeClip && (
            <PlaybackView 
              clip={activeClip} 
              onBack={() => setAppMode('gallery')} 
              onDelete={() => deleteClip(activeClip.id)}
              onUpdate={(updates) => updateClip(activeClip.id, updates)}
            />
          )}

        </div>
      </main>
    </div>
  );
}

// --- GALLERY VIEW COMPONENT ---
function GalleryView({ clips, onRecordNew, onPlayClip, onDeleteClip }) {
  const [aiInsight, setAiInsight] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);

  const [filterPlayer, setFilterPlayer] = useState('All');
  const [filterTags, setFilterTags] = useState([]);

  const uniquePlayers = Array.from(new Set(clips.map(c => c.userName || 'Unknown Player')));
  const uniqueTags = Array.from(new Set(clips.flatMap(c => c.tags || [])));

  const filteredClips = clips.filter(clip => {
    const matchPlayer = filterPlayer === 'All' || (clip.userName || 'Unknown Player') === filterPlayer;
    const matchTags = filterTags.length === 0 || filterTags.some(tag => (clip.tags || []).includes(tag));
    return matchPlayer && matchTags;
  });

  const toggleFilterTag = (tag) => {
    setFilterTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };

  const generateInsights = async () => {
    setIsAiLoading(true);
    setAiError(null);
    try {
      const tagCounts = filteredClips.reduce((acc, clip) => {
        clip.tags?.forEach(tag => { acc[tag] = (acc[tag] || 0) + 1; });
        return acc;
      }, {});
      
      const prompt = `As an expert pickleball coach, analyze this player's training data. They have recorded ${filteredClips.length} clips with these drill tags and frequencies: ${JSON.stringify(tagCounts)}. Give a brief encouraging 1-sentence summary of what they are focusing on, and suggest 2 specific things they should focus on in their next session based on these trends. Keep it concise.`;
      const response = await callGemini(prompt);
      setAiInsight(response);
    } catch (error) {
      setAiError("Failed to generate AI insights. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full p-6">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-2xl font-bold text-white mb-1">Your Clips</h2>
          <p className="text-gray-400 text-sm">
            Saved permanently on this device ({filteredClips.length}{clips.length !== filteredClips.length ? ` of ${clips.length}` : ''})
          </p>
        </div>
        <div className="flex gap-3">
          {filteredClips.length > 0 && (
            <button 
              onClick={generateInsights}
              disabled={isAiLoading}
              className="flex items-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-400 border border-purple-500/30 px-4 py-2.5 rounded-xl font-medium transition-all"
            >
              <Sparkles className="w-5 h-5" />
              {isAiLoading ? 'Analyzing...' : '✨ AI Insights'}
            </button>
          )}
          <button 
            onClick={onRecordNew}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white px-5 py-2.5 rounded-xl font-medium transition-all shadow-lg shadow-blue-500/20"
          >
            <Plus className="w-5 h-5" />
            New Recording
          </button>
        </div>
      </div>

      {aiError && (
         <div className="mb-6 p-4 bg-red-900/50 border border-red-500/50 rounded-xl text-red-200 text-sm">
           {aiError}
         </div>
      )}

      {aiInsight && (
        <div className="mb-6 p-5 bg-purple-900/20 border border-purple-500/30 rounded-xl relative">
          <button onClick={() => setAiInsight(null)} className="absolute top-4 right-4 text-purple-400 hover:text-white"><X className="w-4 h-4" /></button>
          <h3 className="text-purple-300 font-bold mb-2 flex items-center gap-2"><Sparkles className="w-4 h-4"/> AI Training Summary</h3>
          <p className="text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">{aiInsight}</p>
        </div>
      )}

      {clips.length > 0 && (
        <div className="mb-6 bg-gray-800/40 border border-gray-700/50 rounded-xl p-4 flex flex-col gap-4">
          <div className="flex items-center gap-2 text-gray-400 text-sm font-medium">
            <Filter className="w-4 h-4" /> Filter Clips
          </div>
          <div className="flex flex-col md:flex-row gap-6">
            {uniquePlayers.length > 0 && (
              <div className="flex flex-col gap-2 min-w-[200px]">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Player</label>
                <select
                  value={filterPlayer}
                  onChange={(e) => setFilterPlayer(e.target.value)}
                  className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-blue-500 transition-colors"
                >
                  <option value="All">All Players</option>
                  {uniquePlayers.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            )}

            {uniqueTags.length > 0 && (
              <div className="flex flex-col gap-2 flex-grow">
                <label className="text-xs text-gray-500 uppercase font-bold tracking-wider">Drill Tags (Any)</label>
                <div className="flex flex-wrap gap-2">
                  {uniqueTags.map(tag => {
                    const isSelected = filterTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        onClick={() => toggleFilterTag(tag)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                          isSelected
                            ? 'bg-blue-600 text-white border-blue-500 shadow-sm shadow-blue-600/20'
                            : 'bg-gray-900 text-gray-400 border-gray-700 hover:bg-gray-800 hover:text-gray-200'
                        }`}
                      >
                        {tag}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {clips.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-500 gap-4">
          <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
            <Video className="w-10 h-10 text-gray-600" />
          </div>
          <p className="text-lg">No clips recorded yet.</p>
        </div>
      ) : filteredClips.length === 0 ? (
        <div className="flex-grow flex flex-col items-center justify-center text-gray-500 gap-4">
          <div className="w-20 h-20 bg-gray-800 rounded-full flex items-center justify-center">
            <Filter className="w-10 h-10 text-gray-600" />
          </div>
          <p className="text-lg">No clips match your selected filters.</p>
          <button 
            onClick={() => { setFilterPlayer('All'); setFilterTags([]); }} 
            className="text-blue-400 hover:text-blue-300 font-medium"
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 overflow-y-auto pr-2 pb-4">
          {filteredClips.map(clip => (
            <div key={clip.id} className="group bg-gray-800 border border-gray-700 rounded-xl overflow-hidden hover:border-blue-500/50 transition-colors flex flex-col">
              <div className="relative aspect-video bg-black cursor-pointer overflow-hidden"
                onClick={() => onPlayClip(clip)}
              >
                <video 
                  src={clip.url} 
                  className="w-full h-full object-cover opacity-80 group-hover:opacity-100 group-hover:scale-105 transition-all duration-500"
                  preload="metadata"
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40">
                  <Play className="w-12 h-12 fill-white text-white drop-shadow-md" />
                </div>
              </div>
              <div className="p-4 flex justify-between items-start bg-gray-800">
                <div className="flex flex-col gap-1.5 w-full pr-2">
                  <div className="flex items-center gap-2 text-white font-medium">
                    <User className="w-4 h-4 text-blue-400" />
                    <span className="truncate">{clip.userName || 'Unknown Player'}</span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1"><Calendar className="w-3.5 h-3.5" />{new Date(clip.date).toLocaleDateString()}</span>
                    <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{new Date(clip.date).toLocaleTimeString()}</span>
                  </div>
                  {clip.tags && clip.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-1">
                      {clip.tags.slice(0, 3).map(tag => (
                        <span key={tag} className="text-[10px] font-medium bg-blue-500/10 text-blue-300 px-2 py-0.5 rounded border border-blue-500/20">
                          {tag}
                        </span>
                      ))}
                      {clip.tags.length > 3 && (
                        <span className="text-[10px] font-medium text-gray-400 px-1 py-0.5">+{clip.tags.length - 3}</span>
                      )}
                    </div>
                  )}
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); onDeleteClip(clip.id); }}
                  className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors shrink-0"
                  title="Delete Clip"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- CAMERA VIEW COMPONENT ---
function CameraView({ onRecordingComplete, onCancel }) {
  const videoRef = useRef(null);
  const mediaRecorderRef = useRef(null);
  const streamRef = useRef(null);
  const [isRecording, setIsRecording] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [error, setError] = useState(null);
  const chunksRef = useRef([]);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { width: { ideal: 1280 }, height: { ideal: 720 } }, 
        audio: true 
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setHasPermission(true);
      setError(null);
    } catch (err) {
      console.error("Error accessing camera:", err);
      setError("Could not access camera and microphone. Please check permissions.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  const handleStartRecording = () => {
    if (!streamRef.current) return;
    
    chunksRef.current = [];
    const mediaRecorder = new MediaRecorder(streamRef.current, {
      mimeType: 'video/webm; codecs=vp8,opus'
    });

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        chunksRef.current.push(e.data);
      }
    };

    mediaRecorder.onstop = () => {
      const blob = new Blob(chunksRef.current, { type: 'video/webm' });
      stopCamera();
      onRecordingComplete(blob); // Pass the BLOB directly for IndexedDB
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
  };

  const handleStopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  return (
    <div className="flex flex-col relative w-full h-full min-h-[600px] bg-black overflow-hidden">
      <div className="absolute top-0 inset-x-0 p-4 flex justify-between z-10 bg-gradient-to-b from-black/60 to-transparent">
        <button 
          onClick={() => { stopCamera(); onCancel(); }}
          className="flex items-center gap-2 text-white/80 hover:text-white bg-black/40 hover:bg-black/60 px-3 py-2 rounded-lg backdrop-blur-sm transition-all"
        >
          <ChevronLeft className="w-5 h-5" />
          Cancel
        </button>
      </div>

      {error ? (
        <div className="absolute inset-0 flex items-center justify-center text-red-400 p-6 text-center bg-gray-900 z-10">
          <p>{error}</p>
          <button onClick={startCamera} className="ml-4 px-4 py-2 bg-blue-600 rounded-lg hover:bg-blue-700 text-white">Retry</button>
        </div>
      ) : (
        <video ref={videoRef} autoPlay muted playsInline className="absolute top-0 left-0 w-full h-full object-cover z-0" />
      )}

      <div className="absolute inset-x-0 bottom-0 p-8 bg-gradient-to-t from-black/80 via-black/40 to-transparent flex justify-center items-center z-10">
        {hasPermission && (
          <div className="flex items-center gap-6 bg-gray-900/90 p-3 rounded-full backdrop-blur-md border border-gray-700/50 shadow-2xl">
            {!isRecording ? (
              <button 
                onClick={handleStartRecording}
                className="group flex items-center gap-2 bg-red-600 hover:bg-red-500 text-white px-8 py-3 rounded-full font-medium transition-all"
              >
                <div className="w-4 h-4 bg-white rounded-full group-hover:scale-110 transition-transform" />
                Start Recording
              </button>
            ) : (
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-red-500 font-medium px-4 animate-pulse">
                  <div className="w-3 h-3 bg-red-500 rounded-full" />
                  Recording...
                </div>
                <button 
                  onClick={handleStopRecording}
                  className="flex items-center gap-2 bg-gray-800 hover:bg-gray-700 border border-gray-600 text-white px-8 py-3 rounded-full font-medium transition-all shadow-lg"
                >
                  <Square className="w-5 h-5 fill-white" />
                  Stop & Save
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- PLAYBACK VIEW COMPONENT ---
function PlaybackView({ clip, onBack, onDelete, onUpdate }) {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const progressContainerRef = useRef(null);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isSharing, setIsSharing] = useState(false);

  // AI State
  const [aiCoachTips, setAiCoachTips] = useState(null);
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editName, setEditName] = useState('');
  const [editTags, setEditTags] = useState([]);
  
  // Computer Vision Pose Detection State
  const [isPoseEnabled, setIsPoseEnabled] = useState(false);
  const [isPoseModelLoading, setIsPoseModelLoading] = useState(false);
  const poseDetectorRef = useRef(null);

  // Computer Vision Ball Tracking State
  const [isBallEnabled, setIsBallEnabled] = useState(false);
  const [isBallModelLoading, setIsBallModelLoading] = useState(false);
  const ballDetectorRef = useRef(null);
  const ballTrailRef = useRef([]); // Stores historical coordinates for the trajectory
  
  const AVAILABLE_TAGS = ['Dinking', 'Crosscourt', 'Volley', 'Resets', 'Serve', 'Return', 'Third Shot Drop', 'Overhead', 'Lob'];

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const updateTime = () => setCurrentTime(video.currentTime);
    const updateDuration = () => setDuration(video.duration);
    const onEnded = () => setIsPlaying(false);

    setLoopStart(null);
    setLoopEnd(null);
    setIsPlaying(false);

    video.addEventListener('timeupdate', updateTime);
    video.addEventListener('loadedmetadata', updateDuration);
    video.addEventListener('ended', onEnded);

    if (video.readyState >= 1) setDuration(video.duration);

    return () => {
      video.removeEventListener('timeupdate', updateTime);
      video.removeEventListener('loadedmetadata', updateDuration);
      video.removeEventListener('ended', onEnded);
    };
  }, [clip.url]);

  const togglePoseDetection = async () => {
    if (isPoseEnabled) {
      setIsPoseEnabled(false);
      clearCanvas();
      return;
    }
    setIsPoseModelLoading(true);
    try {
      if (!window.tf || !window.poseDetection) {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/pose-detection');
        await window.tf.ready();
      }
      if (!poseDetectorRef.current) {
        const detectorConfig = { modelType: window.poseDetection.movenet.modelType.SINGLEPOSE_LIGHTNING };
        poseDetectorRef.current = await window.poseDetection.createDetector(window.poseDetection.SupportedModels.MoveNet, detectorConfig);
      }
      setIsPoseEnabled(true);
    } catch (error) {
      alert("Failed to load AI Pose tracking.");
    } finally {
      setIsPoseModelLoading(false);
    }
  };

  const toggleBallDetection = async () => {
    if (isBallEnabled) {
      setIsBallEnabled(false);
      ballTrailRef.current = [];
      clearCanvas();
      return;
    }
    setIsBallModelLoading(true);
    try {
      if (!window.tf || !window.cocoSsd) {
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-core');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-converter');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');
        await loadScript('https://cdn.jsdelivr.net/npm/@tensorflow-models/coco-ssd');
        await window.tf.ready();
      }
      if (!ballDetectorRef.current) {
        ballDetectorRef.current = await window.cocoSsd.load({ base: "mobilenet_v2" });
      }
      setIsBallEnabled(true);
    } catch (error) {
       alert("Failed to load Ball Tracking AI.");
    } finally {
      setIsBallModelLoading(false);
    }
  };

  const clearCanvas = () => {
    if (canvasRef.current && !isPoseEnabled && !isBallEnabled) {
      const ctx = canvasRef.current.getContext('2d');
      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
    }
  };

  // Unified Rendering Loop for Pose and Ball tracking
  useEffect(() => {
    let animationId;
    let lastRenderTime = 0;
    
    const renderAiOverlays = async () => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      
      if ((isPoseEnabled || isBallEnabled) && video && canvas && video.readyState >= 2) {
        if (canvas.width !== video.clientWidth || canvas.height !== video.clientHeight) {
            canvas.width = video.clientWidth;
            canvas.height = video.clientHeight;
        }
        
        const ctx = canvas.getContext('2d');
        const scaleX = canvas.width / video.videoWidth;
        const scaleY = canvas.height / video.videoHeight;
        const scale = Math.min(scaleX, scaleY);
        const xOffset = (canvas.width - video.videoWidth * scale) / 2;
        const yOffset = (canvas.height - video.videoHeight * scale) / 2;

        const mapPt = (x, y) => ({ x: x * scale + xOffset, y: y * scale + yOffset });

        // If video scrubbed, clear old trail
        if (Math.abs(video.currentTime - lastRenderTime) > 0.5) {
          ballTrailRef.current = [];
        }
        lastRenderTime = video.currentTime;

        try {
          const promises = [];
          if (isPoseEnabled && poseDetectorRef.current) promises.push(poseDetectorRef.current.estimatePoses(video));
          else promises.push(Promise.resolve(null));

          if (isBallEnabled && ballDetectorRef.current) promises.push(ballDetectorRef.current.detect(video));
          else promises.push(Promise.resolve(null));

          const [poses, objects] = await Promise.all(promises);
          ctx.clearRect(0, 0, canvas.width, canvas.height);

          // 1. Draw Pose
          if (poses && poses.length > 0) {
            const keypoints = poses[0].keypoints;
            const edges = window.poseDetection.util.getAdjacentPairs(window.poseDetection.SupportedModels.MoveNet);
            ctx.strokeStyle = '#00ffaa';
            ctx.lineWidth = 3;
            
            edges.forEach(([i, j]) => {
              if (keypoints[i].score > 0.3 && keypoints[j].score > 0.3) {
                const p1 = mapPt(keypoints[i].x, keypoints[i].y);
                const p2 = mapPt(keypoints[j].x, keypoints[j].y);
                ctx.beginPath();
                ctx.moveTo(p1.x, p1.y);
                ctx.lineTo(p2.x, p2.y);
                ctx.stroke();
              }
            });

            ctx.fillStyle = '#ff0055';
            keypoints.forEach(kp => {
              if (kp.score > 0.3) {
                const p = mapPt(kp.x, kp.y);
                ctx.beginPath();
                ctx.arc(p.x, p.y, 4, 0, 2 * Math.PI);
                ctx.fill();
              }
            });
          }

          // 2. Draw Ball Trail
          if (objects) {
            const ball = objects.find(obj => obj.class === 'sports ball');
            if (ball) {
              const centerX = ball.bbox[0] + ball.bbox[2] / 2;
              const centerY = ball.bbox[1] + ball.bbox[3] / 2;
              ballTrailRef.current.push({ x: centerX, y: centerY, time: video.currentTime });
            }

            // Remove trail points older than 1.5 seconds of video time
            ballTrailRef.current = ballTrailRef.current.filter(pt => pt.time > video.currentTime - 1.5 && pt.time <= video.currentTime);

            // Draw glowing trajectory
            if (ballTrailRef.current.length > 1) {
              ctx.beginPath();
              ctx.strokeStyle = '#ff8800'; // Bright Orange
              ctx.lineWidth = 4;
              ctx.lineCap = 'round';
              ctx.lineJoin = 'round';
              ctx.shadowColor = '#ff4400';
              ctx.shadowBlur = 10;

              for (let i = 0; i < ballTrailRef.current.length; i++) {
                const pt = mapPt(ballTrailRef.current[i].x, ballTrailRef.current[i].y);
                if (i === 0) ctx.moveTo(pt.x, pt.y);
                else ctx.lineTo(pt.x, pt.y);
              }
              ctx.stroke();
              ctx.shadowBlur = 0; // Reset shadow
            }
          }

        } catch(err) {
           // Skip frame on AI error
        }
      }
      animationId = requestAnimationFrame(renderAiOverlays);
    };

    if (isPoseEnabled || isBallEnabled) renderAiOverlays();

    return () => {
      if (animationId) cancelAnimationFrame(animationId);
    };
  }, [isPoseEnabled, isBallEnabled, isPlaying]);

  const getAiCoachTips = async () => {
    setIsAiLoading(true);
    try {
      const tags = clip.tags?.length > 0 ? clip.tags.join(', ') : 'general pickleball play';
      const name = clip.userName || 'the player';
      const prompt = `As an expert pickleball coach, I am reviewing a video of ${name} practicing: ${tags}. Provide 3 quick, bulleted coaching points on what specific body mechanics, positioning, or strategies to look for when reviewing this footage to help them improve. Be extremely concise.`;
      const response = await callGemini(prompt);
      setAiCoachTips(response);
    } catch (error) {
      alert("Failed to get AI tips. Please try again.");
    } finally {
      setIsAiLoading(false);
    }
  };

  const openEditModal = () => {
    setEditName(clip.userName || '');
    setEditTags(clip.tags || []);
    setShowEditModal(true);
    if (videoRef.current && !videoRef.current.paused) {
      videoRef.current.pause();
      setIsPlaying(false);
    }
  };

  const saveEdits = () => {
    onUpdate({ userName: editName, tags: editTags });
    setShowEditModal(false);
  };

  const toggleTag = (tag) => {
    setEditTags(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);
  };
  
  // Bookmarks & Looping State
  const [loopStart, setLoopStart] = useState(null);
  const [loopEnd, setLoopEnd] = useState(null);
  const [draggingMarker, setDraggingMarker] = useState(null);

  useEffect(() => {
    let animationFrameId;
    const checkLoop = () => {
      const video = videoRef.current;
      if (video && isPlaying && loopStart !== null && loopEnd !== null) {
        if (video.currentTime >= loopEnd) video.currentTime = loopStart;
      }
      animationFrameId = requestAnimationFrame(checkLoop);
    };
    if (isPlaying) animationFrameId = requestAnimationFrame(checkLoop);
    return () => cancelAnimationFrame(animationFrameId);
  }, [isPlaying, loopStart, loopEnd]);

  useEffect(() => {
    const handleMouseMove = (e) => {
      if (!draggingMarker || !progressContainerRef.current || !duration) return;
      const rect = progressContainerRef.current.getBoundingClientRect();
      let pos = (e.clientX - rect.left) / rect.width;
      pos = Math.max(0, Math.min(1, pos)); 
      const newTime = pos * duration;

      if (draggingMarker === 'start') {
        if (loopEnd !== null && newTime >= loopEnd - 0.1) setLoopStart(loopEnd - 0.1);
        else setLoopStart(newTime);
        if (videoRef.current) videoRef.current.currentTime = newTime;
      } else if (draggingMarker === 'end') {
        if (loopStart !== null && newTime <= loopStart + 0.1) setLoopEnd(loopStart + 0.1);
        else setLoopEnd(newTime);
        if (videoRef.current) videoRef.current.currentTime = newTime;
      }
    };
    const handleMouseUp = () => setDraggingMarker(null);
    if (draggingMarker) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);
      if (videoRef.current && !videoRef.current.paused) {
          videoRef.current.pause();
          setIsPlaying(false);
      }
    }
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [draggingMarker, duration, loopStart, loopEnd]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) {
      video.play();
      setIsPlaying(true);
    } else {
      video.pause();
      setIsPlaying(false);
    }
  };

  const handleSeek = (e) => {
    if (draggingMarker || !progressContainerRef.current || !videoRef.current) return;
    const rect = progressContainerRef.current.getBoundingClientRect();
    const pos = (e.clientX - rect.left) / rect.width;
    videoRef.current.currentTime = pos * duration;
  };

  const changeSpeed = (e) => {
    const newSpeed = parseFloat(e.target.value);
    setPlaybackRate(newSpeed);
    if (videoRef.current) videoRef.current.playbackRate = newSpeed;
  };

  const formatTime = (timeInSeconds) => {
    if (isNaN(timeInSeconds)) return "00:00";
    const m = Math.floor(timeInSeconds / 60).toString().padStart(2, '0');
    const s = Math.floor(timeInSeconds % 60).toString().padStart(2, '0');
    const ms = Math.floor((timeInSeconds % 1) * 10); 
    return `${m}:${s}.${ms}`;
  };

  const shareClip = async () => {
    if (!navigator.share || !navigator.canShare) {
      alert("Sharing is not supported on this browser or device.");
      return;
    }
    setIsSharing(true);
    try {
      const response = await fetch(clip.url);
      const blob = await response.blob();
      const file = new File([blob], `LoopCast_${clip.userName || 'Player'}_${clip.id}.webm`, { type: 'video/webm' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ title: 'Pickleball Clip', text: `Check out this clip!`, files: [file] });
      } else alert("Cannot share this file type.");
    } catch (error) {
      if (error.name !== 'AbortError') alert("Something went wrong while trying to share.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="flex flex-col w-full h-full bg-gray-900 text-gray-200">
      <div className="relative w-full aspect-video bg-black overflow-hidden group">
        <div className="absolute top-0 inset-x-0 p-4 flex justify-between z-30 bg-gradient-to-b from-black/80 to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
          <button onClick={onBack} className="flex items-center gap-2 text-white hover:text-blue-400 bg-black/40 px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all"><ChevronLeft className="w-5 h-5" /> Back</button>
          <div className="flex flex-col items-end gap-1">
            <div className="flex items-center gap-2 text-sm text-gray-300 bg-black/40 px-3 py-1.5 rounded-lg backdrop-blur-sm">
               <User className="w-4 h-4" /> <span className="font-medium text-white">{clip.userName || 'Unknown Player'}</span>
            </div>
          </div>
        </div>

        <video ref={videoRef} src={clip.url} className="absolute top-0 left-0 w-full h-full object-contain z-0" onClick={togglePlay} crossOrigin="anonymous" />
        <canvas ref={canvasRef} className="absolute top-0 left-0 w-full h-full z-10 pointer-events-none" />
        
        {!isPlaying && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-20">
             <div className="bg-blue-600/80 p-5 rounded-full text-white backdrop-blur-sm shadow-xl shadow-blue-900/20"><Play className="w-10 h-10 fill-white translate-x-1" /></div>
          </div>
        )}
      </div>

      <div className="p-4 md:p-6 flex flex-col gap-6 bg-gray-900">
        <div className="space-y-3 select-none">
          <div className="flex justify-between text-xs text-gray-400 font-mono tracking-wider">
            <span>{formatTime(currentTime)}</span><span>{formatTime(duration)}</span>
          </div>
          <div className="relative h-8 flex items-center cursor-pointer group" onMouseDown={handleSeek} ref={progressContainerRef}>
            <div className="absolute w-full h-3 bg-gray-800 rounded-full pointer-events-none overflow-hidden">
               <div className="absolute top-0 left-0 h-full bg-blue-600/50 transition-all duration-75" style={{ width: `${(currentTime / duration) * 100 || 0}%` }} />
            </div>
            {loopStart !== null && loopEnd !== null && (
              <div className="absolute h-3 bg-green-500/30 border-y border-green-500/50 pointer-events-none" style={{ left: `${(loopStart / duration) * 100}%`, width: `${((loopEnd - loopStart) / duration) * 100}%` }} />
            )}
            {loopStart !== null && (
              <div className={`absolute w-5 h-6 bg-green-500 rounded-sm shadow-md cursor-ew-resize flex items-center justify-center z-20 hover:scale-110 hover:bg-green-400 transition-transform ${draggingMarker === 'start' ? 'scale-110 ring-2 ring-white' : ''}`} style={{ left: `calc(${(loopStart / duration) * 100}% - 10px)` }} onMouseDown={(e) => { e.stopPropagation(); setDraggingMarker('start'); }}>
                 <div className="w-0.5 h-3 bg-green-900 rounded-full" />
              </div>
            )}
            {loopEnd !== null && (
              <div className={`absolute w-5 h-6 bg-red-500 rounded-sm shadow-md cursor-ew-resize flex items-center justify-center z-20 hover:scale-110 hover:bg-red-400 transition-transform ${draggingMarker === 'end' ? 'scale-110 ring-2 ring-white' : ''}`} style={{ left: `calc(${(loopEnd / duration) * 100}% - 10px)` }} onMouseDown={(e) => { e.stopPropagation(); setDraggingMarker('end'); }}>
                <div className="w-0.5 h-3 bg-red-900 rounded-full" />
              </div>
            )}
            <div className="absolute w-1 h-5 bg-white rounded-full pointer-events-none shadow-sm shadow-black z-10 transition-all duration-75" style={{ left: `calc(${(currentTime / duration) * 100 || 0}% - 2px)` }} />
          </div>
        </div>

        <div className="flex flex-col xl:flex-row gap-4 items-center justify-between">
          <div className="flex items-center gap-3">
            <button onClick={togglePlay} className="p-3 bg-blue-600 hover:bg-blue-500 text-white rounded-full transition-colors"><Pause className={`w-5 h-5 fill-white ${isPlaying ? '' : 'hidden'}`} /><Play className={`w-5 h-5 fill-white ${!isPlaying ? '' : 'hidden'}`} /></button>
            <button onClick={() => { if(videoRef.current) videoRef.current.currentTime = loopStart !== null ? loopStart : 0; }} className="p-3 hover:bg-gray-800 rounded-full text-gray-300"><RotateCcw className="w-5 h-5" /></button>
            <div className="flex items-center gap-2 ml-2 bg-gray-800 px-3 py-1.5 rounded-lg border border-gray-700">
              <Settings2 className="w-4 h-4 text-gray-400" />
              <select value={playbackRate} onChange={changeSpeed} className="bg-transparent text-sm font-medium focus:outline-none cursor-pointer">
                <option value="0.25">0.25x</option><option value="0.5">0.5x</option><option value="1">1.0x</option><option value="1.5">1.5x</option><option value="2">2.0x</option>
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 bg-gray-800/50 p-1.5 rounded-xl border border-gray-700/50 flex-wrap justify-center">
            {loopStart === null ? (
               <button onClick={() => {if(duration){setLoopStart(currentTime); setLoopEnd(Math.min(currentTime+5, duration));}}} className="flex items-center gap-2 px-4 py-2 text-sm font-medium hover:bg-gray-700 text-gray-300 rounded-lg"><MapPin className="w-4 h-4" /> Create Loop</button>
            ) : (
               <>
                 <div className="px-3 text-sm text-green-400 font-medium font-mono bg-green-500/10 py-1.5 rounded-lg border border-green-500/20">Start: {formatTime(loopStart)}</div>
                 <div className="px-3 text-sm text-red-400 font-medium font-mono bg-red-500/10 py-1.5 rounded-lg border border-red-500/20">End: {formatTime(loopEnd)}</div>
                 <button onClick={() => {setLoopStart(null); setLoopEnd(null);}} className="p-2 hover:bg-red-500/20 hover:text-red-400 rounded-lg text-gray-400"><X className="w-4 h-4" /></button>
               </>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 justify-center">
            {/* AI & Vision Toggles */}
            <div className="flex gap-1.5 border-r border-gray-800 pr-3">
               <button onClick={togglePoseDetection} disabled={isPoseModelLoading} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors w-[72px] h-14 ${isPoseEnabled ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent'}`}>
                 {isPoseModelLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Activity className="w-4 h-4 mb-1" />}
                 <span className="text-[9px] font-bold uppercase tracking-wider">{isPoseEnabled ? 'Pose On' : 'Pose'}</span>
               </button>

               <button onClick={toggleBallDetection} disabled={isBallModelLoading} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors w-[72px] h-14 ${isBallEnabled ? 'bg-orange-500/20 text-orange-400 border border-orange-500/30' : 'bg-gray-800 text-gray-400 hover:bg-gray-700 border border-transparent'}`}>
                 {isBallModelLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4 mb-1" />}
                 <span className="text-[9px] font-bold uppercase tracking-wider">{isBallEnabled ? 'Ball On' : 'Ball (Beta)'}</span>
               </button>

               <button onClick={getAiCoachTips} disabled={isAiLoading} className={`flex flex-col items-center justify-center p-2 rounded-lg transition-colors w-[72px] h-14 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 border border-purple-500/20`}>
                 {isAiLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4 mb-1" />}
                 <span className="text-[9px] font-bold uppercase tracking-wider">AI Coach</span>
               </button>
            </div>

            {/* Primary Actions */}
            <div className="flex items-center gap-1.5">
               <button onClick={openEditModal} className="flex items-center gap-2 px-3 py-2 text-sm font-medium bg-gray-800 text-gray-200 hover:bg-gray-700 hover:text-white rounded-lg transition-colors border border-gray-700">
                 <Edit3 className="w-4 h-4" />
                 <span className="hidden sm:inline">Edit Details</span>
               </button>
               <button onClick={shareClip} disabled={isSharing} className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Share"><Share2 className="w-5 h-5" /></button>
               <button onClick={onDelete} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete"><Trash2 className="w-5 h-5" /></button>
            </div>
          </div>
        </div>
      </div>

      {aiCoachTips && (
        <div className="absolute top-20 right-6 w-80 max-h-[80%] overflow-y-auto bg-gray-900/95 border border-purple-500/30 shadow-2xl rounded-2xl p-5 z-40 backdrop-blur-md">
          <div className="flex justify-between items-start mb-3">
            <h3 className="text-purple-400 font-bold flex items-center gap-2"><Sparkles className="w-4 h-4" /> AI Coach Notes</h3>
            <button onClick={() => setAiCoachTips(null)} className="text-gray-400 hover:text-white"><X className="w-4 h-4" /></button>
          </div>
          <div className="text-sm text-gray-200 leading-relaxed whitespace-pre-wrap">{aiCoachTips}</div>
        </div>
      )}

      {showEditModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col">
            <div className="p-4 border-b border-gray-800 flex justify-between items-center bg-gray-800/50">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Tag className="w-5 h-5 text-blue-500" /> Edit Details</h3>
              <button onClick={() => setShowEditModal(false)} className="text-gray-400"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-6 flex flex-col gap-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-gray-400 flex items-center gap-2"><User className="w-4 h-4" /> Player Name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} className="w-full bg-gray-950 border border-gray-700 rounded-lg px-4 py-2.5 text-white" />
              </div>
              <div className="space-y-3">
                <label className="text-sm font-medium text-gray-400 flex items-center gap-2"><Tag className="w-4 h-4" /> Drill Tags</label>
                <div className="flex flex-wrap gap-2">
                  {AVAILABLE_TAGS.map(tag => (
                    <button key={tag} onClick={() => toggleTag(tag)} className={`px-3 py-1.5 rounded-lg text-sm border ${editTags.includes(tag) ? 'bg-blue-600 text-white border-blue-500' : 'bg-gray-800 text-gray-300 border-gray-700'}`}>{tag}</button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-4 border-t border-gray-800 bg-gray-800/50 flex justify-end gap-3">
              <button onClick={() => setShowEditModal(false)} className="px-5 py-2 text-sm text-gray-300">Cancel</button>
              <button onClick={saveEdits} className="px-5 py-2 text-sm bg-blue-600 text-white rounded-xl">Save Details</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}