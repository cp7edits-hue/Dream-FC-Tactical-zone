import { useState, useRef, useMemo, useCallback, useEffect } from 'react';
import { ThreeCanvas } from './components/ThreeCanvas';
import { LandingHero } from './components/LandingHero';
import { TopNavbar } from './components/TopNavbar';
import { TacticalDock } from './components/TacticalDock';
import { MeetingModal } from './components/MeetingModal';
import { MeetingRoomDrawer } from './components/MeetingRoomDrawer';
import { PlayerCardModal } from './components/PlayerCardModal';
import { SavedTacticsModal } from './components/SavedTacticsModal';
import { LegalModal, LegalTab } from './components/legal/LegalModal';
import { LegalFooter } from './components/legal/LegalFooter';
import { NotFoundPage } from './components/NotFoundPage';
import { ContactModal } from './components/ContactModal';
import { PitchScene } from './three/PitchScene';
import {
  CameraPreset,
  FormationType,
  MeetingSession,
  Player,
  TacticalDrill,
  TacticalPath,
  TacticalPathType,
} from './types/tactics';
import { FORMATIONS, getAwayFormation } from './constants/formations';
import { PRESET_DRILLS } from './constants/drills';
import {
  isSoundEnabled,
  playFormationChime,
  playMarkerClickSound,
  playWhistleSound,
  setSoundEnabled,
} from './utils/audio';
import { api } from './services/api';

export default function App() {
  const sceneRef = useRef<PitchScene | null>(null);

  // Initial formations
  const [currentFormation, setCurrentFormation] = useState<FormationType>('4-3-3');
  const [teamDisplay, setTeamDisplay] = useState<'both' | 'home' | 'away'>('both');

  // Players state
  const [homePlayers, setHomePlayers] = useState<Player[]>(() => {
    return FORMATIONS['4-3-3'].positions.map((p, idx) => ({
      id: `home_${idx + 1}`,
      number: p.number,
      name: p.name,
      role: p.role,
      team: 'home',
      position: { x: p.x, z: p.z },
    }));
  });

  const [awayPlayers, setAwayPlayers] = useState<Player[]>(() => {
    return getAwayFormation('4-3-3').map((p, idx) => ({
      id: `away_${idx + 1}`,
      number: p.number,
      name: p.name,
      role: p.role,
      team: 'away',
      position: { x: p.x, z: p.z },
    }));
  });

  // Filtered players
  const visiblePlayers = useMemo(() => {
    if (teamDisplay === 'home') return homePlayers;
    if (teamDisplay === 'away') return awayPlayers;
    return [...homePlayers, ...awayPlayers];
  }, [homePlayers, awayPlayers, teamDisplay]);

  // Selected player
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const selectedPlayer = useMemo(() => {
    if (!activePlayerId) return null;
    return visiblePlayers.find((p) => p.id === activePlayerId) || null;
  }, [activePlayerId, visiblePlayers]);

  // Tactical paths
  const [paths, setPaths] = useState<TacticalPath[]>(() => PRESET_DRILLS[0].paths);
  const [undoStack, setUndoStack] = useState<TacticalPath[][]>([]);
  const [redoStack, setRedoStack] = useState<TacticalPath[][]>([]);

  // Ball position
  const [ballPosition, setBallPosition] = useState<{ x: number; z: number }>({ x: 0, z: 0 });

  // Camera & Drills
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('broadcast');
  const [selectedDrillId, setSelectedDrillId] = useState<string>('opening_master');

  // Audio FX
  const [soundActive, setSoundActive] = useState<boolean>(() => isSoundEnabled());

  // UI Modes
  const [isHeroVisible, setIsHeroVisible] = useState(true);
  const [meetingModal, setMeetingModal] = useState<{ isOpen: boolean; mode: 'create' | 'join' }>({
    isOpen: false,
    mode: 'create',
  });

  // Active Meeting & Backend Sync State
  const [meeting, setMeeting] = useState<MeetingSession | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [isMeetingLocked, setIsMeetingLocked] = useState(false);
  const [boardRevision, setBoardRevision] = useState(1);
  const [isMeetingDrawerOpen, setIsMeetingDrawerOpen] = useState(false);
  const [savedTacticsOpen, setSavedTacticsOpen] = useState(false);

  // Legal modal state
  const [legalModal, setLegalModal] = useState<{ isOpen: boolean; tab: LegalTab }>({
    isOpen: false,
    tab: 'privacy',
  });

  // Contact modal state
  const [contactModalOpen, setContactModalOpen] = useState(false);

  // 404 route detection state
  const [is404Active, setIs404Active] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname;
    return path === '/404' || (path !== '/' && !path.startsWith('/api') && !path.startsWith('/meetings'));
  });

  // Drawing Tools
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingType, setDrawingType] = useState<TacticalPathType>('pass');
  const [isPlayingSequence, setIsPlayingSequence] = useState(false);

  // Status banner
  const [notification, setNotification] = useState<string | null>(null);

  const showNotification = (msg: string) => {
    setNotification(msg);
    setTimeout(() => setNotification(null), 3500);
  };

  // --- REAL-TIME SSE SUBSCRIPTION ---
  useEffect(() => {
    if (!meeting?.id) return;

    const unsubscribe = api.subscribeToBoardEvents(meeting.id, (event, data) => {
      if (event === 'board_updated') {
        if (data.revision > boardRevision) {
          setBoardRevision(data.revision);
          const state = data.boardState;
          if (state.formation && state.formation !== currentFormation) {
            setCurrentFormation(state.formation);
          }
          if (state.home_players) {
            setHomePlayers(state.home_players);
          }
          if (state.away_players) {
            setAwayPlayers(state.away_players);
          }
          if (state.paths) {
            setPaths(state.paths);
          }
          if (state.ball) {
            setBallPosition(state.ball);
          }
          if (data.updatedBy && data.updatedBy !== (isHost ? meeting.hostName : '')) {
            showNotification(`Board updated by ${data.updatedBy}`);
          }
        }
      } else if (event === 'participant_joined') {
        setMeeting((prev) => {
          if (!prev) return null;
          const exists = prev.participants.some((p) => p.id === data.id);
          if (exists) return prev;
          return {
            ...prev,
            participants: [
              ...prev.participants,
              {
                id: data.id,
                name: data.displayName,
                role: data.role,
                isMuted: data.isMuted,
                isSpeaking: false,
                avatarColor: 'bg-blue-600 text-white',
              },
            ],
          };
        });
        showNotification(`${data.displayName} joined the briefing`);
      } else if (event === 'meeting_locked') {
        setIsMeetingLocked(data.status === 'locked');
        showNotification(data.status === 'locked' ? 'Meeting has been locked by the coach' : 'Meeting unlocked');
      } else if (event === 'meeting_ended') {
        showNotification('The coach has ended this tactical session');
        setMeeting(null);
        setIsMeetingDrawerOpen(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [meeting?.id, boardRevision, currentFormation, isHost]);

  // --- ACTIONS ---

  const handleSelectFormation = (f: FormationType) => {
    setCurrentFormation(f);
    playFormationChime();

    const template = FORMATIONS[f];
    const newHome = template.positions.map((pos, idx) => ({
      id: `home_${idx + 1}`,
      number: pos.number,
      name: pos.name,
      role: pos.role,
      team: 'home' as const,
      position: { x: pos.x, z: pos.z },
    }));

    const awayTemplate = getAwayFormation(f);
    const newAway = awayTemplate.map((pos, idx) => ({
      id: `away_${idx + 1}`,
      number: pos.number,
      name: pos.name,
      role: pos.role,
      team: 'away' as const,
      position: { x: pos.x, z: pos.z },
    }));

    setHomePlayers(newHome);
    setAwayPlayers(newAway);

    // Sync with meeting if active
    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'set_formation',
        payload: { formation: f },
      }).catch((err) => {
        showNotification(err.message || 'Permission denied: Board editing restricted');
      });
    }
  };

  const handleResetFormation = () => {
    handleSelectFormation(currentFormation);
  };

  const handleSelectDrill = (drill: TacticalDrill) => {
    setSelectedDrillId(drill.id);
    handleSelectFormation(drill.formation);
    setUndoStack((prev) => [...prev, paths]);
    setRedoStack([]);
    setPaths(drill.paths);
    setBallPosition(drill.ballPosition);
    playFormationChime();

    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'reset_board',
        payload: {
          boardState: {
            formation: drill.formation,
            paths: drill.paths,
            ball: drill.ballPosition,
          },
        },
      }).catch(() => {});
    }
  };

  const handlePlayerMove = useCallback(
    (playerId: string, pos: { x: number; z: number }) => {
      setHomePlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, position: pos } : p))
      );
      setAwayPlayers((prev) =>
        prev.map((p) => (p.id === playerId ? { ...p, position: pos } : p))
      );

      if (meeting?.id) {
        api.sendBoardOperation(meeting.id, {
          type: 'move_player',
          payload: { id: playerId, position: pos },
        }).catch((err) => {
          showNotification(err.message || 'Editing restricted');
        });
      }
    },
    [meeting?.id]
  );

  const handleBallMove = useCallback(
    (pos: { x: number; z: number }) => {
      setBallPosition(pos);
      if (meeting?.id) {
        api.sendBoardOperation(meeting.id, {
          type: 'move_ball',
          payload: { position: pos },
        }).catch(() => {});
      }
    },
    [meeting?.id]
  );

  const handlePathDrawn = useCallback(
    (newPath: TacticalPath) => {
      setPaths((prev) => {
        setUndoStack((u) => [...u, prev]);
        setRedoStack([]);
        return [...prev, newPath];
      });

      if (meeting?.id) {
        api.sendBoardOperation(meeting.id, {
          type: 'add_path',
          payload: { path: newPath },
        }).catch((err) => {
          showNotification(err.message || 'Editing restricted');
        });
      }
    },
    [meeting?.id]
  );

  const handleUndo = () => {
    if (undoStack.length === 0) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, prev.length - 1));
    setRedoStack((prev) => [...prev, paths]);
    setPaths(previous);
    playMarkerClickSound();

    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'reset_board',
        payload: { boardState: { paths: previous } },
      }).catch(() => {});
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0) return;
    const next = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, prev.length - 1));
    setUndoStack((prev) => [...prev, paths]);
    setPaths(next);
    playMarkerClickSound();

    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'reset_board',
        payload: { boardState: { paths: next } },
      }).catch(() => {});
    }
  };

  const handleClearPaths = () => {
    setUndoStack((prev) => [...prev, paths]);
    setRedoStack([]);
    setPaths([]);
    playMarkerClickSound();

    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, { type: 'clear_paths', payload: {} }).catch(() => {});
    }
  };

  const handleSelectDrawTool = (tool: TacticalPathType | 'pointer') => {
    if (tool === 'pointer') {
      setIsDrawingMode(false);
    } else {
      setIsDrawingMode(true);
      setDrawingType(tool);
    }
  };

  const handlePlaySequence = () => {
    if (isPlayingSequence) return;
    setIsPlayingSequence(true);
    playWhistleSound();
    sceneRef.current?.playSequence(paths);
    setTimeout(() => {
      setIsPlayingSequence(false);
    }, 3400);
  };

  const handleToggleSound = () => {
    const next = !soundActive;
    setSoundActive(next);
    setSoundEnabled(next);
  };

  // Meeting Handlers
  const handleMeetingSuccess = (meetingData: any, participantData: any) => {
    const isCallerHost = participantData.role === 'host';
    setIsHost(isCallerHost);

    const session: MeetingSession = {
      id: meetingData.id,
      code: meetingData.code,
      passcode: meetingData.passcode || 'TACTIC-CONFIDENTIAL',
      title: meetingData.title,
      hostName: isCallerHost ? participantData.displayName : 'Head Coach',
      createdAt: new Date().toLocaleTimeString(),
      participants: [
        {
          id: participantData.id,
          name: participantData.displayName,
          role: isCallerHost ? 'Head Coach' : participantData.role,
          isMuted: false,
          isSpeaking: true,
          avatarColor: isCallerHost ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white',
        },
      ],
      notes: [
        '1. Maintain compact 4-3-3 shape during opponent build-up',
        '2. Overload right half-space to isolate winger on 1v1',
        '3. Immediate counter-press within 5 seconds of loss',
      ],
      isMicActive: true,
    };

    setMeeting(session);
    setIsHeroVisible(false);
    setIsMeetingDrawerOpen(true);
    playFormationChime();
    showNotification(`Connected to strategy room: ${meetingData.code}`);
  };

  const handleModeration = async (participantId: string, action: string) => {
    if (!meeting?.id || !isHost) return;
    try {
      await api.moderateParticipant(meeting.id, participantId, action as any);
      showNotification(`Moderation action applied: ${action}`);
    } catch (err: any) {
      showNotification(err.message || 'Action failed');
    }
  };

  const handleToggleLock = async () => {
    if (!meeting?.id || !isHost) return;
    try {
      const res = await api.toggleLock(meeting.id);
      setIsMeetingLocked(res.status === 'locked');
      showNotification(res.status === 'locked' ? 'Room locked' : 'Room unlocked');
    } catch {
      // ignore
    }
  };

  const handleLeaveMeeting = async () => {
    if (meeting?.id && isHost) {
      try {
        await api.endMeeting(meeting.id);
      } catch {}
    }
    setMeeting(null);
    setIsMeetingDrawerOpen(false);
    showNotification('Left strategy room');
  };

  const handleAddRunForPlayer = (player: Player) => {
    const endZ = player.team === 'home' ? player.position.z - 14 : player.position.z + 14;
    const newPath: TacticalPath = {
      id: 'run_' + Date.now(),
      type: 'run',
      points: [
        { x: player.position.x, z: player.position.z },
        { x: player.position.x + (player.position.x > 0 ? -6 : 6), z: endZ },
      ],
      color: '#a3e635',
      label: `${player.name} Overlap`,
    };
    handlePathDrawn(newPath);
    setActivePlayerId(null);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-[#060c16] text-slate-100 font-sans">
      {/* Realtime Notification Banner */}
      {notification && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-1.5 rounded-full bg-slate-900/95 border border-[#a3e635]/60 text-[#a3e635] text-xs font-semibold shadow-2xl backdrop-blur-md animate-fade-in">
          {notification}
        </div>
      )}

      {/* 1. REAL 3D FOOTBALL PITCH CANVAS */}
      <ThreeCanvas
        players={visiblePlayers}
        paths={paths}
        activePlayerId={activePlayerId}
        cameraPreset={cameraPreset}
        isDrawingMode={isDrawingMode}
        drawingType={drawingType}
        onPlayerSelect={(id) => setActivePlayerId(id)}
        onPlayerMove={handlePlayerMove}
        onBallMove={handleBallMove}
        onPathDrawn={handlePathDrawn}
        onSceneReady={(sc) => {
          sceneRef.current = sc;
        }}
      />

      {/* 2. TOP NAVBAR */}
      <TopNavbar
        cameraPreset={cameraPreset}
        onSelectCameraPreset={(p) => setCameraPreset(p)}
        selectedDrillId={selectedDrillId}
        onSelectDrill={handleSelectDrill}
        soundEnabled={soundActive}
        onToggleSound={handleToggleSound}
        meeting={meeting}
        onOpenCreateMeeting={() => setMeetingModal({ isOpen: true, mode: 'create' })}
        onOpenJoinMeeting={() => setMeetingModal({ isOpen: true, mode: 'join' })}
        onToggleMeetingDrawer={() => setIsMeetingDrawerOpen(!isMeetingDrawerOpen)}
        isHeroVisible={isHeroVisible}
        onToggleHero={() => setIsHeroVisible(!isHeroVisible)}
        onOpenSavedTactics={() => setSavedTacticsOpen(true)}
        onOpenContact={() => setContactModalOpen(true)}
      />

      {/* 3. LANDING HERO (Matches Reference Image Exactly) */}
      {isHeroVisible && !is404Active && (
        <LandingHero
          onCreateMeeting={() => setMeetingModal({ isOpen: true, mode: 'create' })}
          onJoinMeeting={() => setMeetingModal({ isOpen: true, mode: 'join' })}
          onEnterTactics={() => setIsHeroVisible(false)}
        />
      )}

      {/* 4. CONSOLIDATED BOTTOM DOCK */}
      {!is404Active && (
        <TacticalDock
          currentFormation={currentFormation}
          onSelectFormation={handleSelectFormation}
          teamDisplay={teamDisplay}
          onToggleTeamDisplay={setTeamDisplay}
          isDrawingMode={isDrawingMode}
          drawingType={drawingType}
          onSelectDrawTool={handleSelectDrawTool}
          onPlaySequence={handlePlaySequence}
          onResetFormation={handleResetFormation}
          onClearPaths={handleClearPaths}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          isPlaying={isPlayingSequence}
        />
      )}

      {/* 5. PLAYER CARD INSPECTOR MODAL */}
      <PlayerCardModal
        player={selectedPlayer}
        onClose={() => setActivePlayerId(null)}
        onAddRunForPlayer={handleAddRunForPlayer}
      />

      {/* 6. MEETING CREATE / JOIN MODAL */}
      <MeetingModal
        isOpen={meetingModal.isOpen}
        mode={meetingModal.mode}
        onClose={() => setMeetingModal({ ...meetingModal, isOpen: false })}
        onSuccess={handleMeetingSuccess}
      />

      {/* 7. MEETING ROOM DRAWER */}
      {meeting && (
        <MeetingRoomDrawer
          isOpen={isMeetingDrawerOpen}
          onClose={() => setIsMeetingDrawerOpen(false)}
          meeting={meeting}
          isHost={isHost}
          boardRevision={boardRevision}
          onUpdateNotes={(notes) => setMeeting({ ...meeting, notes })}
          onToggleMic={() => setMeeting({ ...meeting, isMicActive: !meeting.isMicActive })}
          onLeaveMeeting={handleLeaveMeeting}
          onModerationAction={handleModeration}
          onToggleLock={handleToggleLock}
          isLocked={isMeetingLocked}
        />
      )}

      {/* 8. SAVED TACTICS PLAYBOOK */}
      <SavedTacticsModal
        isOpen={savedTacticsOpen}
        onClose={() => setSavedTacticsOpen(false)}
        currentFormation={currentFormation}
        currentPaths={paths}
        onLoadTactic={(f, p) => {
          setCurrentFormation(f);
          setPaths(p);
          playFormationChime();
          showNotification('Tactical play loaded onto pitch');
        }}
      />

      {/* 9. LEGAL & PRIVACY CENTER */}
      <LegalModal
        isOpen={legalModal.isOpen}
        initialTab={legalModal.tab}
        onClose={() => setLegalModal({ ...legalModal, isOpen: false })}
      />

      {/* 10. CONTACT & TACTICAL SUPPORT MODAL */}
      <ContactModal
        isOpen={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
      />

      {/* 11. BRANDED 404 NOT FOUND OVERLAY */}
      {is404Active && (
        <NotFoundPage
          onReturnHome={() => {
            setIs404Active(false);
            if (typeof window !== 'undefined') window.history.pushState({}, '', '/');
          }}
          onEnterTactics={() => {
            setIs404Active(false);
            setIsHeroVisible(false);
            if (typeof window !== 'undefined') window.history.pushState({}, '', '/');
          }}
          onOpenContact={() => setContactModalOpen(true)}
        />
      )}

      {/* 12. UNOBTRUSIVE LEGAL FOOTER */}
      <LegalFooter
        onOpenLegal={(tab) => setLegalModal({ isOpen: true, tab })}
        onOpenContact={() => setContactModalOpen(true)}
        onOpen404={() => setIs404Active(true)}
      />
    </main>
  );
}
