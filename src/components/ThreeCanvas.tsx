import { useEffect, useRef } from 'react';
import { PitchScene } from '../three/PitchScene';
import { CameraPreset, Player, TacticalPath } from '../types/tactics';

interface ThreeCanvasProps {
  players: Player[];
  paths: TacticalPath[];
  activePlayerId: string | null;
  cameraPreset: CameraPreset;
  isDrawingMode: boolean;
  drawingType: 'pass' | 'run' | 'press' | 'zone';
  canEditBoard?: boolean;
  onPlayerSelect: (playerId: string | null) => void;
  onPlayerMove: (playerId: string, pos: { x: number; z: number }) => void;
  onBallMove: (pos: { x: number; z: number }) => void;
  onPathDrawn: (path: TacticalPath) => void;
  onSceneReady?: (scene: PitchScene) => void;
}

export const ThreeCanvas = ({
  players,
  paths,
  activePlayerId,
  cameraPreset,
  isDrawingMode,
  drawingType,
  canEditBoard = true,
  onPlayerSelect,
  onPlayerMove,
  onBallMove,
  onPathDrawn,
  onSceneReady,
}: ThreeCanvasProps) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PitchScene | null>(null);

  // Initialize scene once
  useEffect(() => {
    if (!mountRef.current) return;

    const scene = new PitchScene(mountRef.current);
    sceneRef.current = scene;

    scene.onPlayerSelect = onPlayerSelect;
    scene.onPlayerMove = onPlayerMove;
    scene.onBallMove = onBallMove;
    scene.onPathDrawn = onPathDrawn;

    if (onSceneReady) {
      onSceneReady(scene);
    }

    return () => {
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  // Update callbacks whenever they change
  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.onPlayerSelect = onPlayerSelect;
    sceneRef.current.onPlayerMove = onPlayerMove;
    sceneRef.current.onBallMove = onBallMove;
    sceneRef.current.onPathDrawn = onPathDrawn;
  }, [onPlayerSelect, onPlayerMove, onBallMove, onPathDrawn]);

  // Update canEditBoard
  useEffect(() => {
    sceneRef.current?.setCanEditBoard(canEditBoard);
  }, [canEditBoard]);

  // Update players
  useEffect(() => {
    sceneRef.current?.setPlayers(players);
  }, [players]);

  // Update paths
  useEffect(() => {
    sceneRef.current?.setPaths(paths);
  }, [paths]);

  // Update active selection
  useEffect(() => {
    sceneRef.current?.setActivePlayer(activePlayerId);
  }, [activePlayerId]);

  // Update camera preset
  useEffect(() => {
    sceneRef.current?.setCameraPreset(cameraPreset);
  }, [cameraPreset]);

  // Update drawing mode
  useEffect(() => {
    sceneRef.current?.setDrawingMode(isDrawingMode, drawingType);
  }, [isDrawingMode, drawingType]);

  return (
    <div
      ref={mountRef}
      className="absolute inset-0 w-full h-full cursor-grab active:cursor-grabbing outline-none select-none"
    />
  );
};
