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
