import { useRef, useMemo } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls, RoundedBox, Environment, Text, ContactShadows, SpotLight, useTexture } from '@react-three/drei';
import * as THREE from 'three';

// --- MATERIALS & COLORS ---
const TILE_COLORS: Record<string, string> = {
  start: '#475569',
  finish: '#db2777',
  cyber: '#dc2626',
  safe: '#0284c7',
  bonus: '#d97706',
  help: '#059669',
  firewall: '#ea580c',
  shop: '#7c3aed',
};

// --- AVATAR ASSETS ---
const AvatarMap: Record<string, string> = {
  'Cyber Security Expert': '/characters/Cyber Security Expert.png',
  'Detective': '/characters/Detective.png',
  'Ethical Hacker': '/characters/Ethical Hacker.png',
  'Programmer': '/characters/Programmer.png',
  'Robot Assistant': '/characters/Robot Assistant.png',
  'Student': '/characters/Student.png',
};

// --- COMPONENTS ---

const Tile3D = ({ tile, position }: { tile: any, position: [number, number, number] }) => {
  const color = TILE_COLORS[tile.type] || TILE_COLORS.start;

  return (
    <group position={position}>
      {/* Main Glass Tile */}
      <RoundedBox args={[1.8, 0.3, 1.8]} radius={0.15} smoothness={4} receiveShadow castShadow>
        <meshPhysicalMaterial 
          color={color} 
          roughness={0.1} 
          metalness={0.2}
          transmission={0.5} // Glass-like
          thickness={0.5}
          clearcoat={1} 
          clearcoatRoughness={0}
        />
      </RoundedBox>
      
      {/* Base/Shadow blocker */}
      <RoundedBox args={[1.7, 0.28, 1.7]} radius={0.1} position={[0, -0.02, 0]}>
        <meshStandardMaterial color="#111" />
      </RoundedBox>

      {/* Number label */}
      <Text 
        position={[0, 0.16, 0]} 
        rotation={[-Math.PI / 2, 0, 0]} 
        fontSize={0.6} 
        color="#ffffff" 
        anchorX="center" 
        anchorY="middle"
        font="https://fonts.gstatic.com/s/inter/v12/UcCO3FwrK3iLTeHuS_fvQtMwCp50KnMw2boKoduKmMEVuLyfAZ9hjQ.ttf"
      >
        {String(tile.index).padStart(2, '0')}
      </Text>
      
      {/* Inner subtle glow for special tiles */}
      {tile.type !== 'start' && tile.type !== 'safe' && (
        <pointLight color={color} intensity={0.5} distance={2} position={[0, 0.5, 0]} />
      )}
    </group>
  );
};

// Player Token: A glowing high-tech glass coin with the character's face
const PlayerPawn = ({ player, position, isCurrent }: { player: any, position: [number, number, number], isCurrent: boolean }) => {
  const pawnRef = useRef<THREE.Group>(null);
  const imgUrl = AvatarMap[player.avatar] || AvatarMap['Cyber Security Expert'];
  const texture = useTexture(imgUrl);
  
  const colorMap: Record<string, string> = {
    'bg-pink-500': '#EC4899', 'bg-cyan-500': '#06B6D4', 'bg-amber-500': '#F59E0B',
    'bg-emerald-500': '#10B981', 'bg-purple-500': '#8B5CF6'
  };
  const color = colorMap[player.color] || '#00E5FF';

  useFrame((state) => {
    if (pawnRef.current) {
      // Hover animation
      const hoverY = isCurrent ? Math.sin(state.clock.elapsedTime * 4) * 0.2 + 0.3 : 0.1;
      pawnRef.current.position.y = THREE.MathUtils.lerp(pawnRef.current.position.y, position[1] + hoverY, 0.1);
      
      // Rotate slowly if current
      if (isCurrent) {
         pawnRef.current.rotation.y += 0.02;
      } else {
         pawnRef.current.rotation.y = THREE.MathUtils.lerp(pawnRef.current.rotation.y, 0, 0.1);
      }
    }
  });

  return (
    <group ref={pawnRef} position={position}>
      {/* Token Frame */}
      <mesh position={[0, 0.6, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.5, 0.5, 0.1, 32]} />
        <meshPhysicalMaterial color="#222" metalness={0.9} roughness={0.1} clearcoat={1} />
      </mesh>
      
      {/* Face Image (Front) */}
      <mesh position={[0, 0.6, 0.051]} rotation={[0, 0, 0]}>
        <circleGeometry args={[0.45, 32]} />
        <meshBasicMaterial map={texture} />
      </mesh>
      
      {/* Face Image (Back) */}
      <mesh position={[0, 0.6, -0.051]} rotation={[0, Math.PI, 0]}>
        <circleGeometry args={[0.45, 32]} />
        <meshBasicMaterial map={texture} />
      </mesh>

      {/* Ring Glow */}
      <mesh position={[0, 0.6, 0]}>
        <torusGeometry args={[0.5, 0.03, 16, 32]} />
        <meshBasicMaterial color={isCurrent ? '#ffffff' : color} />
      </mesh>
      
      {/* Base Light Cast */}
      {isCurrent && (
        <pointLight color={color} intensity={2} distance={4} position={[0, -0.5, 0]} />
      )}
    </group>
  );
};

// --- SCENE & CAMERA MANAGER ---
const SceneManager = ({ board, players, currentPlayerIndex }: { board: any[], players: any[], currentPlayerIndex: number }) => {
  const SCALE = 0.022;
  
  // Center offset calc
  const centerOffset = useMemo(() => {
    if (!board.length) return [0, 0];
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    board.forEach(t => {
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    });
    return [-(maxX + minX) / 2, -(maxY + minY) / 2];
  }, [board]);

  // Dynamic Camera tracking
  useFrame((state) => {
    const cp = players[currentPlayerIndex];
    if (!cp || !board.length) return;
    const tile = board[cp.position] || board[0];
    
    // Target position in 3D space
    const targetX = (tile.x + centerOffset[0]) * SCALE;
    const targetZ = (tile.y + centerOffset[1]) * SCALE; // Note: using Y as Z in 3D

    // Camera floats above and slightly behind (isometric-ish angle)
    const camTargetX = targetX;
    const camTargetY = 8;
    const camTargetZ = targetZ + 10;
    
    state.camera.position.lerp(new THREE.Vector3(camTargetX, camTargetY, camTargetZ), 0.05);
    
    // We can't easily lerp lookAt directly without a dummy object, but OrbitControls handles it if we update its target.
    // However, since we want cinematic movement, we'll manually point the camera.
    // Actually, letting OrbitControls do it is easier. See below in the return.
  });

  return (
    <group position={[0, 0, 0]}>
      {/* Floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.2, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#050810" roughness={0.2} metalness={0.8} />
      </mesh>
      
      {/* Grid Helper (Cyberpunk feel) */}
      <gridHelper args={[100, 100, '#00E5FF', '#111122']} position={[0, -0.19, 0]} />

      <group>
        {board.map(tile => (
          <Tile3D 
            key={tile.index} 
            tile={tile} 
            position={[(tile.x + centerOffset[0]) * SCALE, 0, (tile.y + centerOffset[1]) * SCALE]} 
          />
        ))}

        {players.map((p, idx) => {
          const currentTile = board[p.position] || board[0];
          
          const playersOnThisTile = players.filter(player => player.position === p.position);
          const myIndexOnTile = playersOnThisTile.findIndex(player => player.id === p.id);
          const totalOnTile = playersOnThisTile.length;
          
          let offsetX = 0; let offsetZ = 0;
          if (totalOnTile > 1) {
            const angle = (myIndexOnTile / totalOnTile) * Math.PI * 2;
            const radius = 0.5;
            offsetX = Math.cos(angle) * radius;
            offsetZ = Math.sin(angle) * radius;
          }

          const isCurrent = currentPlayerIndex === idx;

          return (
            <PlayerPawn 
              key={p.id} 
              player={p} 
              position={[(currentTile.x + centerOffset[0]) * SCALE + offsetX, 0.2, (currentTile.y + centerOffset[1]) * SCALE + offsetZ]} 
              isCurrent={isCurrent} 
            />
          );
        })}
      </group>

      <ContactShadows position={[0, -0.18, 0]} opacity={0.8} scale={30} blur={2} far={4} />
    </group>
  );
};

// --- CAMERA CONTROLLER ---
const CameraController = ({ players, currentPlayerIndex, board }: any) => {
  const controlsRef = useRef<any>(null);
  const SCALE = 0.022;

  useFrame(() => {
    if (!controlsRef.current || !board.length || !players[currentPlayerIndex]) return;
    
    const cp = players[currentPlayerIndex];
    const tile = board[cp.position] || board[0];
    
    // Calculate center offset again to match
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    board.forEach((t: any) => {
      if (t.x < minX) minX = t.x;
      if (t.x > maxX) maxX = t.x;
      if (t.y < minY) minY = t.y;
      if (t.y > maxY) maxY = t.y;
    });
    const cX = -(maxX + minX) / 2;
    const cY = -(maxY + minY) / 2;

    const targetX = (tile.x + cX) * SCALE;
    const targetZ = (tile.y + cY) * SCALE;

    // Smoothly pan OrbitControls target to follow player
    controlsRef.current.target.lerp(new THREE.Vector3(targetX, 0, targetZ), 0.05);
    controlsRef.current.update();
  });

  return (
    <OrbitControls 
      ref={controlsRef}
      enablePan={false} 
      enableZoom={true} 
      minDistance={5} 
      maxDistance={25}
      maxPolarAngle={Math.PI / 2.2} // Don't go below floor
    />
  );
};

// --- MAIN EXPORT ---
export default function GameBoard3D({ board, players, currentPlayerIndex }: { board: any[], players: any[], currentPlayerIndex: number }) {
  return (
    <div className="w-full h-full absolute inset-0 bg-[#020203]">
      <Canvas shadows camera={{ position: [0, 10, 15], fov: 45 }}>
        <color attach="background" args={['#020203']} />
        <fog attach="fog" args={['#020203', 15, 40]} />
        
        <ambientLight intensity={0.4} />
        <directionalLight 
          castShadow 
          position={[10, 20, 10]} 
          intensity={1.5} 
          shadow-mapSize={[2048, 2048]} 
        />
        
        <SpotLight
          position={[0, 20, 0]}
          angle={0.6}
          penumbra={1}
          intensity={2}
          color="#00E5FF"
          castShadow
        />

        <SceneManager board={board} players={players} currentPlayerIndex={currentPlayerIndex} />
        <CameraController board={board} players={players} currentPlayerIndex={currentPlayerIndex} />
        
        <Environment preset="city" />
      </Canvas>
    </div>
  );
}
