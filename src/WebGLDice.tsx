import { useState, useEffect, useRef } from 'react';

// Pure CSS 3D Dice - Ultra Optimized for 60FPS while maintaining stunning visuals
export default function WebGLDiceOverlay({ targetValue, onLanded }: { targetValue: number, onLanded: () => void }) {
  const [spinning, setSpinning] = useState(true);
  const [rotation, setRotation] = useState({ x: 720, y: 720, z: 360 });

  const onLandedRef = useRef(onLanded);
  useEffect(() => { onLandedRef.current = onLanded; }, [onLanded]);

  useEffect(() => {
    const baseSpins = 360 * 3;
    let finalX = baseSpins;
    let finalY = baseSpins;
    let finalZ = 0;

    switch (targetValue) {
      case 1: finalX += 0; finalY += 0; break;
      case 6: finalX += 0; finalY += 180; break;
      case 2: finalX -= 90; finalY += 0; break;
      case 5: finalX += 90; finalY += 0; break;
      case 3: finalX += 0; finalY -= 90; break;
      case 4: finalX += 0; finalY += 90; break;
      default: break;
    }

    const timer = setTimeout(() => {
      setRotation({ x: finalX, y: finalY, z: finalZ });
    }, 50);

    const endTimer = setTimeout(() => {
      setSpinning(false);
      setTimeout(() => onLandedRef.current(), 500);
    }, 1500);

    return () => {
      clearTimeout(timer);
      clearTimeout(endTimer);
    };
  }, [targetValue]);

  // Fast GPU pip using background-color and simple border (no blur shadows)
  const renderPip = (x: number, y: number, key: string) => (
    <div key={key} className="absolute w-6 h-6 rounded-full bg-white" style={{ top: `${y}%`, left: `${x}%`, transform: 'translate(-50%, -50%)' }} />
  );

  const getPips = (value: number) => {
    switch (value) {
      case 1: return [renderPip(50, 50, '1')];
      case 2: return [renderPip(25, 25, '1'), renderPip(75, 75, '2')];
      case 3: return [renderPip(25, 25, '1'), renderPip(50, 50, '2'), renderPip(75, 75, '3')];
      case 4: return [renderPip(25, 25, '1'), renderPip(75, 25, '2'), renderPip(25, 75, '3'), renderPip(75, 75, '4')];
      case 5: return [renderPip(25, 25, '1'), renderPip(75, 25, '2'), renderPip(50, 50, '3'), renderPip(25, 75, '4'), renderPip(75, 75, '5')];
      case 6: return [renderPip(25, 20, '1'), renderPip(75, 20, '2'), renderPip(25, 50, '3'), renderPip(75, 50, '4'), renderPip(25, 80, '5'), renderPip(75, 80, '6')];
      default: return [];
    }
  };

  // Optimized Face: Uses radial-gradient to fake depth/lighting instead of box-shadow. Uses opaque bg to prevent layer composite lag.
  const faceClass = "absolute w-full h-full border-[3px] border-cyan-400 rounded-3xl flex items-center justify-center bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-slate-700 via-slate-800 to-slate-950";

  return (
    <div className="fixed inset-0 z-[150] flex items-center justify-center pointer-events-none">
      <div className="absolute inset-0 bg-slate-950/80 pointer-events-auto" style={{ willChange: 'opacity' }} />
      
      {/* 3D Scene Container */}
      <div 
        style={{ perspective: '1200px' }} 
        className={`relative z-10 w-32 h-32 ${spinning ? 'scale-150' : 'scale-125'} transition-transform duration-500`}
      >
        {/* The Cube */}
        <div 
          className="w-full h-full relative"
          style={{
            transformStyle: 'preserve-3d',
            transform: `translateZ(-64px) rotateX(${rotation.x}deg) rotateY(${rotation.y}deg) rotateZ(${rotation.z}deg)`,
            transition: 'transform 1.2s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
            willChange: 'transform' // Force GPU acceleration for rotation
          }}
        >
          {/* Front - 1 */}
          <div className={faceClass} style={{ transform: 'rotateY(0deg) translateZ(64px)', backfaceVisibility: 'hidden' }}>
            {getPips(1)}
          </div>
          {/* Back - 6 */}
          <div className={faceClass} style={{ transform: 'rotateY(180deg) translateZ(64px)', backfaceVisibility: 'hidden' }}>
            {getPips(6)}
          </div>
          {/* Right - 3 */}
          <div className={faceClass} style={{ transform: 'rotateY(90deg) translateZ(64px)', backfaceVisibility: 'hidden' }}>
            {getPips(3)}
          </div>
          {/* Left - 4 */}
          <div className={faceClass} style={{ transform: 'rotateY(-90deg) translateZ(64px)', backfaceVisibility: 'hidden' }}>
            {getPips(4)}
          </div>
          {/* Top - 2 */}
          <div className={faceClass} style={{ transform: 'rotateX(90deg) translateZ(64px)', backfaceVisibility: 'hidden' }}>
            {getPips(2)}
          </div>
          {/* Bottom - 5 */}
          <div className={faceClass} style={{ transform: 'rotateX(-90deg) translateZ(64px)', backfaceVisibility: 'hidden' }}>
            {getPips(5)}
          </div>
        </div>
      </div>
      
      {/* Visual glow effect on the floor (Static to prevent animation lag) */}
      <div className="absolute top-[60%] w-64 h-16 bg-cyan-500/20 rounded-[100%] blur-3xl z-0 pointer-events-none" />
    </div>
  );
};
