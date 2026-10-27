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
  SimulationStatus,
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

  // Tactical paths (starts clean: no automatic curves)
  const [paths, setPaths] = useState<TacticalPath[]>([]);
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

  const [meeting, setMeeting] = useState<MeetingSession | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [currentUser, setCurrentUser] = useState<{ id: string; name: string; role: string }>({
    id: '',
    name: 'Head Coach',
    role: 'host',
  });
  const [latestChatMessage, setLatestChatMessage] = useState<any>(null);
  const [isMeetingLocked, setIsMeetingLocked] = useState(false);
  const [boardRevision, setBoardRevision] = useState(1);
  const [isMeetingDrawerOpen, setIsMeetingDrawerOpen] = useState(false);
  const [savedTacticsOpen, setSavedTacticsOpen] = useState(false);
  const [meetingEndedInfo, setMeetingEndedInfo] = useState<string | null>(null);

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

  // Role-based Board Editing Permission
  // 1. Solo offline mode -> true
  // 2. Host coach -> true
  // 3. Assistant Coach -> true
  // 4. Host-authorized participant (canEditBoard === true) -> true
  // All other squad players -> read-only
  const myParticipant = meeting?.participants.find(
    (p) => p.id === currentUser.id || p.name === currentUser.name
  );
  const isAssistantCoach =
    myParticipant?.role === 'assistant_coach' ||
    myParticipant?.role === 'Assistant Coach' ||
    currentUser.role === 'assistant_coach' ||
    currentUser.role === 'Assistant Coach';
  const isAuthorizedPlayer = Boolean(myParticipant?.canEditBoard);
  const canEditBoard = !meeting || isHost || isAssistantCoach || isAuthorizedPlayer;

  // Drawing Tools & Pass Simulation
  const [isDrawingMode, setIsDrawingMode] = useState(false);
  const [drawingType, setDrawingType] = useState<TacticalPathType>('pass');
  const [simulationStatus, setSimulationStatus] = useState<SimulationStatus>('idle');
  const [currentSimPassIndex, setCurrentSimPassIndex] = useState(0);
  const [simulationSpeed, setSimulationSpeed] = useState(1);

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
          if (state.simulation) {
            if (state.simulation.status === 'playing') {
              setSimulationStatus('playing');
              sceneRef.current?.playSimulation(state.paths || paths);
            } else if (state.simulation.status === 'paused') {
              setSimulationStatus('paused');
              sceneRef.current?.pauseSimulation();
            } else if (state.simulation.status === 'idle') {
              setSimulationStatus('idle');
              sceneRef.current?.resetSimulation();
            }
          }
          if (data.updatedBy && data.updatedBy !== (isHost ? meeting.hostName : '')) {
            showNotification(`Board updated by ${data.updatedBy}`);
          }
        }
      } else if (event === 'participant_joined') {
        setMeeting((prev) => {
          if (!prev) return null;
          const exists = prev.participants.some((p) => p.id === data.id || p.name === data.displayName);
          if (exists) {
            return {
              ...prev,
              participants: prev.participants.map((p) =>
                p.id === data.id || p.name === data.displayName
                  ? { ...p, role: data.role || p.role, isMuted: data.isMuted ?? p.isMuted }
                  : p
              ),
            };
          }
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
                avatarColor: data.role === 'Head Coach' || data.role === 'host' ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white',
              },
            ],
          };
        });
        showNotification(`${data.displayName} joined the briefing`);
      } else if (event === 'participant_left') {
        setMeeting((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            participants: prev.participants.filter(
              (p) => p.id !== data.id && p.name !== data.name
            ),
          };
        });
        if (data.name) {
          showNotification(`${data.name} left the briefing`);
        }
      } else if (event === 'chat_message') {
        setLatestChatMessage(data);
      } else if (event === 'moderation_event') {
        const isMe = data.targetId === currentUser.id;
        if (isMe) {
          if (data.isMuted !== undefined) {
            setMeeting((m) => (m ? { ...m, isMicActive: !data.isMuted } : null));
            showNotification(data.isMuted ? 'You have been muted by the coach' : 'You have been unmuted');
          }
          if (data.action === 'assign_assistant_coach') {
            setCurrentUser((u) => ({ ...u, role: 'assistant_coach' }));
            showNotification('Promoted to Assistant Coach: Tactical board controls unlocked');
          } else if (data.action === 'revoke_assistant_coach') {
            setCurrentUser((u) => ({ ...u, role: 'player' }));
            showNotification('Assistant Coach role revoked: Board is now view-only');
          } else if (data.action === 'grant_board_edit') {
            showNotification('The coach granted you board editing permissions');
          } else if (data.action === 'revoke_board_edit') {
            showNotification('Your board editing permissions have been revoked by the coach');
          }
        }
        setMeeting((prev) => {
          if (!prev) return null;
          return {
            ...prev,
            participants: prev.participants.map((p) =>
              p.id === data.targetId
                ? {
                    ...p,
                    isMuted: data.isMuted !== undefined ? data.isMuted : p.isMuted,
                    role: data.role !== undefined ? (data.role === 'host' ? 'Head Coach' : data.role) : p.role,
                    canEditBoard: data.canEditBoard !== undefined ? data.canEditBoard : p.canEditBoard,
                  }
                : p
            ),
          };
        });
      } else if (event === 'meeting_locked') {
        setIsMeetingLocked(data.status === 'locked');
        showNotification(data.status === 'locked' ? 'Meeting has been locked by the coach' : 'Meeting unlocked');
      } else if (event === 'meeting_ended') {
        showNotification('The coach has ended this briefing.');
        setMeetingEndedInfo(data.message || 'The coach has ended this briefing.');
        setMeeting(null);
        setIsMeetingDrawerOpen(false);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [meeting?.id, boardRevision, currentFormation, isHost, currentUser.id]);

  // --- CROSS-DEVICE PARTICIPANT & BOARD RECONCILIATION ---
  useEffect(() => {
    if (!meeting?.id) return;

    // Periodically reconcile participants and board state across serverless containers / devices
    const pollInterval = setInterval(async () => {
      try {
        const info = await api.getMeeting(meeting.id);
        if (info && info.status === 'ended') {
          setMeetingEndedInfo('The coach has ended this briefing.');
          setMeeting(null);
          setIsMeetingDrawerOpen(false);
          return;
        }

        if (info && Array.isArray(info.participants) && info.participants.length > 0) {
          setMeeting((prev) => {
            if (!prev) return null;
            const updatedList = [...prev.participants];
            let changed = false;

            info.participants.forEach((p: any) => {
              const pName = p.name || p.displayName;
              const pId = p.id;
              const idx = updatedList.findIndex((item) => item.id === pId || item.name === pName);
              if (idx === -1) {
                updatedList.push({
                  id: pId,
                  name: pName,
                  role: p.role === 'host' ? 'Head Coach' : p.role,
                  isMuted: p.isMuted ?? false,
                  isSpeaking: false,
                  canEditBoard: p.canEditBoard ?? false,
                  avatarColor: p.role === 'Head Coach' || p.role === 'host' ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white',
                });
                changed = true;
              } else {
                if (
                  updatedList[idx].role !== p.role ||
                  updatedList[idx].isMuted !== p.isMuted ||
                  updatedList[idx].canEditBoard !== p.canEditBoard
                ) {
                  updatedList[idx] = {
                    ...updatedList[idx],
                    role: p.role === 'host' ? 'Head Coach' : p.role,
                    isMuted: p.isMuted ?? updatedList[idx].isMuted,
                    canEditBoard: p.canEditBoard ?? updatedList[idx].canEditBoard,
                  };
                  changed = true;
                }
              }
            });

            return changed ? { ...prev, participants: updatedList } : prev;
          });
        }

        const board = await api.getBoard(meeting.id);
        if (board && board.revision > boardRevision) {
          setBoardRevision(board.revision);
          const state = board.boardState || board.board_state;
          if (state) {
            if (state.formation && state.formation !== currentFormation) {
              setCurrentFormation(state.formation);
            }
            if (state.home_players) setHomePlayers(state.home_players);
            if (state.away_players) setAwayPlayers(state.away_players);
            if (state.paths) setPaths(state.paths);
            if (state.ball) setBallPosition(state.ball);
          }
        }
      } catch {}
    }, 2500);

    return () => {
      clearInterval(pollInterval);
    };
  }, [meeting?.id, boardRevision, currentFormation]);

  // --- ACTIONS ---

  const handleSelectFormation = (f: FormationType) => {
    if (!canEditBoard) {
      showNotification('Tactical board is in view-only mode for players');
      return;
    }
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
    if (!canEditBoard) {
      showNotification('Tactical board is in view-only mode for players');
      return;
    }
    handleSelectFormation(currentFormation);
  };

  const handleSelectDrill = (drill: TacticalDrill) => {
    if (!canEditBoard) {
      showNotification('Tactical plans can only be changed by authorized coaching staff');
      return;
    }
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
      if (!canEditBoard) {
        showNotification('Board is in view-only mode for squad players');
        return;
      }
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
    [meeting?.id, canEditBoard]
  );

  const handleBallMove = useCallback(
    (pos: { x: number; z: number }) => {
      if (!canEditBoard) return;
      setBallPosition(pos);
      if (meeting?.id) {
        api.sendBoardOperation(meeting.id, {
          type: 'move_ball',
          payload: { position: pos },
        }).catch(() => {});
      }
    },
    [meeting?.id, canEditBoard]
  );

  const handlePathDrawn = useCallback(
    (newPath: TacticalPath) => {
      if (!canEditBoard) {
        showNotification('Drawing tools are reserved for authorized coaches');
        return;
      }
      setPaths((prev) => {
        setUndoStack((u) => [...u, prev]);
        setRedoStack([]);
        const passCount = prev.filter((p) => p.type === 'pass').length;
        const formatted =
          newPath.type === 'pass' && !newPath.order
            ? { ...newPath, order: passCount + 1 }
            : newPath;
        return [...prev, formatted];
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
    [meeting?.id, canEditBoard]
  );

  const handleUndo = () => {
    if (!canEditBoard) {
      showNotification('Board is in view-only mode');
      return;
    }
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
    if (!canEditBoard) {
      showNotification('Board is in view-only mode');
      return;
    }
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
    if (!canEditBoard) {
      showNotification('Board is in view-only mode');
      return;
    }
    setUndoStack((prev) => [...prev, paths]);
    setRedoStack([]);
    setPaths([]);
    setSimulationStatus('idle');
    setCurrentSimPassIndex(0);
    sceneRef.current?.resetSimulation();
    playMarkerClickSound();

    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, { type: 'clear_paths', payload: {} }).catch(() => {});
    }
  };

  const handleSelectDrawTool = (tool: TacticalPathType | 'pointer') => {
    if (!canEditBoard && tool !== 'pointer') {
      showNotification('Drawing tools are reserved for authorized coaches');
      return;
    }
    if (tool === 'pointer') {
      setIsDrawingMode(false);
    } else {
      setIsDrawingMode(true);
      setDrawingType(tool);
    }
  };

  const handlePlaySimulation = () => {
    if (!canEditBoard) {
      showNotification('Simulation playback controls are reserved for coaches');
      return;
    }
    const passes = paths.filter((p) => p.type === 'pass');
    if (passes.length === 0) {
      showNotification('Draw at least one pass before starting simulation');
      return;
    }
    playWhistleSound();
    setSimulationStatus('playing');
    sceneRef.current?.playSimulation(paths);
    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'simulate_play',
        payload: { speed: simulationSpeed },
      }).catch(() => {});
    }
  };

  const handlePauseSimulation = () => {
    if (!canEditBoard) return;
    sceneRef.current?.pauseSimulation();
    setSimulationStatus('paused');
    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'simulate_pause',
        payload: {},
      }).catch(() => {});
    }
  };

  const handleResumeSimulation = () => {
    if (!canEditBoard) return;
    sceneRef.current?.resumeSimulation();
    setSimulationStatus('playing');
    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'simulate_resume',
        payload: {},
      }).catch(() => {});
    }
  };

  const handleResetSimulation = () => {
    if (!canEditBoard) return;
    sceneRef.current?.resetSimulation();
    setSimulationStatus('idle');
    setCurrentSimPassIndex(0);
    setPaths((prev) => prev.map((p) => (p.type === 'pass' ? { ...p, status: 'pending' } : p)));
    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'simulate_reset',
        payload: {},
      }).catch(() => {});
    }
  };

  const handleDeletePass = (passId: string) => {
    if (!canEditBoard) {
      showNotification('Board is in view-only mode');
      return;
    }
    setPaths((prev) => {
      setUndoStack((u) => [...u, prev]);
      setRedoStack([]);
      const filtered = prev.filter((p) => p.id !== passId);
      let passCounter = 1;
      const reindexed = filtered.map((p) => {
        if (p.type === 'pass') {
          return { ...p, order: passCounter++ };
        }
        return p;
      });
      return reindexed;
    });

    if (meeting?.id) {
      api.sendBoardOperation(meeting.id, {
        type: 'delete_path',
        payload: { pathId: passId },
      }).catch(() => {});
    }
  };

  const handleMovePassUp = (passIdx: number) => {
    if (!canEditBoard) return;
    setPaths((prev) => {
      const passes = prev.filter((p) => p.type === 'pass');
      const others = prev.filter((p) => p.type !== 'pass');
      if (passIdx <= 0 || passIdx >= passes.length) return prev;
      setUndoStack((u) => [...u, prev]);
      setRedoStack([]);
      const newPasses = [...passes];
      const temp = newPasses[passIdx - 1];
      newPasses[passIdx - 1] = newPasses[passIdx];
      newPasses[passIdx] = temp;
      newPasses.forEach((p, idx) => {
        p.order = idx + 1;
      });
      const updated = [...others, ...newPasses];
      if (meeting?.id) {
        api.sendBoardOperation(meeting.id, {
          type: 'set_paths',
          payload: { paths: updated },
        }).catch(() => {});
      }
      return updated;
    });
  };

  const handleMovePassDown = (passIdx: number) => {
    if (!canEditBoard) return;
    setPaths((prev) => {
      const passes = prev.filter((p) => p.type === 'pass');
      const others = prev.filter((p) => p.type !== 'pass');
      if (passIdx < 0 || passIdx >= passes.length - 1) return prev;
      setUndoStack((u) => [...u, prev]);
      setRedoStack([]);
      const newPasses = [...passes];
      const temp = newPasses[passIdx + 1];
      newPasses[passIdx + 1] = newPasses[passIdx];
      newPasses[passIdx] = temp;
      newPasses.forEach((p, idx) => {
        p.order = idx + 1;
      });
      const updated = [...others, ...newPasses];
      if (meeting?.id) {
        api.sendBoardOperation(meeting.id, {
          type: 'set_paths',
          payload: { paths: updated },
        }).catch(() => {});
      }
      return updated;
    });
  };

  const handleToggleSpeed = () => {
    const nextSpeed = simulationSpeed === 1 ? 1.5 : simulationSpeed === 1.5 ? 2 : 1;
    setSimulationSpeed(nextSpeed);
    sceneRef.current?.setSimulationSpeed(nextSpeed);
    showNotification(`Simulation speed: ${nextSpeed}x`);
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
    setCurrentUser({
      id: participantData.id,
      name: participantData.displayName,
      role: isCallerHost ? 'Head Coach' : participantData.role,
    });

    const initialParticipants = Array.isArray(meetingData.participants) && meetingData.participants.length > 0
      ? meetingData.participants.map((p: any) => ({
          id: p.id,
          name: p.name || p.displayName,
          role: p.role,
          isMuted: p.isMuted ?? false,
          isSpeaking: false,
          avatarColor:
            p.role === 'Head Coach' || p.role === 'host'
              ? 'bg-[#a3e635] text-slate-950'
              : 'bg-blue-600 text-white',
        }))
      : [];

    if (!initialParticipants.some((p: any) => p.name === participantData.displayName || p.id === participantData.id)) {
      initialParticipants.push({
        id: participantData.id,
        name: participantData.displayName,
        role: isCallerHost ? 'Head Coach' : participantData.role,
        isMuted: false,
        isSpeaking: false,
        avatarColor: isCallerHost ? 'bg-[#a3e635] text-slate-950' : 'bg-blue-600 text-white',
      });
    }

    const session: MeetingSession = {
      id: meetingData.id,
      code: meetingData.code,
      passcode: meetingData.passcode || 'TACTIC-CONFIDENTIAL',
      title: meetingData.title,
      hostName: isCallerHost ? participantData.displayName : (meetingData.hostName || 'Head Coach'),
      createdAt: new Date().toLocaleTimeString(),
      participants: initialParticipants,
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
    if (meeting?.id) {
      try {
        await api.leaveMeeting(meeting.id, {
          id: currentUser.id,
          name: currentUser.name,
        });
      } catch {}
    }
    setMeeting(null);
    setIsMeetingDrawerOpen(false);
    showNotification('Left strategy room');
  };

  const handleEndMeeting = async () => {
    if (!meeting?.id || !isHost) return;
    try {
      await api.endMeeting(meeting.id);
      showNotification('The coach has ended this briefing.');
    } catch (err: any) {
      showNotification(err.message || 'Failed to end briefing');
    }
    setMeeting(null);
    setIsMeetingDrawerOpen(false);
  };

  const handleAddRunForPlayer = (player: Player) => {
    if (!canEditBoard) {
      showNotification('Board is in view-only mode for squad players');
      return;
    }
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
        isDrawingMode={canEditBoard && isDrawingMode}
        drawingType={drawingType}
        canEditBoard={canEditBoard}
        onPlayerSelect={(id) => setActivePlayerId(id)}
        onPlayerMove={handlePlayerMove}
        onBallMove={handleBallMove}
        onPathDrawn={handlePathDrawn}
        onSceneReady={(sc) => {
          sceneRef.current = sc;
          sc.onSimulationStatusChange = (status, idx) => {
            setSimulationStatus(status);
            setCurrentSimPassIndex(idx);
            if (status === 'completed') {
              showNotification('Pass sequence completed');
            }
          };
        }}
      />

      {/* 2. TOP NAVBAR */}
      <TopNavbar
        canEditBoard={canEditBoard}
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
          canEditBoard={canEditBoard}
          currentFormation={currentFormation}
          onSelectFormation={handleSelectFormation}
          teamDisplay={teamDisplay}
          onToggleTeamDisplay={setTeamDisplay}
          isDrawingMode={isDrawingMode}
          drawingType={drawingType}
          onSelectDrawTool={handleSelectDrawTool}
          paths={paths}
          simulationStatus={simulationStatus}
          currentPassIndex={currentSimPassIndex}
          onPlaySimulation={handlePlaySimulation}
          onPauseSimulation={handlePauseSimulation}
          onResumeSimulation={handleResumeSimulation}
          onResetSimulation={handleResetSimulation}
          onDeletePass={handleDeletePass}
          onMovePassUp={handleMovePassUp}
          onMovePassDown={handleMovePassDown}
          onResetFormation={handleResetFormation}
          onClearPaths={handleClearPaths}
          onUndo={handleUndo}
          onRedo={handleRedo}
          canUndo={undoStack.length > 0}
          canRedo={redoStack.length > 0}
          simulationSpeed={simulationSpeed}
          onToggleSpeed={handleToggleSpeed}
        />
      )}

      {/* 5. PLAYER CARD INSPECTOR MODAL */}
      <PlayerCardModal
        player={selectedPlayer}
        canEditBoard={canEditBoard}
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
          currentUser={currentUser}
          boardRevision={boardRevision}
          onUpdateNotes={(notes) => setMeeting({ ...meeting, notes })}
          onToggleMic={() => setMeeting({ ...meeting, isMicActive: !meeting.isMicActive })}
          onLeaveMeeting={handleLeaveMeeting}
          onEndMeeting={handleEndMeeting}
          onModerationAction={handleModeration}
          onToggleLock={handleToggleLock}
          isLocked={isMeetingLocked}
          incomingChatMessage={latestChatMessage}
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

      {/* 13. MEETING CONCLUDED OVERLAY MODAL */}
      {meetingEndedInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4 animate-fade-in">
          <div className="w-full max-w-md rounded-2xl border border-red-500/40 bg-[#0d1527] p-6 shadow-2xl text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/20 text-red-400">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-white tracking-wide">Briefing Concluded</h3>
            <p className="mt-2 text-sm text-slate-300 leading-relaxed font-medium">
              {meetingEndedInfo}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Audio, video, and tactical synchronization have been cleanly closed.
            </p>
            <button
              onClick={() => setMeetingEndedInfo(null)}
              className="mt-6 w-full rounded-xl bg-gradient-to-r from-[#a3e635] to-[#84cc16] px-5 py-2.5 text-sm font-bold text-slate-950 shadow-lg hover:brightness-110 active:scale-95 transition-all cursor-pointer"
            >
              Return to Tactical Pitch
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
