const VERTEX_SHADER = `
attribute vec2 a_position;
varying vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_position * 0.5 + 0.5;
}
`

const FRAGMENT_SHADER = `
precision mediump float;
varying vec2 v_texCoord;
uniform sampler2D u_source;
uniform sampler2D u_background;
uniform sampler2D u_mask;
uniform float u_threshold;
uniform float u_edgeWidth;
uniform float u_invertMask;

void main() {
  vec4 src = texture2D(u_source, v_texCoord);
  vec4 bg = texture2D(u_background, v_texCoord);
  float maskVal = texture2D(u_mask, v_texCoord).r;

  float alpha = 1.0 - smoothstep(
    u_threshold - u_edgeWidth,
    u_threshold + u_edgeWidth,
    maskVal
  );

  alpha = mix(alpha, 1.0 - alpha, u_invertMask);

  gl_FragColor = mix(bg, src, alpha);
}
`

export interface CompositeParams {
  source: HTMLCanvasElement
  background: HTMLCanvasElement
  mask: Uint8Array
  width: number
  height: number
  threshold: number
  edgeWidth: number
  invertMask: boolean
}

export class WebGLCompositor {
  private canvas: HTMLCanvasElement
  private gl: WebGLRenderingContext
  private program: WebGLProgram
  private disposed = false

  // Textures
  private sourceTexture: WebGLTexture
  private backgroundTexture: WebGLTexture
  private maskTexture: WebGLTexture

  // Cached uniform locations
  private uSource: WebGLUniformLocation
  private uBackground: WebGLUniformLocation
  private uMask: WebGLUniformLocation
  private uThreshold: WebGLUniformLocation
  private uEdgeWidth: WebGLUniformLocation
  private uInvertMask: WebGLUniformLocation

  constructor() {
    this.canvas = document.createElement('canvas')

    const gl = this.canvas.getContext('webgl', {
      preserveDrawingBuffer: true,
      premultipliedAlpha: false,
      alpha: true,
      antialias: false,
      depth: false,
      stencil: false,
    })

    if (!gl) {
      throw new Error('WebGL not supported')
    }

    this.gl = gl

    // Handle context loss
    this.canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault()
      console.error('WebGL context lost in WebGLCompositor')
      this.disposed = true
    })

    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)

    // Compile shaders and link program
    this.program = this.createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER)
    gl.useProgram(this.program)

    // Setup fullscreen quad (triangle strip)
    const buffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)

    const aPosition = gl.getAttribLocation(this.program, 'a_position')
    gl.enableVertexAttribArray(aPosition)
    gl.vertexAttribPointer(aPosition, 2, gl.FLOAT, false, 0, 0)

    // Cache uniform locations
    this.uSource = gl.getUniformLocation(this.program, 'u_source')!
    this.uBackground = gl.getUniformLocation(this.program, 'u_background')!
    this.uMask = gl.getUniformLocation(this.program, 'u_mask')!
    this.uThreshold = gl.getUniformLocation(this.program, 'u_threshold')!
    this.uEdgeWidth = gl.getUniformLocation(this.program, 'u_edgeWidth')!
    this.uInvertMask = gl.getUniformLocation(this.program, 'u_invertMask')!

    // Bind texture units to samplers
    gl.uniform1i(this.uSource, 0)
    gl.uniform1i(this.uBackground, 1)
    gl.uniform1i(this.uMask, 2)

    // Create textures
    this.sourceTexture = this.createTexture(gl, gl.LINEAR)
    this.backgroundTexture = this.createTexture(gl, gl.LINEAR)
    this.maskTexture = this.createTexture(gl, gl.LINEAR)
  }

  composite(params: CompositeParams): void {
    if (this.disposed) return

    const { gl } = this
    const { source, background, mask, width, height, threshold, edgeWidth, invertMask } = params

    // Resize canvas if needed
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width
      this.canvas.height = height
      gl.viewport(0, 0, width, height)
    }

    // Upload source texture (unit 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)

    // Upload background texture (unit 1)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, background)

    // Upload mask as LUMINANCE texture (unit 2) — 1 byte per pixel
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.maskTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.LUMINANCE, width, height, 0, gl.LUMINANCE, gl.UNSIGNED_BYTE, mask)

    // Set uniforms
    gl.uniform1f(this.uThreshold, threshold)
    gl.uniform1f(this.uEdgeWidth, edgeWidth)
    gl.uniform1f(this.uInvertMask, invertMask ? 1.0 : 0.0)

    // Draw
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  drawTo(outputCtx: CanvasRenderingContext2D): void {
    if (this.disposed) return
    outputCtx.drawImage(this.canvas, 0, 0)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    const { gl } = this
    gl.deleteTexture(this.sourceTexture)
    gl.deleteTexture(this.backgroundTexture)
    gl.deleteTexture(this.maskTexture)
    gl.deleteProgram(this.program)

    this.canvas.width = 0
    this.canvas.height = 0
  }

  private createProgram(gl: WebGLRenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
    const vs = this.compileShader(gl, gl.VERTEX_SHADER, vsSrc)
    const fs = this.compileShader(gl, gl.FRAGMENT_SHADER, fsSrc)

    const program = gl.createProgram()!
    gl.attachShader(program, vs)
    gl.attachShader(program, fs)
    gl.linkProgram(program)

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      const info = gl.getProgramInfoLog(program)
      gl.deleteProgram(program)
      gl.deleteShader(vs)
      gl.deleteShader(fs)
      throw new Error(`WebGL program link failed: ${info}`)
    }

    // Shaders can be detached after linking
    gl.deleteShader(vs)
    gl.deleteShader(fs)

    return program
  }

  private compileShader(gl: WebGLRenderingContext, type: number, source: string): WebGLShader {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)

    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`WebGL shader compile failed: ${info}`)
    }

    return shader
  }

  private createTexture(gl: WebGLRenderingContext, filter: number): WebGLTexture {
    const texture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
    return texture
  }
}

const GPU_VERTEX_SHADER = `#version 300 es
layout(location = 0) in vec2 a_position;
out vec2 v_texCoord;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
  v_texCoord = a_position * 0.5 + 0.5;
}
`

// Та же формула, что FRAGMENT_SHADER, но маска — confidence человека из MediaPipe (0..1).
// Порог 0.5 даёт ту же бинарную маску, что convertConfidenceMask (0 = человек, 1 = фон)
const GPU_FRAGMENT_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_source;
uniform sampler2D u_background;
uniform highp sampler2D u_mask;
uniform float u_threshold;
uniform float u_edgeWidth;
uniform float u_invertMask;
uniform float u_maskFlipY;
out vec4 outColor;

void main() {
  vec4 src = texture(u_source, v_texCoord);
  vec4 bg = texture(u_background, v_texCoord);
  vec2 maskCoord = vec2(v_texCoord.x, mix(v_texCoord.y, 1.0 - v_texCoord.y, u_maskFlipY));
  float confidence = texture(u_mask, maskCoord).r;
  float maskVal = confidence > 0.5 ? 0.0 : 1.0;

  float alpha = 1.0 - smoothstep(
    u_threshold - u_edgeWidth,
    u_threshold + u_edgeWidth,
    maskVal
  );

  alpha = mix(alpha, 1.0 - alpha, u_invertMask);

  outColor = mix(bg, src, alpha);
}
`

// Текстура маски MediaPipe хранит строки сверху вниз, а наши текстуры загружаются с
// UNPACK_FLIP_Y_WEBGL (снизу вверх) — маску читаем с переворотом по Y
const MASK_FLIP_Y = true

// Уменьшение кадра перед размытием: 4 билинейные выборки со смещением ±u_offset текселя
// усредняют блок factor×factor (factor = 2 → ±0.5, factor = 4 → ±1)
const GPU_DOWNSAMPLE_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_tex;
uniform vec2 u_offset;
out vec4 outColor;

void main() {
  outColor = 0.25 * (
    texture(u_tex, v_texCoord + vec2(-u_offset.x, -u_offset.y)) +
    texture(u_tex, v_texCoord + vec2(u_offset.x, -u_offset.y)) +
    texture(u_tex, v_texCoord + vec2(-u_offset.x, u_offset.y)) +
    texture(u_tex, v_texCoord + vec2(u_offset.x, u_offset.y))
  );
}
`

// Один проход раздельного гауссова размытия (как CSS blur(): sigma = радиус в px)
const GPU_BLUR_SHADER = `#version 300 es
precision mediump float;
in vec2 v_texCoord;
uniform sampler2D u_tex;
uniform vec2 u_step;
uniform float u_sigma;
out vec4 outColor;

void main() {
  float radius = ceil(u_sigma * 3.0);
  float twoSigmaSq = 2.0 * u_sigma * u_sigma;
  vec4 sum = texture(u_tex, v_texCoord);
  float weightSum = 1.0;
  for (int i = 1; i <= 48; i++) {
    float fi = float(i);
    if (fi > radius) break;
    float w = exp(-(fi * fi) / twoSigmaSq);
    sum += (texture(u_tex, v_texCoord + u_step * fi) + texture(u_tex, v_texCoord - u_step * fi)) * w;
    weightSum += 2.0 * w;
  }
  outColor = sum / weightSum;
}
`

type RenderTarget = { texture: WebGLTexture; framebuffer: WebGLFramebuffer; width: number; height: number }

export interface GpuBlurCompositeParams {
  source: TexImageSource
  maskTexture: WebGLTexture
  width: number
  height: number
  // Радиус размытия фона в px кадра (sigma гаусса, как у CSS blur())
  blurRadius: number
  threshold: number
  edgeWidth: number
  invertMask: boolean
}

export interface GpuCompositeParams {
  source: TexImageSource
  background: TexImageSource
  // Фон не менялся с прошлого кадра — не загружать заново (ключ задаёт эффект)
  backgroundKey?: string
  maskTexture: WebGLTexture
  width: number
  height: number
  threshold: number
  edgeWidth: number
  invertMask: boolean
}

// Композиция в WebGL2-контексте MediaPipe: маска берётся текстурой без чтения на CPU.
// Контекст общий с MediaPipe, поэтому всё изменённое состояние GL восстанавливается после кадра
export class GpuMaskCompositor {

  private readonly gl: WebGL2RenderingContext
  private readonly program: WebGLProgram
  private readonly vao: WebGLVertexArrayObject
  private readonly buffer: WebGLBuffer
  private readonly sourceTexture: WebGLTexture
  private readonly backgroundTexture: WebGLTexture
  private readonly uThreshold: WebGLUniformLocation | null
  private readonly uEdgeWidth: WebGLUniformLocation | null
  private readonly uInvertMask: WebGLUniformLocation | null
  private readonly uMaskFlipY: WebGLUniformLocation | null
  private lastBackground: TexImageSource | null = null
  private lastBackgroundKey: string | null = null
  private disposed = false

  // Размытие на GPU (создаётся при первом compositeBlur)
  private downsampleProgram: WebGLProgram | null = null
  private blurProgram: WebGLProgram | null = null
  private blurTargets: [RenderTarget, RenderTarget] | null = null

  constructor(gl: WebGL2RenderingContext) {
    this.gl = gl
    const saved = saveGlState(gl)

    try {
      this.program = linkProgram(gl, GPU_VERTEX_SHADER, GPU_FRAGMENT_SHADER)
      gl.useProgram(this.program)

      this.vao = gl.createVertexArray()!
      gl.bindVertexArray(this.vao)
      this.buffer = gl.createBuffer()!
      gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
      // a_position — location 0 во всех программах (layout в GPU_VERTEX_SHADER)
      gl.enableVertexAttribArray(0)
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0)

      gl.uniform1i(gl.getUniformLocation(this.program, 'u_source'), 0)
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_background'), 1)
      gl.uniform1i(gl.getUniformLocation(this.program, 'u_mask'), 2)
      this.uThreshold = gl.getUniformLocation(this.program, 'u_threshold')
      this.uEdgeWidth = gl.getUniformLocation(this.program, 'u_edgeWidth')
      this.uInvertMask = gl.getUniformLocation(this.program, 'u_invertMask')
      this.uMaskFlipY = gl.getUniformLocation(this.program, 'u_maskFlipY')

      this.sourceTexture = createLinearTexture(gl)
      this.backgroundTexture = createLinearTexture(gl)
    } finally {
      restoreGlState(gl, saved)
    }
  }

  isFor(gl: WebGL2RenderingContext): boolean {
    return this.gl === gl && !this.disposed && !gl.isContextLost()
  }

  composite(params: GpuCompositeParams): void {
    if (this.disposed) return

    const { gl } = this
    const { source, background, backgroundKey, width, height } = params
    this.resizeCanvas(width, height)
    const saved = saveGlState(gl)

    try {
      this.prepareState()
      this.uploadSource(source)

      gl.activeTexture(gl.TEXTURE1)
      gl.bindTexture(gl.TEXTURE_2D, this.backgroundTexture)
      const backgroundChanged = backgroundKey === undefined || backgroundKey !== this.lastBackgroundKey || background !== this.lastBackground
      if (backgroundChanged) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, background)
        this.lastBackground = background
        this.lastBackgroundKey = backgroundKey ?? null
      }

      this.drawComposite(this.backgroundTexture, params)
    } finally {
      restoreGlState(gl, saved)
    }
  }

  // Размытие фона целиком на GPU: уменьшение кадра, два прохода гаусса, композиция по маске.
  // Заменяет 2D-фильтр blur() и загрузку размытого canvas в текстуру
  compositeBlur(params: GpuBlurCompositeParams): void {
    if (this.disposed) return

    const { gl } = this
    const { source, width, height, blurRadius } = params
    this.resizeCanvas(width, height)
    const saved = saveGlState(gl)

    try {
      this.prepareState()
      this.uploadSource(source)

      // Чем сильнее размытие, тем меньше кадр: картинка та же, пикселей в 4–16 раз меньше
      const factor = blurRadius >= 8 ? 4 : blurRadius >= 3 ? 2 : 1
      const [a, b] = this.ensureBlurTargets(Math.max(1, Math.round(width / factor)), Math.max(1, Math.round(height / factor)))
      const sigma = Math.max(0.01, blurRadius / factor)
      const downsample = this.downsampleProgram!
      const blur = this.blurProgram!

      // 1. Кадр → a (уменьшение)
      gl.useProgram(downsample)
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.framebuffer)
      gl.viewport(0, 0, a.width, a.height)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
      gl.uniform2f(gl.getUniformLocation(downsample, 'u_offset'), factor / 4 / width, factor / 4 / height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // 2. a → b (по горизонтали), 3. b → a (по вертикали)
      gl.useProgram(blur)
      const uStep = gl.getUniformLocation(blur, 'u_step')
      gl.uniform1f(gl.getUniformLocation(blur, 'u_sigma'), sigma)

      gl.bindFramebuffer(gl.FRAMEBUFFER, b.framebuffer)
      gl.bindTexture(gl.TEXTURE_2D, a.texture)
      gl.uniform2f(uStep, 1 / a.width, 0)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      gl.bindFramebuffer(gl.FRAMEBUFFER, a.framebuffer)
      gl.bindTexture(gl.TEXTURE_2D, b.texture)
      gl.uniform2f(uStep, 0, 1 / a.height)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      // 4. Композиция в canvas: фон — размытый a
      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.viewport(0, 0, width, height)
      gl.useProgram(this.program)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
      this.drawComposite(a.texture, params)
    } finally {
      restoreGlState(gl, saved)
    }
  }

  private resizeCanvas(width: number, height: number): void {
    const canvas = this.gl.canvas
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }
  }

  private prepareState(): void {
    const { gl } = this
    const canvas = gl.canvas
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, canvas.width, canvas.height)
    gl.disable(gl.BLEND)
    gl.disable(gl.SCISSOR_TEST)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.disable(gl.CULL_FACE)
    gl.colorMask(true, true, true, true)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vao)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false)
  }

  private uploadSource(source: TexImageSource): void {
    const { gl } = this
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sourceTexture)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source)
  }

  // Программа композиции уже активна, кадр — на юните 0, рисуем в текущий framebuffer
  private drawComposite(
    background: WebGLTexture,
    params: { maskTexture: WebGLTexture; threshold: number; edgeWidth: number; invertMask: boolean },
  ): void {
    const { gl } = this

    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, background)

    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, params.maskTexture)
    // Маска float: NEAREST не требует OES_texture_float_linear и даёт ту же картинку,
    // что старая бинарная маска (масштабирование nearest-neighbor)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)

    gl.uniform1f(this.uThreshold, params.threshold)
    gl.uniform1f(this.uEdgeWidth, params.edgeWidth)
    gl.uniform1f(this.uInvertMask, params.invertMask ? 1.0 : 0.0)
    gl.uniform1f(this.uMaskFlipY, MASK_FLIP_Y ? 1.0 : 0.0)

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private ensureBlurTargets(width: number, height: number): [RenderTarget, RenderTarget] {
    const { gl } = this

    if (!this.downsampleProgram || !this.blurProgram) {
      this.downsampleProgram = linkProgram(gl, GPU_VERTEX_SHADER, GPU_DOWNSAMPLE_SHADER)
      this.blurProgram = linkProgram(gl, GPU_VERTEX_SHADER, GPU_BLUR_SHADER)
      for (const program of [this.downsampleProgram, this.blurProgram]) {
        gl.useProgram(program)
        gl.uniform1i(gl.getUniformLocation(program, 'u_tex'), 0)
      }
    }

    if (this.blurTargets && this.blurTargets[0].width === width && this.blurTargets[0].height === height) {
      return this.blurTargets
    }

    this.deleteBlurTargets()
    const create = (): RenderTarget => {
      const texture = createLinearTexture(gl)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      const framebuffer = gl.createFramebuffer()!
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
      return { texture, framebuffer, width, height }
    }
    this.blurTargets = [create(), create()]
    return this.blurTargets
  }

  private deleteBlurTargets(): void {
    if (!this.blurTargets) return
    for (const target of this.blurTargets) {
      this.gl.deleteFramebuffer(target.framebuffer)
      this.gl.deleteTexture(target.texture)
    }
    this.blurTargets = null
  }

  drawTo(outputCtx: CanvasRenderingContext2D): void {
    if (this.disposed) return
    outputCtx.drawImage(this.gl.canvas as CanvasImageSource, 0, 0)
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true

    const { gl } = this
    if (gl.isContextLost()) return
    gl.deleteTexture(this.sourceTexture)
    gl.deleteTexture(this.backgroundTexture)
    this.deleteBlurTargets()
    if (this.downsampleProgram) gl.deleteProgram(this.downsampleProgram)
    if (this.blurProgram) gl.deleteProgram(this.blurProgram)
    gl.deleteBuffer(this.buffer)
    gl.deleteVertexArray(this.vao)
    gl.deleteProgram(this.program)
  }
}

type GlState = {
  program: WebGLProgram | null
  vao: WebGLVertexArrayObject | null
  arrayBuffer: WebGLBuffer | null
  framebuffer: WebGLFramebuffer | null
  readFramebuffer: WebGLFramebuffer | null
  viewport: Int32Array
  activeTexture: number
  textures: (WebGLTexture | null)[]
  flipY: boolean
  premultiply: boolean
  blend: boolean
  scissor: boolean
  depth: boolean
  stencil: boolean
  cull: boolean
  colorMask: boolean[]
}

const SAVED_TEXTURE_UNITS = 3

function saveGlState(gl: WebGL2RenderingContext): GlState {
  const activeTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as number
  const textures: (WebGLTexture | null)[] = []
  for (let i = 0; i < SAVED_TEXTURE_UNITS; i++) {
    gl.activeTexture(gl.TEXTURE0 + i)
    textures.push(gl.getParameter(gl.TEXTURE_BINDING_2D))
  }
  gl.activeTexture(activeTexture)

  return {
    program: gl.getParameter(gl.CURRENT_PROGRAM),
    vao: gl.getParameter(gl.VERTEX_ARRAY_BINDING),
    arrayBuffer: gl.getParameter(gl.ARRAY_BUFFER_BINDING),
    framebuffer: gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING),
    readFramebuffer: gl.getParameter(gl.READ_FRAMEBUFFER_BINDING),
    viewport: gl.getParameter(gl.VIEWPORT),
    activeTexture,
    textures,
    flipY: gl.getParameter(gl.UNPACK_FLIP_Y_WEBGL),
    premultiply: gl.getParameter(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL),
    blend: gl.isEnabled(gl.BLEND),
    scissor: gl.isEnabled(gl.SCISSOR_TEST),
    depth: gl.isEnabled(gl.DEPTH_TEST),
    stencil: gl.isEnabled(gl.STENCIL_TEST),
    cull: gl.isEnabled(gl.CULL_FACE),
    colorMask: gl.getParameter(gl.COLOR_WRITEMASK),
  }
}

function restoreGlState(gl: WebGL2RenderingContext, s: GlState): void {
  gl.useProgram(s.program)
  gl.bindVertexArray(s.vao)
  gl.bindBuffer(gl.ARRAY_BUFFER, s.arrayBuffer)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, s.framebuffer)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, s.readFramebuffer)
  gl.viewport(s.viewport[0], s.viewport[1], s.viewport[2], s.viewport[3])
  for (let i = 0; i < SAVED_TEXTURE_UNITS; i++) {
    gl.activeTexture(gl.TEXTURE0 + i)
    gl.bindTexture(gl.TEXTURE_2D, s.textures[i])
  }
  gl.activeTexture(s.activeTexture)
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, s.flipY)
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, s.premultiply)
  setEnabled(gl, gl.BLEND, s.blend)
  setEnabled(gl, gl.SCISSOR_TEST, s.scissor)
  setEnabled(gl, gl.DEPTH_TEST, s.depth)
  setEnabled(gl, gl.STENCIL_TEST, s.stencil)
  setEnabled(gl, gl.CULL_FACE, s.cull)
  gl.colorMask(s.colorMask[0], s.colorMask[1], s.colorMask[2], s.colorMask[3])
}

function setEnabled(gl: WebGL2RenderingContext, cap: number, on: boolean): void {
  if (on) gl.enable(cap)
  else gl.disable(cap)
}

function linkProgram(gl: WebGL2RenderingContext, vsSrc: string, fsSrc: string): WebGLProgram {
  const compile = (type: number, src: string): WebGLShader => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, src)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      const info = gl.getShaderInfoLog(shader)
      gl.deleteShader(shader)
      throw new Error(`WebGL shader compile failed: ${info}`)
    }
    return shader
  }

  const vs = compile(gl.VERTEX_SHADER, vsSrc)
  const fs = compile(gl.FRAGMENT_SHADER, fsSrc)
  const program = gl.createProgram()!
  gl.attachShader(program, vs)
  gl.attachShader(program, fs)
  gl.linkProgram(program)
  gl.deleteShader(vs)
  gl.deleteShader(fs)

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program)
    gl.deleteProgram(program)
    throw new Error(`WebGL program link failed: ${info}`)
  }

  return program
}

function createLinearTexture(gl: WebGL2RenderingContext): WebGLTexture {
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  return texture
}
