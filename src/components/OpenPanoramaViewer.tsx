import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  Loader2,
  Lock,
  Minus,
  Plus,
} from 'lucide-react';
import { fetchPanoramaxStep } from '../game/openPanoramaService';
import { sanitizePanoramaUrl } from '../game/sanitize';
import type { MovementMode, RoundLocation } from '../game/types';

interface OpenPanoramaViewerProps {
  visible?: boolean;
  location: RoundLocation;
  movementMode: MovementMode;
  resetSignal: number;
  onHeadingChange: (heading: number) => void;
  onLoadFailed: () => void;
}

interface ActiveFrameState {
  imageUrl: string;
  isEquirectangular: boolean;
  cameraAzimuth: number;
  nextStepUrl?: string;
  prevStepUrl?: string;
  attribution: string;
}

const VERTEX_SHADER_SRC = `
  attribute vec2 aPos;
  varying vec2 vUv;
  void main() {
    vUv = aPos * 0.5 + 0.5;
    gl_Position = vec4(aPos, 0.0, 1.0);
  }
`;

// Ray-casts a perspective pinhole camera directly onto a 360° equirectangular texture.
// Zero distortion, zero dependencies, strictly on-demand draw().
const FRAGMENT_SHADER_SRC = `
  precision mediump float;
  uniform sampler2D uTex;
  uniform float uYaw;
  uniform float uPitch;
  uniform float uFovY;
  uniform float uAspect;
  varying vec2 vUv;

  const float PI = 3.14159265359;

  void main() {
    float ndcX = vUv.x * 2.0 - 1.0;
    float ndcY = vUv.y * 2.0 - 1.0;

    float halfH = tan(uFovY * 0.5);
    float halfW = halfH * uAspect;

    // Local camera space ray (forward = +Z, right = +X, up = +Y)
    vec3 dir = normalize(vec3(ndcX * halfW, ndcY * halfH, 1.0));

    // Apply pitch around X axis
    float cp = cos(uPitch);
    float sp = sin(uPitch);
    vec3 pDir = vec3(
      dir.x,
      dir.y * cp + dir.z * sp,
      -dir.y * sp + dir.z * cp
    );

    // Apply yaw around Y axis
    float cy = cos(uYaw);
    float sy = sin(uYaw);
    vec3 wDir = vec3(
      pDir.x * cy + pDir.z * sy,
      pDir.y,
      -pDir.x * sy + pDir.z * cy
    );

    float lon = atan(wDir.x, wDir.z); // [-PI, PI], 0 = center of image
    float lat = asin(clamp(wDir.y, -1.0, 1.0)); // [-PI/2, PI/2]

    float u = 0.5 + lon / (2.0 * PI);
    float v = 0.5 - lat / PI;
    gl_FragColor = texture2D(uTex, vec2(u, v));
  }
`;

function compileShader(
  gl: WebGLRenderingContext,
  type: number,
  source: string,
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) return null;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

/**
 * Zero-dependency, on-demand WebGL 1.0 360° Equirectangular Panorama Viewer
 * (with automatic 2D flat street-photo fallback) for keyless Panoramax and
 * free-token Mapillary panoramas.
 */
export const OpenPanoramaViewer: React.FC<OpenPanoramaViewerProps> = ({
  visible = true,
  location,
  movementMode,
  resetSignal,
  onHeadingChange,
  onLoadFailed,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const glRef = useRef<WebGLRenderingContext | null>(null);
  const programRef = useRef<WebGLProgram | null>(null);
  const textureRef = useRef<WebGLTexture | null>(null);
  const uniformsRef = useRef<{
    uYaw: WebGLUniformLocation | null;
    uPitch: WebGLUniformLocation | null;
    uFovY: WebGLUniformLocation | null;
    uAspect: WebGLUniformLocation | null;
  } | null>(null);

  const onHeadingRef = useRef(onHeadingChange);
  onHeadingRef.current = onHeadingChange;
  const onLoadFailedRef = useRef(onLoadFailed);
  onLoadFailedRef.current = onLoadFailed;

  const isMovingAllowed = movementMode === 'moving';
  const isNmpz = movementMode === 'nmpz';

  const buildInitialFrame = useCallback((): ActiveFrameState => {
    const safeUrl = sanitizePanoramaUrl(location.imageUrl) ?? '';
    return {
      imageUrl: safeUrl,
      isEquirectangular: location.isEquirectangular !== false,
      cameraAzimuth: location.cameraAzimuth ?? 0,
      nextStepUrl: sanitizePanoramaUrl(location.nextStepUrl),
      prevStepUrl: sanitizePanoramaUrl(location.prevStepUrl),
      attribution:
        location.attribution ||
        (location.provider === 'mapillary' ? 'Mapillary' : 'Panoramax'),
    };
  }, [location]);

  const [frame, setFrame] = useState<ActiveFrameState>(buildInitialFrame);
  const [loading, setLoading] = useState(true);
  const [stepping, setStepping] = useState(false);
  const [useFlatFallback, setUseFlatFallback] = useState(
    location.isEquirectangular === false,
  );
  const [flatZoom, setFlatZoom] = useState(1);

  // Camera state stored in ref for zero-jank 60fps pointer drags without React re-renders
  const cameraRef = useRef({
    yawRad: 0,
    pitchRad: 0,
    fovDeg: 75,
  });
  const dragRef = useRef<{
    pointerId: number;
    lastX: number;
    lastY: number;
  } | null>(null);
  const stepRequestIdRef = useRef(0);

  const emitCompassHeading = useCallback((cameraAzimuth: number) => {
    const yawDeg = (cameraRef.current.yawRad * 180) / Math.PI;
    const geographic = (((cameraAzimuth + yawDeg) % 360) + 360) % 360;
    onHeadingRef.current(geographic);
  }, []);

  const drawFrame = useCallback(() => {
    const gl = glRef.current;
    const canvas = canvasRef.current;
    const uniforms = uniformsRef.current;
    const texture = textureRef.current;
    if (!gl || !canvas || !uniforms || !texture) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.floor(canvas.clientWidth * dpr));
    const height = Math.max(1, Math.floor(canvas.clientHeight * dpr));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }

    gl.viewport(0, 0, width, height);
    gl.useProgram(programRef.current);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1f(uniforms.uYaw, cameraRef.current.yawRad);
    gl.uniform1f(uniforms.uPitch, cameraRef.current.pitchRad);
    gl.uniform1f(uniforms.uFovY, (cameraRef.current.fovDeg * Math.PI) / 180);
    gl.uniform1f(uniforms.uAspect, width / height);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }, []);

  // Reset frame & camera whenever a new round starts or user presses Return-to-Start (R)
  useEffect(() => {
    stepRequestIdRef.current += 1;
    const init = buildInitialFrame();
    setFrame(init);
    setUseFlatFallback(!init.isEquirectangular);
    setFlatZoom(1);
    setStepping(false);

    const initialYawDeg = init.isEquirectangular
      ? location.heading - init.cameraAzimuth
      : 0;
    cameraRef.current = {
      yawRad: (initialYawDeg * Math.PI) / 180,
      pitchRad: (location.pitch * Math.PI) / 180,
      fovDeg: 75,
    };
    emitCompassHeading(init.cameraAzimuth);
  }, [buildInitialFrame, location.heading, location.pitch, resetSignal, emitCompassHeading]);

  // Initialize WebGL 1.0 pipeline once when spherical canvas is active
  useEffect(() => {
    if (useFlatFallback) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const gl = canvas.getContext('webgl', {
      antialias: true,
      alpha: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) {
      setUseFlatFallback(true);
      return;
    }

    const vs = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER_SRC);
    const fs = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER_SRC);
    if (!vs || !fs) {
      setUseFlatFallback(true);
      return;
    }

    const program = gl.createProgram();
    if (!program) {
      setUseFlatFallback(true);
      return;
    }
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    gl.deleteShader(vs);
    gl.deleteShader(fs);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      gl.deleteProgram(program);
      setUseFlatFallback(true);
      return;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    );
    const posLoc = gl.getAttribLocation(program, 'aPos');
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    glRef.current = gl;
    programRef.current = program;
    textureRef.current = tex;
    uniformsRef.current = {
      uYaw: gl.getUniformLocation(program, 'uYaw'),
      uPitch: gl.getUniformLocation(program, 'uPitch'),
      uFovY: gl.getUniformLocation(program, 'uFovY'),
      uAspect: gl.getUniformLocation(program, 'uAspect'),
    };

    const observer = new ResizeObserver(() => {
      drawFrame();
    });
    observer.observe(canvas);

    return () => {
      observer.disconnect();
      if (tex) gl.deleteTexture(tex);
      if (buf) gl.deleteBuffer(buf);
      gl.deleteProgram(program);
      glRef.current = null;
      programRef.current = null;
      textureRef.current = null;
      uniformsRef.current = null;
    };
  }, [useFlatFallback, drawFrame]);

  // Stream equirectangular image into WebGL texture whenever active frame changes
  useEffect(() => {
    const safeUrl = sanitizePanoramaUrl(frame.imageUrl);
    if (!safeUrl) {
      onLoadFailedRef.current();
      return;
    }
    if (useFlatFallback) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      if (cancelled) return;
      const gl = glRef.current;
      const tex = textureRef.current;
      if (!gl || !tex) {
        setUseFlatFallback(true);
        setLoading(false);
        return;
      }
      try {
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, 0);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
        setLoading(false);
        drawFrame();
      } catch {
        // SecurityError / tainted canvas fallback -> display clean 2D street image
        setUseFlatFallback(true);
        setLoading(false);
      }
    };
    img.onerror = () => {
      if (cancelled) return;
      setLoading(false);
      onLoadFailedRef.current();
    };
    img.src = safeUrl;

    return () => {
      cancelled = true;
    };
  }, [frame.imageUrl, useFlatFallback, drawFrame]);

  // Redraw when stage becomes visible again (e.g. after Handoff)
  useEffect(() => {
    if (visible && !useFlatFallback && !loading) {
      const raf = window.requestAnimationFrame(() => drawFrame());
      return () => window.cancelAnimationFrame(raf);
    }
  }, [visible, useFlatFallback, loading, drawFrame]);

  const handleStep = useCallback(
    async (direction: 'next' | 'prev') => {
      if (!isMovingAllowed || stepping) return;
      const targetUrl =
        direction === 'next' ? frame.nextStepUrl : frame.prevStepUrl;
      if (!targetUrl) return;

      const reqId = ++stepRequestIdRef.current;
      setStepping(true);
      const nextFrame = await fetchPanoramaxStep(targetUrl);
      if (reqId !== stepRequestIdRef.current) return;
      setStepping(false);

      if (!nextFrame) return;
      // Preserve player's world compass heading smoothly across road steps
      const prevWorldHeading =
        (((frame.cameraAzimuth + (cameraRef.current.yawRad * 180) / Math.PI) % 360) +
          360) %
        360;
      const nextYawDeg = prevWorldHeading - nextFrame.cameraAzimuth;
      cameraRef.current.yawRad = (nextYawDeg * Math.PI) / 180;

      setFrame({
        imageUrl: nextFrame.imageUrl,
        isEquirectangular: nextFrame.isEquirectangular,
        cameraAzimuth: nextFrame.cameraAzimuth,
        nextStepUrl: nextFrame.nextStepUrl,
        prevStepUrl: nextFrame.prevStepUrl,
        attribution: nextFrame.attribution,
      });
      setUseFlatFallback(!nextFrame.isEquirectangular);
      emitCompassHeading(nextFrame.cameraAzimuth);
    },
    [
      isMovingAllowed,
      stepping,
      frame.nextStepUrl,
      frame.prevStepUrl,
      frame.cameraAzimuth,
      emitCompassHeading,
    ],
  );

  // Keyboard step support in Moving mode (W/ArrowUp = forward, S/ArrowDown = backward)
  useEffect(() => {
    if (!visible || !isMovingAllowed) return;
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }
      if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') {
        if (frame.nextStepUrl) {
          e.preventDefault();
          void handleStep('next');
        }
      } else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') {
        if (frame.prevStepUrl) {
          e.preventDefault();
          void handleStep('prev');
        }
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [visible, isMovingAllowed, frame.nextStepUrl, frame.prevStepUrl, handleStep]);

  const adjustZoom = useCallback(
    (deltaDeg: number) => {
      if (isNmpz) return;
      if (useFlatFallback) {
        setFlatZoom((z) => Math.max(1, Math.min(2.6, z - deltaDeg * 0.02)));
        return;
      }
      cameraRef.current.fovDeg = Math.max(
        32,
        Math.min(102, cameraRef.current.fovDeg + deltaDeg),
      );
      drawFrame();
    },
    [isNmpz, useFlatFallback, drawFrame],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isNmpz || useFlatFallback) return;
    dragRef.current = {
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isNmpz || useFlatFallback || !dragRef.current) return;
    if (dragRef.current.pointerId !== e.pointerId) return;
    const dx = e.clientX - dragRef.current.lastX;
    const dy = e.clientY - dragRef.current.lastY;
    dragRef.current.lastX = e.clientX;
    dragRef.current.lastY = e.clientY;

    const sensitivity = (cameraRef.current.fovDeg / 75) * 0.0042;
    cameraRef.current.yawRad -= dx * sensitivity;
    cameraRef.current.pitchRad = Math.max(
      -Math.PI / 2.25,
      Math.min(Math.PI / 2.25, cameraRef.current.pitchRad + dy * sensitivity),
    );
    drawFrame();
    emitCompassHeading(frame.cameraAzimuth);
  };

  const handlePointerUp = () => {
    dragRef.current = null;
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (isNmpz) return;
    adjustZoom(e.deltaY > 0 ? 6 : -6);
  };

  const providerLabel =
    location.provider === 'mapillary' ? 'Mapillary 360°' : 'Panoramax 360°';

  return (
    <div
      data-testid="open-panorama-viewer"
      data-provider={location.provider || 'panoramax'}
      className={`relative h-full w-full overflow-hidden bg-[#0B1220] select-none ${
        isNmpz ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      }`}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onWheel={handleWheel}
    >
      {useFlatFallback ? (
        <div className="flex h-full w-full items-center justify-center overflow-hidden bg-[#0B1220]">
          <img
            src={frame.imageUrl}
            alt="Уличная панорама"
            draggable={false}
            onError={() => onLoadFailedRef.current()}
            className="h-full w-full object-cover transition-transform duration-200"
            style={{ transform: `scale(${flatZoom})` }}
          />
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          data-testid="open-panorama-canvas"
          className="block h-full w-full touch-none"
        />
      )}

      {/* Subtle loading indicator */}
      {(loading || stepping) && (
        <div
          className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center bg-[#0B1220]/45"
          role="status"
          aria-live="polite"
        >
          <div className="flex items-center gap-2 rounded-xl border border-slate-700/80 bg-[#0B1220]/90 px-4 py-2.5 text-xs font-semibold text-slate-200 shadow-xl">
            <Loader2 className="h-4 w-4 animate-spin text-amber-400" />
            <span>{stepping ? 'Переход по улице...' : `Загрузка ${providerLabel}...`}</span>
          </div>
        </div>
      )}

      {/* Moving mode: Forward / Backward street navigation */}
      {visible && isMovingAllowed && (frame.nextStepUrl || frame.prevStepUrl) && (
        <div
          className="pointer-events-auto absolute bottom-8 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 landscape-phone:bottom-4"
          onPointerDown={(e) => e.stopPropagation()}
        >
          {frame.prevStepUrl && (
            <button
              type="button"
              disabled={stepping}
              onClick={() => void handleStep('prev')}
              aria-label="Шаг назад по улице (S)"
              title="Назад (S / ↓)"
              className="flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-slate-700/85 px-3 text-xs font-semibold text-slate-100 shadow-lg transition-colors hover:border-amber-500/70 hover:text-amber-300 disabled:opacity-50"
              style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
            >
              <ArrowDown className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Назад</span>
            </button>
          )}
          {frame.nextStepUrl && (
            <button
              type="button"
              disabled={stepping}
              onClick={() => void handleStep('next')}
              aria-label="Шаг вперёд по улице (W)"
              title="Вперёд (W / ↑)"
              className="flex h-10 cursor-pointer items-center gap-1 rounded-xl border border-slate-700/85 px-3.5 text-xs font-semibold text-slate-100 shadow-lg transition-colors hover:border-amber-500/70 hover:text-amber-300 disabled:opacity-50"
              style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
            >
              <ArrowUp className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Вперёд</span>
            </button>
          )}
        </div>
      )}

      {/* Bottom-left zoom controls (hidden in NMPZ) */}
      {visible && !isNmpz && (
        <div
          className="pointer-events-auto absolute bottom-10 left-3 z-20 flex flex-col overflow-hidden rounded-xl border border-slate-700/80 shadow-lg"
          style={{ backgroundColor: 'rgba(11, 18, 32, 0.88)' }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={() => adjustZoom(-12)}
            aria-label="Приблизить панораму"
            className="flex h-9 w-9 cursor-pointer items-center justify-center border-b border-slate-700/70 text-slate-200 transition-colors hover:bg-slate-800 hover:text-amber-300"
          >
            <Plus className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => adjustZoom(12)}
            aria-label="Отдалить панораму"
            className="flex h-9 w-9 cursor-pointer items-center justify-center text-slate-200 transition-colors hover:bg-slate-800 hover:text-amber-300"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Subtle NMPZ lock badge */}
      {visible && isNmpz && (
        <div
          className="pointer-events-none absolute bottom-10 left-3 z-20 flex items-center gap-1.5 rounded-lg border border-slate-700/80 px-2.5 py-1 font-mono text-[11px] font-semibold text-amber-300 shadow"
          style={{ backgroundColor: 'rgba(11, 18, 32, 0.86)' }}
        >
          <Lock className="h-3 w-3" aria-hidden="true" />
          <span>NMPZ</span>
        </div>
      )}

      {/* Quiet open-source attribution at bottom-left */}
      <div
        className="pointer-events-none absolute bottom-1.5 left-3 z-20 rounded px-1.5 py-0.5 text-[10px] font-medium text-slate-300/85"
        style={{ backgroundColor: 'rgba(11, 18, 32, 0.72)' }}
      >
        {frame.attribution}
      </div>
    </div>
  );
};
