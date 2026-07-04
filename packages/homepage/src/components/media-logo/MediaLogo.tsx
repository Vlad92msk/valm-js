import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type SVGProps,
} from 'react'

export type LogoState =
  | 'circle'
  | 'microphone'
  | 'camera'
  | 'screenshare'
  | 'recording'

type Slot = [number, number, number, number, number, number]
interface StateGeo {
  body: Slot
  mark: Slot
  dot: Slot
  accent: number
}

// Геометрия каждого состояния: тело, метка, точка записи и уровень акцента.
const STATES: Record<LogoState, StateGeo> = {
  circle: {
    body: [22, 22, 56, 56, 28, 1],
    mark: [44, 44, 12, 12, 6, 0],
    dot: [44, 44, 12, 12, 6, 0],
    accent: 0,
  },
  microphone: {
    body: [39, 23, 22, 32, 11, 1],
    mark: [44, 44, 12, 12, 6, 0],
    dot: [44, 44, 12, 12, 6, 0],
    accent: 1,
  },
  camera: {
    body: [26, 30, 48, 40, 10, 1],
    mark: [40, 40, 20, 20, 10, 1],
    dot: [44, 44, 12, 12, 6, 0],
    accent: 0,
  },
  screenshare: {
    body: [26, 30, 48, 40, 10, 1],
    mark: [20, 54, 24, 20, 6, 1],
    dot: [44, 44, 12, 12, 6, 0],
    accent: 0,
  },
  recording: {
    body: [22, 22, 56, 56, 28, 1],
    mark: [44, 44, 12, 12, 6, 0],
    dot: [44, 44, 12, 12, 6, 1],
    accent: 0,
  },
}

const ACCENT_D = 'M32 49 A18 18 0 0 0 68 49 M50 67 V77 M41 77 H59'

const clamp01 = (n: number) => (n < 0 ? 0 : n > 1 ? 1 : n)
const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerpSlot = (a: Slot, b: Slot, t: number): Slot =>
  a.map((v, i) => lerp(v, b[i], t)) as Slot
const easeInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// Путь скруглённого прямоугольника из слота геометрии.
function rrPath(x: number, y: number, w: number, h: number, r: number): string {
  r = Math.min(r, Math.min(w, h) / 2)
  const x2 = x + w
  const y2 = y + h
  return (
    `M${x + r} ${y} H${x2 - r} A${r} ${r} 0 0 1 ${x2} ${y + r} ` +
    `V${y2 - r} A${r} ${r} 0 0 1 ${x2 - r} ${y2} ` +
    `H${x + r} A${r} ${r} 0 0 1 ${x} ${y2 - r} ` +
    `V${y + r} A${r} ${r} 0 0 1 ${x + r} ${y} Z`
  )
}

interface Frame {
  body: Slot
  mark: Slot
  dot: Slot
  accent: number
}
const geoFor = (s: LogoState): StateGeo => STATES[s] ?? STATES.circle
const frameOf = (g: StateGeo): Frame => ({
  body: g.body,
  mark: g.mark,
  dot: g.dot,
  accent: g.accent,
})
const lerpFrame = (a: Frame, b: Frame, t: number): Frame => ({
  body: lerpSlot(a.body, b.body, t),
  mark: lerpSlot(a.mark, b.mark, t),
  dot: lerpSlot(a.dot, b.dot, t),
  accent: lerp(a.accent, b.accent, t),
})

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true
  )
}

// Плавный морфинг геометрии между состояниями через requestAnimationFrame.
function useMorph(state: LogoState, duration: number): Frame {
  const [frame, setFrame] = useState<Frame>(() => frameOf(geoFor(state)))
  const frameRef = useRef(frame)
  const rafRef = useRef<number | null>(null)
  const prevState = useRef(state)
  frameRef.current = frame

  useEffect(() => {
    if (prevState.current === state) return
    const from = frameRef.current
    const to = frameOf(geoFor(state))
    prevState.current = state

    if (duration <= 0 || prefersReducedMotion()) {
      setFrame(to)
      return
    }
    const start = performance.now()
    const tick = (now: number) => {
      const t = clamp01((now - start) / duration)
      setFrame(lerpFrame(from, to, easeInOut(t)))
      if (t < 1) rafRef.current = requestAnimationFrame(tick)
    }
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    }
  }, [state, duration])

  return frame
}

export interface MediaLogoProps extends SVGProps<SVGSVGElement> {
  state: LogoState
  size?: number | string
  strokeWidth?: number
  duration?: number
  blink?: boolean
}

export function MediaLogo({
  state,
  size = '1em',
  strokeWidth,
  duration = 480,
  blink = false,
  style,
  ...rest
}: MediaLogoProps) {
  const f = useMorph(state, duration)
  const accScale = lerp(0.7, 1, f.accent)

  const svgStyle: CSSProperties = {
    stroke: 'currentColor',
    strokeWidth: 'var(--logo-stroke, 6)',
    ...(strokeWidth != null
      ? ({ '--logo-stroke': strokeWidth } as CSSProperties)
      : null),
    ...style,
  }

  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={state ?? 'circle'}
      style={svgStyle}
      {...rest}
    >
      {blink && (
        <style>{`@keyframes media-logo-blink{0%,49%{opacity:1}50%,100%{opacity:0}}`}</style>
      )}
      <path
        d={rrPath(f.body[0], f.body[1], f.body[2], f.body[3], f.body[4])}
        opacity={f.body[5]}
      />
      <path
        d={rrPath(f.mark[0], f.mark[1], f.mark[2], f.mark[3], f.mark[4])}
        opacity={f.mark[5]}
      />
      <path
        d={rrPath(f.dot[0], f.dot[1], f.dot[2], f.dot[3], f.dot[4])}
        fill="currentColor"
        stroke="none"
        opacity={f.dot[5]}
        style={
          blink && state === 'recording'
            ? { animation: 'media-logo-blink 1s steps(1) infinite' }
            : undefined
        }
      />
      <g transform={`translate(50 62) scale(${accScale}) translate(-50 -62)`}>
        <path d={ACCENT_D} opacity={f.accent} />
      </g>
    </svg>
  )
}

const ORDER: LogoState[] = [
  'circle',
  'microphone',
  'camera',
  'screenshare',
  'recording',
]

export interface AnimatedMediaLogoProps
  extends Omit<MediaLogoProps, 'state'> {
  interval?: number
}

// Логотип, автоматически перебирающий состояния по кругу.
export function AnimatedMediaLogo({
  interval = 1600,
  blink = true,
  ...rest
}: AnimatedMediaLogoProps) {
  const [state, setState] = useState<LogoState>('camera')

  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => ORDER[(ORDER.indexOf(s) + 1) % ORDER.length])
    }, interval)
    return () => clearInterval(id)
  }, [interval])

  return <MediaLogo state={state} blink={blink} {...rest} />
}
